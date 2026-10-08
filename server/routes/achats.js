/**
 * Commandes d'achat fournisseurs (brouillon -> commandée -> reçue).
 */
const express = require('express');
const { db } = require('../db');
const { auth, requireModule, requirePerm, peut, magasinImpose } = require('../auth');
const { wrap, prochaineReference, appliquerMouvement, sansPrix } = require('../utils');
const { journaliser } = require('../evenements');
const { entrepriseId, magasinAutorise, produitAutorise } = require('../portee');

const router = express.Router();
router.use(auth);

router.get('/achats', requireModule('achats'), wrap((req, res) => {
  const { statut, fournisseur_id, magasin_id } = req.query;
  let sql = `
    SELECT c.*, f.nom AS fournisseur, m.nom AS magasin, u.nom AS utilisateur,
      (SELECT COUNT(*) FROM commandes_achat_lignes l WHERE l.commande_id=c.id) AS nb_lignes
    FROM commandes_achat c
    JOIN fournisseurs f ON f.id=c.fournisseur_id
    JOIN magasins m ON m.id=c.magasin_id
    LEFT JOIN users u ON u.id=c.user_id WHERE m.entreprise_id = ?`;
  const p = [entrepriseId(req) || -1];
  const impose = magasinImpose(req.user);
  if (impose) { sql += ' AND c.magasin_id = ?'; p.push(impose); }
  else if (magasin_id) { sql += ' AND c.magasin_id = ?'; p.push(magasin_id); }
  if (statut) { sql += ' AND c.statut = ?'; p.push(statut); }
  if (fournisseur_id) { sql += ' AND c.fournisseur_id = ?'; p.push(fournisseur_id); }
  sql += ' ORDER BY c.id DESC LIMIT 300';
  res.json(sansPrix(req, db.prepare(sql).all(...p), ['total']));
}));

router.get('/achats/:id', requireModule('achats'), wrap((req, res) => {
  const c = db.prepare(`
    SELECT c.*, f.nom AS fournisseur, f.telephone AS fournisseur_tel, m.nom AS magasin
    FROM commandes_achat c JOIN fournisseurs f ON f.id=c.fournisseur_id
    JOIN magasins m ON m.id=c.magasin_id WHERE c.id=? AND m.entreprise_id=?`)
    .get(req.params.id, entrepriseId(req) || -1);
  if (!c) return res.status(404).json({ erreur: 'Commande introuvable' });
  c.lignes = db.prepare(`
    SELECT l.*, p.nom AS produit, p.code AS code_produit
    FROM commandes_achat_lignes l JOIN produits p ON p.id=l.produit_id WHERE l.commande_id=?`).all(req.params.id);
  sansPrix(req, c, ['total']);
  sansPrix(req, c.lignes, ['prix_unitaire']);
  res.json(c);
}));

router.post('/achats', requireModule('achats'), requirePerm('achats.creer'), wrap((req, res) => {
  if (req.body && req.body.magasin_id && !magasinAutorise(req, req.body.magasin_id)) {
    return res.status(403).json({ erreur: 'Boutique inconnue pour votre entreprise' });
  }
  const b = req.body || {};
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  if (!b.fournisseur_id || !b.magasin_id || !lignes.length) {
    return res.status(400).json({ erreur: 'Fournisseur, magasin et au moins une ligne sont obligatoires' });
  }
  const tx = db.transaction(() => {
    const ref = prochaineReference('CMD', 'commandes_achat', 'reference', 4);
    const info = db.prepare(`
      INSERT INTO commandes_achat (reference,fournisseur_id,magasin_id,statut,total,note,user_id)
      VALUES (?,?,?,?,0,?,?)`)
      .run(ref, b.fournisseur_id, b.magasin_id, b.statut === 'commandee' ? 'commandee' : 'brouillon', b.note || null, req.user.id);
    const id = info.lastInsertRowid;
    let total = 0;
    const ins = db.prepare('INSERT INTO commandes_achat_lignes (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)');
    for (const l of lignes) {
      const prod = db.prepare('SELECT * FROM produits WHERE id=? AND entreprise_id=?')
        .get(l.produit_id, entrepriseId(req) || -1);
      if (!prod) continue;
      const qte = Number(l.quantite) || 1;
      const pu = Number(l.prix_unitaire) || prod.prix_achat;
      ins.run(id, prod.id, qte, pu);
      total += qte * pu;
    }
    db.prepare('UPDATE commandes_achat SET total=? WHERE id=?').run(total, id);
    return id;
  });
  const id = tx();
  res.status(201).json(db.prepare('SELECT * FROM commandes_achat WHERE id=?').get(id));
}));

const mwStatut = [requireModule('achats'), requirePerm('achats.creer', 'achats.receptionner'), wrap((req, res) => {
  const { statut } = req.body || {};
  const c = db.prepare('SELECT * FROM commandes_achat WHERE id=?').get(req.params.id);
  if (!c || !magasinAutorise(req, c.magasin_id)) return res.status(404).json({ erreur: 'Commande introuvable' });
  if (!['brouillon', 'commandee', 'recue', 'annulee'].includes(statut)) {
    return res.status(400).json({ erreur: 'Statut invalide' });
  }
  if (statut === 'recue') {
    if (c.statut === 'recue') return res.status(400).json({ erreur: 'Commande déjà réceptionnée' });
    const lignes = db.prepare('SELECT * FROM commandes_achat_lignes WHERE commande_id=?').all(c.id);
    const tx = db.transaction(() => {
      for (const l of lignes) {
        appliquerMouvement({
          produit_id: l.produit_id, magasin_id: c.magasin_id, type: 'entree', quantite: l.quantite,
          motif: 'Réception commande ' + c.reference, reference: c.reference, user_id: req.user.id,
        });
        db.prepare('UPDATE produits SET prix_achat=? WHERE id=? AND ? > 0').run(l.prix_unitaire, l.produit_id, l.prix_unitaire);
      }
      db.prepare("UPDATE commandes_achat SET statut='recue', reception_at=datetime('now','localtime') WHERE id=?").run(c.id);
    });
    tx();
    journaliser({
      entreprise_id: entrepriseId(req), magasin_id: c.magasin_id, type: 'achat',
      reference: c.reference, user_id: req.user.id,
      libelle: `Commande ${c.reference} réceptionnée — ${lignes.length} ligne(s) entrée(s) en stock`,
    });
    return res.json({ ok: true, statut: 'recue' });
  }
  db.prepare('UPDATE commandes_achat SET statut=? WHERE id=?').run(statut, c.id);
  res.json({ ok: true, statut });
})];

router.put('/achats/:id/statut', ...mwStatut);
router.post('/achats/:id/statut', ...mwStatut);

router.delete('/achats/:id', requirePerm('achats.creer'), wrap((req, res) => {
  const c = db.prepare('SELECT * FROM commandes_achat WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ erreur: 'Commande introuvable' });
  if (c.statut === 'recue') return res.status(400).json({ erreur: 'Une commande réceptionnée ne peut être supprimée' });
  db.prepare('DELETE FROM commandes_achat WHERE id=?').run(c.id);
  res.json({ ok: true });
}));

module.exports = router;
