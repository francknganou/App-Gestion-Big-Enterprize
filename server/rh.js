/**
 * Ressources humaines : dossier du personnel, salaires et recrutement.
 *
 * Toutes les fonctions sont cloisonnées par entreprise (et par boutique pour
 * les comptes à portée « magasin ») : un administrateur ne voit jamais le
 * personnel d'une autre entreprise.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./db');
const { param } = require('./utils');

/* Les PDF téléversés sont écrits sur disque : trop lourds pour la base. */
const DOSSIER_DOCUMENTS = path.join(__dirname, '..', 'data', 'documents');

const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;   // 10 Mo par document

const CATEGORIES_DOCUMENT = {
  cni: 'Carte nationale d’identité',
  diplome: 'Diplôme / certificat',
  cv: 'Curriculum vitæ',
  contrat: 'Contrat de travail',
  attestation: 'Attestation / certificat de travail',
  cnps: 'Document CNPS',
  photo: 'Photo d’identité',
  autre: 'Autre pièce',
};

const STATUTS_CANDIDAT = {
  recu: 'Candidature reçue',
  entretien: 'Entretien planifié',
  retenu: 'Retenu',
  embauche: 'Embauché',
  refuse: 'Refusé',
};

const STATUTS_SALAIRE = { a_payer: 'À payer', paye: 'Payé' };

/** Période courante au format AAAA-MM. */
function periodeCourante() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Prochain mois (AAAA-MM) à partir d'une période. */
function periodeSuivante(periode) {
  const [a, m] = String(periode || periodeCourante()).split('-').map(Number);
  const d = new Date(a, (m || 1) - 1 + 1, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function erreur(message, statut = 400) {
  return Object.assign(new Error(message), { statut });
}

/* ============================================================================
   Employés — dossier du personnel
   ========================================================================== */

const CHAMPS_EMPLOYE = [
  'code', 'civilite', 'nom', 'poste', 'magasin_id', 'telephone', 'email',
  'date_naissance', 'lieu_naissance', 'sexe', 'situation_matrimoniale',
  'adresse', 'ville', 'numero_cni', 'numero_cnps', 'numero_ifu',
  'contact_urgence_nom', 'contact_urgence_tel', 'formation',
  'date_embauche', 'date_fin_contrat', 'type_contrat', 'salaire',
  'date_sortie', 'motif_sortie', 'actif', 'notes',
];

/** Prochain code employé (EM-001…) propre à l'entreprise. */
function prochainCodeEmploye(entrepriseId) {
  const n = db.prepare('SELECT IFNULL(MAX(id),0)+1 n FROM employes WHERE entreprise_id=?').get(entrepriseId).n;
  return 'EM-' + String(n).padStart(3, '0');
}

/**
 * Liste les employés visibles, avec l'avancée de leur dossier et leur dernier
 * versement de salaire.
 */
function listerEmployes({ entrepriseId, magasinImpose = null, magasin_id = null, q = '', actif = '', avecSortis = false } = {}) {
  let sql = `
    SELECT e.*, m.nom AS magasin,
           (SELECT COUNT(*) FROM documents_employe d WHERE d.employe_id = e.id) AS nb_documents,
           (SELECT s.periode FROM salaires s WHERE s.employe_id = e.id ORDER BY s.periode DESC LIMIT 1) AS derniere_periode,
           (SELECT s.statut FROM salaires s WHERE s.employe_id = e.id ORDER BY s.periode DESC LIMIT 1) AS dernier_statut_salaire
    FROM employes e
    LEFT JOIN magasins m ON m.id = e.magasin_id
    WHERE e.entreprise_id = ?`;
  const p = [entrepriseId];
  if (magasinImpose) { sql += ' AND e.magasin_id = ?'; p.push(magasinImpose); }
  else if (magasin_id) { sql += ' AND e.magasin_id = ?'; p.push(Number(magasin_id)); }
  if (q) {
    sql += ` AND (e.nom LIKE ? OR IFNULL(e.poste,'') LIKE ? OR IFNULL(e.code,'') LIKE ?
             OR IFNULL(e.numero_cni,'') LIKE ? OR IFNULL(e.telephone,'') LIKE ?)`;
    const like = '%' + q + '%';
    p.push(like, like, like, like, like);
  }
  if (actif !== '' && actif !== undefined && actif !== null) { sql += ' AND e.actif = ?'; p.push(actif === '1' || actif === 1 ? 1 : 0); }
  if (!avecSortis) sql += " AND IFNULL(e.statut_dossier,'complet') <> 'sorti'";
  sql += ' ORDER BY e.nom';
  return db.prepare(sql).all(...p);
}

/** Fiche complète d'un employé : dossier, salaires et documents. */
function detailEmploye(id, { entrepriseId }) {
  const e = db.prepare(`
    SELECT e.*, m.nom AS magasin FROM employes e
    LEFT JOIN magasins m ON m.id = e.magasin_id
    WHERE e.id = ? AND e.entreprise_id = ?`).get(id, entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  const salaires = db.prepare(`
    SELECT s.*, u.nom AS saisi_par_nom FROM salaires s
    LEFT JOIN users u ON u.id = s.saisi_par
    WHERE s.employe_id = ? ORDER BY s.periode DESC`).all(id);
  const documents = db.prepare(`
    SELECT d.id, d.categorie, d.nom_original, d.type_mime, d.taille, d.date_document, d.created_at,
           u.nom AS televerse_par_nom
    FROM documents_employe d LEFT JOIN users u ON u.id = d.televerse_par
    WHERE d.employe_id = ? ORDER BY d.created_at DESC`).all(id);
  const piecesAttendues = ['cni', 'contrat'];
  const piecesPresentes = new Set(documents.map((d) => d.categorie));
  return {
    employe: e,
    salaires,
    documents,
    dossier: {
      nb_documents: documents.length,
      pieces_manquantes: piecesAttendues.filter((c) => !piecesPresentes.has(c)).map((c) => CATEGORIES_DOCUMENT[c] || c),
      complet: e.numero_cni ? piecesAttendues.every((c) => piecesPresentes.has(c)) : false,
    },
  };
}

/** Crée un employé. `source` indique d'où vient la fiche (recrutement ou saisie). */
function creerEmploye(entrepriseId, donnees, { utilisateurId = null, candidatId = null } = {}) {
  const nom = String(donnees.nom || '').trim();
  if (!nom) throw erreur('Le nom de l’employé est obligatoire');
  const magasinId = donnees.magasin_id ? Number(donnees.magasin_id) : null;
  if (magasinId) {
    const m = db.prepare('SELECT id FROM magasins WHERE id=? AND entreprise_id=?').get(magasinId, entrepriseId);
    if (!m) throw erreur('Boutique inconnue pour cette entreprise');
  }
  const code = String(donnees.code || '').trim() || prochainCodeEmploye(entrepriseId);
  const deja = db.prepare('SELECT id FROM employes WHERE entreprise_id=? AND code=?').get(entrepriseId, code);
  if (deja) throw erreur('Le code « ' + code + ' » est déjà utilisé par un autre employé');

  const info = db.prepare(`
    INSERT INTO employes (entreprise_id, code, civilite, nom, poste, magasin_id, telephone, email,
      date_naissance, lieu_naissance, sexe, situation_matrimoniale, adresse, ville,
      numero_cni, numero_cnps, numero_ifu, contact_urgence_nom, contact_urgence_tel, formation,
      date_embauche, date_fin_contrat, type_contrat, salaire, date_sortie, motif_sortie, actif, notes,
      statut_dossier)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(entrepriseId, code, donnees.civilite || 'M.', nom, donnees.poste || null, magasinId,
      donnees.telephone || null, donnees.email || null,
      donnees.date_naissance || null, donnees.lieu_naissance || null, donnees.sexe || null,
      donnees.situation_matrimoniale || null, donnees.adresse || null, donnees.ville || null,
      donnees.numero_cni || null, donnees.numero_cnps || null, donnees.numero_ifu || null,
      donnees.contact_urgence_nom || null, donnees.contact_urgence_tel || null, donnees.formation || null,
      donnees.date_embauche || null, donnees.date_fin_contrat || null, donnees.type_contrat || 'CDI',
      Number(donnees.salaire) || 0, donnees.date_sortie || null, donnees.motif_sortie || null,
      donnees.actif === 0 || donnees.actif === '0' ? 0 : 1, donnees.notes || null,
      donnees.statut_dossier || 'complet');
  const id = Number(info.lastInsertRowid);

  if (candidatId) {
    db.prepare(`UPDATE candidats SET statut='embauche', employe_id=?,
                salaire_propose=IFNULL(NULLIF(salaire_propose,0), ?)
                WHERE id=? AND entreprise_id=?`).run(id, Number(donnees.salaire) || 0, candidatId, entrepriseId);
  }
  return db.prepare('SELECT * FROM employes WHERE id=?').get(id);
}

/** Met à jour la fiche d'un employé. */
function modifierEmploye(id, entrepriseId, donnees) {
  const e = db.prepare('SELECT * FROM employes WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  const magasinId = donnees.magasin_id ? Number(donnees.magasin_id) : null;
  if (magasinId) {
    const m = db.prepare('SELECT id FROM magasins WHERE id=? AND entreprise_id=?').get(magasinId, entrepriseId);
    if (!m) throw erreur('Boutique inconnue pour cette entreprise');
  }
  const code = String(donnees.code || e.code || '').trim();
  const conflit = db.prepare('SELECT id FROM employes WHERE entreprise_id=? AND code=? AND id<>?').get(entrepriseId, code, id);
  if (conflit) throw erreur('Le code « ' + code + ' » est déjà utilisé par un autre employé');

  db.prepare(`
    UPDATE employes SET code=?, civilite=?, nom=?, poste=?, magasin_id=?, telephone=?, email=?,
      date_naissance=?, lieu_naissance=?, sexe=?, situation_matrimoniale=?, adresse=?, ville=?,
      numero_cni=?, numero_cnps=?, numero_ifu=?, contact_urgence_nom=?, contact_urgence_tel=?,
      formation=?, date_embauche=?, date_fin_contrat=?, type_contrat=?, salaire=?,
      date_sortie=?, motif_sortie=?, actif=?, notes=?, statut_dossier=?
    WHERE id=?`)
    .run(code, donnees.civilite || e.civilite, String(donnees.nom || e.nom).trim(),
      donnees.poste ?? e.poste, magasinId, donnees.telephone ?? e.telephone, donnees.email ?? e.email,
      donnees.date_naissance ?? e.date_naissance, donnees.lieu_naissance ?? e.lieu_naissance,
      donnees.sexe ?? e.sexe, donnees.situation_matrimoniale ?? e.situation_matrimoniale,
      donnees.adresse ?? e.adresse, donnees.ville ?? e.ville,
      donnees.numero_cni ?? e.numero_cni, donnees.numero_cnps ?? e.numero_cnps,
      donnees.numero_ifu ?? e.numero_ifu, donnees.contact_urgence_nom ?? e.contact_urgence_nom,
      donnees.contact_urgence_tel ?? e.contact_urgence_tel, donnees.formation ?? e.formation,
      donnees.date_embauche ?? e.date_embauche, donnees.date_fin_contrat ?? e.date_fin_contrat,
      donnees.type_contrat ?? e.type_contrat,
      donnees.salaire === undefined || donnees.salaire === '' ? e.salaire : Number(donnees.salaire),
      donnees.date_sortie ?? e.date_sortie, donnees.motif_sortie ?? e.motif_sortie,
      donnees.actif === undefined ? e.actif : (donnees.actif ? 1 : 0),
      donnees.notes ?? e.notes, donnees.statut_dossier ?? e.statut_dossier, id);
  return db.prepare('SELECT * FROM employes WHERE id=?').get(id);
}

/** Sortie du personnel : la fiche est conservée (historique de paie, documents). */
function sortirEmploye(id, entrepriseId, { date_sortie, motif_sortie } = {}) {
  const e = db.prepare('SELECT * FROM employes WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  db.prepare(`UPDATE employes SET statut_dossier='sorti', actif=0, date_sortie=?, motif_sortie=? WHERE id=?`)
    .run(date_sortie || new Date().toISOString().slice(0, 10), motif_sortie || null, id);
  return db.prepare('SELECT * FROM employes WHERE id=?').get(id);
}

/** Supprime définitivement un employé (fiche, salaires et documents). */
/* Renvoyer un employé : il passe en « sorti » (archivé) avec date et motif,
   sans être supprimé. Ses documents restent téléchargeables dans les archives. */
function renvoyerEmploye(id, entrepriseId, { motif = null, date_sortie = null, utilisateurId = null } = {}) {
  const e = db.prepare('SELECT * FROM employes WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE employes SET actif=0, statut_dossier=?, date_sortie=?, motif_sortie=? WHERE id=?')
    .run('sorti', date_sortie || aujourdhui, motif || null, id);
  return db.prepare('SELECT * FROM employes WHERE id=?').get(id);
}

function supprimerEmploye(id, entrepriseId) {
  const e = db.prepare('SELECT * FROM employes WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  supprimerDocumentsDe(id);
  db.prepare('DELETE FROM employes WHERE id=?').run(id);
  return e;
}

/* ============================================================================
   Salaires — suivi mensuel des versements
   ========================================================================== */

/**
 * État de la paie d'une période : chaque employé actif avec son salaire de
 * référence, le versement enregistré (s'il existe) et le net calculé.
 */
function etatPaie({ entrepriseId, periode = periodeCourante(), magasinImpose = null, magasin_id = null, q = '' }) {
  const employes = listerEmployes({ entrepriseId, magasinImpose, magasin_id, q, actif: '1' });
  const versements = db.prepare('SELECT * FROM salaires WHERE entreprise_id=? AND periode=?')
    .all(entrepriseId, periode);
  const parEmploye = new Map(versements.map((v) => [v.employe_id, v]));

  const lignes = employes.map((e) => {
    const v = parEmploye.get(e.id) || null;
    const salaire = Number(e.salaire) || 0;
    return {
      employe_id: e.id,
      code: e.code,
      nom: e.nom,
      poste: e.poste,
      magasin: e.magasin,
      type_contrat: e.type_contrat,
      salaire_reference: salaire,
      versement: v,
      primes: v ? Number(v.primes) || 0 : 0,
      retenues: v ? Number(v.retenues) || 0 : 0,
      net: v ? Number(v.net) || 0 : salaire,
      statut: v ? v.statut : 'a_payer',
      date_paiement: v ? v.date_paiement : null,
      mode_paiement: v ? v.mode_paiement : null,
    };
  });

  const totaux = lignes.reduce((a, l) => {
    a.masse_salariale += l.salaire_reference;
    a.total_primes += l.primes;
    a.total_retenues += l.retenues;
    a.total_net += l.statut === 'paye' ? l.net : 0;
    if (l.statut === 'paye') { a.nb_payes++; a.montant_paye += l.net; }
    else { a.nb_a_payer++; a.montant_a_payer += l.net; }
    return a;
  }, { masse_salariale: 0, total_primes: 0, total_retenues: 0, total_net: 0, nb_payes: 0, nb_a_payer: 0, montant_paye: 0, montant_a_payer: 0 });

  return { periode, lignes, totaux, nb_employes: lignes.length };
}

/** Historique des périodes déjà saisies (pour le sélecteur de mois). */
function periodesConnues(entrepriseId) {
  return db.prepare(`SELECT periode, COUNT(*) nb, SUM(statut='paye') nb_payes, IFNULL(SUM(net),0) total
    FROM salaires WHERE entreprise_id=? GROUP BY periode ORDER BY periode DESC`).all(entrepriseId);
}

/** Enregistre (ou met à jour) le versement d'un mois pour un employé. */
function enregistrerSalaire({ entrepriseId, employe_id, periode, montant, primes = 0, retenues = 0, statut = 'a_payer', date_paiement = null, mode_paiement = null, reference = null, notes = null, utilisateurId = null }) {
  const per = String(periode || periodeCourante()).trim();
  if (!/^\d{4}-\d{2}$/.test(per)) throw erreur('Période invalide : utilisez le format AAAA-MM');
  const e = db.prepare('SELECT * FROM employes WHERE id=? AND entreprise_id=?').get(Number(employe_id), entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);

  const base = montant === undefined || montant === null || montant === ''
    ? Number(e.salaire) || 0 : Number(montant);
  if (!Number.isFinite(base) || base < 0) throw erreur('Montant invalide');
  const p = Math.max(0, Number(primes) || 0);
  const r = Math.max(0, Number(retenues) || 0);
  const net = Math.max(0, base + p - r);
  const st = STATUTS_SALAIRE[statut] ? statut : 'a_payer';
  const datePaiement = st === 'paye' ? (date_paiement || new Date().toISOString().slice(0, 10)) : (date_paiement || null);

  db.prepare(`
    INSERT INTO salaires (entreprise_id, employe_id, periode, montant, primes, retenues, net,
      date_paiement, statut, mode_paiement, reference, notes, saisi_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(employe_id, periode) DO UPDATE SET
      montant=excluded.montant, primes=excluded.primes, retenues=excluded.retenues,
      net=excluded.net, date_paiement=excluded.date_paiement, statut=excluded.statut,
      mode_paiement=excluded.mode_paiement, reference=excluded.reference,
      notes=excluded.notes, saisi_par=excluded.saisi_par`)
    .run(entrepriseId, e.id, per, base, p, r, net, datePaiement, st, mode_paiement, reference, notes, utilisateurId);

  return db.prepare('SELECT * FROM salaires WHERE employe_id=? AND periode=?').get(e.id, per);
}

/** Marque toute une période comme payée d'un coup. */
function payerPeriode({ entrepriseId, periode, magasinImpose = null, utilisateurId = null, mode_paiement = null }) {
  const per = String(periode || periodeCourante()).trim();
  const etat = etatPaie({ entrepriseId, periode: per, magasinImpose });
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let nb = 0;
  const tx = db.transaction(() => {
    etat.lignes.filter((l) => l.statut !== 'paye').forEach((l) => {
      enregistrerSalaire({
        entrepriseId, employe_id: l.employe_id, periode: per, montant: l.salaire_reference,
        primes: l.primes, retenues: l.retenues, statut: 'paye', date_paiement: aujourdhui,
        mode_paiement: mode_paiement || l.mode_paiement, utilisateurId,
      });
      nb++;
    });
  });
  tx();
  return { periode: per, nb_marques: nb };
}

function supprimerSalaire(id, entrepriseId) {
  const s = db.prepare('SELECT * FROM salaires WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!s) throw erreur('Versement introuvable', 404);
  db.prepare('DELETE FROM salaires WHERE id=?').run(id);
  return s;
}

/** Évolution de la masse salariale sur les N derniers mois. */
function evolutionMasseSalariale(entrepriseId, mois = 12) {
  return db.prepare(`
    SELECT periode, COUNT(*) nb_employes, IFNULL(SUM(montant),0) masse,
           IFNULL(SUM(net),0) net, SUM(statut='paye') nb_payes
    FROM salaires WHERE entreprise_id=?
    GROUP BY periode ORDER BY periode DESC LIMIT ?`).all(entrepriseId, Number(mois) || 12).reverse();
}

/* ============================================================================
   Documents (PDF) du personnel
   ========================================================================== */

function cheminDocument(nomStocke) {
  return path.join(DOSSIER_DOCUMENTS, nomStocke);
}

/** Supprime les fichiers d'un employé (appelé à la suppression de la fiche). */
function supprimerDocumentsDe(employeId) {
  const docs = db.prepare('SELECT nom_stocke FROM documents_employe WHERE employe_id=?').all(employeId);
  docs.forEach((d) => {
    // Le nom stocké est généré par l'application : on refuse toute traversée de dossier.
    const base = path.basename(String(d.nom_stocke || ''));
    if (!base) return;
    fs.promises.unlink(cheminDocument(base)).catch(() => {});
  });
  db.prepare('DELETE FROM documents_employe WHERE employe_id=?').run(employeId);
}

/**
 * Enregistre un document PDF pour un employé.
 * @param {object} fichier { nom, type, contenu } — contenu en base64 ou Buffer
 */
/* Valide un téléversement PDF et renvoie {nomOriginal, tampon}. Partagé entre
   les documents d'employé et les documents de candidature. */
function validerPdf({ nom, contenu }) {
  const nomOriginal = String(nom || 'document.pdf').replace(/[\\/]/g, '_').slice(0, 180);
  if (!/\.pdf$/i.test(nomOriginal)) throw erreur('Seuls les fichiers PDF sont acceptés');
  const tampon = Buffer.isBuffer(contenu) ? contenu
    : Buffer.from(String(contenu || '').replace(/^data:application\/pdf;base64,/, ''), 'base64');
  if (!tampon.length) throw erreur('Fichier vide');
  if (tampon.length > TAILLE_MAX_OCTETS) {
    throw erreur('Document trop volumineux (' + Math.round(TAILLE_MAX_OCTETS / 1024 / 1024) + ' Mo maximum)');
  }
  /* Un PDF commence toujours par « %PDF- » : on refuse tout le reste. */
  if (tampon.slice(0, 5).toString('latin1') !== '%PDF-') throw erreur('Ce fichier n’est pas un PDF valide');
  return { nomOriginal, tampon };
}

function enregistrerDocument({ entrepriseId, employe_id, categorie = 'autre', nom, type, contenu, date_document = null, utilisateurId = null }) {
  const e = db.prepare('SELECT id FROM employes WHERE id=? AND entreprise_id=?').get(Number(employe_id), entrepriseId);
  if (!e) throw erreur('Employé introuvable', 404);
  const { nomOriginal, tampon } = validerPdf({ nom, contenu });

  if (!fs.existsSync(DOSSIER_DOCUMENTS)) fs.mkdirSync(DOSSIER_DOCUMENTS, { recursive: true });
  const nomStocke = 'emp-' + e.id + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
  fs.writeFileSync(cheminDocument(nomStocke), tampon);

  const info = db.prepare(`
    INSERT INTO documents_employe (entreprise_id, employe_id, categorie, nom_original, nom_stocke,
      type_mime, taille, date_document, televerse_par)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(entrepriseId, e.id, CATEGORIES_DOCUMENT[categorie] ? categorie : 'autre', nomOriginal, nomStocke,
      'application/pdf', tampon.length, date_document || null, utilisateurId);
  return db.prepare('SELECT id, categorie, nom_original, nom_stocke, type_mime, taille, date_document, created_at FROM documents_employe WHERE id=?')
    .get(Number(info.lastInsertRowid));
}

function listerDocuments(employeId, entrepriseId) {
  return db.prepare(`
    SELECT d.id, d.categorie, d.nom_original, d.type_mime, d.taille, d.date_document, d.created_at,
           u.nom AS televerse_par_nom
    FROM documents_employe d LEFT JOIN users u ON u.id = d.televerse_par
    WHERE d.employe_id=? AND d.entreprise_id=? ORDER BY d.created_at DESC`).all(employeId, entrepriseId);
}

/** Récupère un document pour le téléchargement (chemin + métadonnées). */
function documentPourTelechargement(id, entrepriseId) {
  const d = db.prepare('SELECT * FROM documents_employe WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!d) throw erreur('Document introuvable', 404);
  const chemin = cheminDocument(path.basename(d.nom_stocke));
  if (!fs.existsSync(chemin)) throw erreur('Fichier absent du serveur', 404);
  return { document: d, chemin };
}

function supprimerDocument(id, entrepriseId) {
  const d = db.prepare('SELECT * FROM documents_employe WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!d) throw erreur('Document introuvable', 404);
  fs.promises.unlink(cheminDocument(path.basename(d.nom_stocke))).catch(() => {});
  db.prepare('DELETE FROM documents_employe WHERE id=?').run(id);
  return d;
}

/* ---------------- Documents de candidature (PDF) ---------------- */
function enregistrerDocumentCandidat({ entrepriseId, candidat_id, categorie = 'autre', nom, contenu, utilisateurId = null }) {
  const c = db.prepare('SELECT id FROM candidats WHERE id=? AND entreprise_id=?').get(Number(candidat_id), entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  const { nomOriginal, tampon } = validerPdf({ nom, contenu });
  if (!fs.existsSync(DOSSIER_DOCUMENTS)) fs.mkdirSync(DOSSIER_DOCUMENTS, { recursive: true });
  const nomStocke = 'cand-' + c.id + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
  fs.writeFileSync(cheminDocument(nomStocke), tampon);
  const info = db.prepare(`
    INSERT INTO documents_candidat (entreprise_id, candidat_id, categorie, nom_original, nom_stocke,
      type_mime, taille, televerse_par)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(entrepriseId, c.id, CATEGORIES_DOCUMENT[categorie] ? categorie : 'autre', nomOriginal, nomStocke,
      'application/pdf', tampon.length, utilisateurId);
  return db.prepare('SELECT id, categorie, nom_original, nom_stocke, type_mime, taille, created_at FROM documents_candidat WHERE id=?')
    .get(Number(info.lastInsertRowid));
}

function listerDocumentsCandidat(candidatId, entrepriseId) {
  return db.prepare(`
    SELECT d.id, d.categorie, d.nom_original, d.type_mime, d.taille, d.created_at, u.nom AS televerse_par_nom
    FROM documents_candidat d LEFT JOIN users u ON u.id = d.televerse_par
    WHERE d.candidat_id=? AND d.entreprise_id=? ORDER BY d.created_at DESC`).all(candidatId, entrepriseId);
}

function documentCandidatPourTelechargement(id, entrepriseId) {
  const d = db.prepare('SELECT * FROM documents_candidat WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!d) throw erreur('Document introuvable', 404);
  const chemin = cheminDocument(path.basename(d.nom_stocke));
  if (!fs.existsSync(chemin)) throw erreur('Fichier absent du serveur', 404);
  return { document: d, chemin };
}

function supprimerDocumentsCandidatDe(candidatId) {
  const docs = db.prepare('SELECT nom_stocke FROM documents_candidat WHERE candidat_id=?').all(candidatId);
  docs.forEach((d) => {
    const base = path.basename(String(d.nom_stocke || ''));
    if (base) fs.promises.unlink(cheminDocument(base)).catch(() => {});
  });
  db.prepare('DELETE FROM documents_candidat WHERE candidat_id=?').run(candidatId);
}

/* ============================================================================
   Recrutement — candidatures
   ========================================================================== */

function listerCandidats({ entrepriseId, magasinImpose = null, magasin_id = null, statut = '', q = '' } = {}) {
  let sql = `
    SELECT c.*, m.nom AS magasin, e.nom AS employe_nom, e.code AS employe_code,
           (SELECT COUNT(*) FROM documents_employe d WHERE d.employe_id = c.employe_id) AS nb_documents
    FROM candidats c
    LEFT JOIN magasins m ON m.id = c.magasin_id
    LEFT JOIN employes e ON e.id = c.employe_id
    WHERE c.entreprise_id = ?`;
  const p = [entrepriseId];
  if (magasinImpose) { sql += ' AND (c.magasin_id = ? OR c.magasin_id IS NULL)'; p.push(magasinImpose); }
  else if (magasin_id) { sql += ' AND c.magasin_id = ?'; p.push(Number(magasin_id)); }
  if (statut) { sql += ' AND c.statut = ?'; p.push(statut); }
  if (q) {
    sql += " AND (c.nom LIKE ? OR IFNULL(c.poste_vise,'') LIKE ? OR IFNULL(c.telephone,'') LIKE ? OR IFNULL(c.email,'') LIKE ?)";
    const like = '%' + q + '%';
    p.push(like, like, like, like);
  }
  sql += ' ORDER BY c.date_candidature DESC, c.id DESC';
  return db.prepare(sql).all(...p);
}

function detailCandidat(id, entrepriseId) {
  const c = db.prepare(`
    SELECT c.*, m.nom AS magasin, e.nom AS employe_nom, e.code AS employe_code
    FROM candidats c LEFT JOIN magasins m ON m.id = c.magasin_id
    LEFT JOIN employes e ON e.id = c.employe_id
    WHERE c.id=? AND c.entreprise_id=?`).get(id, entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  return {
    candidat: c,
    employe: c.employe_id ? detailEmploye(c.employe_id, { entrepriseId }) : null,
  };
}

function creerCandidat(entrepriseId, donnees, { utilisateurId = null } = {}) {
  const nom = String(donnees.nom || '').trim();
  if (!nom) throw erreur('Le nom du candidat est obligatoire');
  const magasinId = donnees.magasin_id ? Number(donnees.magasin_id) : null;
  if (magasinId) {
    const m = db.prepare('SELECT id FROM magasins WHERE id=? AND entreprise_id=?').get(magasinId, entrepriseId);
    if (!m) throw erreur('Boutique inconnue pour cette entreprise');
  }
  const info = db.prepare(`
    INSERT INTO candidats (entreprise_id, nom, poste_vise, magasin_id, telephone, email, ville,
      date_naissance, date_candidature, source, experience_annees, formation, statut,
      date_entretien, salaire_propose, motif, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(entrepriseId, nom, donnees.poste_vise || null, magasinId, donnees.telephone || null,
      donnees.email || null, donnees.ville || null, donnees.date_naissance || null,
      donnees.date_candidature || new Date().toISOString().slice(0, 10),
      donnees.source || 'spontanee', Number(donnees.experience_annees) || 0, donnees.formation || null,
      STATUTS_CANDIDAT[donnees.statut] ? donnees.statut : 'recu', donnees.date_entretien || null,
      Number(donnees.salaire_propose) || 0, donnees.motif || null, donnees.notes || null);
  return db.prepare('SELECT * FROM candidats WHERE id=?').get(Number(info.lastInsertRowid));
}

function modifierCandidat(id, entrepriseId, donnees) {
  const c = db.prepare('SELECT * FROM candidats WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  const magasinId = donnees.magasin_id ? Number(donnees.magasin_id) : null;
  db.prepare(`
    UPDATE candidats SET nom=?, poste_vise=?, magasin_id=?, telephone=?, email=?, ville=?,
      date_naissance=?, date_candidature=?, source=?, experience_annees=?, formation=?, statut=?,
      date_entretien=?, salaire_propose=?, motif=?, notes=?
    WHERE id=?`)
    .run(String(donnees.nom || c.nom).trim(), donnees.poste_vise ?? c.poste_vise, magasinId,
      donnees.telephone ?? c.telephone, donnees.email ?? c.email, donnees.ville ?? c.ville,
      donnees.date_naissance ?? c.date_naissance, donnees.date_candidature ?? c.date_candidature,
      donnees.source ?? c.source,
      donnees.experience_annees === undefined ? c.experience_annees : Number(donnees.experience_annees) || 0,
      donnees.formation ?? c.formation,
      donnees.statut && STATUTS_CANDIDAT[donnees.statut] ? donnees.statut : c.statut,
      donnees.date_entretien ?? c.date_entretien,
      donnees.salaire_propose === undefined ? c.salaire_propose : Number(donnees.salaire_propose) || 0,
      donnees.motif ?? c.motif, donnees.notes ?? c.notes, id);
  return db.prepare('SELECT * FROM candidats WHERE id=?').get(id);
}

function changerStatutCandidat(id, entrepriseId, statut, { motif = null, date_entretien = null } = {}) {
  if (!STATUTS_CANDIDAT[statut]) throw erreur('Statut de candidature inconnu');
  const c = db.prepare('SELECT * FROM candidats WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  db.prepare('UPDATE candidats SET statut=?, motif=?, date_entretien=IFNULL(?, date_entretien) WHERE id=?')
    .run(statut, motif ?? c.motif, date_entretien, id);
  return db.prepare('SELECT * FROM candidats WHERE id=?').get(id);
}

function supprimerCandidat(id, entrepriseId) {
  const c = db.prepare('SELECT * FROM candidats WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  /* Une candidature embauchée a créé une fiche du personnel : la supprimer sans
     elle laisserait un employé orphelin de sa candidature et ses PDF sur disque. */
  if (c.employe_id) supprimerEmploye(c.employe_id, entrepriseId);
  supprimerDocumentsCandidatDe(id);
  db.prepare('DELETE FROM candidats WHERE id=?').run(id);
  return c;
}

/**
 * Transforme une candidature en employé : la fiche du personnel est créée avec
 * les informations du candidat, puis la candidature passe à « embauche ».
 */
function embaucherCandidat(id, entrepriseId, donnees = {}, { utilisateurId = null } = {}) {
  const c = db.prepare('SELECT * FROM candidats WHERE id=? AND entreprise_id=?').get(id, entrepriseId);
  if (!c) throw erreur('Candidature introuvable', 404);
  if (c.employe_id) throw erreur('Ce candidat a déjà été embauché');

  const employe = creerEmploye(entrepriseId, {
    nom: donnees.nom || c.nom,
    poste: donnees.poste ?? c.poste_vise,
    magasin_id: donnees.magasin_id ?? c.magasin_id,
    telephone: donnees.telephone ?? c.telephone,
    email: donnees.email ?? c.email,
    ville: donnees.ville ?? c.ville,
    date_naissance: donnees.date_naissance ?? c.date_naissance,
    formation: donnees.formation ?? c.formation,
    date_embauche: donnees.date_embauche || new Date().toISOString().slice(0, 10),
    type_contrat: donnees.type_contrat || 'CDI',
    salaire: donnees.salaire ?? (c.salaire_propose || 0),
    numero_cni: donnees.numero_cni || null,
    notes: donnees.notes || ('Recruté le ' + (c.date_candidature || '') + (c.source ? ' — ' + c.source : '')),
    statut_dossier: 'a_completer',
  }, { utilisateurId, candidatId: c.id });

  /* Les pièces PDF de la candidature (CV, diplôme…) suivent l'employé : elles sont
     recopiées dans son dossier puis retirées du vivier. */
  db.prepare('SELECT categorie, nom_original, nom_stocke, type_mime, taille FROM documents_candidat WHERE candidat_id=? AND entreprise_id=?')
    .all(id, entrepriseId)
    .forEach((doc) => {
      db.prepare(`INSERT INTO documents_employe (entreprise_id, employe_id, categorie, nom_original,
          nom_stocke, type_mime, taille, televerse_par) VALUES (?,?,?,?,?,?,?,?)`)
        .run(entrepriseId, employe.id, doc.categorie, doc.nom_original, doc.nom_stocke, doc.type_mime, doc.taille, utilisateurId);
    });
  db.prepare('DELETE FROM documents_candidat WHERE candidat_id=?').run(id);

  return { employe, candidat: db.prepare('SELECT * FROM candidats WHERE id=?').get(id) };
}

/** Chiffres du recrutement pour le tableau de bord RH. */
function statsRecrutement(entrepriseId) {
  const parStatut = db.prepare('SELECT statut, COUNT(*) c FROM candidats WHERE entreprise_id=? GROUP BY statut')
    .all(entrepriseId).reduce((a, r) => { a[r.statut] = r.c; return a; }, {});
  const total = Object.values(parStatut).reduce((a, n) => a + n, 0);
  const entretiens = db.prepare(`SELECT COUNT(*) c FROM candidats WHERE entreprise_id=?
    AND statut='entretien' AND date_entretien >= date('now')`).get(entrepriseId).c;
  return {
    total, par_statut: parStatut,
    en_cours: (parStatut.recu || 0) + (parStatut.entretien || 0) + (parStatut.retenu || 0),
    embauches: parStatut.embauche || 0,
    refuses: parStatut.refuse || 0,
    entretiens_a_venir: entretiens,
    taux_embauche: total ? Math.round(((parStatut.embauche || 0) / total) * 100) : 0,
  };
}

module.exports = {
  DOSSIER_DOCUMENTS, TAILLE_MAX_OCTETS, CATEGORIES_DOCUMENT, STATUTS_CANDIDAT, STATUTS_SALAIRE,
  periodeCourante, periodeSuivante,
  listerEmployes, detailEmploye, creerEmploye, modifierEmploye, sortirEmploye, supprimerEmploye,
  etatPaie, periodesConnues, enregistrerSalaire, payerPeriode, supprimerSalaire, evolutionMasseSalariale,
  renvoyerEmploye,
  enregistrerDocument, listerDocuments, documentPourTelechargement, supprimerDocument, supprimerDocumentsDe,
  enregistrerDocumentCandidat, listerDocumentsCandidat, documentCandidatPourTelechargement, supprimerDocumentsCandidatDe,
  listerCandidats, detailCandidat, creerCandidat, modifierCandidat, changerStatutCandidat,
  supprimerCandidat, embaucherCandidat, statsRecrutement,
};
