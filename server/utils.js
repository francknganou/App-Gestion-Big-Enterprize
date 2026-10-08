/**
 * Petits utilitaires partagés par les routes.
 */
const { db } = require('./db');
const { peut } = require('./auth');
const Evenements = require('./evenements');

/** Libellé lisible d'un mouvement de stock pour le journal en temps réel. */
const LIBELLES_MOUVEMENT = {
  entree: 'Entrée de stock', sortie: 'Sortie de stock', vente: 'Sortie (vente)',
  retour: 'Retour en stock', transfert: 'Transfert', ajustement: 'Ajustement d’inventaire',
  reception: 'Réception fournisseur', perte: 'Perte / casse',
};

/** Génère une référence séquentielle du type VTE-000123. */
function prochaineReference(prefixe, table, colonne = 'reference', longueur = 6) {
  const row = db.prepare(
    `SELECT ${colonne} AS ref FROM ${table} WHERE ${colonne} LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefixe + '-%');
  let n = 1;
  if (row && row.ref) {
    const m = String(row.ref).match(/(\d+)\s*$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefixe}-${String(n).padStart(longueur, '0')}`;
}

/**
 * Valeur d'un paramètre : celle de l'entreprise, sinon celle de la plateforme
 * (entreprise_id = 0), sinon la valeur par défaut passée en argument.
 */
function param(cle, defaut = null, entrepriseId = 0) {
  const id = Number(entrepriseId) || 0;
  let row = id ? db.prepare('SELECT valeur FROM parametres WHERE cle=? AND entreprise_id=?').get(cle, id) : null;
  if (!row) row = db.prepare('SELECT valeur FROM parametres WHERE cle=? AND entreprise_id=0').get(cle);
  return row ? row.valeur : defaut;
}

/** Enveloppe une route async pour remonter les erreurs proprement. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Journalise un mouvement de stock et met à jour la quantité. */
function appliquerMouvement({ produit_id, magasin_id, type, quantite, motif, reference, user_id, date }) {
  const row = db.prepare('SELECT quantite FROM stocks WHERE produit_id=? AND magasin_id=?')
    .get(produit_id, magasin_id);
  const avant = row ? row.quantite : 0;
  const apres = Math.round((avant + quantite) * 1000) / 1000;
  if (row) {
    db.prepare('UPDATE stocks SET quantite=?, maj_at=datetime(\'now\',\'localtime\') WHERE produit_id=? AND magasin_id=?')
      .run(apres, produit_id, magasin_id);
  } else {
    db.prepare('INSERT INTO stocks (produit_id,magasin_id,quantite) VALUES (?,?,?)')
      .run(produit_id, magasin_id, apres);
  }
  db.prepare(
    `INSERT INTO mouvements_stock
     (produit_id,magasin_id,type,quantite,quantite_avant,quantite_apres,motif,reference,user_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now','localtime')))`
  ).run(produit_id, magasin_id, type, quantite, avant, apres, motif || null, reference || null, user_id || null, date || null);

  /* --- Temps réel : l'événement est publié pour les écrans ouverts ailleurs --- */
  try {
    const prod = db.prepare('SELECT nom, entreprise_id FROM produits WHERE id=?').get(produit_id) || {};
    const mouvement = db.prepare('SELECT id, nom FROM magasins WHERE id=?').get(magasin_id) || {};
    if (prod.entreprise_id) {
      Evenements.journaliser({
        entreprise_id: prod.entreprise_id,
        magasin_id,
        type: 'stock',
        libelle: `${LIBELLES_MOUVEMENT[type] || type} — ${prod.nom} (${quantite > 0 ? '+' : ''}${quantite})${mouvement.nom ? ' · ' + mouvement.nom : ''}`,
        reference: reference || null,
        user_id: user_id || null,
      });
    }
  } catch (e) { /* le journal ne doit jamais casser une opération */ }

  return apres;
}

/**
 * Retire les champs sensibles (prix d'achat, marges, valorisation) des réponses
 * destinées aux rôles dépourvus de la permission « prix.consulter ».
 * Le masquage est fait côté serveur : rien ne fuit même par appel direct de l'API.
 */
function sansPrix(req, donnees, champs) {
  if (!req || !req.user || peut(req.user, 'prix.consulter')) return donnees;
  const nettoyer = (objet) => {
    if (!objet || typeof objet !== 'object') return objet;
    champs.forEach((c) => { if (c in objet) objet[c] = null; });
    return objet;
  };
  if (Array.isArray(donnees)) return donnees.map(nettoyer);
  return nettoyer(donnees);
}

module.exports = { prochaineReference, param, wrap, appliquerMouvement, sansPrix };
