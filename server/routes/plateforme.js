/**
 * Console du propriétaire de la plateforme : toutes les entreprises clientes,
 * leurs informations complètes, leurs magasins/boutiques et leurs paiements.
 * Accès réservé au rôle « super_admin ».
 */
const express = require('express');
const { db } = require('../db');
const { auth, requirePlateforme, peut } = require('../auth');
const { wrap, param } = require('../utils');
const A = require('../abonnement');
const Entreprises = require('../entreprises');
const { journaliser } = require('../evenements');
const Mails = require('../mails');
const PSP = require('../psp');
const { setParam } = require('../db');

const router = express.Router();
router.use(auth, requirePlateforme);

/** État d'un moyen de paiement après application de la requête (sans l'écrire). */
function serviceActifApres(corps, code) {
  return corps[code] === undefined ? A.serviceActif(code) : !!corps[code];
}

/* ------------------------------- Tableau de bord ------------------------------- */
router.get('/resume', wrap((req, res) => {
  res.json(Entreprises.statsPlateforme());
}));

/* -------------------------------- Entreprises -------------------------------- */
router.get('/entreprises', wrap((req, res) => {
  res.json(Entreprises.listerEntreprises({ q: req.query.q || '', statut: req.query.statut || null }));
}));

router.get('/entreprises/:id', wrap((req, res) => {
  try { res.json(Entreprises.detailEntreprise(Number(req.params.id))); }
  catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

router.put('/entreprises/:id', wrap((req, res) => {
  try { res.json({ ok: true, entreprise: Entreprises.majEntreprise(Number(req.params.id), req.body || {}) }); }
  catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

/** Suspendre / réactiver une entreprise cliente. */
router.post('/entreprises/:id/statut', wrap((req, res) => {
  const statut = req.body && req.body.statut === 'suspendu' ? 'suspendu' : 'actif';
  try {
    const e = Entreprises.majEntreprise(Number(req.params.id), { statut });
    res.json({ ok: true, entreprise: e, message: statut === 'suspendu'
      ? `Accès suspendu pour ${e.nom}` : `Accès rétabli pour ${e.nom}` });
  } catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

/** Geste commercial : offrir des jours ou prolonger un abonnement. */
router.post('/entreprises/:id/abonnement', wrap((req, res) => {
  const { plan, jours, motif } = req.body || {};
  const id = Number(req.params.id);
  const e = db.prepare('SELECT * FROM entreprises WHERE id=?').get(id);
  if (!e) return res.status(404).json({ erreur: 'Entreprise introuvable' });
  let abonnement;
  if (plan === 'mensuel' || plan === 'annuel') {
    abonnement = A.prolonger(id, plan, plan === 'annuel' ? A.tarifs().annuel : A.tarifs().mensuel,
      (motif || 'Geste commercial'));
  } else {
    abonnement = A.demarrerEssai(id, Number(jours) || A.tarifs().essai_jours);
  }
  res.json({ ok: true, abonnement, etat: A.etat(id) });
}));

router.delete('/entreprises/:id', wrap((req, res) => {
  try { res.json({ ok: true, entreprise: Entreprises.supprimerEntreprise(Number(req.params.id)) }); }
  catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

/* ---------------------------------- Paiements ---------------------------------- */
router.get('/paiements', wrap((req, res) => {
  res.json(Entreprises.tousLesPaiements({
    statut: req.query.statut || null,
    service: req.query.service || null,
    entreprise_id: req.query.entreprise_id || null,
  }));
}));

router.post('/paiements/:id/valider', wrap((req, res) => {
  try {
    const r = A.validerPaiement(Number(req.params.id), req.user.id);
    const e = db.prepare('SELECT nom FROM entreprises WHERE id=?').get(r.paiement.entreprise_id) || {};
    journaliser({
      entreprise_id: r.paiement.entreprise_id, type: 'plateforme', reference: r.paiement.reference,
      montant: r.paiement.montant, user_id: req.user.id,
      libelle: `Paiement ${r.paiement.reference} validé — abonnement ${e.nom || ''} activé`,
    });
    res.json({ ok: true, ...r, entreprise: e.nom, etat: A.etat(r.paiement.entreprise_id) });
  } catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

router.post('/paiements/:id/rejeter', wrap((req, res) => {
  try {
    const p = A.rejeterPaiement(Number(req.params.id), req.user.id, req.body && req.body.motif);
    res.json({ ok: true, paiement: p });
  } catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

router.delete('/paiements/:id', wrap((req, res) => {
  try { res.json({ ok: true, paiement: A.supprimerPaiement(Number(req.params.id)) }); }
  catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); }
}));

/* ------------------------------ Réglages plateforme ------------------------------ */
const CLES_PLATEFORME = ['tarif_mensuel', 'tarif_annuel', 'essai_jours', 'om_numero', 'mtn_numero',
  'om_ussd', 'mtn_ussd', 'paiement_marchand', 'paiement_instructions',
  'whatsapp_support', 'whatsapp_message', 'support_email',
  /* Serveur d'envoi des e-mails (vérification + identifiants des comptes). */
  'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'mail_from'];

router.get('/parametres', wrap((req, res) => {
  const valeurs = {};
  CLES_PLATEFORME.forEach((c) => { valeurs[c] = param(c, ''); });
  res.json({ valeurs, tarifs: A.tarifs(), paiement: A.coordonneesPaiement() });
}));

router.put('/parametres', wrap((req, res) => {
  const maj = db.prepare("INSERT INTO parametres (entreprise_id,cle,valeur) VALUES (0,?,?) ON CONFLICT(entreprise_id,cle) DO UPDATE SET valeur=excluded.valeur");
  Object.entries(req.body || {}).forEach(([cle, valeur]) => {
    if (CLES_PLATEFORME.includes(cle) && valeur !== undefined && valeur !== null) maj.run(cle, String(valeur));
  });
  const valeurs = {};
  CLES_PLATEFORME.forEach((c) => { valeurs[c] = param(c, ''); });
  res.json({ ok: true, valeurs, tarifs: A.tarifs(), paiement: A.coordonneesPaiement() });
}));

/* ---------------------------------------------------------------------------
   E-mails : journal de tous les envois (vérification, identifiants de compte).
   Sans serveur SMTP configuré, les messages sont consignés ici et consultables.
   --------------------------------------------------------------------------- */
router.get('/mails', wrap((req, res) => {
  const config = Mails.configSmtp();
  const messages = Mails.liste({
    limite: Number(req.query.limite) || 100,
    statut: req.query.statut || null,
    entreprise_id: req.query.entreprise_id || null,
  }).map((m) => ({
    id: m.id, type: m.type, destinataire: m.destinataire, sujet: m.sujet,
    statut: m.statut, erreur: m.erreur, smtp_utilise: !!m.smtp_utilise,
    entreprise: m.entreprise_nom, entreprise_id: m.entreprise_id,
    utilisateur_id: m.utilisateur_id, tentatives: m.tentatives,
    date: m.created_at,
    corps_texte: m.corps_texte,
  }));
  res.json({
    messages,
    smtp: {
      configure: config.configure,
      hote: config.hote || '',
      port: config.port || '',
      secure: !!config.secure,
      utilisateur: config.user || '',
      expediteur: config.from || '',
      mot_de_passe_defini: !!config.pass,
    },
    validite_codes_minutes: Mails.VALIDITE_CODES_MINUTES,
  });
}));

/** Renvoie un email consigné (utile quand le SMTP vient d'être configuré). */
router.post('/mails/:id/renvoyer', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const avant_ = db.prepare('SELECT destinataire, entreprise_id, sujet FROM mails_envoyes WHERE id=?').get(id);
  if (!avant_) return res.status(404).json({ erreur: 'Message introuvable' });
  const r = await Mails.renvoyer(id);
  if (r.ok) {
    journaliser({ type: 'plateforme', entreprise_id: avant_.entreprise_id, utilisateur_id: req.user.id,
      action: 'mail_renvoye', message: `Email #${id} renvoyé à ${avant_.destinataire}`, entite: 'mails' });
  }
  res.json({ ok: !!r.ok, statut: r.ok ? 'envoye' : 'erreur', erreur: r.erreur || null, destinataire: avant_.destinataire });
}));

/** Teste la connexion au serveur SMTP configuré. */
router.post('/mails/tester', wrap(async (req, res) => {
  const config = Mails.configSmtp();
  if (!config.configure) {
    return res.status(400).json({ erreur: "Aucun serveur d'envoi n'est configuré." });
  }
  const destinataire = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(destinataire)) {
    return res.status(400).json({ erreur: 'Adresse de test invalide.' });
  }
  const r = await Mails.envoyer({
    destinataire, type: 'test',
    donnees: { expediteur: config.from, serveur: `${config.hote}:${config.port}` },
  });
  res.json({ ok: r.statut === 'envoye', statut: r.statut, erreur: r.erreur || null });
}));

/* ==========================================================================
   VENTES D'ABONNEMENTS — tous les paiements reçus (validés ou en attente)
   ========================================================================== */

/** Liste consolidée de tous les paiements d'abonnement, avec filtres et totaux. */
router.get('/ventes', wrap((req, res) => {
  const { statut, service, entreprise_id, depuis, jusqu, q } = req.query;
  const limite = Math.min(1000, Math.max(1, Number(req.query.limite) || 200));
  const cond = [];
  const params = [];
  if (statut && statut !== 'tous') { cond.push('p.statut = ?'); params.push(String(statut)); }
  if (service && service !== 'tous') { cond.push('p.service = ?'); params.push(String(service)); }
  if (entreprise_id) { cond.push('p.entreprise_id = ?'); params.push(Number(entreprise_id)); }
  if (depuis) { cond.push('date(p.created_at) >= date(?)'); params.push(String(depuis)); }
  if (jusqu) { cond.push('date(p.created_at) <= date(?)'); params.push(String(jusqu)); }
  if (q) {
    cond.push('(p.reference LIKE ? OR e.nom LIKE ? OR p.nom_payeur LIKE ? OR p.code_reduction LIKE ?)');
    const like = '%' + String(q) + '%';
    params.push(like, like, like, like);
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const paiements = db.prepare(`
    SELECT p.*, e.nom AS entreprise, e.logo AS entreprise_logo, e.statut AS entreprise_statut,
           u.nom AS utilisateur, v.nom AS valide_par_nom, f.libelle AS formule_libelle
    FROM paiements_abonnement p
    LEFT JOIN entreprises e ON e.id = p.entreprise_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users v ON v.id = p.valide_par
    LEFT JOIN formules f ON f.code = p.plan
    ${where} ORDER BY p.id DESC LIMIT ?`).all(...params, limite);

  /* Totaux par statut sur le même périmètre filtré, mais sans le filtre de statut :
     la page doit toujours afficher « validé / en attente / rejeté » côte à côte. */
  const condSansStatut = [];
  const paramsSansStatut = [];
  cond.forEach((c, i) => {
    if (c.startsWith('p.statut')) return;
    condSansStatut.push(c);
    /* Les paramètres sont alignés sur l'ordre des conditions : on récupère ceux
       correspondant à cette condition (chaque condition consomme 1 ou 4 jetons). */
    const consommes = c.includes('LIKE ? OR') ? 4 : 1;
    let pos = 0;
    for (let k = 0; k < i; k += 1) pos += cond[k].includes('LIKE ? OR') ? 4 : 1;
    paramsSansStatut.push(...params.slice(pos, pos + consommes));
  });
  const w2 = condSansStatut.length ? 'WHERE ' + condSansStatut.join(' AND ') : '';
  const parStatut = db.prepare(`SELECT p.statut, IFNULL(SUM(p.montant),0) s, COUNT(*) n
    FROM paiements_abonnement p LEFT JOIN entreprises e ON e.id=p.entreprise_id ${w2}
    GROUP BY p.statut`).all(...paramsSansStatut);
  const map = {};
  parStatut.forEach((r) => { map[r.statut] = r; });
  res.json({
    paiements,
    totaux: {
      encaisse: (map.valide || {}).s || 0, nb_valides: (map.valide || {}).n || 0,
      attente: (map.en_attente || {}).s || 0, nb_attente: (map.en_attente || {}).n || 0,
      rejete: (map.rejete || {}).s || 0, nb_rejetes: (map.rejete || {}).n || 0,
      brut_total: ((map.valide || {}).s || 0) + ((map.en_attente || {}).s || 0),
      remise_accordee: db.prepare(`SELECT IFNULL(SUM(IFNULL(montant_brut, montant) - montant),0) s
        FROM paiements_abonnement WHERE statut='valide' AND IFNULL(montant_brut, montant) > montant`).get().s,
    },
    nb_resultats: paiements.length,
  });
}));

/* ==========================================================================
   CLASSEMENT — entreprises qui utilisent le plus l'application
   ========================================================================== */

/**
 * Classe les entreprises clientes selon l'usage qu'elles font de l'application,
 * mesuré à travers leur abonnement : montants encaissés, régularité des
 * paiements, ancienneté d'abonnement, puis intensité d'usage (ventes, comptes).
 */
router.get('/classement', wrap((req, res) => {
  const entreprises = Entreprises.statsPlateforme().entreprises;
  const agg = db.prepare(`
    SELECT entreprise_id,
           IFNULL(SUM(CASE WHEN statut='valide' THEN montant ELSE 0 END),0) AS total_encaisse,
           SUM(CASE WHEN statut='valide' THEN 1 ELSE 0 END) AS nb_valides,
           SUM(CASE WHEN statut='en_attente' THEN 1 ELSE 0 END) AS nb_attente,
           IFNULL(SUM(montant),0) AS total_brut,
           MAX(date(created_at)) AS dernier_paiement,
           MIN(date(created_at)) AS premier_paiement
    FROM paiements_abonnement GROUP BY entreprise_id`).all();
  const parId = {};
  agg.forEach((a) => { parId[a.entreprise_id] = a; });

  const lignes = entreprises.map((e) => {
    const a = parId[e.id] || {};
    const ab = e.abonnement || {};
    const joursAbonne = ab.date_debut
      ? Math.max(0, Math.round((new Date(ab.date_fin || ab.date_debut) - new Date(ab.date_debut)) / 86400000))
      : 0;
    const joursDepuis = ab.date_debut
      ? Math.max(0, Math.round((Date.now() - new Date(ab.date_debut).getTime()) / 86400000)) : 0;
    return {
      id: e.id, nom: e.nom, logo: e.logo || null, ville: e.ville || null, statut_entreprise: e.statut,
      plan: ab.plan || null, plan_libelle: ab.plan === 'annuel' ? 'Annuel'
        : ab.plan === 'mensuel' ? 'Mensuel' : (ab.plan ? ab.plan : 'Essai'),
      abonnement_statut: ab.statut, jours_restants: ab.jours_restants || 0,
      date_fin: ab.date_fin || null,
      total_encaisse: a.total_encaisse || 0,
      nb_valides: a.nb_valides || 0,
      nb_attente: a.nb_attente || 0,
      total_brut: a.total_brut || 0,
      premier_paiement: a.premier_paiement || null,
      dernier_paiement: a.dernier_paiement || null,
      jours_abonne: joursDepuis,
      duree_souscrite: joursAbonne,
      nb_magasins: e.nb_magasins || 0,
      nb_comptes: e.nb_comptes || 0,
      nb_ventes: e.nb_ventes || 0,
      ca_total: e.ca_total || 0,
    };
  });

  /* Score composite 0-100 : l'abonnement pèse le plus, l'usage vient compléter. */
  const max = (cle) => Math.max(1, ...lignes.map((l) => Number(l[cle]) || 0));
  const mEnc = max('total_encaisse'), mNb = max('nb_valides'), mJours = max('jours_abonne'),
        mVentes = max('nb_ventes'), mComptes = max('nb_comptes');
  lignes.forEach((l) => {
    const brut = 0.40 * (l.total_encaisse / mEnc) + 0.20 * (l.nb_valides / mNb)
      + 0.15 * (l.jours_abonne / mJours) + 0.15 * (l.nb_ventes / mVentes)
      + 0.10 * (l.nb_comptes / mComptes);
    l.score = Math.round(brut * 100);
    l.pourcentage_enc = mEnc > 1 ? Math.round((l.total_encaisse / lignes.reduce((s, x) => s + x.total_encaisse, 0) || 1) * 100) : 0;
  });
  const totalEnc = lignes.reduce((s, l) => s + l.total_encaisse, 0) || 1;
  lignes.forEach((l) => { l.pourcentage_enc = Math.round((l.total_encaisse / totalEnc) * 100); });

  lignes.sort((a, b) => b.score - a.score || b.total_encaisse - a.total_encaisse);
  lignes.forEach((l, i) => {
    l.rang = i + 1;
    l.palier = l.score >= 75 ? 'Platine' : l.score >= 50 ? 'Or' : l.score >= 25 ? 'Argent' : 'Bronze';
  });

  res.json({
    classement: lignes,
    nb_entreprises: lignes.length,
    total_encaisse: lignes.reduce((s, l) => s + l.total_encaisse, 0),
    moyenne_score: lignes.length ? Math.round(lignes.reduce((s, l) => s + l.score, 0) / lignes.length) : 0,
    nb_abonnes: lignes.filter((l) => l.abonnement_statut === 'actif').length,
    nb_essai: lignes.filter((l) => l.abonnement_statut === 'essai').length,
  });
}));

/* ==========================================================================
   FORMULES D'ABONNEMENT — durée et montant libres, augmentations, réductions
   ========================================================================== */

/** Toutes les formules (actives et inactives) + les réductions + l'état du PSP. */
router.get('/formules', wrap((req, res) => {
  res.json({
    formules: A.formules(false),
    reductions: A.reductions(false),
    tarifs: A.tarifs(),
    psp: { ...PSP.etat(), prestataires: PSP.liste() },
  });
}));

/** Crée ou met à jour une formule : le propriétaire choisit la durée ET le montant. */
router.post('/formules', wrap((req, res) => {
  const code = String(req.body.code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const libelle = String(req.body.libelle || '').trim();
  const duree = Math.round(Number(req.body.duree_jours));
  const montant = Math.round(Number(req.body.montant));
  if (!code) return res.status(400).json({ erreur: 'Code de formule requis (ex. mensuel, trimestre).' });
  if (!libelle) return res.status(400).json({ erreur: 'Libellé requis.' });
  if (!Number.isFinite(duree) || duree < 1 || duree > 3650) {
    return res.status(400).json({ erreur: 'Durée invalide : entre 1 et 3 650 jours.' });
  }
  if (!Number.isFinite(montant) || montant < 0 || montant > 100000000) {
    return res.status(400).json({ erreur: 'Montant invalide.' });
  }
  const existante = db.prepare('SELECT * FROM formules WHERE code=?').get(code);
  if (existante) {
    db.prepare(`UPDATE formules SET libelle=?, duree_jours=?, montant=?, ordre=?, note=?,
      actif=COALESCE(?, actif), maj_le=datetime('now','localtime') WHERE code=?`)
      .run(libelle, duree, montant, Math.round(Number(req.body.ordre) || existante.ordre),
        req.body.note || existante.note || null,
        req.body.actif === undefined ? null : (req.body.actif ? 1 : 0), code);
    journaliser({ type: 'plateforme', user_id: req.user.id,
      libelle: `Formule « ${libelle} » mise à jour : ${duree} jours — ${montant} FCFA` });
    return res.json({ ok: true, formule: db.prepare('SELECT * FROM formules WHERE code=?').get(code),
      message: `Formule « ${libelle} » mise à jour.` });
  }
  /* Sans ordre précisé, la nouvelle formule se place en fin de liste : la formule
     par défaut (mensuel) reste proposée en premier au client. */
  const ordre = req.body.ordre === undefined || req.body.ordre === null || req.body.ordre === ''
    ? (db.prepare('SELECT IFNULL(MAX(ordre),0)+1 o FROM formules').get().o)
    : Math.round(Number(req.body.ordre));
  db.prepare(`INSERT INTO formules (code, libelle, duree_jours, montant, ordre, note, actif, cree_par)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(code, libelle, duree, montant, ordre,
      req.body.note || null, req.body.actif === undefined ? 1 : (req.body.actif ? 1 : 0), req.user.id);
  journaliser({ type: 'plateforme', user_id: req.user.id,
    libelle: `Formule « ${libelle} » créée : ${duree} jours — ${montant} FCFA` });
  res.status(201).json({ ok: true, formule: db.prepare('SELECT * FROM formules WHERE code=?').get(code),
    message: `Formule « ${libelle} » créée : ${A.dureeLisible(duree)} pour ${montant.toLocaleString('fr-FR')} FCFA.` });
}));

/** Active / désactive une formule. */
router.post('/formules/:code/statut', wrap((req, res) => {
  const f = db.prepare('SELECT * FROM formules WHERE code=?').get(String(req.params.code));
  if (!f) return res.status(404).json({ erreur: 'Formule introuvable' });
  const actif = req.body.actif ? 1 : 0;
  db.prepare('UPDATE formules SET actif=?, maj_le=datetime(\'now\',\'localtime\') WHERE code=?').run(actif, f.code);
  journaliser({ type: 'plateforme', user_id: req.user.id,
    libelle: `Formule « ${f.libelle} » ${actif ? 'réactivée' : 'désactivée'}` });
  res.json({ ok: true, formule: db.prepare('SELECT * FROM formules WHERE code=?').get(f.code),
    message: actif ? 'Formule réactivée.' : 'Formule désactivée : elle n\'est plus proposée aux clients.' });
}));

/** Supprime une formule (refusée si des paiements l'ont déjà utilisée). */
router.delete('/formules/:code', wrap((req, res) => {
  const f = db.prepare('SELECT * FROM formules WHERE code=?').get(String(req.params.code));
  if (!f) return res.status(404).json({ erreur: 'Formule introuvable' });
  const utilisee = db.prepare('SELECT COUNT(*) c FROM paiements_abonnement WHERE plan=?').get(f.code).c;
  if (utilisee) {
    return res.status(400).json({
      erreur: `Cette formule a déjà servi à ${utilisee} paiement(s) : désactivez-la au lieu de la supprimer.`,
    });
  }
  db.prepare('DELETE FROM formules WHERE code=?').run(f.code);
  journaliser({ type: 'plateforme', user_id: req.user.id, libelle: `Formule « ${f.libelle} » supprimée` });
  res.json({ ok: true, message: `Formule « ${f.libelle} » supprimée.` });
}));

/**
 * Augmentation de tarif : pourcentage ou montant fixe, sur une formule précise
 * ou sur toutes. Valeur négative = baisse de prix.
 */
router.post('/formules/augmenter', wrap((req, res) => {
  const type = req.body.type === 'montant' ? 'montant' : 'pourcentage';
  const valeur = Number(req.body.valeur);
  if (!Number.isFinite(valeur) || valeur === 0) {
    return res.status(400).json({ erreur: 'Indiquez un pourcentage ou un montant (négatif pour une baisse).' });
  }
  if (type === 'pourcentage' && Math.abs(valeur) > 500) {
    return res.status(400).json({ erreur: 'Augmentation limitée à 500 %.' });
  }
  const code = req.body.code ? String(req.body.code) : null;
  const cibles = code ? [db.prepare('SELECT * FROM formules WHERE code=?').get(code)].filter(Boolean)
    : db.prepare('SELECT * FROM formules').all();
  if (!cibles.length) return res.status(404).json({ erreur: 'Aucune formule à modifier' });
  const modifs = [];
  const upd = db.prepare("UPDATE formules SET montant=?, maj_le=datetime('now','localtime') WHERE code=?");
  cibles.forEach((f) => {
    const avant = Math.round(Number(f.montant));
    const apres = Math.max(0, Math.round(type === 'pourcentage' ? avant * (1 + valeur / 100) : avant + valeur));
    upd.run(apres, f.code);
    modifs.push({ code: f.code, libelle: f.libelle, avant, apres, variation: apres - avant });
  });
  journaliser({ type: 'plateforme', user_id: req.user.id,
    libelle: `Tarifs ${valeur > 0 ? 'augmentés' : 'abaissés'} de ${Math.abs(valeur)}${type === 'pourcentage' ? ' %' : ' FCFA'} sur ${cibles.length} formule(s)` });
  res.json({ ok: true, type, valeur, modifs,
    message: `${modifs.length} formule(s) mise(s) à jour.` });
}));

/* ---------------------------- Réductions ---------------------------- */

/** Crée une réduction (ou une augmentation ciblée avec une valeur négative). */
router.post('/reductions', wrap((req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const type = req.body.type === 'montant' ? 'montant' : 'pourcentage';
  const valeur = Number(req.body.valeur);
  if (!code) return res.status(400).json({ erreur: 'Code requis (ex. BIENVENUE20).' });
  if (!Number.isFinite(valeur) || valeur === 0) return res.status(400).json({ erreur: 'Valeur requise.' });
  if (type === 'pourcentage' && Math.abs(valeur) > 100) {
    return res.status(400).json({ erreur: 'Pourcentage limité à 100 %.' });
  }
  const formuleCode = req.body.formule_code ? String(req.body.formule_code) : null;
  if (formuleCode && !db.prepare('SELECT id FROM formules WHERE code=?').get(formuleCode)) {
    return res.status(400).json({ erreur: 'Formule cible inconnue.' });
  }
  if (db.prepare('SELECT id FROM reductions WHERE code=?').get(code)) {
    return res.status(400).json({ erreur: `Le code « ${code} » existe déjà.` });
  }
  db.prepare(`INSERT INTO reductions (code, libelle, type, valeur, formule_code, max_utilisations,
      actif, debut, fin, note, cree_par) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(code, req.body.libelle || null, type, valeur, formuleCode,
      req.body.max_utilisations ? Math.round(Number(req.body.max_utilisations)) : null,
      req.body.actif === undefined ? 1 : (req.body.actif ? 1 : 0),
      req.body.debut || null, req.body.fin || null, req.body.note || null, req.user.id);
  journaliser({ type: 'plateforme', user_id: req.user.id,
    libelle: `Réduction « ${code} » créée (${Math.abs(valeur)}${type === 'pourcentage' ? ' %' : ' FCFA'})` });
  res.status(201).json({ ok: true, reduction: db.prepare('SELECT * FROM reductions WHERE code=?').get(code),
    message: `Code « ${code} » créé : ${valeur > 0 ? 'réduction' : 'majoration'} de ${Math.abs(valeur)}${type === 'pourcentage' ? ' %' : ' FCFA'}.` });
}));

/** Met à jour / active / désactive une réduction. */
router.put('/reductions/:id', wrap((req, res) => {
  const r = db.prepare('SELECT * FROM reductions WHERE id=?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ erreur: 'Réduction introuvable' });
  db.prepare(`UPDATE reductions SET libelle=COALESCE(?, libelle), type=COALESCE(?, type),
      valeur=COALESCE(?, valeur), formule_code=?, max_utilisations=?, actif=COALESCE(?, actif),
      debut=?, fin=?, note=COALESCE(?, note) WHERE id=?`)
    .run(req.body.libelle ?? null, req.body.type ?? null,
      req.body.valeur === undefined ? null : Number(req.body.valeur),
      req.body.formule_code ? String(req.body.formule_code) : null,
      req.body.max_utilisations ? Math.round(Number(req.body.max_utilisations)) : null,
      req.body.actif === undefined ? null : (req.body.actif ? 1 : 0),
      req.body.debut ?? null, req.body.fin ?? null, req.body.note ?? null, r.id);
  res.json({ ok: true, reduction: db.prepare('SELECT * FROM reductions WHERE id=?').get(r.id),
    message: 'Réduction mise à jour.' });
}));

/** Supprime une réduction. */
router.delete('/reductions/:id', wrap((req, res) => {
  const r = db.prepare('SELECT * FROM reductions WHERE id=?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ erreur: 'Réduction introuvable' });
  db.prepare('DELETE FROM reductions WHERE id=?').run(r.id);
  journaliser({ type: 'plateforme', user_id: req.user.id, libelle: `Réduction « ${r.code} » supprimée` });
  res.json({ ok: true, message: `Code « ${r.code} » supprimé.` });
}));

/* --------------------- Moyens de paiement (actif / inactif) --------------------- */

/** Liste des moyens de paiement et de leur état. */
router.get('/moyens-paiement', wrap((req, res) => {
  res.json({ moyens: A.moyensPaiement(), coordonnees: A.coordonneesPaiement().services });
}));

/**
 * Active ou désactive un moyen de paiement.
 * Un moyen désactivé disparaît de la page de paiement des clients et toute
 * demande le concernant est refusée côté serveur.
 */
router.put('/moyens-paiement', wrap((req, res) => {
  const corps = req.body || {};
  const connus = A.CODES_SERVICE;
  const inconnus = Object.keys(corps).filter((c) => !connus.includes(c));
  if (inconnus.length) {
    return res.status(400).json({ erreur: `Moyen de paiement inconnu : ${inconnus.join(', ')}` });
  }
  const actifs = connus.filter((c) => serviceActifApres(corps, c));
  if (!actifs.length) {
    return res.status(400).json({
      erreur: 'Au moins un moyen de paiement doit rester actif, sinon aucun client ne peut régler son abonnement.',
    });
  }
  const changements = [];
  connus.forEach((code) => {
    if (corps[code] === undefined) return;
    const avant = A.serviceActif(code);
    const apres = !!corps[code];
    if (avant === apres) return;
    setParam.run(0, `service_${code}_actif`, apres ? '1' : '0');
    changements.push(`${A.moyensPaiement().find((m) => m.code === code).nom} ${apres ? 'activé' : 'désactivé'}`);
  });
  if (changements.length) {
    journaliser({ type: 'plateforme', user_id: req.user.id,
      libelle: 'Moyens de paiement : ' + changements.join(', ') });
  }
  res.json({ ok: true, moyens: A.moyensPaiement(),
    message: changements.length ? changements.join(', ') + '.' : 'Aucun changement.' });
}));

/* ------------------------- Configuration du PSP ------------------------- */

/**
 * Enregistre la configuration des prestataires de paiement et choisit celui
 * qui est actif (PayDunya par défaut, CinetPay en secours).
 */
router.put('/psp', wrap((req, res) => {
  const cles = [
    // choix du prestataire actif
    'psp_actif',
    // PayDunya
    'paydunya_master_key', 'paydunya_private_key', 'paydunya_token', 'paydunya_mode',
    'paydunya_callback_url', 'paydunya_return_url', 'paydunya_cancel_url', 'paydunya_store',
    // CinetPay (secours)
    'cinetpay_apikey', 'cinetpay_site_id', 'cinetpay_env',
    'cinetpay_notify_url', 'cinetpay_return_url', 'cinetpay_canaux',
  ];
  if (req.body.psp_actif && !PSP.fournisseur(req.body.psp_actif)) {
    return res.status(400).json({ erreur: 'Prestataire inconnu (paydunya ou cinetpay).' });
  }
  cles.forEach((cle) => {
    if (req.body[cle] !== undefined) setParam.run(0, cle, String(req.body[cle] || ''));
  });
  journaliser({ type: 'plateforme', user_id: req.user.id,
    libelle: `Prestataire de paiement : ${PSP.etat().prestataire} (${PSP.actif()})` });
  res.json({
    ok: true, actif: PSP.actif(),
    psp: { ...PSP.etat(), prestataires: PSP.liste() },
    message: PSP.estConfigure()
      ? `${PSP.etat().prestataire} configuré : les cartes sont maintenant débitées réellement.`
      : `Configuration enregistrée, mais ${PSP.etat().prestataire} attend encore ses clés.`,
  });
}));

module.exports = router;
