/**
 * Tableau de bord, rapports analytiques et export CSV.
 */
const express = require('express');
const { db } = require('../db');
const { auth, requireModule, magasinImpose, peut } = require('../auth');
const { wrap, sansPrix, param } = require('../utils');
const { entrepriseId, estPlateforme, magasinAutorise } = require('../portee');

const router = express.Router();
router.use(auth);

/** Le profil a-t-il le droit de voir les prix ? */
function voitPrix(req) { return peut(req.user, 'prix.consulter'); }

/** Identifiant d'entreprise à utiliser dans les requêtes (-1 = aucune donnée). */
function ent(req) { return entrepriseId(req) || -1; }

/**
 * Filtre des ventes : cloisonnement par entreprise puis, pour un caissier ou
 * un magasinier, restriction à son magasin d'affectation.
 */
function filtreMagasin(req) {
  const params = {};
  let clause = '';
  if (!estPlateforme(req)) {
    clause += ' AND v.magasin_id IN (SELECT id FROM magasins WHERE entreprise_id = @ent)';
    params.ent = ent(req);
  }
  const impose = magasinImpose(req.user);
  const mag = impose || (req.query.magasin_id ? Number(req.query.magasin_id) : null);
  if (mag) { clause += ' AND v.magasin_id = @mag'; params.mag = mag; }
  return { clause, params };
}

/** Tableau de bord principal. */
router.get('/dashboard', requireModule('dashboard'), wrap((req, res) => {
  const f = filtreMagasin(req);
  const p = f.params;
  const q = (sql) => db.prepare(sql).get(p);
  const all = (sql) => db.prepare(sql).all(p);

  const caJour = q(`SELECT COUNT(*) nb, IFNULL(SUM(total),0) ca, IFNULL(AVG(total),0) panier
    FROM ventes v WHERE v.statut='payee' AND date(v.created_at)=date('now','localtime') ${f.clause}`);
  const caHier = q(`SELECT COUNT(*) nb, IFNULL(SUM(total),0) ca
    FROM ventes v WHERE v.statut='payee' AND date(v.created_at)=date('now','localtime','-1 day') ${f.clause}`);
  const caMois = q(`SELECT COUNT(*) nb, IFNULL(SUM(total),0) ca FROM ventes v
    WHERE v.statut='payee' AND strftime('%Y-%m',v.created_at)=strftime('%Y-%m','now','localtime') ${f.clause}`);
  const caAnnee = q(`SELECT IFNULL(SUM(total),0) ca FROM ventes v
    WHERE v.statut='payee' AND strftime('%Y',v.created_at)=strftime('%Y','now','localtime') ${f.clause}`);

  const margeJour = q(`SELECT IFNULL(SUM(l.total - l.quantite*p.prix_achat),0) marge
    FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id JOIN produits p ON p.id=l.produit_id
    WHERE v.statut='payee' AND date(v.created_at)=date('now','localtime') ${f.clause}`);
  const margeMois = q(`SELECT IFNULL(SUM(l.total - l.quantite*p.prix_achat),0) marge
    FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id JOIN produits p ON p.id=l.produit_id
    WHERE v.statut='payee' AND strftime('%Y-%m',v.created_at)=strftime('%Y-%m','now','localtime') ${f.clause}`);

  const magClause = p.mag ? ' AND m.id = @mag' : '';
  const valeurStock = db.prepare(`
    SELECT IFNULL(SUM(s.quantite * p.prix_vente),0) valeur_vente,
           IFNULL(SUM(s.quantite * p.prix_achat),0) valeur_achat,
           IFNULL(SUM(s.quantite),0) quantite
    FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN magasins m ON m.id=s.magasin_id
    WHERE p.actif=1 AND m.entreprise_id = @ent ${magClause}`).get(p);

  const nbProduits = db.prepare('SELECT COUNT(*) c FROM produits WHERE actif=1 AND entreprise_id=?').get(ent(req)).c;
  const nbClients = db.prepare('SELECT COUNT(*) c FROM clients WHERE entreprise_id=?').get(ent(req)).c;
  const nbMagasins = db.prepare('SELECT COUNT(*) c FROM magasins WHERE actif=1 AND entreprise_id=?').get(ent(req)).c;
  const nbEmployes = db.prepare(`SELECT COUNT(*) c FROM employes e JOIN magasins m ON m.id=e.magasin_id
    WHERE e.actif=1 AND m.entreprise_id=?`).get(ent(req)).c;

  const alertes = db.prepare(`
    SELECT COUNT(*) c FROM produits p CROSS JOIN magasins m
    LEFT JOIN stocks s ON s.produit_id=p.id AND s.magasin_id=m.id
    WHERE p.actif=1 AND m.actif=1 AND IFNULL(s.quantite,0) <= p.seuil_alerte
      AND p.entreprise_id = @ent AND m.entreprise_id = @ent ${p.mag ? 'AND m.id=@mag' : ''}`)
    .get(p).c;

  const serie = all(`SELECT date(v.created_at) jour, IFNULL(SUM(v.total),0) ca, COUNT(*) nb
    FROM ventes v WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-29 day') ${f.clause}
    GROUP BY date(v.created_at) ORDER BY jour`);

  const topProduits = all(`SELECT p.id, p.nom, p.code, c.nom AS categorie,
      SUM(l.quantite) quantite, SUM(l.total) ca,
      SUM(l.total - l.quantite*p.prix_achat) marge
    FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id
    JOIN produits p ON p.id=l.produit_id LEFT JOIN categories c ON c.id=p.categorie_id
    WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-30 day') ${f.clause}
    GROUP BY p.id ORDER BY ca DESC LIMIT 10`);

  const parMagasin = db.prepare(`
    SELECT m.id, m.nom, m.ville,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.magasin_id=m.id AND v.statut='payee'
        AND strftime('%Y-%m',v.created_at)=strftime('%Y-%m','now','localtime')) ca_mois,
      (SELECT COUNT(*) FROM ventes v WHERE v.magasin_id=m.id AND v.statut='payee'
        AND date(v.created_at)=date('now','localtime')) ventes_jour,
      (SELECT IFNULL(SUM(s.quantite*p.prix_vente),0) FROM stocks s JOIN produits p ON p.id=s.produit_id
        WHERE s.magasin_id=m.id) valeur_stock,
      (SELECT COUNT(*) FROM produits p LEFT JOIN stocks s ON s.produit_id=p.id AND s.magasin_id=m.id
        WHERE p.actif=1 AND IFNULL(s.quantite,0) <= p.seuil_alerte) alertes
    FROM magasins m WHERE m.actif=1 AND m.entreprise_id = ? ORDER BY ca_mois DESC`).all(ent(req));

  const parCategorie = all(`SELECT IFNULL(c.nom,'Sans catégorie') categorie, SUM(l.total) ca, SUM(l.quantite) quantite
    FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id JOIN produits p ON p.id=l.produit_id
    LEFT JOIN categories c ON c.id=p.categorie_id
    WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-30 day') ${f.clause}
    GROUP BY c.id ORDER BY ca DESC`);

  const parPaiement = all(`SELECT v.mode_paiement mode, COUNT(*) nb, IFNULL(SUM(v.total),0) ca
    FROM ventes v WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-30 day') ${f.clause}
    GROUP BY v.mode_paiement ORDER BY ca DESC`);

  const meilleursCaissiers = all(`SELECT u.nom, COUNT(*) nb, IFNULL(SUM(v.total),0) ca
    FROM ventes v JOIN users u ON u.id=v.user_id
    WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-30 day') ${f.clause}
    GROUP BY u.id ORDER BY ca DESC LIMIT 8`);

  const clientsTop = all(`SELECT c.nom, COUNT(*) nb, IFNULL(SUM(v.total),0) ca
    FROM ventes v JOIN clients c ON c.id=v.client_id
    WHERE v.statut='payee' AND date(v.created_at) >= date('now','localtime','-90 day') ${f.clause}
    GROUP BY c.id ORDER BY ca DESC LIMIT 8`);

  const recentes = all(`SELECT v.id, v.reference, v.total, v.mode_paiement, v.statut, v.created_at,
      m.nom AS magasin, IFNULL(c.nom,'—') AS client
    FROM ventes v JOIN magasins m ON m.id=v.magasin_id LEFT JOIN clients c ON c.id=v.client_id
    WHERE 1=1 ${f.clause} ORDER BY v.id DESC LIMIT 10`);

  const stockFaible = db.prepare(`
    SELECT p.nom, p.code, m.nom AS magasin, IFNULL(s.quantite,0) quantite, p.seuil_alerte
    FROM produits p CROSS JOIN magasins m LEFT JOIN stocks s ON s.produit_id=p.id AND s.magasin_id=m.id
    WHERE p.actif=1 AND m.actif=1 AND IFNULL(s.quantite,0) <= p.seuil_alerte
      AND p.entreprise_id = @ent AND m.entreprise_id = @ent ${p.mag ? 'AND m.id=@mag' : ''}
    ORDER BY (IFNULL(s.quantite,0)-p.seuil_alerte) LIMIT 8`).all(p);

  const objectifMois = { valeur: param('objectif_mensuel', '0', entrepriseId(req)) };
  const garderPrix = peut(req.user, 'prix.consulter');
  const masque = (v) => (garderPrix ? v : null);

  res.json({
    kpis: {
      ca_jour: caJour.ca, nb_ventes_jour: caJour.nb, panier_moyen: caJour.panier,
      ca_hier: caHier.ca, nb_ventes_hier: caHier.nb,
      evolution: caHier.ca ? Math.round(((caJour.ca - caHier.ca) / caHier.ca) * 1000) / 10 : null,
      ca_mois: caMois.ca, nb_ventes_mois: caMois.nb, ca_annee: caAnnee.ca,
      marge_jour: masque(margeJour.marge), marge_mois: masque(margeMois.marge),
      valeur_stock: masque(valeurStock.valeur_vente), valeur_stock_achat: masque(valeurStock.valeur_achat),
      prix_visibles: garderPrix,
      nb_produits: nbProduits, nb_clients: nbClients, nb_magasins: nbMagasins, nb_employes: nbEmployes,
      alertes_stock: alertes,
      objectif_mois: objectifMois ? Number(objectifMois.valeur) : 0,
    },
    serie_30j: serie,
    top_produits: sansPrix(req, topProduits, ['marge']),
    par_magasin: sansPrix(req, parMagasin, ['valeur_stock']),
    par_categorie: parCategorie,
    par_paiement: parPaiement,
    meilleurs_caissiers: meilleursCaissiers,
    top_clients: clientsTop,
    ventes_recentes: recentes,
    stock_faible: stockFaible,
  });
}));

/** Rapport de ventes, groupé par axe choisi. */
router.get('/rapports/ventes', requireModule('rapports'), wrap((req, res) => {
  const { debut, fin, group = 'jour' } = req.query;
  const d = debut || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const f = fin || new Date().toISOString().slice(0, 10);
  const axes = {
    jour: "date(v.created_at) AS cle",
    mois: "strftime('%Y-%m', v.created_at) AS cle",
    magasin: 'm.nom AS cle',
    caissier: "IFNULL(u.nom,'—') AS cle",
    categorie: "IFNULL(c.nom,'Sans catégorie') AS cle",
    produit: 'p.nom AS cle',
    mode: "CASE v.mode_paiement WHEN 'especes' THEN 'Espèces' WHEN 'mobile_money' THEN 'Mobile Money' WHEN 'carte' THEN 'Carte bancaire' ELSE 'Crédit' END AS cle",
    client: "IFNULL(cl.nom,'Client de passage') AS cle",
  };
  const axe = axes[group] || axes.jour;
  const besoinLignes = ['categorie', 'produit'].includes(group);
  const base = besoinLignes
    ? `FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id
        JOIN produits p ON p.id=l.produit_id LEFT JOIN categories c ON c.id=p.categorie_id
        JOIN magasins m ON m.id=v.magasin_id LEFT JOIN users u ON u.id=v.user_id LEFT JOIN clients cl ON cl.id=v.client_id`
    : `FROM ventes v JOIN magasins m ON m.id=v.magasin_id
        LEFT JOIN users u ON u.id=v.user_id LEFT JOIN clients cl ON cl.id=v.client_id
        LEFT JOIN ventes_lignes l ON 1=0 LEFT JOIN produits p ON 1=0 LEFT JOIN categories c ON 1=0`;
  const sql = `
    SELECT ${axe},
      COUNT(DISTINCT v.id) AS nb_ventes,
      IFNULL(SUM(${besoinLignes ? 'l.total' : 'v.total'}),0) AS ca,
      IFNULL(SUM(${besoinLignes ? '(l.total - l.quantite*p.prix_achat)' : 'v.total'}),0) AS ${besoinLignes ? 'marge' : 'marge_brute'},
      IFNULL(AVG(v.total),0) AS panier_moyen
    ${base}
    WHERE v.statut='payee' AND date(v.created_at) BETWEEN date(?) AND date(?)
      AND m.entreprise_id = ?
    GROUP BY cle ORDER BY cle`;
  const rows = db.prepare(sql).all(d, f, ent(req));
  const total = rows.reduce((s, r) => s + r.ca, 0);
  const nb = db.prepare(`SELECT COUNT(*) c, IFNULL(AVG(total),0) m FROM ventes v
    WHERE v.statut='payee' AND date(v.created_at) BETWEEN date(?) AND date(?)
      AND v.magasin_id IN (SELECT id FROM magasins WHERE entreprise_id = ?)`).get(d, f, ent(req));
  res.json({ debut: d, fin: f, group, lignes: rows, total, nb_ventes: nb.c, panier_moyen: nb.m });
}));

/** Rapport de rentabilité par produit. */
router.get('/rapports/produits', requireModule('rapports'), wrap((req, res) => {
  const { debut, fin } = req.query;
  const d = debut || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const f = fin || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT p.id, p.code, p.nom, IFNULL(c.nom,'—') AS categorie, p.prix_achat, p.prix_vente, p.seuil_alerte,
      IFNULL(SUM(l.quantite),0) quantite_vendue,
      IFNULL(SUM(l.total),0) ca,
      IFNULL(SUM(l.quantite*p.prix_achat),0) cout,
      IFNULL(SUM(l.total - l.quantite*p.prix_achat),0) marge,
      (SELECT IFNULL(SUM(s.quantite),0) FROM stocks s WHERE s.produit_id=p.id) stock_total
    FROM produits p LEFT JOIN categories c ON c.id=p.categorie_id
    LEFT JOIN ventes_lignes l ON l.produit_id=p.id
    LEFT JOIN ventes v ON v.id=l.vente_id AND v.statut='payee' AND date(v.created_at) BETWEEN date(?) AND date(?)
    WHERE p.actif=1 AND p.entreprise_id = ?
    GROUP BY p.id ORDER BY marge DESC`).all(d, f, ent(req));
  res.json({ debut: d, fin: f, lignes: sansPrix(req, rows, ['prix_achat', 'cout', 'marge']) });
}));

/** État de stock valorisé par magasin. */
router.get('/rapports/stocks', requireModule('rapports'), wrap((req, res) => {
  const impose = magasinImpose(req.user);
  const rows = db.prepare(`
    SELECT m.id magasin_id, m.nom magasin, p.id produit_id, p.code, p.nom produit, p.seuil_alerte,
      IFNULL(s.quantite,0) quantite, p.prix_achat, p.prix_vente,
      IFNULL(s.quantite*p.prix_achat,0) valeur_achat, IFNULL(s.quantite*p.prix_vente,0) valeur_vente,
      (IFNULL(s.quantite,0)-p.seuil_alerte) AS ecart_seuil,
      date(s.maj_at) AS derniere_maj
    FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN magasins m ON m.id=s.magasin_id
    WHERE p.actif=1 AND m.entreprise_id = ? ${impose ? 'AND m.id=?' : ''}
    ORDER BY m.nom, p.nom`).all(...(impose ? [ent(req), impose] : [ent(req)]));
  res.json(sansPrix(req, rows, ['prix_achat', 'valeur_achat', 'valeur_vente']));
}));

/** Export CSV : chaque export est autorisé par la permission du module correspondant. */
const PERMISSION_EXPORT = {
  ventes: ['ventes.consulter', 'rapports.consulter'],
  lignes: ['ventes.consulter', 'rapports.consulter'],
  stocks: ['stock.consulter', 'rapports.consulter'],
  produits: ['produits.consulter', 'rapports.consulter'],
  clients: ['clients.consulter', 'rapports.consulter'],
  journal: ['journal.consulter', 'rapports.consulter'],
};

router.get('/export.csv', auth, wrap((req, res, next) => {
  const { type = 'ventes' } = req.query;
  const requises = PERMISSION_EXPORT[type] || ['rapports.consulter'];
  if (!requises.some((p) => peut(req.user, p))) {
    return res.status(403).json({ erreur: `Export non autorisé pour votre rôle` });
  }
  next();
  const debut = req.query.debut || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const fin = req.query.fin || new Date().toISOString().slice(0, 10);
  const magasin_id = magasinImpose(req.user) || req.query.magasin_id || null;
  const ent = entrepriseId(req) || -1;
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const toCsv = (titre, lignes, colonnes) => {
    const head = colonnes.join(';');
    const body = lignes.map((l) => colonnes.map((c) => esc(l[c])).join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${titre}.csv"`);
    res.send('\uFEFF' + head + '\n' + body);
  };

  if (type === 'ventes') {
    const rows = db.prepare(`
      SELECT v.reference AS Reference, date(v.created_at) AS Date, time(v.created_at) AS Heure,
        m.nom AS Magasin, IFNULL(c.nom,'Client de passage') AS Client, IFNULL(u.nom,'') AS Caissier,
        v.mode_paiement AS Paiement, v.sous_total AS 'Sous-total', v.remise AS Remise, v.total AS Total, v.statut AS Statut
      FROM ventes v JOIN magasins m ON m.id=v.magasin_id
      LEFT JOIN clients c ON c.id=v.client_id LEFT JOIN users u ON u.id=v.user_id
      WHERE date(v.created_at) BETWEEN date(?) AND date(?) AND m.entreprise_id = ?
        ${magasin_id ? 'AND v.magasin_id=?' : ''}
      ORDER BY v.id DESC`).all(...(magasin_id ? [debut, fin, ent, magasin_id] : [debut, fin, ent]));
    return toCsv(`ventes_${debut}_${fin}`, rows, Object.keys(rows[0] || {
      Reference: 1, Date: 1, Heure: 1, Magasin: 1, Client: 1, Caissier: 1, Paiement: 1, 'Sous-total': 1, Remise: 1, Total: 1, Statut: 1,
    }));
  }
  if (type === 'stocks') {
    const colonnesPrix = voitPrix(req);
    const rows = db.prepare(`
      SELECT m.nom AS Magasin, p.code AS Code, p.nom AS Produit, IFNULL(c.nom,'') AS Categorie,
        s.quantite AS Quantite, p.seuil_alerte AS 'Seuil alerte', p.prix_achat AS 'Prix achat',
        p.prix_vente AS 'Prix vente', (s.quantite*p.prix_vente) AS 'Valeur vente', date(s.maj_at) AS 'Derniere MAJ'
      FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN magasins m ON m.id=s.magasin_id
      LEFT JOIN categories c ON c.id=p.categorie_id
      WHERE p.actif=1 AND m.entreprise_id = ? ${magasin_id ? 'AND s.magasin_id=?' : ''} ORDER BY m.nom, p.nom`)
      .all(...(magasin_id ? [ent, magasin_id] : [ent]));
    if (!colonnesPrix) {
      rows.forEach((r) => { delete r['Prix achat']; delete r['Valeur vente']; });
      return toCsv('etat_stocks', rows, ['Magasin', 'Code', 'Produit', 'Categorie', 'Quantite', 'Seuil alerte', 'Prix vente', 'Derniere MAJ']);
    }
    return toCsv('etat_stocks', rows, ['Magasin', 'Code', 'Produit', 'Categorie', 'Quantite', 'Seuil alerte', 'Prix achat', 'Prix vente', 'Valeur vente', 'Derniere MAJ']);
  }
  if (type === 'produits') {
    const rows = db.prepare(`
      SELECT p.code AS Code, p.nom AS Produit, IFNULL(c.nom,'') AS Categorie, p.unite AS Unite,
        p.prix_achat AS 'Prix achat', p.prix_vente AS 'Prix vente', p.seuil_alerte AS 'Seuil',
        (SELECT IFNULL(SUM(s.quantite),0) FROM stocks s WHERE s.produit_id=p.id) AS 'Stock total',
        p.actif AS Actif
      FROM produits p LEFT JOIN categories c ON c.id=p.categorie_id WHERE p.entreprise_id = ? ORDER BY p.nom`).all(ent);
    return toCsv('catalogue_produits', rows, ['Code', 'Produit', 'Categorie', 'Unite', 'Prix achat', 'Prix vente', 'Seuil', 'Stock total', 'Actif']);
  }
  if (type === 'clients') {
    const rows = db.prepare(`
      SELECT c.code AS Code, c.nom AS Client, c.telephone AS Telephone, c.email AS Email,
        c.ville AS Ville, c.type AS Type, c.points AS Points,
        (SELECT COUNT(*) FROM ventes v WHERE v.client_id=c.id) AS 'Nb achats',
        (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.client_id=c.id AND v.statut='payee') AS 'Total achats'
      FROM clients c WHERE c.entreprise_id = ? ORDER BY c.nom`).all(ent);
    return toCsv('clients', rows, ['Code', 'Client', 'Telephone', 'Email', 'Ville', 'Type', 'Points', 'Nb achats', 'Total achats']);
  }
  if (type === 'lignes') {
    const rows = db.prepare(`
      SELECT v.reference AS Reference, date(v.created_at) AS Date, m.nom AS Magasin, p.nom AS Produit,
        l.quantite AS Quantite, l.prix_unitaire AS 'Prix unitaire', l.total AS Total
      FROM ventes_lignes l JOIN ventes v ON v.id=l.vente_id
      JOIN produits p ON p.id=l.produit_id JOIN magasins m ON m.id=v.magasin_id
      WHERE v.statut='payee' AND date(v.created_at) BETWEEN date(?) AND date(?) AND m.entreprise_id = ?
        ${magasin_id ? 'AND v.magasin_id=?' : ''}
      ORDER BY v.id DESC`).all(...(magasin_id ? [debut, fin, ent, magasin_id] : [debut, fin, ent]));
    return toCsv(`lignes_ventes_${debut}_${fin}`, rows, ['Reference', 'Date', 'Magasin', 'Produit', 'Quantite', 'Prix unitaire', 'Total']);
  }
  if (type === 'journal') {
    const rows = db.prepare(`
      SELECT ms.created_at AS Date, m.nom AS Magasin, p.code AS Code, p.nom AS Produit, ms.type AS Type,
        ms.quantite AS Quantite, ms.quantite_avant AS Avant, ms.quantite_apres AS Apres,
        IFNULL(ms.motif,'') AS Motif, IFNULL(ms.reference,'') AS Reference, IFNULL(u.nom,'') AS Utilisateur
      FROM mouvements_stock ms JOIN produits p ON p.id=ms.produit_id JOIN magasins m ON m.id=ms.magasin_id
      LEFT JOIN users u ON u.id=ms.user_id
      WHERE date(ms.created_at) BETWEEN date(?) AND date(?) AND m.entreprise_id = ?
        ${magasin_id ? 'AND ms.magasin_id=?' : ''}
      ORDER BY ms.id DESC`).all(...(magasin_id ? [debut, fin, ent, magasin_id] : [debut, fin, ent]));
    return toCsv('journal_stock', rows, ['Date', 'Magasin', 'Code', 'Produit', 'Type', 'Quantite', 'Avant', 'Apres', 'Motif', 'Reference', 'Utilisateur']);
  }
  res.status(400).json({ erreur: 'Type d’export inconnu' });
}));

module.exports = router;
