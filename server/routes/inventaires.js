/**
 * Routes des inventaires physiques.
 *
 *   GET    /inventaires                 liste des sessions
 *   POST   /inventaires                 crée une session (photographie du stock)
 *   GET    /inventaires/:id             détail + lignes + comptes
 *   PUT    /inventaires/:id/lignes/:lid enregistre une quantité comptée
 *   POST   /inventaires/:id/cloturer    fige la session
 *   POST   /inventaires/:id/appliquer   applique les écarts au stock
 *   GET    /inventaires/:id/export.csv  export comptable
 *   DELETE /inventaires/:id             supprime un brouillon
 *
 * Les montants (valeur du stock, écarts en FCFA) sont masqués aux comptes qui
 * n'ont pas la permission `prix.consulter`, exactement comme dans le catalogue.
 */
const express = require('express');
const { auth, requireModule, requirePerm, peut, magasinImpose } = require('../auth');
const { wrap, sansPrix } = require('../utils');
const { entrepriseId, magasinAutorise } = require('../portee');
const { db } = require('../db');
const Inv = require('../inventaires');

const router = express.Router();
router.use(auth);

const CHAMPS_PRIX = [
  'prix_achat', 'prix_vente', 'valeur_theorique', 'valeur_comptee',
  'valeur_vente_comptee', 'marge_potentielle', 'ecart_valeur', 'ecart_valeur_vente',
];

/** Un utilisateur limité à sa boutique ne voit/traite que son magasin. */
function magasinCible(req) {
  const impose = magasinImpose(req.user);
  if (impose) return Number(impose);
  const q = req.query && req.query.magasin_id ? Number(req.query.magasin_id) : null;
  return q || null;
}

function charger(req, res) {
  const inv = db.prepare('SELECT * FROM inventaires WHERE id=? AND entreprise_id=?')
    .get(Number(req.params.id), entrepriseId(req));
  if (!inv) {
    res.status(404).json({ erreur: 'Inventaire introuvable' });
    return null;
  }
  return inv;
}

router.get('/', requireModule('inventaires'), requirePerm('inventaire.consulter'), wrap((req, res) => {
  res.json({
    inventaires: Inv.lister(entrepriseId(req), { magasin_id: magasinCible(req) }),
    peut_gerer: peut(req.user, 'inventaire.gerer'),
  });
}));

router.post('/', requireModule('inventaires'), requirePerm('inventaire.gerer'), wrap((req, res) => {
  const { libelle, commentaire } = req.body || {};
  const impose = magasinImpose(req.user);
  const magasin_id = impose ? Number(impose) : (req.body && req.body.magasin_id ? Number(req.body.magasin_id) : null);
  if (magasin_id && !magasinAutorise(req, magasin_id)) {
    return res.status(403).json({ erreur: 'Magasin hors de votre périmètre' });
  }
  try {
    const inv = Inv.creer({
      entreprise_id: entrepriseId(req), magasin_id, libelle, commentaire, user_id: req.user.id,
    });
    sansPrix(req, inv.lignes, CHAMPS_PRIX);
    sansPrix(req, inv.comptes, CHAMPS_PRIX);
    inv.peut_gerer = peut(req.user, 'inventaire.gerer');
    inv.peut_voir_prix = peut(req.user, 'prix.consulter');
    res.status(201).json(inv);
  } catch (e) {
    res.status(e.statut || 400).json({ erreur: e.message });
  }
}));

router.get('/:id', requireModule('inventaires'), requirePerm('inventaire.consulter'), wrap((req, res) => {
  if (!charger(req, res)) return;
  const d = Inv.detail(req.params.id);
  sansPrix(req, d.lignes, CHAMPS_PRIX);
  sansPrix(req, d.comptes, CHAMPS_PRIX);
  d.peut_gerer = peut(req.user, 'inventaire.gerer');
  d.peut_voir_prix = peut(req.user, 'prix.consulter');
  res.json(d);
}));

router.put('/:id/lignes/:ligneId', requireModule('inventaires'), requirePerm('inventaire.gerer'), wrap((req, res) => {
  if (!charger(req, res)) return;
  try {
    const d = Inv.enregistrerComptage(req.params.id, req.params.ligneId, req.body || {}, req.user.id);
    sansPrix(req, d.lignes, CHAMPS_PRIX);
    sansPrix(req, d.comptes, CHAMPS_PRIX);
    d.peut_gerer = peut(req.user, 'inventaire.gerer');
  d.peut_voir_prix = peut(req.user, 'prix.consulter');
    res.json(d);
  } catch (e) {
    res.status(e.statut || 400).json({ erreur: e.message });
  }
}));

router.post('/:id/cloturer', requireModule('inventaires'), requirePerm('inventaire.gerer'), wrap((req, res) => {
  if (!charger(req, res)) return;
  try {
    const d = Inv.cloturer(req.params.id, req.user.id);
    sansPrix(req, d.lignes, CHAMPS_PRIX);
    sansPrix(req, d.comptes, CHAMPS_PRIX);
    d.peut_gerer = peut(req.user, 'inventaire.gerer');
  d.peut_voir_prix = peut(req.user, 'prix.consulter');
    res.json(d);
  } catch (e) {
    res.status(e.statut || 400).json({ erreur: e.message });
  }
}));

router.post('/:id/appliquer', requireModule('inventaires'), requirePerm('stock.ajuster'), wrap((req, res) => {
  if (!charger(req, res)) return;
  try {
    res.json(Inv.appliquerEcarts(req.params.id, req.user.id));
  } catch (e) {
    res.status(e.statut || 400).json({ erreur: e.message });
  }
}));

router.get('/:id/export.csv', requireModule('inventaires'), requirePerm('inventaire.consulter'), wrap((req, res) => {
  if (!charger(req, res)) return;
  const d = Inv.detail(req.params.id);
  const voirPrix = peut(req.user, 'prix.consulter');
  const entetes = ['Produit', 'Référence', 'Magasin', 'Stock théorique', 'Stock recalculé', 'Stock compté',
    'Écart quantité', voirPrix ? 'Écart valeur (FCFA)' : null, voirPrix ? 'Valeur comptée (FCFA)' : null, 'Note']
    .filter(Boolean);
  const esc = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const lignes = d.lignes.map((l) => [
    l.produit, l.produit_reference || '', l.magasin_nom || 'Tous magasins',
    l.quantite_theorique, l.quantite_calculee,
    l.quantite_comptee === null || l.quantite_comptee === undefined ? '' : l.quantite_comptee,
    l.ecart_quantite === null ? '' : l.ecart_quantite,
    voirPrix ? (l.ecart_valeur === null ? '' : l.ecart_valeur) : null,
    voirPrix ? (l.valeur_comptee === null ? '' : l.valeur_comptee) : null,
    l.note || '',
  ].filter((c) => c !== null).map(esc).join(';'));
  const csv = '\uFEFF' + [entetes.map(esc).join(';'), ...lignes].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="inventaire-${req.params.id}.csv"`);
  res.send(csv);
}));

router.delete('/:id', requireModule('inventaires'), requirePerm('inventaire.gerer'), wrap((req, res) => {
  if (!charger(req, res)) return;
  try {
    Inv.supprimer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.statut || 400).json({ erreur: e.message });
  }
}));

module.exports = router;
