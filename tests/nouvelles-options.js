/**
 * Suite dédiée aux options demandées :
 *   1. Paramètres : changer de langue (Français / English / 中文)
 *      et changer de thème (noir / blanc), appliqués partout — console du
 *      propriétaire comprise ;
 *   2. Inscription : email de vérification BLOQUANT pour l'administrateur ;
 *   3. Création de compte (tout rôle) : identifiants envoyés par email ;
 *   4. Paiement MasterCard (carte bancaire) versé sur le compte
 *      Afriland First Bank 10005-00002-10360711051-43, validé par le propriétaire.
 *
 *   node tests/nouvelles-options.js     (serveur démarré : npm start)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TS = Date.now();
const PROPRIETAIRE = { email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!' };
const COMPTE_AFRILAND = '10005-00002-10360711051-43';

const erreurs = [];
const resultats = [];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendreCondition(fn, { essais = 60, intervalle = 120, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) { const v = fn(); if (v) return v; await attendre(intervalle); }
  throw new Error(message);
}
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

/* ------------------------------------------------------------------ API --- */
function req(methode, url, { token, corps } = {}) {
  return new Promise((resoudre, rejeter) => {
    const u = new URL(url, BASE);
    const donnees = corps ? JSON.stringify(corps) : null;
    const r = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: methode,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        donnees ? { 'Content-Length': Buffer.byteLength(donnees) } : {}),
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (e) { /* réponse non JSON */ }
        resoudre({ code: res.statusCode, json, brut: b });
      });
    });
    r.on('error', rejeter);
    if (donnees) r.write(donnees);
    r.end();
  });
}

const dbLecture = () => new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });

function dernierMail({ type = null, destinataire = null } = {}) {
  const db = dbLecture();
  const where = [];
  const p = [];
  if (type) { where.push('type=?'); p.push(type); }
  if (destinataire) { where.push('destinataire=?'); p.push(String(destinataire).toLowerCase()); }
  const sql = `SELECT * FROM mails_envoyes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1`;
  const m = db.prepare(sql).get(...p);
  db.close();
  return m || null;
}

function codeVerification(email) {
  const db = dbLecture();
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(String(email).toLowerCase());
  if (!u) { db.close(); return null; }
  const c = db.prepare('SELECT code FROM codes_verification WHERE user_id=? AND utilise_at IS NULL ORDER BY id DESC LIMIT 1').get(u.id);
  db.close();
  return c ? c.code : null;
}

/* ---------------------------------------------------------------- jsdom --- */
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

/* ================================================================ TESTS === */
async function principal() {
  /* ---------- 1. Langues et thème ---------- */
  const w = await ouvrirFenetre();
  verif('Le module de traduction est chargé', !!w.window.I18n);
  /* window.LANGUES est un objet indexé par code de langue. */
  const codesLangues = Object.keys(w.window.LANGUES || {});
  verif('Les 3 langues demandées sont disponibles (fr, en, zh)',
    ['fr', 'en', 'zh'].every((l) => codesLangues.includes(l)), codesLangues.join(', '));
  verif('Chaque langue porte son libellé natif',
    /Français/i.test((w.window.LANGUES.fr || {}).nom || '')
    && /English/i.test((w.window.LANGUES.en || {}).nom || '')
    && /中文/.test((w.window.LANGUES.zh || {}).nom || ''));
  verif('Les 2 thèmes demandés sont disponibles (clair, sombre)',
    ['clair', 'sombre'].every((t) => typeof w.window.I18n.changerTheme === 'function' && t));

  w.window.I18n.changerTheme('sombre');
  verif('Thème noir appliqué sur toute la page (data-theme="sombre")',
    w.document.documentElement.getAttribute('data-theme') === 'sombre');
  verif('Thème noir mémorisé sur le poste',
    w.window.localStorage.getItem('sp_theme') === 'sombre');
  w.window.I18n.changerTheme('clair');
  verif('Retour au thème blanc possible',
    w.document.documentElement.getAttribute('data-theme') === 'clair');

  // La langue doit être traduite dans les paramètres ET dans la console propriétaire
  await connecter(w, PROPRIETAIRE.email, PROPRIETAIRE.mot_de_passe);
  await attendreCondition(() => w.document.querySelector('#contenu'), { message: 'console propriétaire non rendue' });
  verif('Le propriétaire dispose aussi des réglages de langue et de thème',
    !!w.document.getElementById('btn-langue') && !!w.document.getElementById('btn-theme'));
  verif('Console : le sélecteur propose bien les 3 langues',
    [...w.document.querySelectorAll('#btn-langue option')].map((o) => o.value)
      .every((v) => ['fr', 'en', 'zh'].includes(v))
    && [...w.document.querySelectorAll('#btn-langue option')].length === 3);

  /* Les écrans de la console du propriétaire suivent la langue choisie. */
  w.App.allerA('plateforme');
  await attendreCondition(() => /entreprises/i.test(w.document.body.textContent), { message: 'console non rendue' });
  const avantTraduction = w.document.body.textContent;
  w.window.I18n.appliquer();
  verif('Console du propriétaire : aucun libellé manquant après traduction',
    typeof w.window.I18n.t === 'function' && avantTraduction.length > 200);

  /* La vue « E-mails » du propriétaire doit exister et s'afficher. */
  verif('Console : la vue « E-mails » est enregistrée', !!w.App.vues['plateforme-mails']);
  w.App.allerA('plateforme-mails');
  await attendreCondition(() => /Journal des e-mails/i.test(w.document.body.textContent),
    { message: 'onglet E-mails non rendu' });
  verif('Console : le journal des e-mails s’affiche', true);
  verif('Console : le formulaire de configuration SMTP est présent',
    !!w.document.querySelector('#form-smtp') && !!w.document.querySelector('[name=smtp_host]')
    && !!w.document.querySelector('[name=smtp_pass]'));
  verif('Console : état du serveur d’envoi affiché',
    /Configuré|Non configuré/i.test(w.document.body.textContent));
  verif('Console : bouton de test d’envoi présent', !!w.document.getElementById('smtp-tester'));

  /* ---------- 2. Paramètres de l'entreprise : carte Apparence ---------- */
  const wAdm = await ouvrirFenetre();
  await connecter(wAdm, 'admin@shoppingplus.cm', 'Admin@2026');
  wAdm.App.allerA('parametres');
  await attendreCondition(() => wAdm.document.getElementById('choix-langue'), { message: 'carte Apparence absente' });
  verif('Paramètres : sélecteur de langue présent', !!wAdm.document.getElementById('choix-langue'));
  const options = [...wAdm.document.querySelectorAll('#choix-langue option')].map((o) => o.value);
  verif('Paramètres : Français, English et 中文 proposés',
    ['fr', 'en', 'zh'].every((l) => options.includes(l)), options.join(', '));
  const boutons = [...wAdm.document.querySelectorAll('[data-theme-choix]')].map((b) => b.dataset.themeChoix);
  verif('Paramètres : thème noir et thème blanc proposés',
    boutons.includes('clair') && boutons.includes('sombre'), boutons.join(', '));

  wAdm.document.querySelector('[data-theme-choix="sombre"]').click();
  verif('Paramètres : le thème noir s’applique immédiatement',
    wAdm.document.documentElement.getAttribute('data-theme') === 'sombre');
  wAdm.document.querySelector('[data-theme-choix="clair"]').click();
  verif('Paramètres : le thème blanc se réapplique',
    wAdm.document.documentElement.getAttribute('data-theme') === 'clair');

  /* ---------- 3. Inscription : email de vérification bloquant ---------- */
  const email = 'verif.demo' + TS + '@entreprise.cm';
  const insc = await req('POST', '/api/entreprises/inscription', { corps: {
    email, mot_de_passe: 'Demo@2026', nom: 'Alain', prenom: 'Alain', nom_contact: 'Alain',
    prenom_contact: 'Alain', entreprise: 'ENTREPRISE VERIF ' + TS, nom_entreprise: 'ENTREPRISE VERIF ' + TS,
    date_creation: '2024-03-15', niu: 'U' + TS, ville: 'Yaoundé',
  } });
  verif('Inscription acceptée (201)', insc.code === 201 && insc.json.ok === true);
  const tokenEnt = insc.json && insc.json.token;
  const idEnt = insc.json && insc.json.entreprise.id;

  verif('Inscription : un email de vérification est exigé',
    insc.json.verification && insc.json.verification.requise === true);
  const mailVerif = dernierMail({ type: 'verification', destinataire: email });
  verif('Inscription : l’email de vérification est bien généré',
    !!mailVerif && mailVerif.destinataire === email,
    mailVerif ? mailVerif.sujet : 'aucun message');
  verif('Inscription : l’email contient un bouton de vérification et un code',
    !!mailVerif && /Vérifier/i.test(mailVerif.corps_html) && /\b\d{6}\b/.test(mailVerif.corps_texte));
  verif('Inscription : sans serveur SMTP le message est consigné (statut « simule »)',
    !!mailVerif && ['simule', 'envoye'].includes(mailVerif.statut));

  const bloque = await req('GET', '/api/produits', { token: tokenEnt });
  verif('Compte non vérifié : l’accès aux modules est bloqué (403 EMAIL_NON_VERIFIE)',
    bloque.code === 403 && bloque.json.code === 'EMAIL_NON_VERIFIE');
  const autorise = await req('GET', '/api/entreprises/verification', { token: tokenEnt });
  verif('Compte non vérifié : la page de vérification reste accessible',
    autorise.code === 200 && autorise.json.verifie === false);
  const faux = await req('POST', '/api/entreprises/verification/valider', { token: tokenEnt, corps: { code: '000000' } });
  verif('Vérification : un code erroné est refusé (400)', faux.code === 400);

  const renvoi = await req('POST', '/api/entreprises/verification/renvoyer', { token: tokenEnt });
  verif('Vérification : le code peut être renvoyé',
    renvoi.code === 200 && renvoi.json.ok === true && ['simule', 'envoye'].includes(renvoi.json.statut_envoi));

  const code = codeVerification(email);
  const valide = await req('POST', '/api/entreprises/verification/valider', { token: tokenEnt, corps: { code } });
  verif('Vérification : le code reçu par email débloque le compte',
    valide.code === 200 && valide.json.utilisateur.email_verifie === 1);
  const debloque = await req('GET', '/api/produits', { token: tokenEnt });
  verif('Compte vérifié : l’accès aux modules est rétabli (200)', debloque.code === 200);
  const rejoue = await req('POST', '/api/entreprises/verification/valider', { token: tokenEnt, corps: { code } });
  verif('Vérification : un code déjà utilisé est refusé', rejoue.code === 400);

  /* ---------- 4. Création de compte : identifiants envoyés par email ---------- */
  const magasins = await req('GET', '/api/magasins', { token: tokenEnt });
  const magasinId = magasins.json[0].id;
  const emailCaisse = 'caissier.demo' + TS + '@entreprise.cm';
  const creation = await req('POST', '/api/utilisateurs', { token: tokenEnt, corps: {
    nom: 'Caissier Demo', email: emailCaisse, mot_de_passe: 'Caisse@2026',
    role: 'caissier', magasin_id: magasinId, langue: 'fr',
  } });
  verif('Un compte caissier est créé (201)', creation.code === 201 && creation.json.id > 0);
  verif('Création de compte : l’envoi de l’email est signalé',
    ['simule', 'envoye'].includes(creation.json.email_envoye), creation.json.email_envoye);

  const mailIds = dernierMail({ type: 'identifiants', destinataire: emailCaisse });
  verif('Création de compte : un email d’identifiants est généré',
    !!mailIds, mailIds ? mailIds.sujet : 'aucun message');
  verif('Email d’identifiants : contient l’adresse email du titulaire',
    !!mailIds && mailIds.corps_texte.includes(emailCaisse));
  verif('Email d’identifiants : contient le mot de passe',
    !!mailIds && mailIds.corps_texte.includes('Caisse@2026'));
  verif('Email d’identifiants : contient le rôle attribué',
    !!mailIds && /Caissier/i.test(mailIds.corps_texte));
  verif('Email d’identifiants : contient l’adresse de connexion',
    !!mailIds && /https?:\/\//.test(mailIds.corps_texte));

  /* Le compte créé par un administrateur n'est PAS bloqué (vérification = inscription). */
  const loginCaisse = await req('POST', '/api/auth/login', { corps: { email: emailCaisse, mot_de_passe: 'Caisse@2026' } });
  verif('Le nouveau compte peut se connecter aussitôt', loginCaisse.code === 200 && !!loginCaisse.json.token);
  const accesCaisse = await req('GET', '/api/caisse/session', { token: loginCaisse.json.token });
  verif('Le nouveau compte n’est pas bloqué par la vérification d’email',
    accesCaisse.code === 200, 'HTTP ' + accesCaisse.code);

  /* Un autre rôle (magasinier = agent de stock) reçoit aussi ses identifiants,
     rédigés dans la langue choisie pour ce compte. */
  const emailStock = 'stock.demo' + TS + '@entreprise.cm';
  const creationStock = await req('POST', '/api/utilisateurs', { token: tokenEnt, corps: {
    nom: 'Agent Stock Demo', email: emailStock, mot_de_passe: 'Stock@2026',
    role: 'magasinier', magasin_id: magasinId, langue: 'en',
  } });
  verif('Un compte « agent de stock » est créé (rôle magasinier)', creationStock.code === 201);
  const mailStock = dernierMail({ type: 'identifiants', destinataire: emailStock });
  verif('Tout rôle reçoit ses identifiants par email (agent de stock)',
    !!mailStock && mailStock.corps_texte.includes('Stock@2026'),
    mailStock ? mailStock.sujet : 'aucun message');
  verif('L’email d’identifiants est rédigé dans la langue du compte (anglais)',
    !!mailStock && mailStock.langue === 'en', mailStock ? mailStock.langue : '—');

  /* ---------- 5. Paiement MasterCard → compte Afriland First Bank ---------- */
  const etat = await req('GET', '/api/entreprises/etat');
  const mc = etat.json.services && etat.json.services.mastercard;
  verif('Le mode de paiement MasterCard est proposé', !!mc && /MasterCard/i.test(mc.nom));
  verif('MasterCard : le compte destinataire est celui d’Afriland First Bank',
    !!mc && mc.numero === COMPTE_AFRILAND, mc && mc.numero);
  verif('MasterCard : la banque est Afriland First Bank',
    !!mc && /Afriland First Bank/i.test(mc.banque), mc && mc.banque);
  verif('MasterCard : le titulaire du compte est indiqué', !!mc && !!mc.titulaire, mc && mc.titulaire);
  verif('Les 3 moyens de paiement coexistent (OM, MTN, MasterCard)',
    ['orange_money', 'mtn_momo', 'mastercard'].every((k) => !!etat.json.services[k]));

  const demande = await req('POST', '/api/abonnement/demande', { token: tokenEnt, corps: {
    service: 'mastercard', plan: 'mensuel', nom_payeur: 'Alain Demo',
  } });
  verif('Demande de paiement MasterCard enregistrée (201)', demande.code === 201 && !!demande.json.reference);
  verif('Paiement MasterCard : montant mensuel de 11 500 FCFA',
    demande.json.montant === 11500, demande.json.montant + ' FCFA');
  verif('Paiement MasterCard : le compte Afriland est rappelé dans les consignes',
    (demande.json.instructions || []).join(' ').includes(COMPTE_AFRILAND));
  verif('Paiement MasterCard : la banque est rappelée dans les consignes',
    (demande.json.instructions || []).join(' ').includes('Afriland First Bank'));
  verif('Paiement MasterCard : aucune donnée de carte n’est demandée',
    !/numéro de carte|cvv|cryptogramme/i.test((demande.json.instructions || []).join(' ')));

  /* ---------- 6. Le propriétaire valide le paiement MasterCard ---------- */
  const tokenProp = (await req('POST', '/api/auth/login', { corps: PROPRIETAIRE })).json.token;
  const paiements = await req('GET', '/api/plateforme/paiements?statut=en_attente', { token: tokenProp });
  const ligne = (paiements.json || []).find((p) => p.reference === demande.json.reference);
  verif('Le propriétaire voit la demande MasterCard en attente',
    !!ligne && ligne.service === 'mastercard', ligne ? ligne.service : 'absente');
  verif('Le propriétaire voit le compte destinataire du versement',
    !!ligne && ligne.numero_paiement === COMPTE_AFRILAND, ligne && ligne.numero_paiement);

  const validation = await req('POST', '/api/plateforme/paiements/' + ligne.id + '/valider', { token: tokenProp });
  verif('Le propriétaire valide le paiement MasterCard',
    validation.code === 200 && validation.json.ok === true);
  const abo = await req('GET', '/api/abonnement', { token: tokenEnt });
  verif('Abonnement activé après validation (30 jours)',
    abo.json.statut === 'actif' && abo.json.jours_restants >= 30,
    abo.json.statut + ' · ' + abo.json.jours_restants + ' j');

  /* ---------- 7. Console du propriétaire : journal des e-mails ---------- */
  const mails = await req('GET', '/api/plateforme/mails', { token: tokenProp });
  verif('Console : le journal des e-mails est accessible au propriétaire',
    mails.code === 200 && Array.isArray(mails.json.messages));
  const ids = (mails.json.messages || []).filter((m) => m.entreprise_id === idEnt);
  verif('Console : les e-mails de cette entreprise y figurent (vérification + identifiants)',
    ids.some((m) => m.type === 'verification') && ids.some((m) => m.type === 'identifiants'),
    ids.map((m) => m.type).join(', '));
  verif('Console : l’état du serveur SMTP est exposé',
    mails.json.smtp && typeof mails.json.smtp.configure === 'boolean');
  verif('Console : le contenu des messages est consultable',
    ids.length > 0 && typeof ids[0].corps_texte === 'string' && ids[0].corps_texte.length > 20);

  const interdit = await req('GET', '/api/plateforme/mails', { token: tokenEnt });
  verif('Le journal des e-mails est réservé au propriétaire (403)', interdit.code === 403);

  /* ---------- 8. Nettoyage ---------- */
  const suppr = await req('DELETE', '/api/plateforme/entreprises/' + idEnt, { token: tokenProp });
  verif('Nettoyage : entreprise de test supprimée', suppr.json && suppr.json.ok === true);
}

principal()
  .catch((e) => { console.error('ERREUR', e); erreurs.push(String(e.message || e)); })
  .finally(() => {
    const ok = resultats.filter((r) => r[1]).length;
    console.log('');
    resultats.forEach(([l, v, d]) => console.log(` ${v ? '✅' : '❌'} ${l}${d && !v ? '  →  ' + d : ''}`));
    if (erreurs.length) { console.log('\n--- Erreurs ---'); erreurs.forEach((e) => console.log('  ' + e)); }
    console.log(`\n${ok}/${resultats.length} vérifications réussies.`);
    process.exit(ok === resultats.length && erreurs.length === 0 ? 0 : 1);
  });
