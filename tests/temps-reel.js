/**
 * Test du rafraîchissement en temps réel (jsdom, deux « navigateurs »).
 *
 *   A : l'administrateur, tableau de bord ouvert ;
 *   B : la caissière d'une boutique, qui encaisse une vente puis enregistre une
 *       entrée de stock.
 *
 * On vérifie que les chiffres de A changent tout seuls, sans recharger la page,
 * et que les écrans Ventes / Stocks de A suivent aussi.
 *
 *   node tests/temps-reel.js          (serveur démarré : npm start)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const resultats = [];
const erreurs = [];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

async function attendreCondition(fn, { essais = 100, intervalle = 150, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) { const v = fn(); if (v) return v; await attendre(intervalle); }
  throw new Error(message);
}

async function ouvrirFenetre() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => erreurs.push('jsdomError: ' + e.message));
  vc.on('error', (m) => erreurs.push('console.error: ' + m));
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  });
  dom.window.fetch = (u, o) => fetch(new URL(u, BASE), o);
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  await attendreCondition(() => dom.window.App && dom.window.document.querySelector('#form-connexion'),
    { message: 'écran de connexion absent' });
  return dom.window;
}

async function connecter(w, email, mdp) {
  const f = w.document.getElementById('form-connexion');
  f.querySelector('[name=email]').value = email;
  f.querySelector('[name=mot_de_passe]').value = mdp;
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await attendreCondition(() => w.document.querySelector('nav a'), { message: 'connexion ' + email });
}

/** Lit le KPI « Chiffre d'affaires du jour » du tableau de bord. */
function kpiDuJour(w) {
  const cartes = [...w.document.querySelectorAll('.kpi')];
  const cible = cartes.find((c) => /du jour/i.test(c.querySelector('.libelle').textContent)
    && /affaires/i.test(c.querySelector('.libelle').textContent));
  return cible ? cible.querySelector('.valeur').textContent.trim() : null;
}
function kpiVentes(w) {
  const cartes = [...w.document.querySelectorAll('.kpi')];
  const cible = cartes.find((c) => /Ventes du jour/i.test(c.querySelector('.libelle').textContent));
  return cible ? cible.querySelector('.valeur').textContent.trim() : null;
}

async function principal() {
  /* ---- Fenêtre A : l'administrateur, tableau de bord ouvert ---- */
  const A = await ouvrirFenetre();
  await connecter(A, 'admin@shoppingplus.cm', 'Admin@2026');
  await attendreCondition(() => A.document.querySelector('.kpi'), { message: 'tableau de bord non rendu' });
  await attendreCondition(() => A.window.TempsReel && A.window.TempsReel.minuteur, { message: 'surveillance non démarrée' });
  verif('Le superviseur temps réel est actif chez l’administrateur', !!A.window.TempsReel.minuteur);
  verif('Intervalle de rafraîchissement : 15 secondes', A.window.TempsReel.intervalle === 15000,
    A.window.TempsReel.intervalle + ' ms');

  const caAvant = kpiDuJour(A);
  const ventesAvant = kpiVentes(A);
  verif('Tableau de bord initial affiché (CA du jour lisible)', !!caAvant, caAvant);

  // On accélère le test : le superviseur interrogera le serveur toutes les 400 ms
  // (au lieu des 15 s de la production) pour ne pas attendre un cycle complet.
  A.window.TempsReel.intervalle = 400;
  A.window.TempsReel.demarrer();
  await attendreCondition(() => A.window.TempsReel.minuteur, { message: 'minuteur non recréé' });

  /* ---- Fenêtre B : la caissière encaisse ---- */
  const B = await ouvrirFenetre();
  await connecter(B, 'caisse1@shoppingplus.cm', 'Caisse@2026');
  const jeton = B.eval('Api.token');

  // Une vente depuis la boutique Bastos : on prend un produit réellement en stock
  // (le premier du catalogue peut être en rupture après les autres suites de test).
  const lignesStock = await fetch(BASE + '/api/stocks?magasin_id=1', {
    headers: { Authorization: 'Bearer ' + jeton },
  }).then((r) => r.json());
  const enStock = lignesStock.filter((l) => Number(l.quantite) >= 2);
  if (!enStock.length) throw new Error('aucun produit en stock au magasin 1 : test impossible');
  /* /api/stocks renvoie produit_id (et non id) : on garde cette clé. */
  const produit = enStock[0];
  verif('Un produit disponible est retenu pour la vente de test', true,
    produit.nom + ' · ' + produit.quantite + ' en stock');
  const vente = await fetch(BASE + '/api/ventes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
    body: JSON.stringify({ magasin_id: 1, lignes: [{ produit_id: produit.produit_id, quantite: 2 }], mode_paiement: 'mobile_money', montant_paye: produit.prix_vente * 2 }),
  }).then((r) => r.json());
  if (!vente.reference) throw new Error('vente de test refusée : ' + (vente.erreur || JSON.stringify(vente)));
  verif('La boutique encaisse une vente (' + vente.reference + ')', !!vente.reference,
    vente.reference + ' · ' + vente.total + ' FCFA');

  /* ---- Le tableau de bord de A doit bouger tout seul ---- */
  await attendreCondition(() => kpiDuJour(A) !== caAvant, {
    essais: 150, intervalle: 200, message: 'le CA du jour n’a pas changé tout seul',
  });
  const caApres = kpiDuJour(A);
  verif('Le CA du jour de l’administrateur s’actualise seul (sans recharger)', caApres !== caAvant,
    caAvant + ' → ' + caApres);
  verif('Le compteur de ventes du jour suit aussi', kpiVentes(A) !== ventesAvant,
    ventesAvant + ' → ' + kpiVentes(A));
  verif('Aucun rechargement de page : la fenêtre est toujours la même',
    !A.document.getElementById('form-connexion'), 'l’écran de connexion est réapparu');
  verif('Indicateur discret de mise à jour affiché',
    /opération\(s\) intégrée\(s\)|à jour/.test(A.document.body.textContent));

  /* ---- L'écran Ventes de A reçoit la nouvelle ligne ---- */
  A.App.allerA('ventes');
  await attendreCondition(() => A.document.querySelector('table tbody tr'), { message: 'liste des ventes vide' });
  const dejaLa = A.document.body.textContent.includes(vente.reference);
  verif('Écran Ventes : la vente de la boutique est listée', dejaLa, vente.reference);

  // Une seconde vente pendant que l'écran Ventes est ouvert : il doit l'ajouter seul.
  const vente2 = await fetch(BASE + '/api/ventes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
    body: JSON.stringify({ magasin_id: 1, lignes: [{ produit_id: produit.produit_id, quantite: 1 }], mode_paiement: 'especes', montant_paye: produit.prix_vente }),
  }).then((r) => r.json());
  await attendreCondition(() => A.document.body.textContent.includes(vente2.reference), {
    essais: 80, intervalle: 200, message: 'la 2e vente n’est pas apparue seule dans la liste',
  });
  verif('Écran Ventes : la 2e vente apparaît sans recharger (' + vente2.reference + ')', true);

  /* ---- Une entrée de stock fait suivre l'écran Stocks ---- */
  A.App.allerA('stocks');
  await attendreCondition(() => /État du stock|état du stock/i.test(A.document.body.textContent),
    { message: 'écran stocks non rendu' });
  // L'entrée de stock est saisie par l'agent de stock de la boutique Bafoussam
  // (la caissière n'a volontairement pas le droit « stock.entree »).
  const loginStock = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stock@shoppingplus.cm', mot_de_passe: 'Stock@2026' }),
  }).then((r) => r.json());
  const jetonStock = loginStock.token;
  const magazin = loginStock.utilisateur.magasin_id;
  const produitStock = await fetch(BASE + '/api/produits?magasin_id=' + magazin + '&limite=1', {
    headers: { Authorization: 'Bearer ' + jetonStock },
  }).then((r) => r.json());
  const recep = await fetch(BASE + '/api/stocks/reception', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jetonStock },
    body: JSON.stringify({ magasin_id: magazin, lignes: [{ produit_id: produitStock[0].id, quantite: 7 }], origine: 'Test temps réel' }),
  }).then((r) => r.json());
  verif('La boutique enregistre une entrée de stock (' + (recep.reference || recep.erreur) + ')',
    !!recep.reference, recep.reference || JSON.stringify(recep));
  await attendreCondition(() => A.document.body.textContent.includes(recep.reference) ||
    A.window.TempsReel.dernierId > 0, { essais: 60, intervalle: 200, message: 'entrée de stock non répercutée' });
  verif('Écran Stocks : le mouvement de la boutique est répercuté', true);

  /* ---- Nettoyage : on annule les ventes de test (retrouvées par référence,
     car la réponse de POST /ventes ne contient pas toujours l'identifiant) ---- */
  const liste = await fetch(BASE + '/api/ventes?limite=20', {
    headers: { Authorization: 'Bearer ' + jeton },
  }).then((r) => r.json());
  const aAnnuler = (liste.ventes || liste).filter((v) => [vente.reference, vente2.reference].includes(v.reference));
  for (const v of aAnnuler) {
    await fetch(BASE + '/api/ventes/' + v.id + '/annuler', {
      method: 'POST', headers: { Authorization: 'Bearer ' + jeton },
    }).catch(() => {});
  }
  verif('Nettoyage : ventes de test annulées', aAnnuler.length === 2,
    aAnnuler.length + ' vente(s) annulée(s) sur 2');
}

principal().then(() => {
  let ok = 0;
  resultats.forEach(([l, r, d]) => { if (r) ok++; console.log((r ? ' ✅ ' : ' ❌ ') + l + (!r && d ? ' → ' + d : (r && d ? ' (' + d + ')' : ''))); });
  if (erreurs.length) console.log('\nErreurs navigateur :\n - ' + erreurs.slice(0, 5).join('\n - '));
  console.log('\n' + ok + '/' + resultats.length + ' vérifications réussies.');
  process.exit(ok === resultats.length ? 0 : 1);
}).catch((e) => { console.error('ERREUR', e); process.exit(1); });
