/**
 * abonnement.js — Gestion de l'abonnement de la plateforme.
 *
 * Règles métier :
 *   • 7 jours d'utilisation gratuite à la première mise en service ;
 *   • ensuite 11 500 FCFA / mois ou 132 000 FCFA / an ;
 *   • paiement par Orange Money (693007397) ou MTN Mobile Money (654324282) :
 *     l'utilisateur choisit le service, reçoit un lien + le numéro, effectue le
 *     transfert, puis sa demande est validée et l'abonnement est prolongé.
 */
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { param } = require('./utils');
const { SECRET, peut } = require('./auth');

const JOUR_MS = 86400000;

const LIBELLE_SERVICE = {
  orange_money: { nom: 'Orange Money', cle_numero: 'om_numero', cle_ussd: 'om_ussd', couleur: '#ff7900' },
  mtn_momo: { nom: 'MTN Mobile Money', cle_numero: 'mtn_numero', cle_ussd: 'mtn_ussd', couleur: '#ffcc00' },
  mastercard: { nom: 'Carte bancaire MasterCard', cle_numero: 'cb_compte', couleur: '#eb001b' },
};

/** Compte bancaire qui reçoit les paiements par carte (Afriland First Bank). */
const COMPTE_BANCAIRE_PAR_DEFAUT = {
  banque: 'Afriland First Bank',
  compte: '10005-00002-10360711051-43',
  titulaire: 'OUMBE NGANOU FRANCK',
  pays: 'Cameroun',
  devise: 'FCFA (XAF)',
};

const DUREE = { mensuel: 30, annuel: 365 };

const dateLisible = (d) => new Date(d).toISOString().slice(0, 10);

function parametreNombre(cle, defaut) {
  const v = Number(param(cle, null));
  return Number.isFinite(v) && v > 0 ? v : defaut;
}

/**
 * Un moyen de paiement est actif par défaut ; le propriétaire de la plateforme
 * peut l'activer ou le désactiver à tout moment (paramètre `service_<code>_actif`).
 */
const CODES_SERVICE = ['orange_money', 'mtn_momo', 'mastercard'];

function serviceActif(code) {
  return String(param(`service_${code}_actif`, '1')) !== '0';
}

/** Liste des moyens de paiement avec leur état, pour l'interface du propriétaire. */
function moyensPaiement() {
  return CODES_SERVICE.map((code) => ({
    code,
    nom: LIBELLE_SERVICE[code].nom,
    couleur: LIBELLE_SERVICE[code].couleur,
    actif: serviceActif(code),
  }));
}

/** Tarifs et coordonnées de paiement (modifiables dans Paramètres). */
function coordonneesPaiement() {
  const om = {
    service: 'orange_money',
    nom: LIBELLE_SERVICE.orange_money.nom,
    numero: String(param('om_numero', '693007397')),
    ussd: String(param('om_ussd', '#150#')),
  };
  const mtn = {
    service: 'mtn_momo',
    nom: LIBELLE_SERVICE.mtn_momo.nom,
    numero: String(param('mtn_numero', '654324282')),
    ussd: String(param('mtn_ussd', '*126#')),
  };
  [om, mtn].forEach((s) => { s.lien = 'tel:' + encodeURIComponent(s.ussd); });

  /* Paiement par carte bancaire (MasterCard) : le versement est fait sur le
     compte Afriland First Bank, puis validé par le propriétaire de la plateforme. */
  const carte = {
    service: 'mastercard',
    nom: LIBELLE_SERVICE.mastercard.nom,
    reseau: 'MasterCard',
    numero: String(param('cb_compte', COMPTE_BANCAIRE_PAR_DEFAUT.compte)),
    banque: String(param('cb_banque', COMPTE_BANCAIRE_PAR_DEFAUT.banque)),
    titulaire: String(param('cb_titulaire', COMPTE_BANCAIRE_PAR_DEFAUT.titulaire)),
    pays: String(param('cb_pays', COMPTE_BANCAIRE_PAR_DEFAUT.pays)),
    devise: COMPTE_BANCAIRE_PAR_DEFAUT.devise,
    lien: null,
  };

  const services = { orange_money: om, mtn_momo: mtn, mastercard: carte };
  CODES_SERVICE.forEach((code) => { services[code].actif = serviceActif(code); });

  return {
    marchand: String(param('paiement_marchand', 'OUMBE NGANOU FRANCK')),
    instructions: String(param('paiement_instructions', '')),
    services,
    moyens: moyensPaiement(),
    compte_bancaire: {
      banque: carte.banque,
      compte: carte.numero,
      titulaire: carte.titulaire,
      pays: carte.pays,
      devise: carte.devise,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Formules et réductions (configurées par le propriétaire)            */
/* ------------------------------------------------------------------ */

/** Formules d'abonnement actives, triées par ordre d'affichage. */
function formules(activesSeulement = true) {
  const rows = db.prepare(`SELECT * FROM formules ${activesSeulement ? 'WHERE actif=1' : ''}
    ORDER BY ordre, duree_jours, id`).all();
  return rows.map((f) => ({
    ...f,
    montant: Number(f.montant),
    duree_jours: Number(f.duree_jours),
    montant_par_mois: Math.round(Number(f.montant) / (Number(f.duree_jours) / 30)),
    duree_libelle: dureeLisible(Number(f.duree_jours)),
  }));
}

/** Retrouve une formule par son code (ou par id). */
function formule(code) {
  if (code === undefined || code === null || code === '') return null;
  return db.prepare('SELECT * FROM formules WHERE code=? OR id=?').get(String(code), Number(code) || 0) || null;
}

function dureeLisible(jours) {
  const j = Number(jours) || 0;
  if (j % 365 === 0 && j >= 365) return `${j / 365} an(s)`;
  if (j % 30 === 0 && j >= 30) return `${j / 30} mois`;
  return `${j} jour(s)`;
}

/** Réductions actives (le propriétaire peut aussi créer des augmentations : valeur négative). */
function reductions(activesSeulement = true) {
  return db.prepare(`SELECT * FROM reductions ${activesSeulement ? 'WHERE actif=1' : ''}
    ORDER BY id DESC`).all().map((r) => ({ ...r, valeur: Number(r.valeur) }));
}

/**
 * Contrôle un code de réduction et calcule le montant net.
 * Renvoie { reduction, remise, montant } — la remise est négative pour une augmentation.
 */
function appliquerReduction(code, formuleCode, montantBrut) {
  if (!code) return { reduction: null, remise: 0, montant: Math.round(montantBrut) };
  const r = db.prepare('SELECT * FROM reductions WHERE code=?').get(String(code).trim().toUpperCase());
  const err = (msg) => { throw Object.assign(new Error(msg), { statut: 400 }); };
  if (!r) err('Code de réduction inconnu');
  if (!r.actif) err('Ce code n\'est plus actif');
  if (r.formule_code && r.formule_code !== formuleCode) err('Ce code ne s\'applique pas à cette formule');
  const auj = new Date().toISOString().slice(0, 10);
  if (r.debut && r.debut > auj) err('Ce code n\'est pas encore valable');
  if (r.fin && r.fin < auj) err('Ce code a expiré');
  if (r.max_utilisations && Number(r.utilisations) >= Number(r.max_utilisations)) err('Ce code a atteint son nombre maximum d\'utilisations');
  const valeur = Number(r.valeur);
  const remise = r.type === 'pourcentage' ? Math.round((montantBrut * valeur) / 100) : Math.round(valeur);
  const montant = Math.max(0, Math.round(montantBrut) - remise);
  return { reduction: r, remise, montant };
}

function tarifs() {
  const f = formules();
  const par = (code, defaut) => { const x = f.find((y) => y.code === code); return x ? x.montant : defaut; };
  const mensuel = par('mensuel', parametreNombre('tarif_mensuel', 11500));
  const annuel = par('annuel', parametreNombre('tarif_annuel', 132000));
  return {
    mensuel, annuel,
    essai_jours: parametreNombre('essai_jours', 7),
    economie_annuelle: Math.max(0, mensuel * 12 - annuel),
    mensuel_equivalent_annuel: Math.round(annuel / 12),
    formules: f,
  };
}

/* ------------------------------------------------------------------ */
/* État de l'abonnement                                                */
/* ------------------------------------------------------------------ */

function ligneCourante(entrepriseId) {
  return db.prepare('SELECT * FROM abonnements WHERE entreprise_id=? ORDER BY id DESC LIMIT 1')
    .get(Number(entrepriseId) || 0);
}

/**
 * Crée (ou relance) la période d'essai gratuit d'une entreprise.
 * Une entreprise n'a qu'UNE ligne d'abonnement : on la réutilise au lieu d'en
 * ajouter une nouvelle, sinon l'état dépendrait de l'ordre des insertions.
 */
function demarrerEssai(entrepriseId, jours) {
  const duree = Number.isFinite(Number(jours)) ? Number(jours) : tarifs().essai_jours;
  const debut = new Date();
  const fin = new Date(debut.getTime() + duree * JOUR_MS);
  const id = Number(entrepriseId) || 0;
  const existante = ligneCourante(id);
  if (existante) {
    db.prepare(`UPDATE abonnements SET statut='essai', plan='essai', montant=0,
        date_debut=?, date_fin=?, reference=NULL, maj_at=datetime('now','localtime') WHERE id=?`)
      .run(dateLisible(debut), dateLisible(fin), existante.id);
    return db.prepare('SELECT * FROM abonnements WHERE id=?').get(existante.id);
  }
  const info = db.prepare(`
    INSERT INTO abonnements (entreprise_id, statut, plan, montant, date_debut, date_fin, reference)
    VALUES (?, 'essai', 'essai', 0, ?, ?, NULL)`).run(id, dateLisible(debut), dateLisible(fin));
  return db.prepare('SELECT * FROM abonnements WHERE id=?').get(info.lastInsertRowid);
}

/** Récupère l'abonnement courant, en créant l'essai gratuit si nécessaire. */
function abonnementCourant(entrepriseId) {
  return ligneCourante(entrepriseId) || demarrerEssai(entrepriseId);
}

/** Prolonge l'abonnement d'un mois ou d'un an (cumulable, sans perte de jours). */
function prolonger(entrepriseId, plan, montant, reference, dureeJours) {
  /* La durée vient de la formule choisie (configurable par le propriétaire). */
  const f = formule(plan);
  const duree = Number(dureeJours) > 0 ? Number(dureeJours)
    : (f ? f.duree_jours : (DUREE[plan] || DUREE.mensuel));
  const actuel = abonnementCourant(entrepriseId);
  const finActuelle = actuel.date_fin ? new Date(actuel.date_fin + 'T23:59:59') : new Date();
  const depart = finActuelle > new Date() ? finActuelle : new Date();
  const fin = new Date(depart.getTime() + duree * JOUR_MS);
  db.prepare(`
    UPDATE abonnements SET statut='actif', plan=?, montant=?, date_fin=?, reference=?,
      maj_at=datetime('now','localtime') WHERE id=?`)
    .run(plan, montant, dateLisible(fin), reference || null, actuel.id);
  return db.prepare('SELECT * FROM abonnements WHERE id=?').get(actuel.id);
}

/** État complet (statut calculé, jours restants, tarifs, coordonnées). */
function etat(entrepriseId) {
  const a = abonnementCourant(entrepriseId);
  const fin = new Date(a.date_fin + 'T23:59:59');
  const msRestants = fin.getTime() - Date.now();
  const jours = Math.max(0, Math.ceil(msRestants / JOUR_MS));
  const expire = msRestants <= 0;
  const enEssai = a.statut === 'essai';
  const paiementEnAttente = db.prepare(
    "SELECT * FROM paiements_abonnement WHERE statut='en_attente' AND entreprise_id=? ORDER BY id DESC LIMIT 1")
    .get(Number(entrepriseId) || 0);
  return {
    statut: expire ? 'expire' : a.statut,
    statut_libelle: expire ? 'Abonnement expiré' : (enEssai ? 'Essai gratuit' : 'Abonnement actif'),
    plan: a.plan,
    montant: a.montant,
    date_debut: a.date_debut,
    date_fin: a.date_fin,
    jours_restants: jours,
    expire,
    en_essai: enEssai && !expire,
    actif: !expire,
    reference: a.reference,
    paiement_en_attente: paiementEnAttente || null,
    tarifs: tarifs(),
    paiement: coordonneesPaiement(),
    alerte_bientot: !expire && jours <= 3,
    grace_jours: 3,     // marge d'affichage avant blocage total
  };
}

/** Référence de paiement : AB-2026-0001 */
function prochaineReference() {
  const annee = new Date().getFullYear();
  const prefixe = `AB-${annee}-`;
  const derniere = db.prepare(
    'SELECT reference FROM paiements_abonnement WHERE reference LIKE ? ORDER BY id DESC LIMIT 1').get(prefixe + '%');
  let n = 1;
  if (derniere) {
    const m = String(derniere.reference).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return prefixe + String(n).padStart(4, '0');
}

/**
 * Enregistre une demande de paiement et renvoie le message de validation du montant.
 */
function demanderPaiement({ entreprise_id, service, plan, telephone_payeur, nom_payeur, user_id,
                            code_reduction, carte }) {
  const infos = coordonneesPaiement();
  const svc = infos.services[service];
  if (!svc) throw Object.assign(new Error('Service de paiement inconnu'), { statut: 400 });
  if (!svc.actif) {
    throw Object.assign(new Error(`${svc.nom} est momentanément désactivé. Choisissez un autre moyen de paiement.`),
      { statut: 400 });
  }
  /* La formule est désormais libre : toute formule active créée par le propriétaire. */
  const f = formule(plan);
  if (!f) throw Object.assign(new Error('Formule inconnue'), { statut: 400 });
  if (!f.actif) throw Object.assign(new Error('Cette formule n\'est plus disponible'), { statut: 400 });
  const montantBrut = Number(f.montant);
  const { reduction, remise, montant } = appliquerReduction(code_reduction, f.code, montantBrut);
  const duree = Number(f.duree_jours);
  const reference = prochaineReference();
  const message = [
    `Validation de votre paiement`,
    `Montant : ${montant.toLocaleString('fr-FR')} FCFA`
      + (remise ? ` (${montantBrut.toLocaleString('fr-FR')} FCFA ${remise > 0 ? '−' : '+'} ${Math.abs(remise).toLocaleString('fr-FR')} FCFA)` : ''),
    `Formule : ${f.libelle} (${duree} jours)`,
    `Service : ${svc.nom} — numéro ${svc.numero}`,
    `Référence : ${reference}`,
  ].join(' · ');

  const info = db.prepare(`
    INSERT INTO paiements_abonnement
      (entreprise_id, reference, service, numero_paiement, telephone_payeur, nom_payeur, plan, montant,
       montant_brut, duree_jours, statut, message, user_id, reduction_id, code_reduction,
       carte_titulaire, carte_numero_masque, carte_expiration)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'en_attente', ?,?,?,?,?,?,?)`)
    .run(Number(entreprise_id) || 0, reference, service, svc.numero, telephone_payeur || null, nom_payeur || null,
      f.code, montant, montantBrut, duree, message, user_id || null,
      reduction ? reduction.id : null, reduction ? reduction.code : null,
      (carte && carte.titulaire) || null, (carte && carte.numero_masque) || null,
      (carte && carte.expiration) || null);

  const paiement = db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(info.lastInsertRowid);
  /* Le parcours diffère selon le moyen de paiement choisi. */
  const instruction = service === 'mastercard' ? [
    `1. Réglez ${montant.toLocaleString('fr-FR')} FCFA par carte bancaire (MasterCard).`,
    `2. Le versement doit arriver sur le compte ${svc.banque} — ${svc.numero} (${svc.titulaire}).`,
    `3. Indiquez la référence ${reference} dans le motif du virement : elle permet de rattacher votre paiement.`,
    `4. Votre abonnement est activé dès la validation du paiement par notre équipe.`,
  ] : [
    `1. Ouvrez ${svc.nom} en composant ${svc.ussd} (ou touchez le lien ci-dessous).`,
    `2. Choisissez « Transfert d’argent » puis le numéro ${svc.numero} (${infos.marchand}).`,
    `3. Envoyez exactement ${montant.toLocaleString('fr-FR')} FCFA et validez avec votre code secret.`,
    `4. Conservez l’identifiant de transaction reçu par SMS : il valide votre paiement sous la référence ${reference}.`,
  ];
  return { paiement, message, instruction, service: svc, montant, montant_brut: montantBrut,
           remise, reduction: reduction ? { code: reduction.code, libelle: reduction.libelle } : null,
           formule: f, duree };
}

/** Valide un paiement et prolonge l'abonnement. */
function validerPaiement(id, utilisateurId) {
  const p = db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(id);
  if (!p) throw Object.assign(new Error('Demande de paiement introuvable'), { statut: 404 });
  if (p.statut === 'valide') throw Object.assign(new Error('Ce paiement a déjà été validé'), { statut: 400 });
  const abonnement = prolonger(p.entreprise_id, p.plan, p.montant, p.reference, p.duree_jours);
  db.prepare(`UPDATE paiements_abonnement SET statut='valide', valide_par=?, traite_at=datetime('now','localtime') WHERE id=?`)
    .run(utilisateurId || null, p.id);
  if (p.reduction_id) {
    db.prepare('UPDATE reductions SET utilisations = utilisations + 1 WHERE id=?').run(p.reduction_id);
  }
  return { paiement: db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(p.id), abonnement };
}

function rejeterPaiement(id, utilisateurId, motif) {
  const p = db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(id);
  if (!p) throw Object.assign(new Error('Demande de paiement introuvable'), { statut: 404 });
  if (p.statut === 'valide') throw Object.assign(new Error('Un paiement validé ne peut être rejeté'), { statut: 400 });
  db.prepare(`UPDATE paiements_abonnement SET statut='rejete', valide_par=?, traite_at=datetime('now','localtime'),
              message = message || ' — rejeté : ' || ? WHERE id=?`)
    .run(utilisateurId || null, motif || 'non précisé', p.id);
  return db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(p.id);
}

/** Supprime une ligne de l'historique (correction d'une saisie erronée). */
function supprimerPaiement(id) {
  const p = db.prepare('SELECT * FROM paiements_abonnement WHERE id=?').get(id);
  if (!p) throw Object.assign(new Error('Demande de paiement introuvable'), { statut: 404 });
  db.prepare('DELETE FROM paiements_abonnement WHERE id=?').run(id);
  return p;
}

/* ------------------------------------------------------------------ */
/* Contrôle d'accès : bloque l'application quand l'abonnement est fini */
/* ------------------------------------------------------------------ */

const CHEMINS_LIBRES = ['/sante', '/auth', '/abonnement', '/entreprises', '/plateforme', '/psp'];

/** Utilisateur de la requête : req.user si déjà résolu, sinon le jeton Bearer. */
function utilisateurDeLaRequete(req) {
  if (req.user) return req.user;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), SECRET); } catch (e) { return null; }
}

/**
 * Préviens l'administrateur d'une entreprise dont l'abonnement est expiré :
 * un message interne + un email « mettez à jour votre abonnement » sont créés,
 * au plus une fois par 24 h. Seul le propriétaire peut ensuite réactiver.
 */
function alerterExpiration(entrepriseId) {
  try {
    const recente = db.prepare(`SELECT COUNT(*) c FROM messages WHERE entreprise_id=?
      AND objet LIKE 'Abonnement expiré%' AND created_at >= datetime('now','localtime','-1 day')`)
      .get(entrepriseId).c;
    if (recente) return;
    const admins = db.prepare(`SELECT id, nom, email FROM users WHERE entreprise_id=? AND role='admin'`)
      .all(entrepriseId);
    const ent = db.prepare('SELECT nom FROM entreprises WHERE id=?').get(entrepriseId) || {};
    admins.forEach((adm) => {
      db.prepare(`INSERT INTO messages (de_user_id, de_nom, de_email, a_user_id, a_nom, a_email, entreprise_id, objet, corps)
        VALUES (NULL,'Inventa GestyPro','noreply@inventa-gestypro', ?,?,?, ?,?,?)`)
        .run(adm.id, adm.nom, adm.email, entrepriseId,
          'Abonnement expiré — mise à jour requise',
          `Bonjour ${adm.nom},

L'abonnement de « ${ent.nom || 'votre entreprise'} » est expiré : toutes les pages sont `
          + `désormais non fonctionnelles.
Seul le propriétaire de la plateforme peut réactiver temporairement votre accès. `
          + `Pour un accès continu, merci de régler votre abonnement (Orange Money, MTN MoMo ou carte).

— Inventa GestyPro`);
      const M = require('./mails');
      M.envoyerMessageLibre({
        destinataire: adm.email, destinataire_nom: adm.nom,
        sujet: '[Inventa GestyPro] Abonnement expiré — mise à jour requise',
        corps: `L'abonnement de « ${ent.nom || 'votre entreprise'} » est expiré. Merci de le mettre à jour.`,
        entreprise_id: entrepriseId,
      });
    });
  } catch (e) { /* l'alerte ne doit jamais casser la requête */ }
}

function exigerAbonnement(req, res, next) {
  const utilisateur = utilisateurDeLaRequete(req);
  // Le propriétaire de la plateforme n'est jamais bloqué par un abonnement.
  if (utilisateur && utilisateur.role === 'super_admin') return next();

  const entrepriseId = utilisateur ? utilisateur.entreprise_id : null;
  if (!entrepriseId) return next();                 // aucune entreprise : rien à contrôler

  let e;
  try { e = etat(entrepriseId); } catch (err) { return next(); }
  if (!e.expire) return next();
  alerterExpiration(entrepriseId);
  if (CHEMINS_LIBRES.some((c) => req.path === c || req.path.startsWith(c + '/'))) return next();

  // Lecture seule pour ceux qui gèrent l'abonnement : ils doivent pouvoir atteindre la page de paiement.
  const lecture = req.method === 'GET' || req.method === 'HEAD';
  if (lecture && utilisateur && peut(utilisateur, 'abonnement.gerer')) return next();

  return res.status(402).json({
    erreur: 'Abonnement expiré : les opérations sont suspendues jusqu’au règlement.',
    code: 'ABONNEMENT_EXPIRE',
    abonnement: {
      statut: e.statut, date_fin: e.date_fin, tarifs: e.tarifs, paiement: e.paiement,
    },
  });
}

module.exports = {
  supprimerPaiement,
  JOUR_MS, DUREE, LIBELLE_SERVICE,
  etat, tarifs, coordonneesPaiement, abonnementCourant, ligneCourante, demarrerEssai, prolonger,
  formules, formule, reductions, appliquerReduction, dureeLisible,
  moyensPaiement, serviceActif, CODES_SERVICE,
  demanderPaiement, validerPaiement, rejeterPaiement, prochaineReference, exigerAbonnement,
};
