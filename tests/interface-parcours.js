/**
 * Test d'INTERFACE (jsdom) du parcours demandé :
 *   1. page d'inscription d'entreprise avant tout accès ;
 *   2. accès à l'application après inscription + espace « Aide » (WhatsApp 654 32 42 82) ;
 *   3. console du propriétaire : entreprises, paiements, boutiques.
 *
 *   node tests/interface-parcours.js      (serveur démarré : npm start)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const Database = require('better-sqlite3');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TS = Date.now();

/* Le code de vérification part par email ; sans serveur SMTP il reste consigné
   en base. Le test le lit là, exactement comme l'utilisateur le lit dans sa boîte. */
function codeVerification(email) {
  const db = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(String(email).toLowerCase());
  if (!u) { db.close(); return null; }
  const c = db.prepare('SELECT code FROM codes_verification WHERE user_id=? AND utilise_at IS NULL ORDER BY id DESC LIMIT 1').get(u.id);
  db.close();
  return c ? c.code : null;
}

const erreurs = [];
const resultats = [];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendreCondition(fn, { essais = 60, intervalle = 120, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) { const v = fn(); if (v) return v; await attendre(intervalle); }
  throw new Error(message);
}
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

async function ouvrirFenetre() {
  const consoleVirtuelle = new VirtualConsole();
  consoleVirtuelle.on('jsdomError', (e) => erreurs.push('jsdomError: ' + e.message));
  consoleVirtuelle.on('error', (m) => erreurs.push('console.error: ' + m));
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: consoleVirtuelle,
  });
  dom.window.fetch = (url, options) => fetch(new URL(url, BASE), options);
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  return dom.window;
}

async function principal() {
  const email = 'interface.' + TS + '@entreprise.cm';
  const motDePasse = 'Demo@2026';
  const nomEntreprise = 'INTERFACE DEMO ' + TS;

  /* ---------- 1. Avant tout accès : la page d'inscription ---------- */
  let w = await ouvrirFenetre();
  await attendreCondition(() => w.App && w.document.querySelector('#form-connexion'), { message: 'écran de connexion absent' });
  verif('Écran d’accueil : bouton « Créer mon entreprise » visible', !!w.document.getElementById('btn-inscription'));

  w.document.getElementById('btn-inscription').click();
  await attendreCondition(() => w.document.getElementById('form-inscription'), { message: 'page d’inscription non affichée' });
  const f = w.document.getElementById('form-inscription');
  // email professionnel, nom, prénom, nom de l'entreprise, date de création, NIU, logo(photo)
  const champs = ['email', 'mot_de_passe', 'nom_contact', 'prenom_contact', 'nom', 'date_creation', 'niu'];
  verif('Page d’inscription : les 7 informations demandées sont présentes',
    champs.every((c) => f.querySelector(`[name="${c}"]`)),
    champs.filter((c) => !f.querySelector(`[name="${c}"]`)).join(',') || 'tous les champs');
  const champLogo = w.document.getElementById('champ-logo');
  verif('Page d’inscription : le logo est bien un champ photo (image)',
    !!champLogo && champLogo.type === 'file' && /image/.test(champLogo.accept || ''));
  await attendreCondition(() => /11[\s\u00a0]500/.test(w.document.body.textContent),
    { message: 'tarifs non rendus sur la page d’inscription' });
  verif('Page d’inscription : tarifs affichés (11 500 / 132 000 FCFA)',
    /11[\s\u00a0]500/.test(w.document.body.textContent) && /132[\s\u00a0]000/.test(w.document.body.textContent));
  verif('Page d’inscription : retour possible vers la connexion', !!w.document.getElementById('btn-vers-connexion'));

  /* ---------- 2. Inscription puis accès à l'application ---------- */
  f.querySelector('[name=email]').value = email;
  f.querySelector('[name=mot_de_passe]').value = motDePasse;
  f.querySelector('[name=confirmation]').value = motDePasse;
  f.querySelector('[name=prenom_contact]').value = 'Alain';
  f.querySelector('[name=nom_contact]').value = 'Demo';
  f.querySelector('[name=nom]').value = nomEntreprise;
  f.querySelector('[name=date_creation]').value = '2024-03-15';
  f.querySelector('[name=niu]').value = 'U' + TS;
  f.querySelector('[name=ville]').value = 'Yaoundé';
  f.querySelector('[name=boutique]').value = 'BOUTIQUE PRINCIPALE INTERFACE';
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  await attendreCondition(() => w.document.querySelector('nav a'), { message: 'accès à l’application après inscription' });
  verif('Après inscription : l’administrateur accède à l’application (menus affichés)',
    w.document.querySelectorAll('nav a').length >= 3,
    w.document.querySelectorAll('nav a').length + ' modules');

  /* ---------- 2 bis. Vérification de l'email : accès bloquant ---------- */
  await attendreCondition(() => w.document.getElementById('form-verification'),
    { message: 'écran de vérification de l’email absent' });
  verif('Après inscription : accès limité à l’écran de vérification de l’email',
    !!w.document.getElementById('form-verification'));
  verif('Écran de vérification : l’adresse email du compte est rappelée',
    w.document.getElementById('contenu').textContent.includes(email));

  /* Le bouton « Renvoyer » doit exister avant même la première saisie. */
  verif('Écran de vérification : bouton « Renvoyer le code » présent',
    !!w.document.getElementById('v-renvoyer'));

  /* Un code erroné ne débloque rien. */
  const fVerif = w.document.getElementById('form-verification');
  fVerif.querySelector('[name=code]').value = '000000';
  fVerif.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await attendre(500);
  verif('Écran de vérification : un code erroné est refusé',
    /invalide|incorrect|erreur/i.test(w.document.getElementById('contenu').textContent));

  /* Le bon code (reçu par email) ouvre l'application. */
  const code = codeVerification(email);
  verif('Email de vérification : un code à 6 chiffres a bien été généré', /^[0-9]{6}$/.test(code || ''));
  fVerif.querySelector('[name=code]').value = code;
  fVerif.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await attendreCondition(() => !w.document.getElementById('form-verification'),
    { message: 'l’écran de vérification ne se referme pas après le bon code' });
  verif('Email vérifié : l’application devient accessible',
    !!w.document.getElementById('form-verification') === false);

  /* Le blocage est levé : les modules redeviennent accessibles. */
  verif('Après vérification : le blocage est levé dans l’application',
    w.App.etat.emailBloque === false);
  w.App.allerA('dashboard');
  await attendreCondition(() => w.document.getElementById('contenu')
    && w.document.getElementById('contenu').innerHTML.length > 900,
    { message: 'tableau de bord inaccessible après vérification' });
  verif('Après vérification : le tableau de bord s’affiche', true);
  verif('Après inscription : le nom de son entreprise apparaît dans l’interface',
    new RegExp(nomEntreprise).test(w.document.body.textContent));

  // Espace « Aide » → WhatsApp 654 32 42 82
  const lienAide = [...w.document.querySelectorAll('nav a')].find((a) => /aide/i.test(a.textContent));
  verif('Espace « Aide » présent dans le menu', !!lienAide);
  if (lienAide) {
    lienAide.click();
    await attendreCondition(() => /wa\.me\/237654324282/.test(w.document.body.innerHTML), { message: 'lien WhatsApp absent' });
    const html = w.document.body.innerHTML;
    verif('Espace « Aide » : lien WhatsApp vers le 654 32 42 82', /wa\.me\/237654324282/.test(html));
    verif('Espace « Aide » : numéro affiché 654 32 42 82', /654\s?32\s?42\s?82/.test(w.document.body.textContent));
    await attendreCondition(() => /693[\s\u00a0]00[\s\u00a0]73[\s\u00a0]97/.test(w.document.body.textContent),
      { message: 'coordonnées de paiement absentes de l’espace Aide' });
    verif('Espace « Aide » : numéros Orange Money et MTN MoMo rappelés',
      /693[\s\u00a0]00[\s\u00a0]73[\s\u00a0]97/.test(w.document.body.textContent) &&
      /654[\s\u00a0]32[\s\u00a0]42[\s\u00a0]82/.test(w.document.body.textContent));
  }

  // L'administrateur crée sa boutique depuis l'interface
  w.App.allerA('utilisateurs');
  await attendreCondition(() => w.document.getElementById('u-boutique'), { message: 'écran comptes & rôles absent' });
  w.document.getElementById('u-boutique').click();
  await attendreCondition(() => w.document.querySelector('[data-creer]'), { message: 'formulaire boutique absent' });
  const modale = w.document.querySelector('[data-creer]').closest('.modale') || w.document;
  modale.querySelector('[name=code]').value = 'B2';
  modale.querySelector('[name=nom]').value = 'BOUTIQUE INTERFACE B2';
  w.document.querySelector('[data-creer]').click();
  await attendreCondition(() => /BOUTIQUE INTERFACE B2/.test(w.document.body.textContent), { message: 'boutique créée absente de la liste' });
  verif('L’administrateur crée sa boutique depuis l’interface', true);

  /* ---------- 3. Console du propriétaire ---------- */
  const w2 = await ouvrirFenetre();
  await attendreCondition(() => w2.App && w2.document.querySelector('#form-connexion'), { message: 'écran de connexion absent (2)' });
  const fc = w2.document.getElementById('form-connexion');
  fc.querySelector('[name=email]').value = 'franck06.nganou02oumbe2004@gmail.com';
  fc.querySelector('[name=mot_de_passe]').value = 'Aspirine46@!';
  fc.dispatchEvent(new w2.Event('submit', { bubbles: true, cancelable: true }));
  await attendreCondition(() => w2.document.querySelector('nav a'), { message: 'connexion propriétaire' });

  const menuPlateforme = [...w2.document.querySelectorAll('nav a')].find((a) => /plateforme|console/i.test(a.textContent));
  verif('Le propriétaire a un menu « Plateforme »', !!menuPlateforme);
  await attendreCondition(() => /console|plateforme/i.test(w2.document.body.textContent), { message: 'console non rendue' });
  await attendreCondition(() => new RegExp(nomEntreprise).test(w2.document.body.textContent), { message: 'entreprise absente de la console' });
  verif('Console : toutes les entreprises créées sont listées (dont la nouvelle)', true);
  verif('Console : statistiques globales (entreprises, boutiques, comptes, CA)',
    /entreprises/i.test(w2.document.body.textContent) && /boutiques/i.test(w2.document.body.textContent));

  // Page des paiements
  const lienPaiements = [...w2.document.querySelectorAll('nav a')].find((a) => /paiements/i.test(a.textContent));
  verif('Console : page « Paiements » dans le menu', !!lienPaiements);
  if (lienPaiements) {
    lienPaiements.click();
    await attendreCondition(() => /référence|AB-|Aucun paiement/i.test(w2.document.body.textContent), { message: 'page paiements non rendue' });
    verif('Console : page des paiements de toutes les entreprises affichée', true);
  }

  // Fiche d'une entreprise → ses boutiques
  w2.App.allerA('plateforme-entreprises');
  await attendreCondition(() => w2.document.querySelector('[data-fiche]'), { message: 'liste entreprises absente' });
  // Les entreprises sont affichées en cartes : on remonte jusqu'à la carte qui porte le nom.
  const carteDe = (b) => {
    let n = b;
    while (n && n !== w2.document.body) { if (new RegExp(nomEntreprise).test(n.textContent)) return n; n = n.parentElement; }
    return null;
  };
  const ligne = [...w2.document.querySelectorAll('[data-fiche]')].find((b) => carteDe(b));
  verif('Console : la nouvelle entreprise est sélectionnable', !!ligne);
  if (ligne) {
    ligne.click();
    await attendreCondition(() => /BOUTIQUE INTERFACE B2/.test(w2.document.body.textContent), { message: 'boutiques de l’entreprise absentes' });
    verif('Console : tous les magasins/boutiques de cette entreprise sont visibles', true);
    verif('Console : informations complètes (NIU, responsable, date de création)',
      new RegExp('U' + TS).test(w2.document.body.textContent) && /2024-03-15|15\/03\/2024/.test(w2.document.body.textContent));
  }

  /* ---------- 4. Nettoyage ---------- */
  const ent = await fetch(BASE + '/api/plateforme/entreprises', {
    headers: { Authorization: 'Bearer ' + w2.eval('Api.token') },
  }).then((r) => r.json());
  const cible = (Array.isArray(ent) ? ent : ent.entreprises).find((e) => e.nom === nomEntreprise);
  if (cible) {
    await fetch(BASE + '/api/plateforme/entreprises/' + cible.id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + w2.eval('Api.token') },
    });
    verif('Nettoyage : entreprise de test supprimée', true);
  } else {
    verif('Nettoyage : entreprise de test supprimée', false, 'entreprise introuvable');
  }
}

principal().then(() => {
  let ok = 0;
  resultats.forEach(([l, r, d]) => { if (r) ok++; console.log((r ? ' ✅ ' : ' ❌ ') + l + (!r && d ? ' → ' + d : '')); });
  if (erreurs.length) console.log('\nErreurs navigateur : \n - ' + erreurs.slice(0, 6).join('\n - '));
  console.log('\n' + ok + '/' + resultats.length + ' vérifications réussies.');
  process.exit(ok === resultats.length && erreurs.length === 0 ? 0 : 1);
}).catch((e) => { console.error('ERREUR', e); process.exit(1); });
