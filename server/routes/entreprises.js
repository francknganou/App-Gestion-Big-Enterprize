/**
 * Routes des entreprises : inscription publique, fiche de l'entreprise
 * connectée (nom, logo, NIU, coordonnées) et réglages de marque.
 */
const express = require('express');
const { db } = require('../db');
const { auth, sign, requirePerm } = require('../auth');
const { wrap, param } = require('../utils');
const { parametresEntreprise } = require('../db');
const A = require('../abonnement');
const Entreprises = require('../entreprises');
const Mails = require('../mails');

const router = express.Router();

/** Numéro WhatsApp d'assistance (bouton « Aide »). */
function support() {
  const numero = String(param('whatsapp_support', '654324282')).replace(/\D/g, '');
  const international = numero.startsWith('237') ? numero : '237' + numero;
  return {
    numero,
    affiche: numero.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
    lien: 'https://wa.me/' + international,
    message: String(param('whatsapp_message', 'Bonjour, j’ai besoin d’aide sur Inventa GestyPro.')),
    email: String(param('support_email', '')),
  };
}

/** Informations publiques de la page d'inscription. */
router.get('/etat', wrap((req, res) => {
  const t = A.tarifs();
  res.json({
    tarifs: t,
    services: A.coordonneesPaiement().services,
    marchand: A.coordonneesPaiement().marchand,
    compte_bancaire: A.coordonneesPaiement().compte_bancaire,
    support: support(),
    nb_entreprises: db.prepare('SELECT COUNT(*) c FROM entreprises').get().c,
  });
}));

/** Vérifie la disponibilité d'un email professionnel. */
router.get('/email-disponible', wrap((req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return res.status(400).json({ erreur: 'Email invalide' });
  }
  res.json({ email, disponible: !Entreprises.emailDejaUtilise(email) });
}));

/**
 * INSCRIPTION PUBLIQUE : l'administrateur crée son entreprise et son compte
 * (email professionnel, nom, prénom, nom de l'entreprise, date de création,
 * NIU, logo) puis obtient immédiatement 7 jours d'essai gratuit.
 */
router.post('/inscription', wrap(async (req, res) => {
  const donnees = req.body || {};
  const r = Entreprises.creerEntreprise(donnees);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(r.admin.id);
  const langue = ['fr', 'en', 'zh'].includes(donnees.langue) ? donnees.langue : 'fr';

  /* Email de vérification envoyé à l'administrateur qui s'inscrit. */
  const envoi = await Mails.envoyerVerification({ user, entreprise: r.entreprise, langue });

  res.status(201).json({
    ok: true,
    entreprise: r.entreprise,
    magasin: r.magasin,
    abonnement: {
      statut: r.abonnement.statut, date_debut: r.abonnement.date_debut, date_fin: r.abonnement.date_fin,
      jours_restants: A.etat(r.entreprise.id).jours_restants,
    },
    verification: {
      requise: true,
      email: user.email,
      statut_envoi: envoi.statut,          // envoye | simule | erreur
      smtp: envoi.smtp,
      validite_minutes: Mails.VALIDITE_CODES_MINUTES,
    },
    message: `Bienvenue ${r.entreprise.nom} ! Un email de vérification vient d'être envoyé à ${user.email}.`,
    token: sign(user),
  });
}));

/** Renvoie le code de vérification (bouton « Renvoyer »). */
router.post('/verification/renvoyer', auth, wrap(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ erreur: 'Compte introuvable' });
  if (user.email_verifie) return res.json({ ok: true, deja_verifie: true });
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id=?').get(user.entreprise_id) || {};
  const envoi = await Mails.envoyerVerification({ user, entreprise, langue: user.langue || 'fr' });
  res.json({ ok: true, statut_envoi: envoi.statut, smtp: envoi.smtp, email: user.email });
}));

/** Vérifie l'email avec le code reçu (ou le jeton du lien). */
router.post('/verification/valider', auth, wrap((req, res) => {
  const r = Mails.verifierCode(req.user.id, (req.body || {}).code);
  if (!r.ok) return res.status(400).json({ erreur: r.erreur });
  const user = db.prepare('SELECT id,nom,email,email_verifie,email_verifie_at,langue FROM users WHERE id=?').get(req.user.id);
  res.json({ ok: true, message: 'Email vérifié — votre espace est pleinement actif.', utilisateur: user });
}));

/** État de vérification du compte connecté. */
router.get('/verification', auth, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({
    verifie: !!user.email_verifie,
    email: user.email,
    verifie_at: user.email_verifie_at || null,
    smtp_configure: Mails.configSmtp().configure,
  });
}));

/** Fiche de l'entreprise connectée. */
router.get('/moi', auth, wrap((req, res) => {
  if (!req.user.entreprise_id) {
    return res.json({ entreprise: null, plateforme: true, support: support() });
  }
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id=?').get(req.user.entreprise_id);
  if (!entreprise) return res.status(404).json({ erreur: 'Entreprise introuvable' });
  res.json({
    entreprise,
    abonnement: A.etat(entreprise.id),
    magasins: db.prepare('SELECT id,nom,ville,adresse,telephone,responsable,actif FROM magasins WHERE entreprise_id=? ORDER BY actif DESC, id')
      .all(entreprise.id),
    support: support(),
  });
}));

/** Mise à jour de la fiche entreprise (nom, logo, NIU, coordonnées…). */
router.put('/moi', auth, requirePerm('parametres.gerer'), wrap((req, res) => {
  if (!req.user.entreprise_id) return res.status(400).json({ erreur: 'Aucune entreprise rattachée à ce compte' });
  const maj = {};
  ['nom', 'email', 'nom_contact', 'prenom_contact', 'telephone', 'ville', 'pays', 'date_creation', 'niu', 'logo']
    .forEach((c) => { if (req.body && req.body[c] !== undefined) maj[c] = req.body[c]; });
  const entreprise = Entreprises.majEntreprise(req.user.entreprise_id, maj);
  res.json({ ok: true, entreprise });
}));

/** Réglages de marque (tickets, TVA, préfixe, objectif) de l'entreprise. */
router.get('/parametres', auth, wrap((req, res) => {
  res.json({
    reglages: parametresEntreprise({ nom: 'x' }),
    valeurs: Object.fromEntries(
      ['nom_entreprise', 'slogan', 'adresse', 'telephone', 'email', 'contribuable', 'ville',
        'tva_defaut', 'prefixe_vente', 'objectif_mensuel', 'message_ticket']
        .map((c) => [c, param(c, '', req.user.entreprise_id)]),
    ),
  });
}));

module.exports = router;
module.exports.support = support;
