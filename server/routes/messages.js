/**
 * Messagerie interne — « chacun communique avec l'autre à partir de l'email ».
 *
 * Règles de destinataires :
 *   • le PROPRIÉTAIRE écrit aux administrateurs de toutes les entreprises ;
 *   • un ADMINISTRATEUR d'entreprise écrit à tous les profils de son entreprise ;
 *   • un autre compte écrit à l'administrateur de son entreprise (ou à son créateur).
 *
 * Chaque message est conservé en base ET consigné/expédié par le module d'emails
 * (journal « E-mails » du propriétaire, envoi réel si un SMTP est configuré).
 */
const express = require('express');
const { db } = require('../db');
const { auth } = require('../auth');
const { wrap } = require('../utils');
const Mails = require('../mails');

const router = express.Router();
router.use(auth);

/** Liste des destinataires autorisés pour l'utilisateur connecté. */
function destinatairesPour(user) {
  if (user.plateforme || user.role === 'super_admin') {
    return db.prepare(`SELECT id, nom, email, role FROM users
      WHERE role IN ('admin') AND entreprise_id IS NOT NULL ORDER BY nom`).all();
  }
  if (user.role === 'admin' || user.role === 'gestionnaire') {
    return db.prepare(`SELECT id, nom, email, role FROM users
      WHERE entreprise_id=? AND id<>? ORDER BY nom`).all(user.entreprise_id, user.id);
  }
  return db.prepare(`SELECT id, nom, email, role FROM users
    WHERE entreprise_id=? AND (role IN ('admin','gestionnaire') OR id=?) AND id<>?
    ORDER BY nom`).all(user.entreprise_id, user.cree_par || -1, user.id);
}

router.get('/', wrap((req, res) => {
  const u = req.user;
  const recus = db.prepare(`SELECT * FROM messages WHERE a_user_id=? ORDER BY created_at DESC`).all(u.id);
  const envoyes = db.prepare(`SELECT * FROM messages WHERE de_user_id=? ORDER BY created_at DESC`).all(u.id);
  const non_lus = db.prepare(`SELECT COUNT(*) c FROM messages WHERE a_user_id=? AND lu=0`).get(u.id).c;
  res.json({ recus, envoyes, non_lus, destinataires: destinatairesPour(u) });
}));

router.post('/', wrap((req, res) => {
  const u = req.user;
  const { a_user_id, objet, corps } = req.body || {};
  if (!objet || !corps) return res.status(400).json({ erreur: 'Objet et message obligatoires' });
  const cible = (destinatairesPour(u) || []).find((d) => d.id === Number(a_user_id));
  if (!cible) return res.status(400).json({ erreur: 'Destinataire non autorisé' });

  const info = db.prepare(`INSERT INTO messages
      (de_user_id, de_nom, de_email, a_user_id, a_nom, a_email, entreprise_id, objet, corps)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(u.id, u.nom, u.email, cible.id, cible.nom, cible.email, u.entreprise_id || 0,
      String(objet), String(corps));

  /* Le message part aussi par email (consigné, expédié si SMTP configuré). */
  Mails.envoyerMessageLibre({
    destinataire: cible.email, destinataire_nom: cible.nom,
    sujet: `[Inventa GestyPro] ${objet}`, corps: `${corps}\n\n— ${u.nom} (${u.email})`,
    entreprise_id: u.entreprise_id || 0,
  });

  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), destinataire: cible });
}));

router.post('/:id/lire', wrap((req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND a_user_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ erreur: 'Message introuvable' });
  db.prepare(`UPDATE messages SET lu=1, lu_at=datetime('now','localtime') WHERE id=?`).run(m.id);
  res.json({ ok: true });
}));

module.exports = router;
