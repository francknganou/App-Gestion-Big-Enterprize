/**
 * inventaires.js — Inventaires physiques et rapprochement des stocks.
 *
 * Un inventaire répond à quatre questions, chacune traitée dans son onglet :
 *   1. « comptes des stocks actuels »  → le comptage physique, saisi ligne à ligne ;
 *   2. « comptes du montant généré »   → la valeur du stock compté (au prix
 *                                        d'achat = immobilisé, au prix de vente
 *                                        = ce que le stock peut rapporter) ;
 *   3. « le stock qu'on devait avoir » → le stock théorique, c'est-à-dire ce que
 *                                        le système annonce, CONTRÔLÉ en le
 *                                        recalculant depuis les mouvements ;
 *   4. « on compare »                  → les écarts (quantité et valeur) entre le
 *                                        compté et le théorique, avec application
 *                                        possible des ajustements.
 *
 * Les quantités de `mouvements_stock` sont déjà signées (négatives pour les
 * sorties/ventes) : le stock recalculé est donc la simple somme des mouvements.
 */
const { db } = require('./db');
const { appliquerMouvement } = require('./utils');

/** Stock annoncé par le système pour un produit (tous magasins ou un seul). */
function stockSysteme(produitId, magasinId) {
  const r = magasinId
    ? db.prepare('SELECT IFNULL(quantite,0) q FROM stocks WHERE produit_id=? AND magasin_id=?')
      .get(produitId, magasinId)
    : db.prepare('SELECT IFNULL(SUM(quantite),0) q FROM stocks WHERE produit_id=?').get(produitId);
  return Number((r && r.q) || 0);
}

/** Stock recalculé depuis le journal des mouvements (contrôle d'intégrité). */
function stockCalcule(produitId, magasinId) {
  const r = magasinId
    ? db.prepare('SELECT IFNULL(SUM(quantite),0) q FROM mouvements_stock WHERE produit_id=? AND magasin_id=?')
      .get(produitId, magasinId)
    : db.prepare('SELECT IFNULL(SUM(quantite),0) q FROM mouvements_stock WHERE produit_id=?').get(produitId);
  return Number((r && r.q) || 0);
}

/** Sessions d'inventaire d'une entreprise. */
function lister(entrepriseId, { magasin_id = null } = {}) {
  const params = [Number(entrepriseId)];
  let filtre = '';
  if (magasin_id) { filtre = ' AND (i.magasin_id = ? OR i.magasin_id IS NULL)'; params.push(Number(magasin_id)); }
  return db.prepare(`
    SELECT i.*, m.nom AS magasin_nom,
      (SELECT COUNT(*) FROM inventaires_lignes l WHERE l.inventaire_id = i.id) AS nb_lignes,
      (SELECT COUNT(*) FROM inventaires_lignes l WHERE l.inventaire_id = i.id
         AND l.quantite_comptee IS NOT NULL) AS nb_comptees,
      (SELECT IFNULL(SUM((l.quantite_comptee - l.quantite_theorique) * l.prix_achat), 0)
         FROM inventaires_lignes l WHERE l.inventaire_id = i.id
         AND l.quantite_comptee IS NOT NULL) AS ecart_valeur,
      (SELECT COUNT(*) FROM inventaires_lignes l WHERE l.inventaire_id = i.id
         AND l.quantite_comptee IS NOT NULL
         AND ROUND(l.quantite_comptee - l.quantite_theorique, 3) <> 0) AS nb_ecarts
    FROM inventaires i
    LEFT JOIN magasins m ON m.id = i.magasin_id
    WHERE i.entreprise_id = ?${filtre}
    ORDER BY i.id DESC`).all(...params);
}

/**
 * Crée une session et photographie l'état du stock : chaque ligne reçoit le stock
 * théorique (système) et le stock recalculé depuis les mouvements.
 */
function creer({ entreprise_id, magasin_id = null, libelle, commentaire = null, user_id = null }) {
  const ent = Number(entreprise_id) || 0;
  if (!ent) throw Object.assign(new Error('Entreprise inconnue'), { statut: 400 });
  if (!String(libelle || '').trim()) throw Object.assign(new Error('Libellé d’inventaire requis'), { statut: 400 });
  if (magasin_id) {
    const m = db.prepare('SELECT id FROM magasins WHERE id=? AND entreprise_id=?').get(Number(magasin_id), ent);
    if (!m) throw Object.assign(new Error('Magasin introuvable'), { statut: 404 });
  }

  const produits = magasin_id
    ? db.prepare(`SELECT p.id, p.nom, p.code AS reference, p.prix_achat, p.prix_vente, IFNULL(s.quantite,0) AS q
        FROM produits p LEFT JOIN stocks s ON s.produit_id = p.id AND s.magasin_id = ?
        WHERE p.entreprise_id = ? AND p.actif = 1 ORDER BY p.nom`).all(Number(magasin_id), ent)
    : db.prepare(`SELECT p.id, p.nom, p.code AS reference, p.prix_achat, p.prix_vente,
        IFNULL((SELECT SUM(quantite) FROM stocks WHERE produit_id = p.id), 0) AS q
        FROM produits p WHERE p.entreprise_id = ? AND p.actif = 1 ORDER BY p.nom`).all(ent);

  const info = db.prepare(`INSERT INTO inventaires
      (entreprise_id, magasin_id, libelle, commentaire, cree_par) VALUES (?,?,?,?,?)`)
    .run(ent, magasin_id ? Number(magasin_id) : null, String(libelle).trim(), commentaire, user_id);
  const id = Number(info.lastInsertRowid);

  const ins = db.prepare(`INSERT INTO inventaires_lignes
      (inventaire_id, produit_id, magasin_id, quantite_theorique, quantite_calculee, prix_achat, prix_vente)
    VALUES (?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    produits.forEach((p) => {
      ins.run(id, p.id, magasin_id ? Number(magasin_id) : null,
        Number(p.q) || 0, stockCalcule(p.id, magasin_id),
        Number(p.prix_achat) || 0, Number(p.prix_vente) || 0);
    });
  });
  tx();

  return { id, nb_lignes: produits.length, ...detail(id) };
}

/** Détail complet : lignes + comptes (théorique, compté, valorisation, écarts). */
function detail(id) {
  const inv = db.prepare(`SELECT i.*, m.nom AS magasin_nom, u.nom AS cree_par_nom,
      c.nom AS cloture_par_nom
    FROM inventaires i
    LEFT JOIN magasins m ON m.id = i.magasin_id
    LEFT JOIN users u ON u.id = i.cree_par
    LEFT JOIN users c ON c.id = i.cloture_par
    WHERE i.id = ?`).get(Number(id));
  if (!inv) return null;

  const lignes = db.prepare(`SELECT l.*, p.nom AS produit, p.code AS produit_reference,
      p.unite, m.nom AS magasin_nom
    FROM inventaires_lignes l
    JOIN produits p ON p.id = l.produit_id
    LEFT JOIN magasins m ON m.id = l.magasin_id
    WHERE l.inventaire_id = ? ORDER BY p.nom`).all(Number(id));

  lignes.forEach((l) => {
    l.ecart_quantite = l.quantite_comptee === null || l.quantite_comptee === undefined
      ? null : Math.round((Number(l.quantite_comptee) - Number(l.quantite_theorique)) * 1000) / 1000;
    l.ecart_valeur = l.ecart_quantite === null ? null : Math.round(l.ecart_quantite * Number(l.prix_achat));
    l.ecart_valeur_vente = l.ecart_quantite === null ? null : Math.round(l.ecart_quantite * Number(l.prix_vente));
    l.valeur_theorique = Math.round(Number(l.quantite_theorique) * Number(l.prix_achat));
    l.valeur_comptee = l.quantite_comptee === null || l.quantite_comptee === undefined
      ? null : Math.round(Number(l.quantite_comptee) * Number(l.prix_achat));
    l.valeur_vente_comptee = l.quantite_comptee === null || l.quantite_comptee === undefined
      ? null : Math.round(Number(l.quantite_comptee) * Number(l.prix_vente));
    /* Écart entre ce que le système annonce et ce que les mouvements racontent. */
    l.ecart_integrite = Math.round((Number(l.quantite_theorique) - Number(l.quantite_calculee)) * 1000) / 1000;
  });

  const comptes = lignes.filter((l) => l.quantite_comptee !== null && l.quantite_comptee !== undefined);
  const somme = (f) => comptes.reduce((s, l) => s + (f(l) || 0), 0);
  const total = (f) => lignes.reduce((s, l) => s + (f(l) || 0), 0);

  return {
    inventaire: inv,
    lignes,
    comptes: {
      nb_produits: lignes.length,
      nb_comptes: comptes.length,
      nb_restants: lignes.length - comptes.length,
      progression: lignes.length ? Math.round((comptes.length / lignes.length) * 100) : 0,
      /* 3. Le stock qu'on devait avoir */
      quantite_theorique: total((l) => Number(l.quantite_theorique)),
      quantite_calculee: total((l) => Number(l.quantite_calculee)),
      valeur_theorique: total((l) => l.valeur_theorique),
      /* 1. Le stock réellement compté */
      quantite_comptee: somme((l) => Number(l.quantite_comptee)),
      valeur_comptee: somme((l) => l.valeur_comptee),
      /* 2. Le montant généré (valeur de revente du stock compté) */
      valeur_vente_comptee: somme((l) => l.valeur_vente_comptee),
      marge_potentielle: somme((l) => (l.valeur_vente_comptee || 0) - (l.valeur_comptee || 0)),
      /* 4. La comparaison */
      ecart_quantite: somme((l) => l.ecart_quantite),
      ecart_valeur: somme((l) => l.ecart_valeur),
      ecart_valeur_vente: somme((l) => l.ecart_valeur_vente),
      nb_ecarts: comptes.filter((l) => Math.abs(l.ecart_quantite || 0) > 0.0001).length,
      nb_manquants: comptes.filter((l) => (l.ecart_quantite || 0) < 0).length,
      nb_excedents: comptes.filter((l) => (l.ecart_quantite || 0) > 0).length,
      nb_incoherences_systeme: lignes.filter((l) => Math.abs(l.ecart_integrite) > 0.0001).length,
    },
  };
}

/** Enregistre une quantité comptée (ou l'annule avec null). */
function enregistrerComptage(inventaireId, ligneId, { quantite_comptee, note = null }, userId = null) {
  const inv = db.prepare('SELECT * FROM inventaires WHERE id=?').get(Number(inventaireId));
  if (!inv) throw Object.assign(new Error('Inventaire introuvable'), { statut: 404 });
  if (inv.statut === 'cloture') {
    throw Object.assign(new Error('Cet inventaire est clôturé : plus aucune saisie n’est possible.'), { statut: 400 });
  }
  const ligne = db.prepare('SELECT * FROM inventaires_lignes WHERE id=? AND inventaire_id=?')
    .get(Number(ligneId), Number(inventaireId));
  if (!ligne) throw Object.assign(new Error('Ligne d’inventaire introuvable'), { statut: 404 });

  let q = null;
  if (quantite_comptee !== null && quantite_comptee !== undefined && quantite_comptee !== '') {
    q = Number(quantite_comptee);
    if (!Number.isFinite(q) || q < 0) {
      throw Object.assign(new Error('Quantité comptée invalide'), { statut: 400 });
    }
    q = Math.round(q * 1000) / 1000;
  }
  db.prepare(`UPDATE inventaires_lignes SET quantite_comptee=?, note=?, compte_par=?,
      maj_at=datetime('now','localtime') WHERE id=?`)
    .run(q, note, userId || null, ligne.id);
  return detail(inventaireId);
}

/** Clôture : fige l'inventaire, plus aucune saisie ni ajustement. */
function cloturer(id, userId = null) {
  const inv = db.prepare('SELECT * FROM inventaires WHERE id=?').get(Number(id));
  if (!inv) throw Object.assign(new Error('Inventaire introuvable'), { statut: 404 });
  if (inv.statut === 'cloture') throw Object.assign(new Error('Inventaire déjà clôturé'), { statut: 400 });
  const nonComptes = db.prepare(`SELECT COUNT(*) c FROM inventaires_lignes
    WHERE inventaire_id=? AND quantite_comptee IS NULL`).get(Number(id)).c;
  if (nonComptes) {
    throw Object.assign(new Error(`${nonComptes} produit(s) n'ont pas encore été compté(s).`), { statut: 400 });
  }
  db.prepare(`UPDATE inventaires SET statut='cloture', cloture_par=?, cloture_at=datetime('now','localtime') WHERE id=?`)
    .run(userId || null, Number(id));
  return detail(id);
}

/**
 * Applique les écarts : crée un mouvement d'ajustement par ligne en écart pour que
 * le stock du système rejoigne le stock compté. Un inventaire clôturé ne peut être
 * appliqué qu'une fois (suivi par la présence d'ajustements déjà liés).
 */
function appliquerEcarts(id, userId = null) {
  const inv = db.prepare('SELECT * FROM inventaires WHERE id=?').get(Number(id));
  if (!inv) throw Object.assign(new Error('Inventaire introuvable'), { statut: 404 });
  const deja = db.prepare('SELECT COUNT(*) c FROM mouvements_stock WHERE reference=?')
    .get('INV-' + Number(id)).c;
  if (deja) throw Object.assign(new Error('Les écarts de cet inventaire ont déjà été appliqués.'), { statut: 400 });

  const lignes = db.prepare(`SELECT l.* FROM inventaires_lignes l
    WHERE l.inventaire_id=? AND l.quantite_comptee IS NOT NULL
      AND ROUND(l.quantite_comptee - l.quantite_theorique, 3) <> 0`).all(Number(id));
  if (!lignes.length) return { appliques: 0, message: 'Aucun écart à appliquer : le stock compté correspond au stock théorique.' };

  const appliques = [];
  lignes.forEach((l) => {
    /* L'ajustement est toujours rattaché à un magasin précis : si l'inventaire
       porte sur tout le réseau, on répartit sur le premier magasin qui détient
       du stock pour ce produit. */
    const magasinId = l.magasin_id || (db.prepare(
      'SELECT magasin_id FROM stocks WHERE produit_id=? ORDER BY quantite DESC LIMIT 1').get(l.produit_id) || {}).magasin_id;
    if (!magasinId) return;
    const avant = stockSysteme(l.produit_id, magasinId);
    appliquerMouvement({
      produit_id: l.produit_id, magasin_id: magasinId, type: 'ajustement',
      quantite: Number(l.quantite_comptee) - Number(l.quantite_theorique),
      motif: `Écart inventaire #${Number(id)} — ${inv.libelle}`,
      reference: 'INV-' + Number(id), user_id: userId || null,
    });
    appliques.push({ produit_id: l.produit_id, magasin_id: magasinId, avant,
      apres: Number(l.quantite_comptee), ecart: Number(l.quantite_comptee) - Number(l.quantite_theorique) });
  });
  return {
    appliques: appliques.length, lignes: appliques,
    message: `${appliques.length} ajustement(s) appliqué(s) : le stock du système rejoint le stock compté.`,
  };
}

/**
 * Supprime une session. Réservé à l'administrateur (permission `inventaire.gerer`) :
 * lui seul peut supprimer, y compris une session clôturée (après en avoir tiré le
 * compte rendu). Les autres rôles n'ont que la consultation.
 */
function supprimer(id) {
  const inv = db.prepare('SELECT * FROM inventaires WHERE id=?').get(Number(id));
  if (!inv) throw Object.assign(new Error('Inventaire introuvable'), { statut: 404 });
  db.prepare('DELETE FROM inventaires WHERE id=?').run(Number(id));
  return inv;
}

module.exports = {
  lister, creer, detail, enregistrerComptage, cloturer, appliquerEcarts, supprimer,
  stockSysteme, stockCalcule,
};
