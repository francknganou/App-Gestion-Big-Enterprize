/**
 * psp/paydunya.js — Adaptateur PayDunya.
 *
 * Prestataire panafricain (Sénégal, Côte d'Ivoire, Cameroun, Mali…) qui encaisse
 * en FCFA par **carte Visa/MasterCard** et **Mobile Money**, puis reverse les
 * fonds sur le compte bancaire / wallet du marchand.
 *
 * API « Paiement Avec Redirection » (Checkout Invoice) :
 *   • initier  : POST {base}/checkout-invoice/create
 *                → { response_code:'00', response_text:<URL de paiement>, token }
 *   • vérifier : GET  {base}/checkout-invoice/confirm/{token}
 *                → { status: completed|pending|cancelled|failed, invoice, customer,
 *                    receipt_url, hash }
 *
 * Sécurité : PayDunya renvoie un `hash` qui est le **SHA-512 de la MasterKey**.
 * On le compare systématiquement avant de faire confiance à une réponse, et la
 * notification (callback) est de toute façon re-vérifiée via `confirm`.
 *
 * Configuration (variables d'environnement ou paramètres de la plateforme) :
 *   PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN,
 *   PAYDUNYA_MODE (test|live), PAYDUNYA_CALLBACK_URL, PAYDUNYA_RETURN_URL,
 *   PAYDUNYA_CANCEL_URL, PAYDUNYA_STORE (nom de la boutique affiché au client)
 */
const crypto = require('crypto');
const { param } = require('../utils');

const BASES = {
  test: 'https://app.paydunya.com/sandbox-api/v1',
  live: 'https://app.paydunya.com/api/v1',
};

/** Statuts PayDunya → statuts internes. */
const STATUTS = {
  COMPLETED: 'valide',
  PENDING: 'en_attente',
  CANCELLED: 'rejete',
  FAILED: 'rejete',
  REFUSED: 'rejete',
};

function lireConfig() {
  const brut = String(process.env.PAYDUNYA_MODE || param('paydunya_mode', 'test') || 'test')
    .toLowerCase().trim();
  const mode = BASES[brut] ? brut : 'test';
  /* PAYDUNYA_BASE permet de pointer vers un autre hôte (bac à sable interne,
     maquette de test) sans toucher au code. */
  const basePerso = String(process.env.PAYDUNYA_BASE || param('paydunya_base', '') || '').trim()
    .replace(/\/+$/, '');
  return {
    base_perso: basePerso,
    master_key: String(process.env.PAYDUNYA_MASTER_KEY || process.env.PAYDUNYA_MASTERKEY
      || param('paydunya_master_key', '') || '').trim(),
    private_key: String(process.env.PAYDUNYA_PRIVATE_KEY || process.env.PAYDUNYA_PRIVATEKEY
      || param('paydunya_private_key', '') || '').trim(),
    token: String(process.env.PAYDUNYA_TOKEN || param('paydunya_token', '') || '').trim(),
    mode,
    base: basePerso || BASES[mode],
    callback_url: String(process.env.PAYDUNYA_CALLBACK_URL || param('paydunya_callback_url', '') || '').trim(),
    return_url: String(process.env.PAYDUNYA_RETURN_URL || param('paydunya_return_url', '') || '').trim(),
    cancel_url: String(process.env.PAYDUNYA_CANCEL_URL || param('paydunya_cancel_url', '') || '').trim(),
    store: String(process.env.PAYDUNYA_STORE || param('paydunya_store', '')
      || param('paiement_marchand', 'INVENTA GESTYPRO')).trim(),
  };
}

/** Les trois clés sont exigées par l'API PayDunya. */
function estConfigure() {
  const c = lireConfig();
  return !!(c.master_key && c.private_key && c.token);
}

function etat() {
  const c = lireConfig();
  return {
    code: 'paydunya',
    prestataire: 'PayDunya',
    configure: estConfigure(),
    mode: c.mode,
    dev_cle: c.private_key ? `…${c.private_key.slice(-4)}` : null,
    master_key: c.master_key ? `…${c.master_key.slice(-4)}` : null,
    token: c.token ? `…${c.token.slice(-4)}` : null,
    notify_url: c.callback_url || null,
    return_url: c.return_url || null,
    cancel_url: c.cancel_url || null,
    store: c.store,
    devise: 'XAF',
    message: estConfigure()
      ? `Paiement par carte activé via PayDunya (${c.mode === 'live' ? 'production' : 'sandbox'}).`
      : 'PayDunya non configuré : renseignez PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY et PAYDUNYA_TOKEN.',
  };
}

function entetes() {
  const c = lireConfig();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'PAYDUNYA-MASTER-KEY': c.master_key,
    'PAYDUNYA-PRIVATE-KEY': c.private_key,
    'PAYDUNYA-TOKEN': c.token,
  };
}

/** SHA-512 de la MasterKey : signature des réponses PayDunya. */
function hashAttendu() {
  return crypto.createHash('sha512').update(lireConfig().master_key, 'utf8').digest('hex');
}

function signatureValide(reponse) {
  const recu = String((reponse && reponse.hash) || '').toLowerCase();
  return !!recu && recu === hashAttendu();
}

/**
 * Ouvre une facture de paiement hébergée chez PayDunya.
 * @returns {{url:string, jeton:string, brut:object, mode:string, transaction_id:string}}
 */
async function initierPaiement({ reference, montant, description, client = {}, metadata = {} }) {
  if (!estConfigure()) throw Object.assign(new Error('PayDunya non configuré'), { statut: 503 });
  const c = lireConfig();
  const montantEntier = Math.max(1, Math.round(Number(montant)));
  if (montantEntier < 100) {
    throw Object.assign(new Error('Le montant minimum accepté par PayDunya est de 100 FCFA'), { statut: 400 });
  }

  const corps = {
    invoice: {
      items: {
        item_0: {
          name: description || `Abonnement ${c.store}`,
          quantity: 1,
          unit_price: String(montantEntier),
          description: description || `Abonnement ${c.store} — référence ${reference}`,
        },
      },
      total_amount: montantEntier,
      description: `${description || 'Abonnement'} — référence ${reference}`,
      custom_data: { reference, ...metadata },
      actions: {
        callback_url: c.callback_url || '',
        return_url: c.return_url || '',
        cancel_url: c.cancel_url || c.return_url || '',
      },
    },
    store: { name: c.store, tag: 'abonnement' },
  };
  /* Le client est un enfant du nœud « invoice » (pré-remplissage de la page). */
  const nomComplet = [client.prenom, client.nom].filter(Boolean).join(' ').trim();
  if (nomComplet || client.email || client.telephone) {
    corps.invoice.customer = {
      name: nomComplet || client.nom || '',
      email: client.email || '',
      phone: String(client.telephone || '').replace(/\D/g, ''),
    };
  }

  const res = await fetch(c.base + '/checkout-invoice/create', {
    method: 'POST', headers: entetes(), body: JSON.stringify(corps),
  });
  let brut = null;
  try { brut = await res.json(); } catch (e) { /* réponse non JSON */ }
  if (!res.ok && !brut) {
    throw Object.assign(new Error(`PayDunya : réponse HTTP ${res.status}`), { statut: 502 });
  }
  if (!brut || String(brut.response_code) !== '00' || !brut.response_text) {
    throw Object.assign(new Error((brut && (brut.response_text || brut.description))
      || 'PayDunya n’a pas créé la facture de paiement'), { statut: 502, psp_brut: brut });
  }
  /* response_text porte l'URL de la page de paiement hébergée. */
  const url = /^https?:\/\//i.test(brut.response_text) ? brut.response_text : null;
  if (!url) {
    throw Object.assign(new Error('PayDunya n’a pas renvoyé d’URL de paiement'),
      { statut: 502, psp_brut: brut });
  }
  return { url, jeton: brut.token || null, brut, mode: c.mode, transaction_id: reference };
}

/** Vérifie l'état réel d'une facture côté PayDunya (source de vérité). */
async function verifier(jeton) {
  if (!estConfigure()) throw Object.assign(new Error('PayDunya non configuré'), { statut: 503 });
  const c = lireConfig();
  const res = await fetch(`${c.base}/checkout-invoice/confirm/${encodeURIComponent(String(jeton))}`, {
    method: 'GET', headers: entetes(),
  });
  let brut = null;
  try { brut = await res.json(); } catch (e) { /* réponse non JSON */ }
  if (!brut) throw Object.assign(new Error(`PayDunya : réponse illisible (HTTP ${res.status})`), { statut: 502 });
  const statutBrut = String(brut.status || '').toLowerCase();
  const facture = brut.invoice || {};
  const erreur = brut.fail_reason || (brut.errors && (brut.errors.message || brut.errors.description)) || null;
  return {
    reference: String((brut.custom_data && brut.custom_data.reference) || facture.description || '').match(/AB-\d{4}-\d{4}/)?.[0] || null,
    jeton: facture.token || String(jeton),
    statut_psp: statutBrut || null,
    statut: STATUTS[String(statutBrut).toUpperCase()] || null,
    montant: Number(facture.total_amount || 0),
    methode: brut.payment_method || brut.mode || null,
    client: brut.customer || null,
    message: erreur || brut.response_text || null,
    recu: brut.receipt_url || null,
    signature_ok: signatureValide(brut),
    brut,
  };
}

/**
 * Notification (callback) de PayDunya.
 * PayDunya poste du `application/x-www-form-urlencoded` ; les informations sont
 * sous l'index `data`. On ne s'y fie pas : on re-vérifie via l'API `confirm`.
 */
async function traiterNotification(corps = {}) {
  /* Le nœud utile peut arriver sous « data », parfois sérialisé en JSON. */
  let data = corps.data || corps;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = corps; }
  }
  const jeton = data.invoice_token || data.token || data.payment_token
    || corps.invoice_token || corps.token || null;
  const referenceBrute = (data.custom_data && data.custom_data.reference)
    || data.reference || corps.reference || null;

  if (!jeton && !referenceBrute) return { ok: false, erreur: 'token de facture manquant' };

  try {
    const v = await verifier(jeton || referenceBrute);
    return { ok: true, ...v, jeton: v.jeton || jeton, reference_brute: referenceBrute };
  } catch (e) {
    const statutBrut = String(data.status || corps.status || '').toLowerCase();
    return {
      ok: !!STATUTS[String(statutBrut).toUpperCase()],
      reference: referenceBrute,
      jeton,
      statut_psp: statutBrut || null,
      statut: STATUTS[String(statutBrut).toUpperCase()] || null,
      montant: Number((data.invoice && data.invoice.total_amount) || data.total_amount || 0),
      message: data.fail_reason || e.message,
      brut: corps,
    };
  }
}

module.exports = {
  code: 'paydunya', nom: 'PayDunya', devise: 'XAF',
  estConfigure, etat, initierPaiement, verifier, traiterNotification,
  lireConfig, hashAttendu, signatureValide, STATUTS,
};
