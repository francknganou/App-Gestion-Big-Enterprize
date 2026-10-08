/**
 * Test du parcours multi-entreprises (interface) :
 *   1. page publique de création d'entreprise,
 *   2. accès de l'administrateur d'entreprise à son espace + espace « Aide » WhatsApp,
 *   3. console du propriétaire (toutes les entreprises, tous les paiements).
 *
 * Nécessite : npm install --no-save jsdom  +  serveur démarré (npm start)
 *   node tests/multi-entreprises.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const Database = require('better-sqlite3');
const path = require('path');

/* Le code de vérification part par email ; sans serveur SMTP il reste consigné
   en base. Le test le lit là, comme l'utilisateur le lit dans sa boîte mail. */
function codeVerification(email) {
  const db = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(String(email).toLowerCase());
  if (!u) { db.close(); return null; }
  const c = db.prepare('SELECT code FROM codes_verification WHERE user_id=? AND utilise_at IS NULL ORDER BY id DESC LIMIT 1').get(u.id);
  db.close();
  return c ? c.code : null;
}

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PROPRIETAIRE = { email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!' };
const horodatage = Date.now();
const EMAIL_TEST = `test.multi.${horodatage}@essai.cm`;
const NOM_TEST = `BOUTIQUE TEST MULTI ${horodatage}`;

const erreurs = [];
const resultats = [];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreCondition(fn, { essais = 80, intervalle = 120, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) {
    let v; try { v = fn(); } catch (e) { v = false; }
    if (v) return v;
    await attendre(intervalle);
  }
  throw new Error(message);
}

async function principal() {
  const cv = new VirtualConsole();
  cv.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) erreurs.push('jsdomError: ' + e.message); });
  cv.on('error', (m) => erreurs.push('console.error: ' + m));

  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: cv,
  });
  const { window } = dom;
  window.fetch = (url, options) => fetch(new URL(url, BASE), options);
  window.alert = () => {};
  window.prompt = () => '';
  window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {} });

  const doc = window.document;
  // `Api` et `Fmt` sont déclarés avec const : accessibles dans la fenêtre, mais pas en
  // tant que propriétés de window → on passe par window.eval.
  const jetonApi = () => window.eval('Api.token');
  const oublierJeton = () => window.eval('Api.definirToken(null)');

  /* ============ 1. Page publique de création d'entreprise ============ */
  await attendreCondition(() => window.App && doc.querySelector('#form-connexion'), { message: 'écran de connexion absent' });
  resultats.push(['Écran de connexion affiché', true]);
  resultats.push(['Bouton « Créer mon entreprise » sur l’écran de connexion', !!doc.getElementById('btn-inscription')]);

  doc.getElementById('btn-inscription').click();
  await attendreCondition(() => doc.querySelector('#form-inscription'), { message: 'formulaire d’inscription absent' });
  resultats.push(['Page de création d’entreprise affichée', true]);
  resultats.push(['Bouton « J’ai déjà un compte » proposé', !!doc.getElementById('btn-vers-connexion')]);

  const form = doc.getElementById('form-inscription');
  const champs = ['nom', 'email', 'niu', 'date_creation', 'nom_contact', 'prenom_contact', 'mot_de_passe'];
  const manquants = champs.filter((n) => !form.querySelector(`[name=${n}]`));
  resultats.push([`Champs exigés présents (email pro, nom, prénom, entreprise, date de création, NIU)${manquants.length ? ' — manquants : ' + manquants : ''}`,
    manquants.length === 0]);
  resultats.push(['Zone de dépôt du logo (photo)', !!doc.getElementById('champ-logo') && !!doc.getElementById('apercu-logo')]);
  resultats.push(['Tarifs et essai affichés', /11\s?500 FCFA/.test(doc.body.textContent) && /132\s?000 FCFA/.test(doc.body.textContent)
    && /essai gratuit/i.test(doc.body.textContent)]);
  resultats.push(['Assistance WhatsApp annoncée sur la page publique', /654 32 42 82/.test(doc.body.textContent)]);

  /* ============ 2. Inscription réelle via l'interface ============ */
  form.querySelector('[name=nom]').value = NOM_TEST;
  form.querySelector('[name=email]').value = EMAIL_TEST;
  form.querySelector('[name=niu]').value = 'M0999888777T';
  form.querySelector('[name=date_creation]').value = '2026-02-14';
  form.querySelector('[name=nom_contact]').value = 'Nganou';
  form.querySelector('[name=prenom_contact]').value = 'Bernard';
  form.querySelector('[name=telephone]').value = '699112233';
  form.querySelector('[name=ville]').value = 'Yaoundé';
  form.querySelector('[name=boutique]').value = 'Boutique de test';
  form.querySelector('[name=mot_de_passe]').value = 'Essai@2026';
  form.querySelector('[name=confirmation]').value = 'Essai@2026';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await attendreCondition(() => doc.querySelector('nav a'), { essais: 120, message: 'coquille non rendue après inscription' });

  /* Accès limité tant que l'email n'est pas confirmé (vérification bloquante). */
  await attendreCondition(() => doc.getElementById('form-verification'),
    { essais: 120, message: 'écran de vérification de l’email absent après inscription' });
  resultats.push(['Après inscription : l’accès est limité à la vérification de l’email',
    !!doc.getElementById('form-verification')]);

  const fVerif = doc.getElementById('form-verification');
  fVerif.querySelector('[name=code]').value = codeVerification(EMAIL_TEST) || '000000';
  fVerif.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await attendreCondition(() => !doc.getElementById('form-verification'),
    { essais: 120, message: 'l’écran de vérification ne se referme pas' });

  const u = window.App.etat.utilisateur;
  resultats.push(['L’administrateur entre dans l’application après vérification de son email',
    !!u && u.email === EMAIL_TEST && u.email_verifie === 1]);
  resultats.push(['Son espace est bien celui de sa nouvelle entreprise',
    !!u.entreprise && u.entreprise.nom === NOM_TEST && u.entreprise.niu === 'M0999888777T']);
  resultats.push(['Entreprise isolée : 1 seule boutique au départ', window.App.etat.magasins.length === 1]);
  resultats.push(['Ce compte n’est pas propriétaire de la plateforme', u.plateforme === false]);
  resultats.push(['Aucune vue « Plateforme » pour lui',
    !doc.querySelector('nav a[data-vue^="plateforme"]')]);

  /* ============ 3. Espace « Aide » (WhatsApp 654 32 42 82) ============ */
  resultats.push(['Module « Aide » dans le menu', !!doc.querySelector('nav a[data-vue="aide"]')]);
  await window.App.monter('aide');
  await attendreCondition(() => doc.querySelector('#contenu .bandeau-whatsapp, #contenu a[href*="wa.me"]'), { message: 'espace Aide non rendu' });
  const contenuAide = doc.getElementById('contenu').textContent;
  const lienWa = [...doc.querySelectorAll('#contenu a[href*="wa.me"]')].map((a) => a.href).join(' ');
  resultats.push(['Espace Aide : lien WhatsApp vers le 654 32 42 82', /wa\.me\/237654324282/.test(lienWa)]);
  resultats.push(['Espace Aide : numéro affiché lisiblement', /654 32 42 82/.test(contenuAide)]);
  resultats.push(['Espace Aide : message pré-rempli (entreprise + NIU)',
    /wa\.me\/237654324282\?text=/.test(lienWa) && /M0999888777T/.test(decodeURIComponent(lienWa))]);
  resultats.push(['Espace Aide : fiche entreprise et FAQ', /Ma fiche entreprise|Questions/i.test(contenuAide)]);

  /* ============ 4. Demande de paiement de la nouvelle entreprise ============ */
  const demande = await window.fetch('/api/abonnement/demande', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jetonApi() },
    body: JSON.stringify({ service: 'orange_money', plan: 'mensuel', telephone_payeur: '699112233' }),
  }).then((r) => r.json());
  resultats.push([`Demande de paiement créée depuis l’espace entreprise (${demande.reference || '—'})`, !!demande.reference]);

  /* ============ 5. Console du propriétaire ============ */
  oublierJeton();
  window.App.afficherConnexion();
  await attendreCondition(() => doc.querySelector('#form-connexion'), { message: 'retour à l’écran de connexion impossible' });
  const f2 = doc.getElementById('form-connexion');
  f2.querySelector('[name=email]').value = PROPRIETAIRE.email;
  f2.querySelector('[name=mot_de_passe]').value = PROPRIETAIRE.mot_de_passe;
  f2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  /* App pose etat.utilisateur avant de rendre la coquille : il faut attendre le
     menu lui-même, sinon les assertions sur la navigation tombent sur un nav absent. */
  await attendreCondition(
    () => window.App.etat.utilisateur && window.App.etat.utilisateur.plateforme && doc.querySelector('nav'),
    { message: 'connexion propriétaire impossible' });

  resultats.push(['Le propriétaire est reconnu (portée plateforme)', window.App.etat.utilisateur.portee === 'plateforme']);
  const menusPlateforme = [...doc.querySelectorAll('nav a[data-vue^="plateforme"]')].map((a) => a.dataset.vue);
  resultats.push([`Menu « Plateforme » présent (${menusPlateforme.length} modules)`, menusPlateforme.length >= 3]);
  resultats.push(['Groupe « Plateforme » affiché dans la navigation', /Plateforme/.test(doc.querySelector('nav').textContent)]);
  resultats.push(['Le propriétaire arrive sur la console', window.App.etat.vue === 'plateforme']);

  await attendreCondition(() => /Entreprises clientes/.test(doc.getElementById('contenu').textContent), { message: 'tableau de bord plateforme non rendu' });
  const txtPlateforme = doc.getElementById('contenu').textContent;
  resultats.push(['Tableau de bord : total des entreprises clientes', /Entreprises clientes/.test(txtPlateforme)]);
  resultats.push(['Tableau de bord : boutiques, comptes et CA cumulés',
    /Boutiques créées/.test(txtPlateforme) && /Comptes utilisateurs/.test(txtPlateforme) && /Chiffre d'affaires cumulé/.test(txtPlateforme)]);
  resultats.push(['Tableau de bord : encaissement des abonnements', /Encaissé \(abonnements\)/.test(txtPlateforme)]);
  resultats.push(['Tableau de bord : réglages (tarifs, Orange Money, MTN, WhatsApp)', !!doc.getElementById('form-plateforme')]);

  /* Fiche de toutes les entreprises */
  await window.App.monter('plateforme-entreprises');
  await attendreCondition(() => /entreprise\(s\) cliente\(s\)/.test(doc.getElementById('contenu').textContent), { message: 'liste des entreprises non rendue' });
  const txtEntreprises = doc.getElementById('contenu').textContent;
  resultats.push(['Liste des entreprises créées (toutes)', /INVENTA GESTYPRO SARL/.test(txtEntreprises) && txtEntreprises.includes(NOM_TEST)]);
  resultats.push(['Fiche entreprise : NIU, responsable, date de création, ville',
    /NIU/.test(txtEntreprises) && /Bernard/.test(txtEntreprises) && /14\/02\/2026/.test(txtEntreprises) && /Yaound/.test(txtEntreprises)]);
  resultats.push(['Fiche entreprise : boutiques, comptes, ventes, total payé',
    /Boutiques \/ magasins/.test(txtEntreprises) && /Comptes · produits · clients/.test(txtEntreprises) && /Total payé/.test(txtEntreprises)]);
  resultats.push(['Bouton de suspension d’accès', !!doc.querySelector('[data-statut]')]);

  /* Fiche détaillée (boutiques + comptes + paiements) */
  const btnFiche = doc.querySelector('[data-fiche]');
  btnFiche.click();
  await attendreCondition(() => doc.querySelector('.modale .modale-corps') && /Boutiques \/ magasins/.test(doc.querySelector('.modale .modale-corps').textContent),
    { message: 'fiche détaillée non ouverte' });
  const txtFiche = doc.querySelector('.modale .modale-corps').textContent;
  resultats.push(['Fiche détaillée : informations complètes de l’entreprise',
    /NIU/.test(txtFiche) && /Entreprise créée le/.test(txtFiche) && /inscrite sur la plateforme le/.test(txtFiche)]);
  resultats.push(['Fiche détaillée : ses magasins/boutiques', /Boutiques \/ magasins/.test(txtFiche) && /Boutique de test/.test(txtFiche)]);
  resultats.push(['Fiche détaillée : ses comptes utilisateurs', /Comptes utilisateurs/.test(txtFiche) && new RegExp(EMAIL_TEST.replace('.', '\\.')).test(txtFiche)]);
  resultats.push(['Fiche détaillée : ses paiements d’abonnement', /Paiements d'abonnement/.test(txtFiche) && /11\s?500 FCFA/.test(txtFiche)]);
  doc.querySelector('.modale .fermer').click();

  /* Page des paiements : valider puis rejeter */
  await window.App.monter('plateforme-paiements');
  await attendreCondition(() => /Paiements reçus/.test(doc.getElementById('contenu').textContent), { message: 'page des paiements non rendue' });
  const txtPaiements = doc.getElementById('contenu').textContent;
  resultats.push(['Page des paiements de toutes les entreprises', /Paiements reçus/.test(txtPaiements) && txtPaiements.includes(NOM_TEST)]);
  resultats.push(['Paiement en attente : boutons Valider / Rejeter / Supprimer',
    !!doc.querySelector('[data-valider]') && !!doc.querySelector('[data-rejeter]') && !!doc.querySelector('[data-suppr]')]);
  resultats.push(['Paiement : montant et référence visibles',
    /11\s?500 FCFA/.test(txtPaiements) && new RegExp((demande.reference || 'ZZZ').replace(/-/g, '\\-')).test(txtPaiements)]);

  const idPaiement = doc.querySelector('[data-valider]').dataset.valider;
  const reponseValidation = await window.fetch(`/api/plateforme/paiements/${idPaiement}/valider`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + jetonApi(), 'Content-Type': 'application/json' }, body: '{}',
  }).then((r) => r.json());
  resultats.push([`Validation du paiement par le propriétaire (${reponseValidation.entreprise || '—'} → ${reponseValidation.etat ? reponseValidation.etat.statut_libelle : '—'})`,
    !!reponseValidation.ok]);

  /* ============ 6. Nettoyage ============ */
  const liste = await window.fetch('/api/plateforme/entreprises', { headers: { Authorization: 'Bearer ' + jetonApi() } }).then((r) => r.json());
  const cible = (liste || []).find((e) => e.email === EMAIL_TEST);
  if (cible) {
    const suppression = await window.fetch('/api/plateforme/entreprises/' + cible.id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + jetonApi() },
    }).then((r) => r.json());
    resultats.push([`Entreprise de test supprimée par le propriétaire (${suppression.ok ? 'ok' : 'échec'})`, !!suppression.ok]);
  } else {
    resultats.push(['Entreprise de test introuvable pour le nettoyage', false]);
  }

  dom.window.close();

  /* ------------------------------ Résumé ------------------------------ */
  console.log('\n=== TEST MULTI-ENTREPRISES — Inventa GestyPro ===\n');
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

principal().catch((e) => { console.error("Échec du test :", e.message); console.error(e.stack.split("\n").slice(1,6).join("\n")); process.exit(1); });
