/**
 * portee.js — Cloisonnement des données par entreprise.
 *
 * Chaque entreprise cliente ne voit que ses magasins, ses produits, ses
 * clients, ses fournisseurs et ses ventes. Le propriétaire de la plateforme
 * (super_admin) voit tout.
 */
const { db } = require('./db');
const { param } = require('./utils');

/** Identifiant de l'entreprise de l'utilisateur connecté (null si plateforme). */
function entrepriseId(req) {
  const id = req && req.user ? req.user.entreprise_id : null;
  return id === null || id === undefined ? null : Number(id);
}

/** L'utilisateur est-il le propriétaire de la plateforme ? */
function estPlateforme(req) {
  return !!(req && req.user && req.user.role === 'super_admin');
}

/**
 * Clause SQL restreignant une table à l'entreprise de l'utilisateur.
 * Renvoie { clause, params } — attention : « 1=0 » si aucun accès légitime.
 */
function parEntreprise(req, colonne = 'entreprise_id') {
  if (estPlateforme(req)) return { clause: '1=1', params: [] };
  const id = entrepriseId(req);
  if (!id) return { clause: '1=0', params: [] };
  return { clause: `${colonne} = ?`, params: [id] };
}

/** Clause SQL restreignant une table possédant une colonne magasin_id. */
function parMagasin(req, colonne = 'magasin_id') {
  if (estPlateforme(req)) return { clause: '1=1', params: [] };
  const id = entrepriseId(req);
  if (!id) return { clause: '1=0', params: [] };
  return {
    clause: `${colonne} IN (SELECT id FROM magasins WHERE entreprise_id = ?)`,
    params: [id],
  };
}

/** Identifiants des magasins visibles par l'utilisateur. */
function magasinsDe(req) {
  if (estPlateforme(req)) return db.prepare('SELECT id FROM magasins').all().map((m) => m.id);
  const id = entrepriseId(req);
  if (!id) return [];
  return db.prepare('SELECT id FROM magasins WHERE entreprise_id=?').all(id).map((m) => m.id);
}

/** Le magasin appartient-il à l'entreprise de l'utilisateur ? */
function magasinAutorise(req, magasinId) {
  if (estPlateforme(req)) return true;
  const id = entrepriseId(req);
  if (!id) return false;
  return !!db.prepare('SELECT id FROM magasins WHERE id=? AND entreprise_id=?').get(magasinId, id);
}

/** Paramètre de l'entreprise de l'utilisateur (repli sur la plateforme). */
function paramEntreprise(req, cle, defaut = null) {
  return param(cle, defaut, entrepriseId(req));
}

/** Le produit appartient-il à l'entreprise de l'utilisateur ? */
function produitAutorise(req, produitId) {
  if (estPlateforme(req)) return true;
  const id = entrepriseId(req);
  if (!id) return false;
  return !!db.prepare('SELECT id FROM produits WHERE id=? AND entreprise_id=?').get(produitId, id);
}

module.exports = {
  entrepriseId, estPlateforme, parEntreprise, parMagasin, magasinsDe,
  magasinAutorise, produitAutorise, paramEntreprise,
};
