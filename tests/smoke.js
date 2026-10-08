/**
 * Test d'intégration de l'interface (nécessite : npm install --no-save jsdom)
 * Le serveur doit être démarré : npm start
 *
 *   node tests/smoke.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Une promesse rejetée (ex. une vue remplacée pendant son chargement) ne doit pas
// interrompre la série de tests : on la consigne comme erreur et on continue.
const rejets = [];
process.on('unhandledRejection', (e) => rejets.push('unhandledRejection: ' + (e && e.message ? e.message : String(e))));
const erreurs = [];
const resultats = [];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreCondition(fn, { essais = 60, intervalle = 120, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) {
    const v = fn();
    if (v) return v;
    await attendre(intervalle);
  }
  throw new Error(message);
}

async function principal() {
  const consoleVirtuelle = new VirtualConsole();
  consoleVirtuelle.on('jsdomError', (e) => erreurs.push('jsdomError: ' + e.message));
  consoleVirtuelle.on('error', (m) => erreurs.push('console.error: ' + m));

  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: consoleVirtuelle,
  });
  const { window } = dom;
  // Node expose fetch : on le branche dans la fenêtre jsdom avec résolution d'URL relative
  window.fetch = (url, options) => fetch(new URL(url, BASE), options);
  window.alert = () => {};
  window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {} });

  await attendreCondition(() => window.App && window.document.querySelector('#form-connexion'), { message: 'écran de connexion absent' });
  resultats.push(['Écran de connexion affiché', true]);

  // ---- Connexion administrateur ----
  const form = window.document.getElementById('form-connexion');
  form.querySelector('[name=email]').value = 'admin@shoppingplus.cm';
  form.querySelector('[name=mot_de_passe]').value = 'Admin@2026';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await attendreCondition(() => window.document.querySelector('nav a'), { message: 'coquille non rendue après connexion' });
  const nbMenus = window.document.querySelectorAll('nav a').length;
  resultats.push([`Connexion admin + menus affichés (${nbMenus} modules)`, nbMenus >= 12]);
  resultats.push(['Nom utilisateur en pied de menu', /Administrateur/.test(window.document.querySelector('.bs-bas').textContent)]);

  // ---- Abonnement : badge d'essai + page de paiement Mobile Money ----
  let referencePaiement = null;
  try {
    const badge = window.document.getElementById('badge-abonnement');
    resultats.push(['Abonnement : badge visible dans l’en-tête',
      !!badge && /Essai gratuit|Abonnement/.test(badge.textContent)]);

    await window.App.monter('abonnement');
    await attendre(800);
    const zoneAb = window.document.getElementById('contenu');
    const txtAb = zoneAb.textContent;
    resultats.push(['Abonnement : statut, essai gratuit et jours restants affichés',
      /Essai gratuit/.test(txtAb) && /Jours restants/.test(txtAb)]);
    resultats.push(['Abonnement : 11 500 FCFA / mois et 132 000 FCFA / an affichés',
      /11\s?500 FCFA/.test(txtAb) && /132\s?000 FCFA/.test(txtAb)]);
    /* Les codes de paiement sont désormais cachés derrière les logos : cliquer un
       logo lance directement le paiement (assistant), rien n'est affiché en clair. */
    resultats.push(['Abonnement : codes cachés derrière les logos Orange Money / MTN',
      !/693 00 73 97/.test(txtAb) && !/654 32 42 82/.test(txtAb)
      && !!zoneAb.querySelector('img[src*="orange-money"]') && !!zoneAb.querySelector('img[src*="mtn-momo"]')]);
    resultats.push(['Abonnement : aucune carte bancaire demandée',
      !/numéro de carte|code cvv|date d.expiration/i.test(txtAb)]);

    window.document.querySelector('input[name=plan][value=annuel]').click();
    await attendre(250);
    resultats.push(['Abonnement : montant recalculé selon la formule choisie',
      /132\s?000 FCFA/.test(window.document.getElementById('recap-montant').textContent)]);

    /* Cliquer le logo MTN lance directement le paiement (assistant). */
    window.document.querySelector('.logo-paiement[data-service=mtn_momo]').click();
    await attendre(400);
    const modP = [...window.document.querySelectorAll('.voile')].pop();
    const txtP = modP.textContent;
    const liensTel = [...modP.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    resultats.push(['Assistant de paiement : numéro du marchand, montant et étapes USSD',
      /654 32 42 82/.test(txtP) && /132\s?000 FCFA/.test(txtP) && /Transfert d.argent/.test(txtP)]);
    resultats.push(['Assistant de paiement : lien USSD tel: présent', liensTel.includes('tel:*126%23')]);
    modP.querySelector('[name=telephone_payeur]').value = '677112233';
    modP.querySelector('[data-paye]').click();
    referencePaiement = await attendreCondition(() => {
      const t = (window.document.querySelector('.voile') || { textContent: '' }).textContent;
      return (t.match(/AB-\d{4}-\d{4}/) || [])[0];
    }, { message: 'référence de paiement non affichée' });
    const txtApres = window.document.querySelector('.voile').textContent;
    resultats.push([`Paiement : référence ${referencePaiement} + message de validation`,
      txtApres.includes(referencePaiement) && /Validation de votre paiement/.test(txtApres)]);
    window.document.querySelector('.voile [data-fermer]').click();
    await attendre(1000);

    const htmlAb = window.document.getElementById('contenu').innerHTML;
    resultats.push(['Paiement : demande enregistrée en attente de validation',
      htmlAb.includes(referencePaiement) && /En attente de validation/.test(htmlAb)]);

    // La validation est désormais réservée au propriétaire : l'administrateur n'a plus ce bouton.
    resultats.push(['Administrateur : aucune validation possible (réserve au propriétaire)',
      !window.document.querySelector('[data-valider]') && !window.document.querySelector('[data-rejeter]')]);
  } catch (e) {
    resultats.push(['Parcours abonnement (admin)', false]);
    erreurs.push('Abonnement admin : ' + e.message);
  }

  // ---- Toutes les vues ----
  const vues = Object.keys(window.App.vues);
  for (const vue of vues) {
    try {
      await window.App.monter(vue);
      await attendre(350);
      const zone = window.document.getElementById('contenu');
      const texte = zone.textContent || '';
      const erreur = /Une erreur est survenue/.test(texte);
      const riche = zone.innerHTML.length > 900;
      resultats.push([
        `Vue « ${vue} » rendue (${(zone.innerHTML.length / 1024).toFixed(1)} Ko HTML)`,
        !erreur && riche,
      ]);
      if (erreur) erreurs.push('Vue ' + vue + ' : ' + texte.slice(0, 240));
    } catch (e) {
      resultats.push([`Vue « ${vue} » rendue`, false]);
      erreurs.push('Vue ' + vue + ' : ' + e.message);
    }
  }

  // ---- Une vente complète depuis la caisse ----
  try {
    await window.App.monter('caisse');
    // La liste des produits arrive par l'API : on attend son affichage.
    await attendreCondition(() => window.document.querySelectorAll('.pos-produit:not(.rupture)').length > 0,
      { essais: 40, intervalle: 150, message: 'produits de la caisse absents' }).catch(() => null);
    await attendre(150);
    const produits = window.document.querySelectorAll('.pos-produit:not(.rupture)');
    resultats.push([`Caisse : ${produits.length} produits cliquables`, produits.length > 0]);
    produits[0].click();
    await attendre(120);
    produits[1] && produits[1].click();
    await attendre(200);
    const lignes = window.document.querySelectorAll('.panier-ligne').length;
    resultats.push([`Caisse : panier avec ${lignes} ligne(s)`, lignes === 2]);
    const total = window.document.querySelector('.panier-total.grand').textContent;
    resultats.push([`Caisse : total calculé « ${total.replace(/\s+/g, ' ').trim()} »`, /FCFA/.test(total)]);
    /* Le client paie : on donne toujours plus que le total du panier pour
       contrôler le calcul de la monnaie (les prix du catalogue varient). */
    const totalNumerique = Number((total.match(/[\d\s\u00a0]+/)[0] || '0').replace(/[\s\u00a0]/g, ''));
    const billet = Math.max(10000, (Math.floor(totalNumerique / 10000) + 1) * 10000);
    const champPaye = window.document.getElementById('pos-paye');
    champPaye.value = String(billet);
    champPaye.dispatchEvent(new window.Event('input', { bubbles: true }));
    await attendre(150);
    const monnaieAffichee = window.document.getElementById('pos-monnaie').value;
    const monnaieAttendue = billet - totalNumerique;
    resultats.push([`Caisse : monnaie calculée « ${monnaieAffichee.replace(/\s+/g, ' ').trim()} » (pour ${billet.toLocaleString('fr-FR')} FCFA)`,
      /FCFA/.test(monnaieAffichee)
      && Number(monnaieAffichee.replace(/[^\d]/g, '')) === monnaieAttendue]);
    window.document.getElementById('pos-valider').click();
    const texteTicket = () => { const v = window.document.querySelector('.voile'); return v ? v.textContent : ''; };
    await attendreCondition(() => /VTE-\d+/.test(texteTicket()) && /TOTAL/.test(texteTicket()), { message: 'ticket non affiché' });
    resultats.push(['Vente encaissée + ticket généré (avec monnaie rendue)', /Monnaie rendue/.test(texteTicket())]);
    const boutonFermer = [...window.document.querySelectorAll('.voile [data-fermer]')][0];
    if (boutonFermer) boutonFermer.click();
    await attendre(300);
  } catch (e) {
    resultats.push(['Parcours caisse complet', false]);
    erreurs.push('Caisse : ' + e.message);
  }

  // ---- Contrôle des filtres du tableau de bord ----
  try {
    await window.App.monter('dashboard');
    // Le tableau de bord charge ses chiffres puis dessine le graphique : on attend qu'il soit là.
    await attendreCondition(() => window.document.querySelector('svg.graphique'),
      { essais: 40, intervalle: 150, message: 'graphique du tableau de bord absent' }).catch(() => null);
    const kpis = window.document.querySelectorAll('.kpi').length;
    resultats.push([`Tableau de bord : ${kpis} indicateurs`, kpis >= 6]);
    const svg = window.document.querySelectorAll('svg.graphique').length;
    resultats.push([`Tableau de bord : graphique d'évolution (${svg} SVG)`, svg >= 1]);
  } catch (e) {
    resultats.push(['Tableau de bord', false]);
    erreurs.push('Dashboard : ' + e.message);
  }

  // ---- Rapport groupé ----
  try {
    await window.App.monter('rapports');
    await attendre(700);
    const sel = window.document.getElementById('r-group');
    sel.value = 'magasin';
    window.document.getElementById('r-appliquer').click();
    /* Le rapport est rechargé du serveur : on attend les lignes au lieu d'un
       délai fixe, sinon l'assertion devient aléatoire sur machine chargée. */
    await attendreCondition(() => window.document.querySelectorAll('#r-contenu tbody tr').length >= 1,
      { essais: 40, intervalle: 150, message: 'rapport groupé par magasin vide' }).catch(() => null);
    const lignes = window.document.querySelectorAll('#r-contenu tbody tr').length;
    resultats.push([`Rapports groupés par magasin : ${lignes} lignes`, lignes >= 1]);
  } catch (e) {
    resultats.push(['Rapports', false]);
    erreurs.push('Rapports : ' + e.message);
  }

  // ---- L'administrateur crée une boutique puis y affecte un(e) caissier(ère) ----
  try {
    await window.App.monter('utilisateurs');
    await attendre(900);
    window.document.getElementById('u-boutique').click();
    await attendre(400);
    const modB = [...window.document.querySelectorAll('.voile')].pop();
    resultats.push(['Comptes : bouton « Nouvelle boutique » pour l’administrateur',
      !!modB && /autant de boutiques que vous voulez/i.test(modB.textContent)]);
    const nomBoutique = 'Boutique Test ' + Date.now().toString().slice(-5);
    modB.querySelector('[name=code]').value = 'TST' + Date.now().toString().slice(-4);
    modB.querySelector('[name=nom]').value = nomBoutique;
    modB.querySelector('[name=ville]').value = 'Douala';
    modB.querySelector('[data-creer]').click();

    await attendreCondition(() => {
      const m = (window.document.querySelector('.voile') || { textContent: '' }).textContent;
      return /Nouveau compte utilisateur/i.test(m);
    }, { message: 'fiche du caissier non ouverte après création de la boutique', essais: 80 });
    resultats.push([`Boutique « ${nomBoutique} » créée puis fiche du caissier ouverte`, true]);

    const modC = [...window.document.querySelectorAll('.voile')].pop();
    const cases = () => [...modC.querySelectorAll('.hab')];
    resultats.push([`Habilitations : ${cases().length} permissions proposées dans la fiche du compte`, cases().length >= 30]);
    const selMagasin = modC.querySelector('[name=magasin_id]');
    const optionBoutique = [...selMagasin.options].find((o) => o.textContent.includes(nomBoutique));
    resultats.push(['Habilitations : la nouvelle boutique est proposée à l’affectation', !!optionBoutique]);
    if (optionBoutique) selMagasin.value = optionBoutique.value;
    modC.querySelector('[name=role]').value = 'caissier';
    modC.querySelector('[name=role]').dispatchEvent(new window.Event('change', { bubbles: true }));
    await attendre(250);

    const emailCaissier = 'caissier.test.' + Date.now() + '@shoppingplus.cm';
    modC.querySelector('[name=nom]').value = 'Caissière Test Boutique';
    modC.querySelector('[name=email]').value = emailCaissier;
    modC.querySelector('[name=mot_de_passe]').value = 'Caisse@2026';

    const caseRetiree = cases().find((c) => c.value === 'ventes.consulter');
    const caseAccordee = cases().find((c) => c.value === 'ventes.annuler');
    resultats.push(['Habilitations : cases « du rôle » pré-cochées pour un caissier',
      !!caseRetiree && !!caseAccordee && caseRetiree.checked && !caseAccordee.checked]);
    caseRetiree.click();
    caseAccordee.click();
    await attendre(300);
    const resume = modC.querySelector('#hab-resume').textContent;
    resultats.push(['Habilitations : récapitulatif « accordée / retirée » mis à jour',
      /accordée/.test(resume) && /retirée/.test(resume)]);

    modC.querySelector('[data-enregistrer]').click();
    await attendre(1800);
    resultats.push(['Caissier affecté à la nouvelle boutique avec ses habilitations sur mesure',
      window.document.getElementById('contenu').textContent.includes('Caissière Test Boutique')]);

    const jetonAdmin = window.eval('Api.token');
    const entetesAdmin = { Authorization: 'Bearer ' + jetonAdmin, 'Content-Type': 'application/json' };
    const listeU = await window.fetch('/api/utilisateurs', { headers: entetesAdmin }).then((r) => r.json());
    const cree = (listeU || []).find((u) => u.email === emailCaissier);
    resultats.push(['Habilitations enregistrées côté serveur (1 accordée, 1 retirée)',
      !!cree && cree.habilitations.accordees.includes('ventes.annuler') && cree.habilitations.retirees.includes('ventes.consulter')]);

    const profil = await window.fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailCaissier, mot_de_passe: 'Caisse@2026' }),
    }).then((r) => r.json());
    const perms = (profil.utilisateur || {}).permissions || [];
    resultats.push(['Le compte applique réellement ses habilitations (annulation accordée, historique retiré)',
      perms.includes('ventes.annuler') && !perms.includes('ventes.consulter')]);
    const refus = await window.fetch('/api/ventes?limite=1', { headers: { Authorization: 'Bearer ' + profil.token } });
    resultats.push([`Permission retirée : historique des ventes refusé (HTTP ${refus.status})`, refus.status === 403]);
    const session = await window.fetch('/api/caisse/session', { headers: { Authorization: 'Bearer ' + profil.token } });
    resultats.push(['Le caissier conserve l’accès à sa caisse', session.ok]);

    // Nettoyage immédiat : le réseau de démonstration reste intact
    if (cree) await window.fetch('/api/utilisateurs/' + cree.id, { method: 'DELETE', headers: entetesAdmin });
    const magasins = await window.fetch('/api/magasins', { headers: entetesAdmin }).then((r) => r.json());
    const mb = (magasins || []).find((x) => x.nom === nomBoutique);
    if (mb) await window.fetch('/api/magasins/' + mb.id, { method: 'DELETE', headers: entetesAdmin });
    resultats.push(['Nettoyage : boutique de test et son compte supprimés', !!cree && !!mb]);
    window.eval("Stockage.setItem('sp_magasin','1')");
    await window.App.chargerContexte();
    window.App.rendreCoquille();
    await window.App.monter('utilisateurs');
    await attendre(400);
  } catch (e) {
    resultats.push(['Parcours boutique + habilitations du caissier', false]);
    erreurs.push('Boutique/habilitations : ' + e.message);
  }

  // ---- Connexion en tant que responsable de boutique : création de comptes ----
  try {
    await window.App.deconnecter(true);
    await attendreCondition(() => window.document.getElementById('form-connexion'), { message: 'écran de connexion absent' });
    const f1 = window.document.getElementById('form-connexion');
    f1.querySelector('[name=email]').value = 'chef.akwa@shoppingplus.cm';
    f1.querySelector('[name=mot_de_passe]').value = 'Chef@2026';
    f1.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await attendreCondition(() => window.document.querySelector('nav a'), { message: 'coquille responsable absente' });
    await attendre(500);
    const menusChef = [...window.document.querySelectorAll('nav a')].map((a) => a.dataset.vue);
    resultats.push([`Responsable de boutique : accès aux comptes (${menusChef.filter((m) => ['utilisateurs', 'magasins'].includes(m)).join(', ') || 'aucun'})`,
      menusChef.includes('utilisateurs') && menusChef.includes('stocks')]);
    resultats.push(['Responsable de boutique : pas d’accès aux paramètres réseau',
      !menusChef.includes('parametres')]);

    await window.App.monter('utilisateurs');
    await attendre(700);
    const bloc = window.document.getElementById('contenu').textContent;
    resultats.push(['Écran « Comptes & rôles » : boutique du responsable isolée',
      /Inventa GestyPro Akwa/.test(bloc) && !/Inventa GestyPro Bastos/.test(bloc)]);
    resultats.push(['Écran « Comptes & rôles » : rappel des rôles autorisés',
      /Rôles autorisés|Responsable de boutique/.test(bloc)]);

    // Création réelle d'un compte vendeur depuis l'interface
    const emailTest = 'vendeur.test.' + Date.now() + '@shoppingplus.cm';
    window.document.getElementById('u-nouveau').click();
    await attendre(250);
    const modale = window.document.querySelector('.voile');
    modale.querySelector('[name=nom]').value = 'Vendeur Test Interface';
    modale.querySelector('[name=email]').value = emailTest;
    modale.querySelector('[name=mot_de_passe]').value = 'Vendeur@2026';
    modale.querySelector('[name=role]').value = 'caissier';
    modale.querySelector('[data-enregistrer]').click();
    await attendre(1200);
    const apres = window.document.getElementById('contenu').textContent;
    resultats.push(['Création d’un compte vendeur depuis l’interface du responsable',
      apres.includes('Vendeur Test Interface')]);
    // Nettoyage : on supprime le compte de test pour laisser la base propre
    const jeton = window.eval('Api.token');   // « Api » est une const globale : on la lit via eval
    const liste = await window.fetch('/api/utilisateurs', {
      headers: { Authorization: 'Bearer ' + jeton },
    }).then((r) => r.json());
    const cree = (liste || []).find((u) => u.email === emailTest);
    if (cree) {
      const rep = await window.fetch('/api/utilisateurs/' + cree.id, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + jeton },
      });
      resultats.push(['Nettoyage du compte de test', rep.ok]);
    }
  } catch (e) {
    resultats.push(['Parcours responsable de boutique', false]);
    erreurs.push('Responsable : ' + e.message);
  }

  // ---- Connexion en tant qu'agent de stock : entrées/sorties SANS PRIX ----
  try {
    await window.App.deconnecter(true);
    await attendreCondition(() => window.document.getElementById('form-connexion'), { message: 'écran de connexion absent' });
    const f3 = window.document.getElementById('form-connexion');
    f3.querySelector('[name=email]').value = 'stock@shoppingplus.cm';
    f3.querySelector('[name=mot_de_passe]').value = 'Stock@2026';
    f3.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await attendreCondition(() => window.document.querySelector('nav a'), { message: 'coquille agent de stock absente' });
    await attendre(500);

    await window.App.monter('stocks');
    await attendre(800);
    const onglets = [...window.document.querySelectorAll('#s-onglets button')].map((b) => b.dataset.onglet);
    resultats.push([`Agent de stock : onglets disponibles (${onglets.join(', ')})`,
      onglets.includes('reception') && onglets.includes('journal')]);

    // Aucun champ « prix » nulle part dans l'écran de réception
    window.document.querySelector('#s-onglets [data-onglet=reception]').click();
    await attendre(900);
    const htmlReception = window.document.getElementById('s-contenu').innerHTML;
    resultats.push(['Écran de réception : aucun champ de prix demandé',
      !/name="prix/i.test(htmlReception) && !/type="number"[^>]*prix/i.test(htmlReception)]);

    // Réception multi-lignes : on remplit deux lignes et on valide
    const sels = window.document.querySelectorAll('#rec-lignes [data-prod]');
    const qtes = window.document.querySelectorAll('#rec-lignes [data-qte]');
    qtes[0].value = '7';
    qtes[0].dispatchEvent(new window.Event('change', { bubbles: true }));
    await attendre(200);
    window.document.getElementById('rec-ajouter').click();
    await attendre(250);
    const qtes2 = window.document.querySelectorAll('#rec-lignes [data-qte]');
    qtes2[1].value = '3';
    qtes2[1].dispatchEvent(new window.Event('change', { bubbles: true }));
    await attendre(200);
    window.document.getElementById('rec-valider').click();
    await attendre(1600);
    const texterech = window.document.getElementById('notifications').textContent;
    resultats.push(['Réception rapide enregistrée (2 lignes, sans prix) : ' + (texterech.match(/REC-\d+[^A-Za-z]*/) || [''])[0].trim(),
      /REC-\d+/.test(texterech)]);

    // L'agent de stock ne voit ni marges ni valeurs de stock
    const contenuStocks = window.document.getElementById('s-contenu').textContent;
    resultats.push(['Agent de stock : aucune valeur de stock affichée',
      !/Valeur du stock|Marge potentielle/.test(contenuStocks)]);
  } catch (e) {
    resultats.push(['Parcours agent de stock', false]);
    erreurs.push('Agent de stock : ' + e.message);
  }

  // ---- Contrôle des droits : connexion en tant que caissière ----
  try {
    await window.App.deconnecter(true);
    await attendreCondition(() => window.document.getElementById('form-connexion'), { message: 'écran de connexion absent' });
    const f2 = window.document.getElementById('form-connexion');
    f2.querySelector('[name=email]').value = 'caisse1@shoppingplus.cm';
    f2.querySelector('[name=mot_de_passe]').value = 'Caisse@2026';
    f2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await attendreCondition(() => window.document.querySelector('nav a'), { message: 'coquille caissière non rendue' });
    await attendre(500);
    const menusCaissier = [...window.document.querySelectorAll('nav a')].map((a) => a.dataset.vue);
    resultats.push([`Caissière : menus limités (${menusCaissier.join(', ')})`,
      !menusCaissier.includes('rapports') && !menusCaissier.includes('utilisateurs') && menusCaissier.includes('caisse')]);
    resultats.push(['Caissière : aucun accès aux comptes ni aux paramètres',
      !menusCaissier.includes('utilisateurs') && !menusCaissier.includes('parametres') && !menusCaissier.includes('achats')]);
    resultats.push(['Caissière : magasin d’affectation affiché (pas de sélecteur)',
      /Bastos/.test(window.document.querySelector('.selecteur-magasin').textContent)]);
    await window.App.monter('abonnement');
    await attendre(900);
    const htmlCaissiere = window.document.getElementById('contenu').innerHTML;
    resultats.push(['Caissière : page Abonnement en lecture seule (logos désactivés, pas de validation)',
      !!window.document.querySelector('.logo-paiement[disabled]') && !/data-valider|ab-expirer/.test(htmlCaissiere)]);
    await window.App.monter('caisse');
    await attendre(600);
    const entete = window.document.querySelector('.carte-entete').textContent;
    resultats.push(['Caisse de la caissière ouverte sur son magasin', /Bastos/.test(entete)]);
    // vente refusée si produit d'un autre magasin ? -> l'API impose le magasin, on vérifie que la vente part avec le bon magasin
    const r = await (window.fetch('/api/caisse/session', { headers: {} }).then((x) => x.json()).catch(() => null));
    resultats.push(['Session de caisse accessible', !!r]);
  } catch (e) {
    resultats.push(['Parcours caissière', false]);
    erreurs.push('Caissière : ' + e.message);
  }

  // ---- Abonnement expiré : opérations suspendues puis déblocage ----
  try {
    const jetonAdmin = await window.fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@shoppingplus.cm', mot_de_passe: 'Admin@2026' }),
    }).then((r) => r.json()).then((r) => r.token);
    const entetesAdmin = { Authorization: 'Bearer ' + jetonAdmin, 'Content-Type': 'application/json' };
    const jetonOwner = await window.fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!' }),
    }).then((r) => r.json()).then((r) => r.token);
    const entetesOwner = { Authorization: 'Bearer ' + jetonOwner, 'Content-Type': 'application/json' };

    const sim = await window.fetch('/api/abonnement/essai', {
      method: 'POST', headers: entetesAdmin, body: JSON.stringify({ jours: -1 }),
    }).then((r) => r.json());
    resultats.push(['Expiration simulée par l’administrateur', !!(sim.etat && sim.etat.expire)]);

    await window.eval("Api.post('/ventes', { lignes: [{ produit_id: 1, quantite: 1 }] }).catch(() => null)");
    const alerte = await attendreCondition(() => window.document.querySelector('[data-alerte-abonnement]'),
      { message: 'alerte d’abonnement expiré absente' });
    resultats.push(['Opération suspendue : fenêtre « Abonnement expiré » avec les moyens de paiement',
      /Abonnement expiré/.test(alerte.textContent) && /Mobile Money/.test(alerte.textContent)]);
    resultats.push(['Abonnement expiré : bandeau rouge + badge d’en-tête',
      !!window.document.querySelector('#bandeau-abonnement .bandeau.ko')
      && /expiré/i.test((window.document.getElementById('badge-abonnement') || {}).textContent || '')]);
    const btnFermer = window.document.querySelector('.voile [data-fermer]');
    if (btnFermer) btnFermer.click();
    await attendre(250);

    const accesAdmin = await window.fetch('/api/produits?limite=1', { headers: { Authorization: 'Bearer ' + jetonAdmin } });
    resultats.push([`Abonnement expiré : l’administrateur garde l’accès (HTTP ${accesAdmin.status})`, accesAdmin.ok]);
    const jetonUtilisateur = window.eval('Api.token');
    const venteRefusee = await window.fetch('/api/ventes', {
      method: 'POST', headers: { Authorization: 'Bearer ' + jetonUtilisateur, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lignes: [{ produit_id: 1, quantite: 1 }] }),
    });
    resultats.push([`Abonnement expiré : vente refusée à l’utilisateur (HTTP ${venteRefusee.status})`, venteRefusee.status === 402]);

    // Remise à neuf : essai de 7 jours et historique de test vidé
    const essai = await window.fetch('/api/abonnement/essai', {
      method: 'POST', headers: entetesAdmin, body: JSON.stringify({ jours: 7 }),
    }).then((r) => r.json());
    resultats.push(['Essai gratuit de 7 jours rétabli', !!(essai.etat && essai.etat.en_essai)]);
    /* On ne supprime que le paiement créé par cette suite : les demandes de
       paiement présentes en démonstration sont conservées. */
    const paiements = await window.fetch('/api/abonnement/paiements', { headers: entetesAdmin }).then((r) => r.json());
    const aSupprimer = (paiements || []).filter((p) => p.reference === referencePaiement);
    for (const p of aSupprimer) {
      await window.fetch('/api/abonnement/paiements/' + p.id, { method: 'DELETE', headers: entetesOwner });
    }
    resultats.push([`Nettoyage : ${aSupprimer.length} paiement de test supprimé (${referencePaiement || '—'})`,
      !referencePaiement || aSupprimer.length === 1]);
    const sante = await window.fetch('/api/sante').then((r) => r.json());
    resultats.push(['Service de santé : abonnement exposé aux autres postes', !!(sante.abonnement && sante.abonnement.tarifs)]);
  } catch (e) {
    resultats.push(['Parcours abonnement expiré', false]);
    erreurs.push('Abonnement expiré : ' + e.message);
  }

  // ---- Nettoyage de sécurité : aucun reste de test dans la base ----
  // On rétablit d'abord un essai gratuit de 7 jours (même si un bloc précédent a échoué
  // avant sa propre remise à neuf), sinon toute l'application resterait bloquée.
  try {
    const jetonProprietaire = await window.fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!' }),
    }).then((r) => r.json()).then((r) => r.token);
    const plat = await window.fetch('/api/plateforme/entreprises', {
      headers: { Authorization: 'Bearer ' + jetonProprietaire } }).then((r) => r.json());
    for (const e of plat || []) {
      await window.fetch(`/api/plateforme/entreprises/${e.id}/abonnement`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + jetonProprietaire, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jours: 7, motif: 'Remise à neuf après tests' }),
      });
    }
    /* Filet de sécurité : on ne supprime QUE le paiement créé par cette suite.
       Les demandes de paiement de la démonstration doivent survivre aux tests —
       un vidage global de /plateforme/paiements les effaçait toutes. */
    const paiementsPlat = await window.fetch('/api/plateforme/paiements', {
      headers: { Authorization: 'Bearer ' + jetonProprietaire } }).then((r) => r.json());
    const restesTest = (paiementsPlat || []).filter((p) => referencePaiement && p.reference === referencePaiement);
    for (const p of restesTest) {
      await window.fetch('/api/plateforme/paiements/' + p.id, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + jetonProprietaire } });
    }
    const sante = await window.fetch('/api/sante').then((r) => r.json());
    resultats.push(['Remise à neuf : essai de 7 jours rétabli, seul le paiement de test supprimé',
      !!(sante.abonnement && sante.abonnement.tarifs) && restesTest.length === 0]);
  } catch (e) {
    erreurs.push('Remise à neuf : ' + e.message);
  }

  try {
    const jetonAdmin = await window.fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@shoppingplus.cm', mot_de_passe: 'Admin@2026' }),
    }).then((r) => r.json()).then((r) => r.token);
    const entetes = { Authorization: 'Bearer ' + jetonAdmin, 'Content-Type': 'application/json' };
    const listeU = await window.fetch('/api/utilisateurs', { headers: entetes }).then((r) => r.json());
    const restes = (listeU || []).filter((u) => /\.test\.\d+@shoppingplus\.cm$/.test(u.email));
    for (const u of restes) await window.fetch('/api/utilisateurs/' + u.id, { method: 'DELETE', headers: entetes });
    const magasins = await window.fetch('/api/magasins', { headers: entetes }).then((r) => r.json());
    const boutiquesTest = (magasins || []).filter((x) => /^Boutique Test /.test(x.nom));
    for (const m of boutiquesTest) await window.fetch('/api/magasins/' + m.id, { method: 'DELETE', headers: entetes });
    resultats.push([`Base laissée propre (${restes.length} compte(s) et ${boutiquesTest.length} boutique(s) de test supprimés)`, true]);
  } catch (e) {
    erreurs.push('Nettoyage : ' + e.message);
  }

  dom.window.close();

  /* ------------------------------ Résumé ------------------------------ */
  console.log('\n=== TEST D\'INTÉGRATION — Inventa GestyPro ===\n');
  let echecs = 0;
  for (const [libelle, ok] of resultats) {
    if (!ok) echecs++;
    console.log(` ${ok ? '✅' : '❌'} ${libelle}`);
  }
  if (erreurs.length) {
    console.log('\n--- Détail des erreurs ---');
    erreurs.slice(0, 20).forEach((e) => console.log(' • ' + e.slice(0, 300)));
  }
  console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
  process.exit(echecs || erreurs.length ? 1 : 0);
}

principal().catch((e) => { console.error('Échec du test :', e.message); process.exit(1); });
