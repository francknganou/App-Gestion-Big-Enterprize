/**
 * psp/cinetpay.js — Adaptateur CinetPay.
 *
 * Agrégateur camerounais : cartes Visa/MasterCard et Mobile Money en XAF.
 *   • initier  : POST {base}/v2/payment      → renvoie payment_url
 *   • vérifier : POST {base}/v2/checkPayInit → statut réel de la transaction
 *
 * Configuration (variables d'environnement ou paramètres de la plateforme) :
 *   CINETPAY_APIKEY, CINETPAY_SITE_ID, CINETPAY_ENV (SANDBOX|PRODUCTION),
 *   CINETPAY_NOTIFY_URL, CINETPAY_RETURN_URL, CINETPAY_CANAUX
 */
const { param } = require('../utils');

const BASES = {
  SANDBOX: 'https://api-checkout-sandbox.cinetpay.com',
  PRODUCTION: 'https://api-checkout.cinetpay.com',
};

/** Statuts CinetPay → statuts internes. */
const STATUTS = {
  ACCEPTED: 'valide',
  WAITING: 'en_attente',
  PENDING: 'en_attente',
  CANCELLED: 'rejete',
  REFUSED: 'rejete',
  FAILED: 'rejete',
};

function lireConfig() {
  const brut = (process.env.CINETPAY_ENV || param('cinetpay_env', 'SANDBOX') || 'SANDBOX')
    .toUpperCase().trim();
  const env = BASES[brut] ? brut : 'SANDBOX';
  return {
    apikey: String(process.env.CINETPAY_APIKEY || process.env.CINETPAY_API_KEY
      || param('cinetpay_apikey', '') || '').trim(),
    site_id: String(process.env.CINETPAY_SITE_ID || process.env.CINETPAY_SITEID
      || param('cinetpay_site_id', '') || '').trim(),
    env,
    base: BASES[env],
    notify_url: String(process.env.CINETPAY_NOTIFY_URL || param('cinetpay_notify_url', '') || '').trim(),
    return_url: String(process.env.CINETPAY_RETURN_URL || param('cinetpay_return_url', '') || '').trim(),
    canaux: String(process.env.CINETPAY_CANAUX || param('cinetpay_canaux', 'CARD,MOBILE_MONEY') || 'CARD').trim(),
    marchand: String(param('paiement_marchand', 'INVENTA GESTYPRO')),
  };
}

function estConfigure() {
  const c = lireConfig();
  return !!(c.apikey && c.site_id);
}

function etat() {
  const c = lireConfig();
  return {
    code: 'cinetpay',
    prestataire: 'CinetPay',
    configure: estConfigure(),
    mode: c.env,
    dev_cle: c.apikey ? `…${c.apikey.slice(-4)}` : null,
    site_id: c.site_id || null,
    canaux: c.canaux,
    notify_url: c.notify_url || null,
    return_url: c.return_url || null,
    devise: 'XAF',
    message: estConfigure()
      ? `Paiement par carte activé via CinetPay (${c.env}).`
      : 'CinetPay non configuré : renseignez CINETPAY_APIKEY et CINETPAY_SITE_ID.',
  };
}

/** POST x-www-form-urlencoded (format attendu par CinetPay). */
async function poster(chemin, corps) {
  const res = await fetch(lireConfig().base + chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(corps).toString(),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* réponse non JSON */ }
  if (!res.ok && !json) throw Object.assign(new Error(`PSP : réponse HTTP ${res.status}`), { statut: 502 });
  return json || {};
}

async function initierPaiement({ reference, montant, description, client = {}, metadata = {} }) {
  if (!estConfigure()) throw Object.assign(new Error('CinetPay non configuré'), { statut: 503 });
  const c = lireConfig();
  const montantEntier = Math.max(1, Math.round(Number(montant)));
  if (montantEntier < 100) {
    throw Object.assign(new Error('Le montant minimum accepté par CinetPay est de 100 FCFA'), { statut: 400 });
  }
  const brut = await poster('/v2/payment', {
    apikey: c.apikey,
    site_id: c.site_id,
    transaction_id: reference,
    amount: String(montantEntier),
    currency: 'XAF',
    description: description || `Abonnement ${c.marchand} — ${reference}`,
    channels: c.canaux,
    lang: 'fr',
    customer_id: String(client.id || reference),
    customer_email: client.email || '',
    customer_phone_number: String(client.telephone || '').replace(/\D/g, '') || '',
    customer_first_name: client.prenom || '',
    customer_last_name: client.nom || '',
    customer_country: 'CM',
    customer_city: client.ville || 'Yaounde',
    notify_url: c.notify_url || '',
    return_url: c.return_url || '',
    metadata: JSON.stringify(metadata),
  });
  const d = (brut && brut.data) || {};
  const url = d.payment_url || d.paymentUrl;
  if (!url) {
    throw Object.assign(new Error(brut.message || brut.description || 'CinetPay n’a pas renvoyé de page de paiement'),
      { statut: 502, psp_brut: brut });
  }
  return { url, jeton: d.payment_token || null, brut, mode: c.env, transaction_id: reference };
}

async function verifier(reference) {
  if (!estConfigure()) throw Object.assign(new Error('CinetPay non configuré'), { statut: 503 });
  const c = lireConfig();
  const brut = await poster('/v2/checkPayInit', {
    apikey: c.apikey, site_id: c.site_id, transaction_id: String(reference),
  });
  const d = (brut && brut.data) || {};
  return {
    reference: String(reference),
    statut_psp: d.payment_status || d.paymentStatus || null,
    statut: STATUTS[String(d.payment_status || d.paymentStatus || '').toUpperCase()] || null,
    montant: Number(d.cpm_amount || d.amount || 0),
    methode: d.payment_method || null,
    carte: d.card_number ? String(d.card_number) : null,
    reseau: d.card_brand || null,
    message: d.cpm_error_message || d.payment_message || brut.message || null,
    recu: null,
    brut: d,
  };
}

/** Notification (IPN) : re-vérification systématique via checkPayInit. */
async function traiterNotification(corps = {}) {
  const reference = corps.cpm_trans_id || corps.transaction_id || corps.reference;
  if (!reference) return { ok: false, erreur: 'transaction_id manquant' };
  try {
    const v = await verifier(reference);
    return { ok: true, reference: String(reference), ...v };
  } catch (e) {
    const statutBrut = String(corps.payment_status || corps.cpm_status || '').toUpperCase();
    return {
      ok: !!STATUTS[statutBrut],
      reference: String(reference),
      statut_psp: statutBrut || null,
      statut: STATUTS[statutBrut] || null,
      montant: Number(corps.cpm_amount || 0),
      methode: corps.payment_method || null,
      message: corps.cpm_error_message || e.message,
      brut: corps,
    };
  }
}

module.exports = {
  code: 'cinetpay', nom: 'CinetPay', devise: 'XAF',
  estConfigure, etat, initierPaiement, verifier, traiterNotification, lireConfig, STATUTS,
};
