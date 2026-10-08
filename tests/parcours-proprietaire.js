/**
 * Vérification du parcours demandé :
 *  1. un administrateur passe par la page d'inscription d'entreprise avant d'accéder à l'app ;
 *  2. une fois dans l'app, l'espace « Aide » propose le WhatsApp 654 32 42 82 ;
 *  3. le compte propriétaire voit toutes les entreprises, leurs paiements et leurs boutiques.
 */
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const BASE = 'http://localhost:3000';
const TS = Date.now();

function req(methode, chemin, { token, corps } = {}) {
  return new Promise((resoudre, rejeter) => {
    const donnees = corps ? JSON.stringify(corps) : null;
    const r = http.request(BASE + chemin, {
      method: methode,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        donnees ? { 'Content-Length': Buffer.byteLength(donnees) } : {}),
    }, (rep) => {
      let brut = '';
      rep.on('data', (c) => { brut += c; });
      rep.on('end', () => {
        let json = null;
        try { json = JSON.parse(brut); } catch (e) { /* non-JSON */ }
        resoudre({ code: rep.statusCode, json, brut });
      });
    });
    r.on('error', rejeter);
    if (donnees) r.write(donnees);
    r.end();
  });
}

let reussies = 0; const echecs = [];
function verif(libelle, ok, detail) {
  if (ok) { reussies++; console.log(' ✅ ' + libelle); }
  else { echecs.push(libelle); console.log(' ❌ ' + libelle + (detail ? ' → ' + detail : '')); }
}

(async () => {
  /* --- 1. La page d'inscription est accessible sans compte --- */
  const etat = await req('GET', '/api/entreprises/etat');
  verif('Informations publiques d’inscription disponibles (tarifs, paiement, support)',
    etat.code === 200 && etat.json.tarifs.mensuel === 11500 && etat.json.tarifs.annuel === 132000);
  const emailDispo = await req('GET', '/api/entreprises/email-disponible?email=nouveau.' + TS + '@demo.cm');
  verif('Vérification de disponibilité de l’email professionnel', emailDispo.json && emailDispo.json.disponible === true);

  /* --- 2. Création de l'entreprise (tous les champs demandés) --- */
  const email = 'admin.demo' + TS + '@entreprise.cm';
  const insc = await req('POST', '/api/entreprises/inscription', { corps: {
    email, mot_de_passe: 'Demo@2026', nom: 'DEMO', prenom: 'Alain',
    entreprise: 'ENTREPRISE DEMO ' + TS, date_creation: '2024-03-15', niu: 'U' + TS,
    logo: 'data:image/png;base64,iVBORw0KGgo=', ville: 'Yaoundé',
  } });
  verif('Entreprise créée avec les 7 informations demandées', insc.code === 201 && insc.json.ok === true);
  verif('Essai gratuit de 7 jours accordé automatiquement',
    insc.json && insc.json.abonnement && insc.json.abonnement.jours_restants >= 7 && insc.json.abonnement.statut === 'essai');
  const tokenEnt = insc.json && insc.json.token;
  const idEnt = insc.json && insc.json.entreprise.id;

  /* --- 2 bis. Vérification de l'email : accès bloquant --- */
  verif('Inscription : un email de vérification est annoncé',
    insc.json && insc.json.verification && insc.json.verification.requise === true
    && insc.json.verification.email === email);
  verif('Inscription : l’email est consigné (envoyé ou simulé sans SMTP)',
    ['envoye', 'simule'].includes(insc.json.verification.statut_envoi));

  const bloque = await req('GET', '/api/magasins', { token: tokenEnt });
  verif('Compte non vérifié : l’accès aux modules est refusé (403)',
    bloque.code === 403 && bloque.json && bloque.json.code === 'EMAIL_NON_VERIFIE');
  const autorise = await req('GET', '/api/entreprises/verification', { token: tokenEnt });
  verif('Compte non vérifié : l’écran de vérification reste accessible',
    autorise.code === 200 && autorise.json.verifie === false);

  const codeFaux = await req('POST', '/api/entreprises/verification/valider', { token: tokenEnt, corps: { code: '000000' } });
  verif('Vérification : un code erroné est refusé (400)', codeFaux.code === 400);

  const dbVerif = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
  const ligneCode = dbVerif.prepare(`SELECT c.code FROM codes_verification c JOIN users u ON u.id=c.user_id
    WHERE u.email=? AND c.utilise_at IS NULL ORDER BY c.id DESC LIMIT 1`).get(email);
  dbVerif.close();
  verif('Un code à 6 chiffres a bien été généré pour cet email', /^[0-9]{6}$/.test((ligneCode || {}).code || ''));

  const valide = await req('POST', '/api/entreprises/verification/valider',
    { token: tokenEnt, corps: { code: (ligneCode || {}).code } });
  verif('Vérification : le code reçu par email débloque le compte',
    valide.code === 200 && valide.json.ok === true && valide.json.utilisateur.email_verifie === 1);
  const debloque = await req('GET', '/api/magasins', { token: tokenEnt });
  verif('Compte vérifié : l’accès aux modules est rétabli (200)', debloque.code === 200);

  const moi = await req('GET', '/api/entreprises/moi', { token: tokenEnt });
  verif('L’administrateur retrouve son entreprise (NIU + logo enregistrés)',
    moi.json && moi.json.entreprise.niu === 'U' + TS && moi.json.entreprise.logo === 'data:image/png;base64,iVBORw0KGgo=');
  verif('Espace « Aide » : WhatsApp 654 32 42 82 exposé à l’entreprise',
    moi.json && moi.json.support.numero === '654324282' && /237654324282/.test(moi.json.support.lien));

  /* Une 2e boutique créée par cette entreprise */
  const boutique = await req('POST', '/api/magasins', { token: tokenEnt, corps: { code: 'B2', nom: 'BOUTIQUE DEMO B2', ville: 'Douala' } });
  verif('L’administrateur crée ses boutiques', boutique.code === 200 || boutique.code === 201);

  /* --- 3. Le compte propriétaire monitore tout --- */
  const loginProp = await req('POST', '/api/auth/login', { corps: {
    email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!',
  } });
  verif('Connexion du compte propriétaire (franck06.nganou02oumbe2004@gmail.com)', loginProp.json && !!loginProp.json.token);
  const tokenProp = loginProp.json.token;

  const liste = await req('GET', '/api/plateforme/entreprises', { token: tokenProp });
  const entreprises = Array.isArray(liste.json) ? liste.json : (liste.json && liste.json.entreprises) || [];
  const trouvee = entreprises.find((e) => e.id === idEnt);
  verif('Le propriétaire voit l’entreprise nouvellement créée parmi toutes les autres', !!trouvee,
    entreprises.length + ' entreprises listées');
  verif('Toutes les informations de l’entreprise sont visibles (email, NIU, date de création, ville)',
    !!trouvee && trouvee.email === email && trouvee.niu === 'U' + TS && trouvee.date_creation === '2024-03-15');

  const fiche = await req('GET', '/api/plateforme/entreprises/' + idEnt, { token: tokenProp });
  verif('Le propriétaire voit tous les magasins/boutiques créés',
    fiche.json && Array.isArray(fiche.json.magasins) && fiche.json.magasins.length === 2);
  verif('Le propriétaire voit les comptes et les paiements de cette entreprise',
    fiche.json && Array.isArray(fiche.json.utilisateurs) && Array.isArray(fiche.json.paiements));

  /* Paiement déclaré par l'entreprise, validé par le propriétaire */
  const demande = await req('POST', '/api/abonnement/demande', { token: tokenEnt, corps: {
    service: 'orange_money', plan: 'mensuel', telephone_payeur: '699000000', nom_payeur: 'Alain Demo',
  } });
  verif('L’entreprise déclare son paiement Orange Money (référence AB-… et 11 500 FCFA)',
    demande.json && /^AB-/.test(demande.json.reference) && demande.json.montant === 11500,
    demande.json ? demande.json.reference + ' / ' + demande.json.montant : 'aucune réponse');
  const reference = demande.json && demande.json.reference;

  const pagePaie = await req('GET', '/api/plateforme/paiements', { token: tokenProp });
  const paiements = Array.isArray(pagePaie.json) ? pagePaie.json : (pagePaie.json && pagePaie.json.paiements) || [];
  const ligne = paiements.find((p) => p.reference === reference);
  verif('Page des paiements du propriétaire : le paiement de cette entreprise y figure', !!ligne,
    paiements.length + ' paiements listés');
  const idPaie = ligne && ligne.id;
  const val = await req('POST', '/api/plateforme/paiements/' + idPaie + '/valider', { token: tokenProp });
  verif('Le propriétaire valide le paiement → abonnement actif 30 jours',
    val.json && val.json.etat && val.json.etat.statut === 'actif');

  const resume = await req('GET', '/api/plateforme/resume', { token: tokenProp });
  verif('Tableau de bord du propriétaire (entreprises, boutiques, CA, encaissements)',
    resume.json && resume.json.nb_entreprises >= 2 && typeof resume.json.nb_magasins === 'number');

  /* --- 4. Nettoyage --- */
  const suppr = await req('DELETE', '/api/plateforme/entreprises/' + idEnt, { token: tokenProp });
  verif('Nettoyage : entreprise de test supprimée par le propriétaire', suppr.json && suppr.json.ok === true);

  console.log('\n' + reussies + '/' + (reussies + echecs.length) + ' vérifications réussies.');
  if (echecs.length) { console.log('Échecs :'); echecs.forEach((e) => console.log('  - ' + e)); process.exit(1); }
})().catch((e) => { console.error('ERREUR', e); process.exit(1); });
