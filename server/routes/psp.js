/**
 * routes/psp.js — Notifications (IPN / callback) des prestataires de paiement.
 *
 * Ces routes sont PUBLIQUES : c'est le PSP qui les appelle après chaque
 * transaction, sans jeton d'authentification. La sécurité repose sur la
 * re-vérification systématique de la transaction **chez le PSP** avant toute
 * modification de l'abonnement — on ne fait jamais confiance au seul POST —
 * et sur le contrôle du montant reçu.
 *
 * Montée sur `/api/psp` avec `express.urlencoded` car les PSP notifient en
 * x-www-form-urlencoded.
 */
const express = require('express');
const { db } = require('../db');
const A = require('../abonnement');
const PSP = require('../psp');
const { journaliser } = require('../evenements');

const router = express.Router();
router.use(express.urlencoded({ extended: true }), express.json());

/** Retrouve la ligne de paiement visée (par jeton PSP puis par référence). */
function trouverPaiement({ jeton, reference }) {
  if (jeton) {
    const parJeton = db.prepare('SELECT * FROM paiements_abonnement WHERE psp_ticket=? ORDER BY id DESC LIMIT 1')
      .get(String(jeton));
    if (parJeton) return parJeton;
  }
  if (reference) {
    return db.prepare('SELECT * FROM paiements_abonnement WHERE reference=? ORDER BY id DESC LIMIT 1')
      .get(String(reference)) || null;
  }
  return null;
}

/**
 * Applique le résultat vérifié du PSP à la ligne de paiement.
 * Renvoie true si la transaction a été reconnue.
 */
function appliquer(codePsp, paiement, resultat) {
  if (!paiement) return false;

  const montantPsp = Number(resultat.montant || 0);
  const montantOk = !montantPsp || Math.abs(montantPsp - Number(paiement.montant)) < 1;

  db.prepare(`UPDATE paiements_abonnement SET psp=?, psp_statut=?, psp_brut=? WHERE id=?`)
    .run(codePsp, resultat.statut_psp || 'inconnu',
      JSON.stringify({
        statut: resultat.statut_psp, montant: montantPsp, methode: resultat.methode || null,
        carte: resultat.carte || null, reseau: resultat.reseau || null,
        recu: resultat.recu || null, message: resultat.message || null,
        signature_ok: resultat.signature_ok === undefined ? null : !!resultat.signature_ok,
      }).slice(0, 2000),
      paiement.id);

  try {
    if (resultat.statut === 'valide' && paiement.statut !== 'valide') {
      if (!montantOk) {
        A.rejeterPaiement(paiement.id, null,
          `montant ${codePsp} ${montantPsp} FCFA ≠ ${paiement.montant} FCFA attendus`);
        return true;
      }
      A.validerPaiement(paiement.id, null);
      journaliser({
        entreprise_id: paiement.entreprise_id, type: 'plateforme', reference: paiement.reference,
        montant: paiement.montant,
        libelle: `Paiement carte confirmé par ${codePsp} — ${paiement.reference}`,
      });
    } else if (resultat.statut === 'rejete' && paiement.statut === 'en_attente') {
      A.rejeterPaiement(paiement.id, null, resultat.message || `paiement refusé par ${codePsp}`);
    }
  } catch (e) {
    return false;
  }
  return true;
}

/** Fabrique le gestionnaire d'IPN d'un prestataire. */
function ipn(codePsp) {
  return async (req, res) => {
    let resultat;
    try {
      resultat = await PSP.traiterNotification(req.body || {}, codePsp);
    } catch (e) {
      return res.status(200).send('KO'); // on acquitte pour éviter les renvois en boucle
    }
    if (!resultat) return res.status(200).send('KO');
    const paiement = trouverPaiement({
      jeton: resultat.jeton || null,
      reference: resultat.reference || resultat.reference_brute || null,
    });
    if (!paiement) return res.status(200).send('KO');
    const ok = appliquer(codePsp, paiement, resultat);
    res.status(200).send(ok ? 'OK' : 'KO');
  };
}

/** IPN CinetPay : https://…/api/psp/cinetpay/ipn */
router.post('/cinetpay/ipn', ipn('cinetpay'));

/** Callback PayDunya : https://…/api/psp/paydunya/ipn */
router.post('/paydunya/ipn', ipn('paydunya'));

/**
 * Retour navigateur après paiement.
 *
 * ⚠️ Cette route n'ACTIVE JAMAIS l'abonnement. Le simple retour du client sur le
 * site ne prouve rien : seule la notification (IPN) vérifiée auprès du prestataire
 * fait foi. On se contente d'indiquer la référence pour que l'écran Abonnement
 * affiche « confirmation en cours » pendant que le webhook arrive.
 */
router.get('/paydunya/retour', (req, res) => {
  const jeton = String(req.query.token || '');
  const paiement = jeton ? trouverPaiement({ jeton, reference: null }) : null;
  res.redirect(`/#/abonnement?retour=${encodeURIComponent(paiement ? paiement.reference : jeton)}`);
});

/** Retour navigateur après paiement (CinetPay) — même règle : aucune activation ici. */
router.get('/cinetpay/retour', (req, res) => {
  const reference = String(req.query.transaction_id || req.query.cpm_trans_id || '');
  res.redirect(`/#/abonnement?retour=${encodeURIComponent(reference)}`);
});

/** État des prestataires (public, sans donnée sensible) : utile pour l'aide. */
router.get('/etat', (req, res) => res.json({
  actif: PSP.actif(),
  prestataire: PSP.etat().prestataire,
  configure: PSP.estConfigure(),
  prestataires: PSP.liste(),
}));

module.exports = router;
