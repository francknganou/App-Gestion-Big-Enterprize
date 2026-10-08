/**
 * Routes d'authentification et de profil.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth, sign, role: roleDe, porteeDe, permissionsEffectives, habilitations: habilitationsDe } = require('../auth');
const { wrap, param } = require('../utils');
const Entreprises = require('../entreprises');

const router = express.Router();

/** Informations renvoyées au client pour construire l'interface. */
function profil(user) {
  const r = roleDe(user.role);
  const magasin = user.magasin_id
    ? db.prepare('SELECT id,nom,ville FROM magasins WHERE id=?').get(user.magasin_id) : null;
  const h = habilitationsDe(user);
  const entreprise = user.entreprise_id
    ? db.prepare(`SELECT id,nom,email,nom_contact,prenom_contact,telephone,ville,date_creation,niu,logo,statut,created_at
                  FROM entreprises WHERE id=?`).get(user.entreprise_id) : null;
  return {
    id: user.id, nom: user.nom, email: user.email, role: user.role,
    libelle_role: r ? r.nom : user.role,
    description_role: r ? r.description : null,
    /** permissions effectives = rôle + habilitations accordées − retirées */
    permissions: permissionsEffectives(user),
    habilitations: { accordees: h.accordees, retirees: h.retirees, du_role: h.du_role },
    portee: porteeDe(user),
    magasin_id: user.magasin_id,
    magasin,
    entreprise_id: user.entreprise_id || null,
    entreprise,
    /** Coordonnées d'assistance (WhatsApp) affichées dans l'espace « Aide ». */
    support: support(),
    plateforme: user.role === 'super_admin',
    /* Vérification de l'adresse email : 0 = accès limité à l'écran de vérification. */
    email_verifie: user.email_verifie === undefined ? 1 : Number(user.email_verifie),
    email_verifie_at: user.email_verifie_at || null,
    langue: user.langue || 'fr',
  };
}

/** Numéro WhatsApp d'assistance et message pré-rempli. */
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

router.post('/login', wrap((req, res) => {
  const { email, mot_de_passe } = req.body || {};
  if (!email || !mot_de_passe) return res.status(400).json({ erreur: 'Email et mot de passe obligatoires' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(mot_de_passe, user.mot_de_passe)) {
    return res.status(401).json({ erreur: 'Identifiants incorrects' });
  }
  if (!user.actif) return res.status(403).json({ erreur: 'Ce compte est désactivé' });
  db.prepare("UPDATE users SET dernier_login = datetime('now','localtime') WHERE id = ?").run(user.id);
  res.json({ token: sign(user), utilisateur: profil(user) });
}));

router.get('/support', wrap((req, res) => res.json(support())));

/** L'email est-il déjà pris ? (aide à l'inscription) */
router.get('/email-disponible', wrap((req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ erreur: 'Email manquant' });
  res.json({ email, disponible: !Entreprises.emailDejaUtilise(email) });
}));

router.get('/me', auth, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(401).json({ erreur: 'Compte introuvable' });
  res.json({ utilisateur: profil(user) });
}));

router.post('/mot-de-passe', auth, wrap((req, res) => {
  const { ancien, nouveau } = req.body || {};
  if (!nouveau || String(nouveau).length < 6) {
    return res.status(400).json({ erreur: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(ancien || '', user.mot_de_passe)) {
    return res.status(400).json({ erreur: 'Ancien mot de passe incorrect' });
  }
  db.prepare('UPDATE users SET mot_de_passe=? WHERE id=?').run(bcrypt.hashSync(nouveau, 10), user.id);
  res.json({ ok: true });
}));

module.exports = router;
