/**
 * Clients, fournisseurs et employés.
 */
const express = require('express');
const { db } = require('../db');
const { auth, requireModule, requirePerm, magasinImpose } = require('../auth');
const { wrap } = require('../utils');
const { journaliser } = require('../evenements');
const { entrepriseId, magasinAutorise } = require('../portee');
const RH = require('../rh');

const router = express.Router();
router.use(auth);

/* ----------------------------- CLIENTS ----------------------------- */
router.get('/clients', requireModule('clients'), wrap((req, res) => {
  const { q, type } = req.query;
  let sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM ventes v WHERE v.client_id=c.id AND v.statut='payee') AS nb_achats,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.client_id=c.id AND v.statut='payee') AS total_achats,
      (SELECT MAX(v.created_at) FROM ventes v WHERE v.client_id=c.id) AS dernier_achat
    FROM clients c WHERE c.entreprise_id = ?`;
  const p = [entrepriseId(req) || -1];
  if (q) { sql += " AND (c.nom LIKE ? OR IFNULL(c.telephone,'') LIKE ? OR IFNULL(c.code,'') LIKE ?)"; p.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  if (type) { sql += ' AND c.type = ?'; p.push(type); }
  sql += ' ORDER BY c.nom';
  res.json(db.prepare(sql).all(...p));
}));

router.get('/clients/:id', requireModule('clients'), wrap((req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND entreprise_id=?')
    .get(req.params.id, entrepriseId(req) || -1);
  if (!c) return res.status(404).json({ erreur: 'Client introuvable' });
  c.ventes = db.prepare(`
    SELECT v.id, v.reference, v.total, v.statut, v.created_at, m.nom AS magasin
    FROM ventes v JOIN magasins m ON m.id=v.magasin_id
    WHERE v.client_id=? ORDER BY v.id DESC LIMIT 50`).all(req.params.id);
  res.json(c);
}));

router.post('/clients', requireModule('clients'), requirePerm('clients.gerer'), wrap((req, res) => {
  const b = req.body || {};
  if (!b.nom) return res.status(400).json({ erreur: 'Le nom du client est obligatoire' });
  const n = db.prepare('SELECT IFNULL(MAX(id),0)+1 n FROM clients').get().n;
  const info = db.prepare(`
    INSERT INTO clients (entreprise_id,code,nom,telephone,email,adresse,ville,type) VALUES (?,?,?,?,?,?,?,?)`)
    .run(entrepriseId(req), 'CL-' + String(n).padStart(4, '0'), b.nom, b.telephone || null, b.email || null,
      b.adresse || null, b.ville || null, b.type || 'particulier');
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(info.lastInsertRowid);
  journaliser({
    entreprise_id: entrepriseId(req), type: 'tiers', reference: client.code, user_id: req.user.id,
    libelle: `Nouveau client « ${client.nom} »`,
  });
  res.status(201).json(client);
}));

router.put('/clients/:id', requireModule('clients'), requirePerm('clients.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ erreur: 'Client introuvable' });
  db.prepare('UPDATE clients SET nom=?,telephone=?,email=?,adresse=?,ville=?,type=? WHERE id=?')
    .run(b.nom || c.nom, b.telephone ?? c.telephone, b.email ?? c.email, b.adresse ?? c.adresse,
      b.ville ?? c.ville, b.type || c.type, c.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(c.id));
}));

router.delete('/clients/:id', requirePerm('clients.gerer'), wrap((req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM ventes WHERE client_id=?').get(req.params.id).c;
  if (n) return res.status(400).json({ erreur: `Ce client a ${n} vente(s) : suppression impossible` });
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ----------------------------- FOURNISSEURS ----------------------------- */
router.get('/fournisseurs', requireModule('fournisseurs'), wrap((req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT f.*,
      (SELECT COUNT(*) FROM commandes_achat c WHERE c.fournisseur_id=f.id) AS nb_commandes,
      (SELECT IFNULL(SUM(c.total),0) FROM commandes_achat c WHERE c.fournisseur_id=f.id AND c.statut='recue') AS total_achats
    FROM fournisseurs f WHERE f.entreprise_id = ?`;
  const p = [entrepriseId(req) || -1];
  if (q) { sql += " AND (f.nom LIKE ? OR IFNULL(f.contact,'') LIKE ? OR IFNULL(f.code,'') LIKE ?)"; p.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY f.nom';
  res.json(db.prepare(sql).all(...p));
}));

router.post('/fournisseurs', requireModule('fournisseurs'), requirePerm('fournisseurs.gerer'), wrap((req, res) => {
  const b = req.body || {};
  if (!b.nom) return res.status(400).json({ erreur: 'Le nom du fournisseur est obligatoire' });
  const n = db.prepare('SELECT IFNULL(MAX(id),0)+1 n FROM fournisseurs').get().n;
  const info = db.prepare(`
    INSERT INTO fournisseurs (entreprise_id,code,nom,contact,telephone,email,adresse,ville,categorie)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(entrepriseId(req), 'FR-' + String(n).padStart(3, '0'), b.nom, b.contact || null, b.telephone || null,
      b.email || null, b.adresse || null, b.ville || null, b.categorie || null);
  res.status(201).json(db.prepare('SELECT * FROM fournisseurs WHERE id=?').get(info.lastInsertRowid));
}));

router.put('/fournisseurs/:id', requireModule('fournisseurs'), requirePerm('fournisseurs.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const f = db.prepare('SELECT * FROM fournisseurs WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ erreur: 'Fournisseur introuvable' });
  db.prepare('UPDATE fournisseurs SET nom=?,contact=?,telephone=?,email=?,adresse=?,ville=?,categorie=? WHERE id=?')
    .run(b.nom || f.nom, b.contact ?? f.contact, b.telephone ?? f.telephone, b.email ?? f.email,
      b.adresse ?? f.adresse, b.ville ?? f.ville, b.categorie ?? f.categorie, f.id);
  res.json(db.prepare('SELECT * FROM fournisseurs WHERE id=?').get(f.id));
}));

router.delete('/fournisseurs/:id', requirePerm('fournisseurs.gerer'), wrap((req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM commandes_achat WHERE fournisseur_id=?').get(req.params.id).c;
  if (n) return res.status(400).json({ erreur: `Ce fournisseur a ${n} commande(s) enregistrée(s)` });
  db.prepare('DELETE FROM fournisseurs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ----------------------------- EMPLOYÉS ----------------------------- */
router.get('/employes', requireModule('employes'), wrap((req, res) => {
  const impose = magasinImpose(req.user);
  const { q, magasin_id, actif } = req.query;
  let sql = `SELECT e.*, m.nom AS magasin FROM employes e LEFT JOIN magasins m ON m.id=e.magasin_id
    WHERE (m.entreprise_id = ? OR e.magasin_id IS NULL)`;
  const p = [entrepriseId(req) || -1];
  if (impose) { sql += ' AND e.magasin_id = ?'; p.push(impose); }
  else if (magasin_id) { sql += ' AND e.magasin_id = ?'; p.push(magasin_id); }
  if (q) { sql += " AND (e.nom LIKE ? OR IFNULL(e.poste,'') LIKE ? OR IFNULL(e.code,'') LIKE ?)"; p.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  if (actif !== undefined && actif !== '') { sql += ' AND e.actif = ?'; p.push(actif === '1' ? 1 : 0); }
  sql += ' ORDER BY e.nom';
  const rows = db.prepare(sql).all(...p);
  const masse = rows.filter((r) => r.actif).reduce((s, r) => s + (r.salaire || 0), 0);
  res.json({ employes: rows, masse_salariale: masse });
}));

/* Créé via le module RH : l'entreprise est renseignée, le code est unique par
   entreprise et la permission vérifiée est bien « employes.gerer ». */
router.post('/employes', requireModule('employes'), requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.creerEmploye(entrepriseId(req), req.body || {}, { utilisateurId: req.user.id });
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id, montant: Number(e.salaire) || 0,
    libelle: 'Employé créé : ' + e.nom + ' (' + (e.poste || 'sans poste') + ')',
  });
  res.status(201).json(e);
}));

router.put('/employes/:id', requireModule('employes'), requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.modifierEmploye(Number(req.params.id), entrepriseId(req), req.body || {});
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id,
    libelle: 'Fiche du personnel modifiée : ' + e.nom,
  });
  res.json(e);
}));

/* Cloisonné par entreprise : on ne peut plus supprimer la fiche d'une autre
   entreprise en devinant son identifiant. */
router.delete('/employes/:id', requireModule('employes'), requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.supprimerEmploye(Number(req.params.id), entrepriseId(req));
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id,
    libelle: 'Employé supprimé : ' + e.nom,
  });
  res.json({ ok: true, id: e.id });
}));

module.exports = router;
