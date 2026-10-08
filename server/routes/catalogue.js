/**
 * Catalogue (catégories, produits), stocks par magasin et transferts.
 */
const express = require('express');
const { db } = require('../db');
const { auth, requireModule, requirePerm, peut, magasinImpose } = require('../auth');
const { wrap, prochaineReference, appliquerMouvement, sansPrix } = require('../utils');
const { journaliser } = require('../evenements');
const { entrepriseId, parEntreprise, magasinAutorise, produitAutorise } = require('../portee');

const router = express.Router();
router.use(auth);

/* ----------------------------- CATÉGORIES ----------------------------- */
router.get('/categories', requireModule('produits'), wrap((req, res) => {
  const pe = parEntreprise(req, 'c.entreprise_id');
  res.json(db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM produits p WHERE p.categorie_id=c.id AND p.actif=1) AS nb_produits
    FROM categories c WHERE ${pe.clause} ORDER BY c.nom
  `).all(...pe.params));
}));

router.post('/categories', requirePerm('produits.gerer'), wrap((req, res) => {
  const { nom, description } = req.body || {};
  if (!nom) return res.status(400).json({ erreur: 'Nom obligatoire' });
  const info = db.prepare('INSERT INTO categories (entreprise_id,nom,description) VALUES (?,?,?)')
    .run(entrepriseId(req), nom, description || null);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(info.lastInsertRowid));
}));

router.put('/categories/:id', requirePerm('produits.gerer'), wrap((req, res) => {
  const { nom, description } = req.body || {};
  db.prepare('UPDATE categories SET nom=?, description=? WHERE id=? AND entreprise_id=?')
    .run(nom, description || null, req.params.id, entrepriseId(req));
  res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id));
}));

router.delete('/categories/:id', requirePerm('produits.gerer'), wrap((req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM produits WHERE categorie_id=?').get(req.params.id).c;
  if (n) return res.status(400).json({ erreur: `Catégorie utilisée par ${n} produit(s)` });
  db.prepare('DELETE FROM categories WHERE id=? AND entreprise_id=?').run(req.params.id, entrepriseId(req));
  res.json({ ok: true });
}));

/* ----------------------------- PRODUITS ----------------------------- */
router.get('/produits', requireModule('produits'), wrap((req, res) => {
  const { q, categorie_id, alerte, actif, magasin_id, limite } = req.query;
  let sql = `
    SELECT p.*, c.nom AS categorie,
      (SELECT IFNULL(SUM(s.quantite),0) FROM stocks s WHERE s.produit_id=p.id) AS stock_total,
      ${magasin_id ? '(SELECT IFNULL(s.quantite,0) FROM stocks s WHERE s.produit_id=p.id AND s.magasin_id=@mag) AS stock_magasin,' : ''}
      (p.prix_vente - p.prix_achat) AS marge_unitaire
    FROM produits p LEFT JOIN categories c ON c.id = p.categorie_id
    WHERE p.entreprise_id = @ent`;
  const params = { ent: entrepriseId(req) || -1 };
  if (magasin_id) params.mag = magasin_id;
  if (q) { sql += ' AND (p.nom LIKE @q OR p.code LIKE @q OR IFNULL(p.code_barres,\'\') LIKE @q)'; params.q = '%' + q + '%'; }
  if (categorie_id) { sql += ' AND p.categorie_id = @cat'; params.cat = categorie_id; }
  if (actif !== undefined && actif !== '') { sql += ' AND p.actif = @actif'; params.actif = actif === '1' || actif === true ? 1 : 0; }
  sql += ' ORDER BY p.nom LIMIT @lim';
  params.lim = Math.min(Number(limite) || 2000, 5000);
  let rows = db.prepare(sql).all(params);
  if (alerte === '1') rows = rows.filter((r) => (r.stock_magasin !== undefined ? r.stock_magasin : r.stock_total) <= r.seuil_alerte);
  res.json(sansPrix(req, rows, ['prix_achat', 'marge_unitaire']));
}));

router.get('/produits/:id', requireModule('produits'), wrap((req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.nom AS categorie,
      (SELECT IFNULL(SUM(s.quantite),0) FROM stocks s WHERE s.produit_id=p.id) AS stock_total
    FROM produits p LEFT JOIN categories c ON c.id=p.categorie_id WHERE p.id=? AND p.entreprise_id=?
  `).get(req.params.id, entrepriseId(req) || -1);
  if (!p) return res.status(404).json({ erreur: 'Produit introuvable' });
  p.stocks = db.prepare(`
    SELECT s.quantite, s.maj_at, m.id AS magasin_id, m.nom AS magasin
    FROM stocks s JOIN magasins m ON m.id=s.magasin_id WHERE s.produit_id=? ORDER BY m.nom
  `).all(req.params.id);
  p.mouvements = db.prepare(`
    SELECT ms.*, m.nom AS magasin, u.nom AS utilisateur FROM mouvements_stock ms
    JOIN magasins m ON m.id=ms.magasin_id LEFT JOIN users u ON u.id=ms.user_id
    WHERE ms.produit_id=? ORDER BY ms.id DESC LIMIT 25
  `).all(req.params.id);
  sansPrix(req, p, ['prix_achat', 'marge_unitaire']);
  p.ventes_recentes = db.prepare(`
    SELECT date(v.created_at) AS jour, SUM(l.quantite) AS quantite, SUM(l.total) AS montant
    FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id
    WHERE l.produit_id=? AND v.statut='payee' AND date(v.created_at) >= date('now','localtime','-30 day')
    GROUP BY date(v.created_at) ORDER BY jour
  `).all(req.params.id);
  res.json(p);
}));

router.post('/produits', requireModule('produits'), requirePerm('produits.gerer'), wrap((req, res) => {
  const b = req.body || {};
  /* Le prix de vente n'est plus obligatoire : il peut être donné lors de la vente. */
  if (!b.nom) return res.status(400).json({ erreur: 'Nom obligatoire' });
  const code = b.code || 'P' + String((db.prepare('SELECT IFNULL(MAX(id),0)+1 n FROM produits').get().n)).padStart(4, '0');
  const info = db.prepare(`
    INSERT INTO produits (entreprise_id,code,code_barres,nom,categorie_id,unite,prix_achat,prix_vente,tva,seuil_alerte,actif)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)
  `).run(entrepriseId(req), code, b.code_barres || null, b.nom, b.categorie_id || null, b.unite || 'pièce',
    Number(b.prix_achat) || 0, Number(b.prix_vente) || 0, Number(b.tva ?? 19.25), Number(b.seuil_alerte) || 5);
  const id = info.lastInsertRowid;
  for (const m of db.prepare('SELECT id FROM magasins WHERE actif=1 AND entreprise_id=?').all(entrepriseId(req))) {
    db.prepare('INSERT OR IGNORE INTO stocks (produit_id,magasin_id,quantite) VALUES (?,?,0)').run(id, m.id);
  }
  res.status(201).json(db.prepare('SELECT * FROM produits WHERE id=?').get(id));
}));

router.put('/produits/:id', requireModule('produits'), requirePerm('produits.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM produits WHERE id=? AND entreprise_id=?')
    .get(req.params.id, entrepriseId(req) || -1);
  if (!p) return res.status(404).json({ erreur: 'Produit introuvable' });
  db.prepare(`
    UPDATE produits SET code=?,code_barres=?,nom=?,categorie_id=?,unite=?,prix_achat=?,prix_vente=?,tva=?,seuil_alerte=?,actif=?
    WHERE id=?
  `).run(b.code || p.code, b.code_barres ?? p.code_barres, b.nom || p.nom,
    b.categorie_id === undefined ? p.categorie_id : (b.categorie_id || null),
    b.unite || p.unite, Number(b.prix_achat ?? p.prix_achat), Number(b.prix_vente ?? p.prix_vente),
    Number(b.tva ?? p.tva), Number(b.seuil_alerte ?? p.seuil_alerte),
    b.actif === undefined ? p.actif : (b.actif ? 1 : 0), p.id);
  res.json(db.prepare('SELECT * FROM produits WHERE id=?').get(p.id));
}));

router.delete('/produits/:id', requirePerm('produits.gerer'), wrap((req, res) => {
  if (!produitAutorise(req, req.params.id)) return res.status(404).json({ erreur: 'Produit introuvable' });
  const n = db.prepare('SELECT COUNT(*) c FROM ventes_lignes WHERE produit_id=?').get(req.params.id).c;
  if (n) {
    db.prepare('UPDATE produits SET actif=0 WHERE id=?').run(req.params.id);
    return res.json({ ok: true, desactive: true, message: 'Produit désactivé (présent dans des ventes)' });
  }
  db.prepare('DELETE FROM produits WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ----------------------------- STOCKS ----------------------------- */
router.get('/stocks', requireModule('stocks'), wrap((req, res) => {
  const magasinId = magasinImpose(req.user) || req.query.magasin_id;
  if (!magasinId) return res.status(400).json({ erreur: 'Précisez un magasin (magasin_id)' });
  if (!magasinAutorise(req, magasinId)) return res.status(403).json({ erreur: 'Boutique inconnue pour votre entreprise' });
  const { q, alerte } = req.query;
  let sql = `
    SELECT p.id AS produit_id, p.code, p.nom, p.unite, p.seuil_alerte, p.prix_achat, p.prix_vente,
           c.nom AS categorie, IFNULL(s.quantite,0) AS quantite, s.maj_at,
           (IFNULL(s.quantite,0) * p.prix_vente) AS valeur
    FROM produits p
    LEFT JOIN categories c ON c.id = p.categorie_id
    LEFT JOIN stocks s ON s.produit_id = p.id AND s.magasin_id = ?
    WHERE p.actif = 1 AND p.entreprise_id = ?`;
  const params = [magasinId, entrepriseId(req) || -1];
  if (q) { sql += " AND (p.nom LIKE ? OR p.code LIKE ?)"; params.push('%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY p.nom';
  let rows = db.prepare(sql).all(...params);
  if (alerte === '1') rows = rows.filter((r) => r.quantite <= r.seuil_alerte);
  res.json(sansPrix(req, rows, ['prix_achat', 'valeur']));
}));

router.get('/stocks/alertes', requireModule('stocks'), wrap((req, res) => {
  const impose = magasinImpose(req.user);
  const rows = db.prepare(`
    SELECT p.id AS produit_id, p.nom, p.code, p.seuil_alerte, m.nom AS magasin, m.id AS magasin_id,
           IFNULL(s.quantite,0) AS quantite
    FROM produits p
    CROSS JOIN magasins m
    LEFT JOIN stocks s ON s.produit_id=p.id AND s.magasin_id=m.id
    WHERE p.actif=1 AND m.actif=1 AND IFNULL(s.quantite,0) <= p.seuil_alerte
      AND p.entreprise_id = ? AND m.entreprise_id = ?
      ${impose ? 'AND m.id = ?' : ''}
    ORDER BY (IFNULL(s.quantite,0) - p.seuil_alerte) ASC LIMIT 200
  `).all(entrepriseId(req) || -1, entrepriseId(req) || -1, ...(impose ? [impose] : []));
  res.json(rows);
}));

router.post('/stocks/mouvement', requireModule('stocks'), requirePerm('stock.entree', 'stock.sortie'), wrap((req, res) => {
  const { produit_id, magasin_id, type, quantite, motif } = req.body || {};
  const q = Number(quantite);
  if (!produit_id || !magasin_id || !q || q <= 0) {
    return res.status(400).json({ erreur: 'Produit, boutique et quantité (> 0) obligatoires' });
  }
  // Le droit dépend du sens du mouvement : un agent de réception ne fait que des entrées
  const permissionRequise = type === 'sortie' ? 'stock.sortie' : 'stock.entree';
  if (!peut(req.user, permissionRequise)) {
    return res.status(403).json({
      erreur: type === 'sortie'
        ? 'Votre rôle ne permet pas d’enregistrer des sorties de stock'
        : 'Votre rôle ne permet pas d’enregistrer des entrées de stock',
      permission_requise: [permissionRequise],
    });
  }
  const impose = magasinImpose(req.user);
  if (impose && Number(magasin_id) !== Number(impose)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez agir que sur votre magasin' });
  }
  if (!magasinAutorise(req, magasin_id) || !produitAutorise(req, produit_id)) {
    return res.status(403).json({ erreur: 'Produit ou boutique hors de votre entreprise' });
  }
  const signe = type === 'sortie' ? -q : q;
  const apres = appliquerMouvement({
    produit_id, magasin_id, type: type === 'sortie' ? 'sortie' : 'entree',
    quantite: signe, motif: motif || (type === 'sortie' ? 'Sortie manuelle' : 'Entrée fournisseur'),
    reference: 'MV-' + Date.now(), user_id: req.user.id,
  });
  res.json({ ok: true, quantite: apres });
}));

router.post('/stocks/ajustement', requireModule('stocks'), requirePerm('stock.ajuster'), wrap((req, res) => {
  const { produit_id, magasin_id, quantite_reelle, motif } = req.body || {};
  const impose = magasinImpose(req.user);
  if (impose && Number(magasin_id) !== Number(impose)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez agir que sur votre magasin' });
  }
  if (!magasinAutorise(req, magasin_id) || !produitAutorise(req, produit_id)) {
    return res.status(403).json({ erreur: 'Produit ou boutique hors de votre entreprise' });
  }
  const row = db.prepare('SELECT IFNULL(quantite,0) q FROM stocks WHERE produit_id=? AND magasin_id=?')
    .get(produit_id, magasin_id);
  const avant = row ? row.q : 0;
  const apres_ = Number(quantite_reelle);
  if (isNaN(apres_)) return res.status(400).json({ erreur: 'Quantité réelle invalide' });
  const q = Math.round((apres_ - avant) * 1000) / 1000;
  appliquerMouvement({
    produit_id, magasin_id, type: 'ajustement', quantite: q,
    motif: motif || 'Ajustement inventaire', reference: 'AJU-' + Date.now(), user_id: req.user.id,
  });
  res.json({ ok: true, avant, apres: apres_ });
}));

/**
 * Réception rapide : plusieurs lignes d'un coup, SANS AUCUN PRIX.
 * L'agent de stock ou le vendeur saisit uniquement produit + quantité reçue ;
 * l'entrée est tracée dans le journal avec son auteur.
 */
router.post('/stocks/reception', requireModule('stocks'), requirePerm('stock.entree'), wrap((req, res) => {
  const { magasin_id, lignes, origine, motif } = req.body || {};
  const impose = magasinImpose(req.user);
  const magasin = impose || Number(magasin_id);
  if (!magasin) return res.status(400).json({ erreur: 'Boutique de réception obligatoire' });
  if (impose && Number(magasin_id) && Number(magasin_id) !== Number(impose)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez réceptionner que dans votre boutique' });
  }
  if (!magasinAutorise(req, magasin)) {
    return res.status(404).json({ erreur: 'Boutique introuvable' });
  }
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ erreur: 'Ajoutez au moins une ligne à réceptionner' });
  }
  const reference = prochaineReference('REC', 'mouvements_stock', 'reference', 6);
  const texteMotif = [
    origine ? `Origine : ${origine}` : null,
    motif || null,
    'Réception sans prix',
  ].filter(Boolean).join(' — ');

  const tx = db.transaction(() => {
    let quantiteTotale = 0;
    let nbLignes = 0;
    for (const l of lignes) {
      const produit = db.prepare('SELECT id,nom FROM produits WHERE id=? AND entreprise_id=?')
        .get(l.produit_id, entrepriseId(req) || -1);
      if (!produit) throw new Error(`Produit inconnu (n° ${l.produit_id})`);
      const quantite = Number(l.quantite);
      if (!quantite || quantite <= 0) {
        throw new Error(`Quantité invalide pour « ${produit.nom} »`);
      }
      appliquerMouvement({
        produit_id: produit.id, magasin_id: magasin, type: 'entree', quantite,
        motif: texteMotif, reference, user_id: req.user.id,
      });
      quantiteTotale += quantite;
      nbLignes++;
    }
    return { quantiteTotale, nbLignes };
  });

  const r = tx();

  const nomMagasin = (db.prepare('SELECT nom FROM magasins WHERE id=?').get(magasin) || {}).nom || '';
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: magasin, type: 'stock', reference,
    user_id: req.user.id,
    libelle: `Réception ${reference} — ${r.nbLignes} ligne(s), ${r.quantiteTotale} article(s) entrés${nomMagasin ? ' · ' + nomMagasin : ''}`,
  });

  res.status(201).json({ ok: true, reference, magasin_id: magasin, ...r });
}));

/* ----------------------------- TRANSFERTS ----------------------------- */
router.get('/transferts', requireModule('transferts'), wrap((req, res) => {
  const { statut, magasin_id } = req.query;
  let sql = `
    SELECT t.*, p.nom AS produit, p.code AS code_produit,
           ms.nom AS source, md.nom AS destination, u.nom AS utilisateur
    FROM transferts t
    JOIN produits p ON p.id = t.produit_id
    JOIN magasins ms ON ms.id = t.magasin_source_id
    JOIN magasins md ON md.id = t.magasin_dest_id
    LEFT JOIN users u ON u.id = t.user_id WHERE ms.entreprise_id = ?`;
  const params = [entrepriseId(req) || -1];
  if (statut) { sql += ' AND t.statut = ?'; params.push(statut); }
  if (magasin_id) { sql += ' AND (t.magasin_source_id = ? OR t.magasin_dest_id = ?)'; params.push(magasin_id, magasin_id); }
  sql += ' ORDER BY t.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...params));
}));

router.post('/transferts', requireModule('transferts'), requirePerm('transferts.creer'), wrap((req, res) => {
  const { magasin_source_id, magasin_dest_id, produit_id, quantite, note } = req.body || {};
  const q = Number(quantite);
  if (!magasin_source_id || !magasin_dest_id || !produit_id || !q || q <= 0) {
    return res.status(400).json({ erreur: 'Tous les champs sont obligatoires (quantité > 0)' });
  }
  if (Number(magasin_source_id) === Number(magasin_dest_id)) {
    return res.status(400).json({ erreur: 'Le magasin de départ et d’arrivée doivent différer' });
  }
  if (!magasinAutorise(req, magasin_source_id) || !magasinAutorise(req, magasin_dest_id)
      || !produitAutorise(req, produit_id)) {
    return res.status(403).json({ erreur: 'Boutique ou produit hors de votre entreprise' });
  }
  const dispo = db.prepare('SELECT IFNULL(quantite,0) q FROM stocks WHERE produit_id=? AND magasin_id=?')
    .get(produit_id, magasin_source_id).q;
  if (dispo < q) {
    return res.status(400).json({ erreur: `Stock insuffisant dans le magasin source (disponible : ${dispo})` });
  }
  const ref = prochaineReference('TRF', 'transferts', 'reference', 4);
  const info = db.prepare(`
    INSERT INTO transferts (reference,magasin_source_id,magasin_dest_id,produit_id,quantite,statut,note,user_id)
    VALUES (?,?,?,?,?,'en_attente',?,?)
  `).run(ref, magasin_source_id, magasin_dest_id, produit_id, q, note || null, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM transferts WHERE id=?').get(info.lastInsertRowid));
}));

router.post('/transferts/:id/valider', requireModule('transferts'), requirePerm('transferts.valider'), wrap((req, res) => {
  const t = db.prepare('SELECT * FROM transferts WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ erreur: 'Transfert introuvable' });
  if (!magasinAutorise(req, t.magasin_source_id) || !magasinAutorise(req, t.magasin_dest_id)) {
    return res.status(403).json({ erreur: 'Transfert hors de votre entreprise' });
  }
  if (t.statut !== 'en_attente') return res.status(400).json({ erreur: 'Ce transfert a déjà été traité' });
  const dispo = db.prepare('SELECT IFNULL(quantite,0) q FROM stocks WHERE produit_id=? AND magasin_id=?')
    .get(t.produit_id, t.magasin_source_id).q;
  if (dispo < t.quantite) return res.status(400).json({ erreur: 'Stock insuffisant dans le magasin source' });
  appliquerMouvement({
    produit_id: t.produit_id, magasin_id: t.magasin_source_id, type: 'transfert_sortie',
    quantite: -t.quantite, motif: 'Transfert vers destination', reference: t.reference, user_id: req.user.id,
  });
  appliquerMouvement({
    produit_id: t.produit_id, magasin_id: t.magasin_dest_id, type: 'transfert_entree',
    quantite: t.quantite, motif: 'Transfert depuis source', reference: t.reference, user_id: req.user.id,
  });
  db.prepare("UPDATE transferts SET statut='valide', valide_at=datetime('now','localtime') WHERE id=?").run(t.id);

  const produit = db.prepare('SELECT nom FROM produits WHERE id=?').get(t.produit_id) || {};
  const source = db.prepare('SELECT nom FROM magasins WHERE id=?').get(t.magasin_source_id) || {};
  const dest = db.prepare('SELECT nom FROM magasins WHERE id=?').get(t.magasin_dest_id) || {};
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: t.magasin_dest_id, type: 'transfert',
    reference: t.reference, user_id: req.user.id,
    libelle: `Transfert ${t.reference} validé — ${produit.nom || 'produit'} ×${t.quantite} : ${source.nom || '?'} → ${dest.nom || '?'}`,
  });

  res.json({ ok: true });
}));

router.post('/transferts/:id/annuler', requireModule('transferts'), requirePerm('transferts.valider'), wrap((req, res) => {
  const t = db.prepare('SELECT * FROM transferts WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ erreur: 'Transfert introuvable' });
  if (!magasinAutorise(req, t.magasin_source_id) || !magasinAutorise(req, t.magasin_dest_id)) {
    return res.status(403).json({ erreur: 'Transfert hors de votre entreprise' });
  }
  if (t.statut !== 'en_attente') return res.status(400).json({ erreur: 'Seul un transfert en attente peut être annulé' });
  db.prepare("UPDATE transferts SET statut='annule' WHERE id=?").run(t.id);
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: t.magasin_source_id, type: 'transfert',
    reference: t.reference, user_id: req.user.id,
    libelle: `Transfert ${t.reference} annulé`,
  });
  res.json({ ok: true });
}));

module.exports = router;
