/**
 * Ventes / caisse : enregistrement, consultation, annulation.
 */
const express = require('express');
const { db } = require('../db');
const { auth, requireModule, requirePerm, magasinImpose } = require('../auth');
const { wrap, prochaineReference, appliquerMouvement, param } = require('../utils');
const { journaliser } = require('../evenements');
const { entrepriseId, magasinAutorise, produitAutorise, paramEntreprise } = require('../portee');

const router = express.Router();
router.use(auth);

/** Liste des ventes avec filtres. */
router.get('/ventes', requireModule('ventes'), wrap((req, res) => {
  const { debut, fin, magasin_id, client_id, user_id, statut, mode_paiement, q, limite } = req.query;
  let sql = `
    SELECT v.id, v.reference, v.sous_total, v.remise, v.tva, v.total, v.mode_paiement,
           v.montant_paye, v.monnaie, v.statut, v.created_at,
           m.nom AS magasin, m.id AS magasin_id, c.nom AS client, c.id AS client_id, u.nom AS caissier,
           (SELECT IFNULL(SUM(quantite),0) FROM ventes_lignes l WHERE l.vente_id = v.id) AS nb_articles
    FROM ventes v
    JOIN magasins m ON m.id = v.magasin_id
    LEFT JOIN clients c ON c.id = v.client_id
    LEFT JOIN users u ON u.id = v.user_id
    WHERE m.entreprise_id = ?`;
  const p = [entrepriseId(req) || -1];
  const impose = magasinImpose(req.user);
  if (impose) { sql += ' AND v.magasin_id = ?'; p.push(impose); }
  else if (magasin_id) { sql += ' AND v.magasin_id = ?'; p.push(magasin_id); }
  if (debut) { sql += ' AND date(v.created_at) >= date(?)'; p.push(debut); }
  if (fin) { sql += ' AND date(v.created_at) <= date(?)'; p.push(fin); }
  if (client_id) { sql += ' AND v.client_id = ?'; p.push(client_id); }
  if (user_id) { sql += ' AND v.user_id = ?'; p.push(user_id); }
  if (statut) { sql += ' AND v.statut = ?'; p.push(statut); }
  if (mode_paiement) { sql += ' AND v.mode_paiement = ?'; p.push(mode_paiement); }
  if (q) { sql += ' AND (v.reference LIKE ? OR IFNULL(c.nom,\'\') LIKE ?)'; p.push('%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY v.id DESC LIMIT ?';
  p.push(Math.min(Number(limite) || 200, 1000));
  const rows = db.prepare(sql).all(...p);
  const totaux = rows.filter((r) => r.statut === 'payee').reduce((s, r) => s + r.total, 0);
  res.json({ ventes: rows, total_affiche: totaux });
}));

/** Détail d'une vente (pour le ticket / la facture). */
router.get('/ventes/:id', requireModule('ventes'), wrap((req, res) => {
  const v = db.prepare(`
    SELECT v.*, m.nom AS magasin, m.adresse AS magasin_adresse, m.telephone AS magasin_tel,
           c.nom AS client, c.telephone AS client_tel, u.nom AS caissier
    FROM ventes v JOIN magasins m ON m.id=v.magasin_id
    LEFT JOIN clients c ON c.id=v.client_id LEFT JOIN users u ON u.id=v.user_id
    WHERE v.id=? AND m.entreprise_id=?`).get(req.params.id, entrepriseId(req) || -1);
  if (!v) return res.status(404).json({ erreur: 'Vente introuvable' });
  v.lignes = db.prepare('SELECT * FROM ventes_lignes WHERE vente_id=?').all(req.params.id);
  const s = db.prepare('SELECT cle,valeur FROM parametres WHERE entreprise_id IN (?,0)')
    .all(entrepriseId(req) || 0);
  v.parametres = {};
  s.forEach((r) => { v.parametres[r.cle] = r.valeur; });
  res.json(v);
}));

/** Enregistrement d'une vente (caisse). */
router.post('/ventes', requireModule('caisse'), wrap((req, res) => {
  const b = req.body || {};
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  if (!lignes.length) return res.status(400).json({ erreur: 'Le panier est vide' });

  const impose = magasinImpose(req.user);
  const magasin_id = impose || Number(b.magasin_id);
  if (!magasin_id) return res.status(400).json({ erreur: 'Magasin obligatoire' });
  const magasin = db.prepare('SELECT * FROM magasins WHERE id=? AND entreprise_id=?')
    .get(magasin_id, entrepriseId(req) || -1);
  if (!magasin) return res.status(404).json({ erreur: 'Magasin introuvable' });
  /* Un « magasin » ne détient que du stock : seules les « boutiques » encaissent. */
  if (magasin.type === 'magasin') {
    return res.status(400).json({ erreur: 'Ce point de vente est un magasin de stock : il ne peut pas encaisser de ventes.' });
  }

  const peutModifierPrix = ['admin', 'gestionnaire'].includes(req.user.role);
  const details = [];
  for (const l of lignes) {
    const prod = db.prepare('SELECT * FROM produits WHERE id=? AND entreprise_id=?')
      .get(l.produit_id, entrepriseId(req) || -1);
    if (!prod) return res.status(400).json({ erreur: 'Produit inconnu dans le panier' });
    const qte = Number(l.quantite);
    if (!qte || qte <= 0) return res.status(400).json({ erreur: 'Quantité invalide pour ' + prod.nom });
    const row = db.prepare('SELECT IFNULL(quantite,0) q FROM stocks WHERE produit_id=? AND magasin_id=?')
      .get(prod.id, magasin_id);
    if (row.q < qte) {
      return res.status(400).json({ erreur: `Stock insuffisant pour « ${prod.nom} » (disponible : ${row.q})` });
    }
    /* Un produit créé sans prix de vente reçoit le sien au moment de la vente :
       on accepte alors le prix transmis par la caisse et on le mémorise. */
    const prixInitial = Number(prod.prix_vente) || 0;
    let pu;
    if (peutModifierPrix && l.prix_unitaire != null && l.prix_unitaire !== '') pu = Number(l.prix_unitaire);
    else if (!prixInitial && l.prix_unitaire != null && l.prix_unitaire !== '') pu = Number(l.prix_unitaire);
    else pu = prixInitial;
    if (isNaN(pu) || pu < 0) return res.status(400).json({ erreur: 'Prix invalide pour ' + prod.nom });
    const remiseLigne = Number(l.remise) || 0;
    details.push({ produit: prod, quantite: qte, prix_unitaire: pu, remise: remiseLigne, total: pu * qte - remiseLigne,
      memoriser_prix: !prixInitial && pu > 0 });
  }

  const sous_total = details.reduce((s, d) => s + d.prix_unitaire * d.quantite, 0);
  const remise_lignes = details.reduce((s, d) => s + d.remise, 0);
  const remise_globale = Number(b.remise) || 0;
  const remise = remise_lignes + remise_globale;
  const tvaTaux = Number(paramEntreprise(req, 'tva_defaut', '19.25')) || 0;
  const total = Math.max(0, sous_total - remise);
  const mode_paiement = ['especes', 'mobile_money', 'carte', 'credit'].includes(b.mode_paiement) ? b.mode_paiement : 'especes';
  const montant_paye = mode_paiement === 'credit' ? 0 : Number(b.montant_paye ?? total);

  const tx = db.transaction(() => {
    const reference = prochaineReference(paramEntreprise(req, 'prefixe_vente', 'VTE'), 'ventes');
    const info = db.prepare(`
      INSERT INTO ventes (reference,magasin_id,client_id,user_id,sous_total,remise,tva,total,
                          mode_paiement,montant_paye,monnaie,statut,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'payee',?)
    `).run(reference, magasin_id, b.client_id || null, req.user.id, sous_total, remise, 0, total,
      mode_paiement, montant_paye, Math.max(0, montant_paye - total), b.note || null);
    const venteId = info.lastInsertRowid;
    const insLigne = db.prepare(`
      INSERT INTO ventes_lignes (vente_id,produit_id,nom_produit,quantite,prix_unitaire,remise,total)
      VALUES (?,?,?,?,?,?,?)`);
    for (const d of details) {
      insLigne.run(venteId, d.produit.id, d.produit.nom, d.quantite, d.prix_unitaire, d.remise, d.total);
      if (d.memoriser_prix) {
        db.prepare('UPDATE produits SET prix_vente=? WHERE id=?').run(d.prix_unitaire, d.produit.id);
      }
      appliquerMouvement({
        produit_id: d.produit.id, magasin_id, type: 'vente', quantite: -d.quantite,
        motif: 'Vente ' + reference, reference, user_id: req.user.id,
      });
    }
    if (b.client_id) {
      db.prepare('UPDATE clients SET points = points + ? WHERE id=?')
        .run(Math.floor(total / 5000), b.client_id);
    }
    return venteId;
  });

  const venteId = tx();
  const vente = db.prepare('SELECT * FROM ventes WHERE id=?').get(venteId);

  /* Temps réel : les tableaux de bord et listes ouverts ailleurs se rafraîchissent. */
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id, type: 'vente', reference: vente.reference,
    montant: vente.total, user_id: req.user.id,
    libelle: `Vente ${vente.reference} — ${vente.total.toLocaleString('fr-FR')} FCFA · ${magasin.nom}`,
  });

  res.status(201).json(vente);
}));

/** Annulation d'une vente : remise du stock. */
router.post('/ventes/:id/annuler', requireModule('ventes'), requirePerm('ventes.annuler'), wrap((req, res) => {
  const v = db.prepare(`SELECT v.* FROM ventes v JOIN magasins m ON m.id=v.magasin_id
    WHERE v.id=? AND m.entreprise_id=?`).get(req.params.id, entrepriseId(req) || -1);
  if (!v) return res.status(404).json({ erreur: 'Vente introuvable' });
  if (v.statut === 'annulee') return res.status(400).json({ erreur: 'Vente déjà annulée' });
  const lignes = db.prepare('SELECT * FROM ventes_lignes WHERE vente_id=?').all(v.id);
  const tx = db.transaction(() => {
    for (const l of lignes) {
      if (!l.produit_id) continue;
      appliquerMouvement({
        produit_id: l.produit_id, magasin_id: v.magasin_id, type: 'retour', quantite: l.quantite,
        motif: 'Annulation vente ' + v.reference, reference: v.reference, user_id: req.user.id,
      });
    }
    db.prepare("UPDATE ventes SET statut='annulee' WHERE id=?").run(v.id);
  });
  tx();

  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: v.magasin_id, type: 'vente', reference: v.reference,
    montant: -v.total, user_id: req.user.id,
    libelle: `Vente ${v.reference} annulée — stock remis en place`,
  });

  res.json({ ok: true });
}));

/** Dernières ventes du magasin courant (écran caisse). */
router.get('/caisse/session', requireModule('caisse'), wrap((req, res) => {
  const impose = magasinImpose(req.user);
  const magasinId = impose || req.query.magasin_id;
  if (!magasinId) return res.status(400).json({ erreur: 'Magasin obligatoire' });
  if (!magasinAutorise(req, magasinId)) return res.status(403).json({ erreur: 'Boutique inconnue pour votre entreprise' });
  const derniere = db.prepare(`
    SELECT reference, total, mode_paiement, created_at FROM ventes
    WHERE magasin_id=? AND statut='payee' ORDER BY id DESC LIMIT 5`).all(magasinId);
  const jour = db.prepare(`
    SELECT COUNT(*) AS nb, IFNULL(SUM(total),0) AS ca FROM ventes
    WHERE magasin_id=? AND statut='payee' AND date(created_at)=date('now','localtime')`).get(magasinId);
  res.json({ magasin_id: magasinId, derniere, jour });
}));

module.exports = router;
