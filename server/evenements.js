/**
 * evenements.js — Journal des opérations, base du rafraîchissement en temps réel.
 *
 * Chaque écriture métier (vente, entrée/sortie de stock, réception, transfert,
 * compte…) laisse une ligne dans `journal_evenements`. Les écrans interrogent
 * `/api/evenements?depuis=<id>` toutes les 15 secondes : si des événements les
 * concernent, ils rechargent leurs données silencieusement.
 *
 * Le cloisonnement est garanti par entreprise : le jeton d'un utilisateur ne
 * renvoie que les événements de son entreprise (et de ses magasins s'il est
 * limité à une boutique).
 */
const express = require('express');
const { db } = require('./db');
const { auth } = require('./auth');

/* utils.js importe ce module : on définit wrap ici pour éviter un cycle. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CONSERVES = 2000;              // nombre d'événements conservés dans le journal

/** Crée le journal s'il n'existe pas encore. */
function installer() {
  db.exec(`CREATE TABLE IF NOT EXISTS journal_evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id INTEGER NOT NULL,
    magasin_id INTEGER,
    type TEXT NOT NULL,              -- vente | stock | transfert | compte | tiers | achat | plateforme
    libelle TEXT,                    -- texte lisible (« Vente VTE-000123 — 25 000 FCFA »)
    montant REAL,                    -- montant éventuel (CA, valeur du mouvement)
    reference TEXT,                  -- référence métier (VTE-…, REC-…, TRF-…)
    user_id INTEGER,
    auteur TEXT,                     -- nom de l'utilisateur à l'origine
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_journal_entreprise ON journal_evenements(entreprise_id, id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_evenements(created_at)');
}

/** Élagage : on ne conserve que les CONSERVES derniers événements. */
function elaguer() {
  const seuil = db.prepare('SELECT id FROM journal_evenements ORDER BY id DESC LIMIT 1 OFFSET ?').get(CONSERVES);
  if (seuil) db.prepare('DELETE FROM journal_evenements WHERE id < ?').run(seuil.id);
}

/**
 * Enregistre un événement. Ne doit jamais faire échouer l'opération appelante :
 * toute erreur est avalée et simplement journalisée.
 *
 * @param {object} e { entreprise_id, magasin_id, type, libelle, montant, reference, user_id }
 */
function journaliser(e) {
  if (!e || !e.entreprise_id || !e.type) return null;
  let auteur = null;
  try {
    if (e.user_id) {
      const u = db.prepare('SELECT nom FROM users WHERE id=?').get(e.user_id);
      auteur = u ? u.nom : null;
    }
    const info = db.prepare(`
      INSERT INTO journal_evenements (entreprise_id, magasin_id, type, libelle, montant, reference, user_id, auteur)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(Number(e.entreprise_id), e.magasin_id || null, e.type, e.libelle || null,
        e.montant === undefined || e.montant === null ? null : Number(e.montant),
        e.reference || null, e.user_id || null, auteur);
    elaguer();
    return db.prepare('SELECT * FROM journal_evenements WHERE id=?').get(info.lastInsertRowid);
  } catch (err) {
    console.error('[journal] événement non enregistré :', err.message);
    return null;
  }
}

/** Dernier identifiant du journal (sert de point de départ au client). */
function dernierId(entrepriseId) {
  const row = entrepriseId
    ? db.prepare('SELECT MAX(id) m FROM journal_evenements WHERE entreprise_id=?').get(Number(entrepriseId))
    : db.prepare('SELECT MAX(id) m FROM journal_evenements').get();
  return (row && row.m) || 0;
}

/**
 * Événements postérieurs à `depuis`, filtrés selon les droits de l'utilisateur :
 *  - propriétaire de la plateforme : tout ;
 *  - utilisateur d'entreprise : son entreprise uniquement ;
 *  - utilisateur rattaché à une boutique : uniquement les événements de sa boutique
 *    et les événements globaux de l'entreprise (magasin_id NULL).
 */
function depuis(req, depuisId, limite = 50) {
  const limiteSur = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const estPlateforme = !!(req.user && req.user.role === 'super_admin');
  const entrepriseId = req.user ? req.user.entreprise_id : null;
  if (!estPlateforme && !entrepriseId) return [];

  const params = [Number(depuisId) || 0];
  let sql = 'SELECT * FROM journal_evenements WHERE id > ?';
  if (!estPlateforme) {
    sql += ' AND entreprise_id = ?';
    params.push(Number(entrepriseId));
    const magasin = req.user.magasin_id;
    if (magasin) {
      sql += ' AND (magasin_id IS NULL OR magasin_id = ?)';
      params.push(Number(magasin));
    }
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limiteSur);
  return db.prepare(sql).all(...params).reverse();   // ordre chronologique
}

/** Routeur monté sur /api/evenements (authentification obligatoire). */
const router = express.Router();

router.get('/', auth, wrap((req, res) => {
  const depuisId = Number(req.query.depuis) || 0;
  const evenement = req.query.type ? String(req.query.type) : null;
  let liste = depuis(req, depuisId, req.query.limite);
  if (evenement) liste = liste.filter((e) => e.type === evenement);
  res.json({
    dernier_id: dernierId(req.user && req.user.role === 'super_admin' ? null : req.user.entreprise_id),
    maintenant: new Date().toISOString(),
    nb_nouveaux: liste.length,
    evenements: liste,
  });
}));

/** Résumé compact : sert aux écrans qui veulent juste savoir « ai-je changé ? ». */
router.get('/etat', auth, wrap((req, res) => {
  const entrepriseId = req.user && req.user.role === 'super_admin' ? null : req.user.entreprise_id;
  const magasin = req.user ? req.user.magasin_id : null;
  const compte = entrepriseId
    ? db.prepare(magasin
      ? `SELECT COUNT(*) n, IFNULL(MAX(id),0) m FROM journal_evenements
           WHERE entreprise_id=? AND (magasin_id IS NULL OR magasin_id=?)`
      : 'SELECT COUNT(*) n, IFNULL(MAX(id),0) m FROM journal_evenements WHERE entreprise_id=?')
      .get(...(magasin ? [entrepriseId, magasin] : [entrepriseId]))
    : db.prepare('SELECT COUNT(*) n, IFNULL(MAX(id),0) m FROM journal_evenements').get();
  res.json({ dernier_id: compte.m, nb_total: compte.n, maintenant: new Date().toISOString() });
}));

module.exports = { router, journaliser, dernierId, depuis, installer, CONSERVES };
