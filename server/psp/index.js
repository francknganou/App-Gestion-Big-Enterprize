/**
 * psp/index.js — Sélecteur de prestataire de paiement (PSP).
 *
 * Deux adaptateurs cohabitent :
 *   • **PayDunya** (par défaut) — cartes Visa/MasterCard et Mobile Money en FCFA ;
 *   • **CinetPay** — agrégateur camerounais, conservé en secours.
 *
 * Le prestataire actif se choisit :
 *   1. par la variable d'environnement `PSP_ACTIF` (paydunya | cinetpay) ;
 *   2. sinon par le paramètre de plateforme `psp_actif` (réglable par le
 *      propriétaire dans « Abonnements & tarifs → Prestataire de paiement ») ;
 *   3. sinon `paydunya`.
 *
 * Tous les adaptateurs exposent la même interface :
 *   estConfigure(), etat(), initierPaiement(), verifier(), traiterNotification().
 */
const { param } = require('../utils');
const paydunya = require('./paydunya');
const cinetpay = require('./cinetpay');

const FOURNISSEURS = { paydunya, cinetpay };
const PAR_DEFAUT = 'paydunya';

/** Code du prestataire actif. */
function actif() {
  const demande = String(process.env.PSP_ACTIF || param('psp_actif', PAR_DEFAUT) || PAR_DEFAUT)
    .toLowerCase().trim();
  return FOURNISSEURS[demande] ? demande : PAR_DEFAUT;
}

/** Adaptateur actif. */
function courant() {
  return FOURNISSEURS[actif()];
}

/** Adaptateur par son code (null si inconnu). */
function fournisseur(code) {
  return FOURNISSEURS[String(code || '').toLowerCase()] || null;
}

/** Le prestataire actif est-il prêt à débiter réellement ? */
function estConfigure() {
  return courant().estConfigure();
}

/** État du prestataire actif (jamais les clés elles-mêmes). */
function etat() {
  return courant().etat();
}

/** État de tous les prestataires installés, pour l'écran de configuration. */
function liste() {
  return Object.values(FOURNISSEURS).map((f) => f.etat());
}

/** Ouvre une session de paiement chez le prestataire actif. */
async function initierPaiement(args) {
  return courant().initierPaiement(args);
}

/** Vérifie une transaction chez le prestataire actif (référence ou jeton). */
async function verifier(id) {
  return courant().verifier(id);
}

/** Vérifie une transaction chez un prestataire précis (utilisé par les IPN). */
async function verifierChez(code, id) {
  const f = fournisseur(code);
  if (!f) throw Object.assign(new Error('Prestataire inconnu'), { statut: 400 });
  return f.verifier(id);
}

/** Traite une notification (IPN) d'un prestataire précis. */
async function traiterNotification(corps, code) {
  const f = fournisseur(code) || courant();
  const r = await f.traiterNotification(corps || {});
  return { ...r, psp: f.code };
}

module.exports = {
  FOURNISSEURS,
  actif, courant, fournisseur, liste,
  estConfigure, etat, initierPaiement, verifier, verifierChez, traiterNotification,
};
