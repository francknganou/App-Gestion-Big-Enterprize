/**
 * Routes « Ressources humaines » : dossier du personnel, salaires,
 * documents PDF et recrutement.
 *
 * Sécurité :
 *  - toutes les routes exigent l'authentification et sont cloisonnées
 *    par entreprise (et par boutique pour les comptes à portée « magasin ») ;
 *  - les documents sont réservés au personnel autorisé et servis avec
 *    Content-Disposition: attachment (jamais exécutés par le navigateur).
 */
const express = require('express');
const path = require('path');
const { db } = require('../db');
const { auth, requirePerm, requireToutes, requireModule, magasinImpose } = require('../auth');
const { wrap } = require('../utils');
const { entrepriseId } = require('../portee');
const { journaliser } = require('../evenements');
const RH = require('../rh');

const router = express.Router();
router.use(auth);

/* ============================================================================
   Employés — dossier du personnel
   ========================================================================== */

router.get('/rh/employes', requireModule('employes'), wrap((req, res) => {
  const employes = RH.listerEmployes({
    entrepriseId: entrepriseId(req),
    magasinImpose: magasinImpose(req.user),
    magasin_id: req.query.magasin_id,
    q: req.query.q,
    actif: req.query.actif,
    avecSortis: req.query.avec_sortis === '1',
  });
  const masse = employes.filter((e) => e.actif).reduce((s, e) => s + (e.salaire || 0), 0);
  const incomplets = employes.filter((e) => !e.numero_cni).length;
  res.json({
    employes,
    masse_salariale: masse,
    nb_actifs: employes.filter((e) => e.actif).length,
    nb_dossiers_incomplets: incomplets,
    periodes: RH.periodesConnues(entrepriseId(req)),
  });
}));

/** Fiche complète : dossier, historique de paie et documents. */
router.get('/rh/employes/:id', requireModule('employes'), wrap((req, res) => {
  res.json(RH.detailEmploye(Number(req.params.id), { entrepriseId: entrepriseId(req) }));
}));

router.post('/rh/employes', requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.creerEmploye(entrepriseId(req), req.body || {}, { utilisateurId: req.user.id });
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id, montant: Number(e.salaire) || 0,
    libelle: 'Employé créé : ' + e.nom + ' (' + (e.poste || 'sans poste') + ')',
  });
  res.status(201).json(e);
}));

router.put('/rh/employes/:id', requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.modifierEmploye(Number(req.params.id), entrepriseId(req), req.body || {});
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id,
    libelle: 'Fiche du personnel modifiée : ' + e.nom,
  });
  res.json(e);
}));

/** Sortie du personnel : la fiche et l'historique de paie sont conservés. */
router.post('/rh/employes/:id/sortie', requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.sortirEmploye(Number(req.params.id), entrepriseId(req), req.body || {});
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id,
    libelle: 'Sortie du personnel : ' + e.nom,
  });
  res.json(e);
}));

/* Renvoyer un employé : passage en « sorti » (archivé), sans suppression. */
router.post('/rh/employes/:id/renvoyer', requirePerm('employes.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const e = RH.renvoyerEmploye(Number(req.params.id), entrepriseId(req), {
    motif: b.motif || null, date_sortie: b.date_sortie || null, utilisateurId: req.user.id,
  });
  journaliser({
    entreprise_id: entrepriseId(req), type: 'tiers', user_id: req.user.id,
    libelle: `Employé renvoyé / archivé : ${e.nom}${b.motif ? ' — ' + b.motif : ''}`,
  });
  res.json({ ok: true, employe: e });
}));

router.delete('/rh/employes/:id', requirePerm('employes.gerer'), wrap((req, res) => {
  const e = RH.supprimerEmploye(Number(req.params.id), entrepriseId(req));
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: e.magasin_id, type: 'compte',
    reference: e.code, user_id: req.user.id,
    libelle: 'Employé supprimé : ' + e.nom,
  });
  res.json({ ok: true, id: e.id });
}));

/* ============================================================================
   Salaires — suivi mensuel des versements
   ========================================================================== */

router.get('/rh/salaires', requireModule('salaires'), wrap((req, res) => {
  const periode = req.query.periode || RH.periodeCourante();
  const etat = RH.etatPaie({
    entrepriseId: entrepriseId(req),
    periode,
    magasinImpose: magasinImpose(req.user),
    magasin_id: req.query.magasin_id,
    q: req.query.q,
  });
  res.json(Object.assign(etat, {
    periodes: RH.periodesConnues(entrepriseId(req)),
    periode_courante: RH.periodeCourante(),
    evolution: RH.evolutionMasseSalariale(entrepriseId(req), 12),
  }));
}));

router.post('/rh/salaires', requirePerm('salaires.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const s = RH.enregistrerSalaire(Object.assign({
    entrepriseId: entrepriseId(req),
    utilisateurId: req.user.id,
  }, b));
  const e = db.prepare('SELECT nom FROM employes WHERE id=?').get(s.employe_id) || {};
  journaliser({
    entreprise_id: entrepriseId(req), type: 'tiers', reference: s.periode,
    user_id: req.user.id, montant: Number(s.net) || 0,
    libelle: `Salaire ${s.periode} — ${e.nom || ''} : ${Number(s.net).toLocaleString('fr-FR')} FCFA`
      + (s.statut === 'paye' ? ' (payé)' : ' (à payer)'),
  });
  res.status(201).json(s);
}));

/** Marque toute la période comme payée. */
router.post('/rh/salaires/payer-periode', requirePerm('salaires.gerer'), wrap((req, res) => {
  const r = RH.payerPeriode({
    entrepriseId: entrepriseId(req),
    periode: (req.body || {}).periode,
    magasinImpose: magasinImpose(req.user),
    mode_paiement: (req.body || {}).mode_paiement,
    utilisateurId: req.user.id,
  });
  journaliser({
    entreprise_id: entrepriseId(req), type: 'tiers', reference: r.periode, user_id: req.user.id,
    libelle: `Paie ${r.periode} réglée pour ${r.nb_marques} employé(s)`,
  });
  res.json(r);
}));

router.delete('/rh/salaires/:id', requirePerm('salaires.gerer'), wrap((req, res) => {
  const s = RH.supprimerSalaire(Number(req.params.id), entrepriseId(req));
  journaliser({
    entreprise_id: entrepriseId(req), type: 'tiers', reference: s.periode, user_id: req.user.id,
    libelle: 'Versement de salaire supprimé : ' + s.periode,
  });
  res.json({ ok: true, id: s.id });
}));

/* ============================================================================
   Documents PDF du personnel
   ========================================================================== */

/** Catégories de pièces disponibles (CNI, diplôme, CV, contrat…). */
router.get('/rh/documents-categories', requireModule('recrutement'), wrap((req, res) => {
  res.json({ categories: RH.CATEGORIES_DOCUMENT, taille_max_mo: Math.round(RH.TAILLE_MAX_OCTETS / 1024 / 1024) });
}));

router.get('/rh/employes/:id/documents', requireModule('recrutement'), wrap((req, res) => {
  res.json({
    documents: RH.listerDocuments(Number(req.params.id), entrepriseId(req)),
    categories: RH.CATEGORIES_DOCUMENT,
    taille_max_mo: Math.round(RH.TAILLE_MAX_OCTETS / 1024 / 1024),
  });
}));

/**
 * Téléversement d'un PDF. Le fichier arrive en base64 dans le corps JSON :
 * express.json() est limité à 2 Mo, donc la route accepte jusqu'à 15 Mo ici.
 */
router.post('/rh/employes/:id/documents',
  express.json({ limit: '15mb' }),
  requirePerm('recrutement.gerer'),
  wrap((req, res) => {
    const b = req.body || {};
    const d = RH.enregistrerDocument({
      entrepriseId: entrepriseId(req),
      employe_id: Number(req.params.id),
      categorie: b.categorie,
      nom: b.nom,
      type: b.type,
      contenu: b.contenu,
      date_document: b.date_document,
      utilisateurId: req.user.id,
    });
    journaliser({
      entreprise_id: entrepriseId(req), type: 'compte', user_id: req.user.id,
      libelle: `Document ajouté : ${d.nom_original} (${Math.round(d.taille / 1024)} Ko)`,
    });
    res.status(201).json(d);
  }));

/** Téléchargement d'un document. */
router.get('/rh/documents/:id', requireModule('recrutement'), wrap((req, res) => {
  const { document: d, chemin } = RH.documentPourTelechargement(Number(req.params.id), entrepriseId(req));
  // ASCII uniquement dans l'en-tête : le nom original peut contenir des accents.
  const ascii = String(d.nom_original).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', d.taille);
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nom_original)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(chemin));
}));

router.delete('/rh/documents/:id', requirePerm('recrutement.gerer'), wrap((req, res) => {
  const d = RH.supprimerDocument(Number(req.params.id), entrepriseId(req));
  journaliser({
    entreprise_id: entrepriseId(req), type: 'compte', user_id: req.user.id,
    libelle: 'Document supprimé : ' + d.nom_original,
  });
  res.json({ ok: true, id: d.id });
}));

/* ============================================================================
   Recrutement — candidatures
   ========================================================================== */

/* ---------- Documents PDF de candidature (CV, lettre, diplôme…) ---------- */
router.get('/rh/candidats/:id/documents', requireModule('recrutement'), wrap((req, res) => {
  res.json({
    documents: RH.listerDocumentsCandidat(Number(req.params.id), entrepriseId(req)),
    categories: RH.CATEGORIES_DOCUMENT,
    taille_max_mo: Math.round(RH.TAILLE_MAX_OCTETS / 1024 / 1024),
  });
}));

router.post('/rh/candidats/:id/documents',
  express.json({ limit: '15mb' }),
  requirePerm('recrutement.gerer'),
  wrap((req, res) => {
    const b = req.body || {};
    const d = RH.enregistrerDocumentCandidat({
      entrepriseId: entrepriseId(req),
      candidat_id: Number(req.params.id),
      categorie: b.categorie, nom: b.nom, contenu: b.contenu,
      utilisateurId: req.user.id,
    });
    journaliser({
      entreprise_id: entrepriseId(req), type: 'compte', user_id: req.user.id,
      libelle: `Document de candidature ajouté : ${d.nom_original} (${Math.round(d.taille / 1024)} Ko)`,
    });
    res.status(201).json(d);
  }));

/** Téléchargement d'un document de candidature. */
router.get('/rh/documents-candidat/:id', requireModule('recrutement'), wrap((req, res) => {
  const { document: d, chemin } = RH.documentCandidatPourTelechargement(Number(req.params.id), entrepriseId(req));
  const ascii = String(d.nom_original).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', d.taille);
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nom_original)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(chemin));
}));

router.get('/rh/candidats', requireModule('recrutement'), wrap((req, res) => {
  const candidats = RH.listerCandidats({
    entrepriseId: entrepriseId(req),
    magasinImpose: magasinImpose(req.user),
    magasin_id: req.query.magasin_id,
    statut: req.query.statut,
    q: req.query.q,
  });
  res.json({
    candidats,
    stats: RH.statsRecrutement(entrepriseId(req)),
    statuts: RH.STATUTS_CANDIDAT,
  });
}));

router.get('/rh/candidats/:id', requireModule('recrutement'), wrap((req, res) => {
  res.json(RH.detailCandidat(Number(req.params.id), entrepriseId(req)));
}));

router.post('/rh/candidats', requirePerm('recrutement.gerer'), wrap((req, res) => {
  const c = RH.creerCandidat(entrepriseId(req), req.body || {}, { utilisateurId: req.user.id });
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: c.magasin_id, type: 'compte',
    user_id: req.user.id, libelle: 'Candidature enregistrée : ' + c.nom,
  });
  res.status(201).json(c);
}));

router.put('/rh/candidats/:id', requirePerm('recrutement.gerer'), wrap((req, res) => {
  const c = RH.modifierCandidat(Number(req.params.id), entrepriseId(req), req.body || {});
  res.json(c);
}));

router.post('/rh/candidats/:id/statut', requirePerm('recrutement.gerer'), wrap((req, res) => {
  const b = req.body || {};
  const c = RH.changerStatutCandidat(Number(req.params.id), entrepriseId(req), b.statut, {
    motif: b.motif, date_entretien: b.date_entretien,
  });
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: c.magasin_id, type: 'compte',
    user_id: req.user.id, libelle: `Candidature ${c.nom} : ${RH.STATUTS_CANDIDAT[c.statut]}`,
  });
  res.json(c);
}));

/** Embauche : crée la fiche du personnel à partir de la candidature. */
router.post('/rh/candidats/:id/embaucher', requireToutes(['recrutement.gerer', 'employes.gerer']), wrap((req, res) => {
  const r = RH.embaucherCandidat(Number(req.params.id), entrepriseId(req), req.body || {},
    { utilisateurId: req.user.id });
  journaliser({
    entreprise_id: entrepriseId(req), magasin_id: r.employe.magasin_id, type: 'compte',
    reference: r.employe.code, user_id: req.user.id,
    libelle: `Embauche : ${r.employe.nom} (${r.employe.code})`,
  });
  res.status(201).json(r);
}));

router.delete('/rh/candidats/:id', requirePerm('recrutement.gerer'), wrap((req, res) => {
  const c = RH.supprimerCandidat(Number(req.params.id), entrepriseId(req));
  res.json({ ok: true, id: c.id });
}));

module.exports = router;
