/**
 * Suite « PSP PayDunya » — adaptateur testé contre un faux serveur PayDunya.
 *
 * Les clés marchand ne sont pas disponibles ici : on fait donc tourner un serveur
 * HTTP local qui imite l'API PayDunya (`PAYDUNYA_BASE` pointe l'adaptateur dessus).
 * Cela vérifie le VRAI code de l'adaptateur :
 *   • les en-têtes d'authentification (MasterKey / PrivateKey / Token) ;
 *   • la structure du corps de facture (invoice.total_amount, store.name,
 *     custom_data.reference, customer enfant de invoice, actions.callback_url) ;
 *   • la lecture de la réponse (response_code '00', response_text = URL, token) ;
 *   • la vérification d'état (GET /checkout-invoice/confirm/{token}) et la
 *     traduction completed/pending/cancelled → validé/en attente/rejeté ;
 *   • la signature SHA-512 de la MasterKey ;
 *   • le traitement d'une notification (callback) avec re-vérification.
 *
 *   node tests/psp-paydunya.js
 */
const http = require('http');

const resultats = [];
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

const CLES = {
  master: 'wQzk9ZwR-Qq9m-0hD0-zpud-je5coGC3FHKW',
  private: 'test_private_rMIdJM3PLLhLjyArx9tF3VURAF5',
  token: 'IivOiOxGJuWhc5znlIiK',
};

/* Le faux serveur consigne les requêtes pour qu'on puisse les inspecter. */
const recus = [];
let reponseProchaine = null;

function demarrerServeur() {
  return new Promise((resoudre) => {
    const serveur = http.createServer((req, res) => {
      let corps = '';
      req.on('data', (c) => { corps += c; });
      req.on('end', () => {
        recus.push({ methode: req.method, url: req.url, entetes: req.headers, corps });
        const r = reponseProchaine || {};
        res.statusCode = r.statut || 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(r.corps || { response_code: '00' }));
      });
    });
    serveur.listen(0, '127.0.0.1', () => {
      const port = serveur.address().port;
      resoudre({ serveur, base: `http://127.0.0.1:${port}/api/v1` });
    });
  });
}

async function principal() {
  const { serveur, base } = await demarrerServeur();

  process.env.PAYDUNYA_MASTER_KEY = CLES.master;
  process.env.PAYDUNYA_PRIVATE_KEY = CLES.private;
  process.env.PAYDUNYA_TOKEN = CLES.token;
  process.env.PAYDUNYA_MODE = 'test';
  process.env.PAYDUNYA_BASE = base;
  process.env.PAYDUNYA_CALLBACK_URL = 'https://exemple.cm/api/psp/paydunya/ipn';
  process.env.PAYDUNYA_STORE = 'INVENTA GESTYPRO';

  const pd = require('../server/psp/paydunya');
  const PSP = require('../server/psp');

  verif('PayDunya : configuré dès que les trois clés sont présentes', pd.estConfigure() === true);
  verif('PayDunya : endpoints de production et de sandbox connus',
    base.endsWith('/api/v1') && pd.lireConfig().base === base, pd.lireConfig().base);

  /* ------------------------- 1. Ouverture de session ------------------------- */
  reponseProchaine = {
    statut: 200,
    corps: {
      response_code: '00',
      response_text: 'https://app.paydunya.com/sandbox-checkout/invoice/test_ABC123',
      description: 'Checkout Invoice Created',
      token: 'test_ABC123',
    },
  };
  recus.length = 0;
  const init = await pd.initierPaiement({
    reference: 'AB-2026-9001',
    montant: 11500,
    description: 'Abonnement mensuel',
    client: { nom: 'NKOLO', prenom: 'Awa', email: 'awa@exemple.cm', telephone: '+237 6 99 11 22 33' },
    metadata: { entreprise_id: 1, formule: 'mensuel' },
  });

  const req0 = recus[0];
  const corps0 = JSON.parse(req0.corps);
  verif('PayDunya : POST sur /checkout-invoice/create',
    req0.methode === 'POST' && req0.url === '/api/v1/checkout-invoice/create', req0.url);
  verif('PayDunya : en-têtes MasterKey, PrivateKey et Token transmis',
    req0.entetes['paydunya-master-key'] === CLES.master
    && req0.entetes['paydunya-private-key'] === CLES.private
    && req0.entetes['paydunya-token'] === CLES.token);
  verif('PayDunya : montant et devise FCFA dans invoice.total_amount',
    corps0.invoice.total_amount === 11500, 'total_amount=' + corps0.invoice.total_amount);
  verif('PayDunya : store.name obligatoire présent',
    corps0.store && corps0.store.name === 'INVENTA GESTYPRO', corps0.store && corps0.store.name);
  verif('PayDunya : notre référence voyague dans custom_data',
    corps0.invoice.custom_data && corps0.invoice.custom_data.reference === 'AB-2026-9001',
    JSON.stringify(corps0.invoice.custom_data));
  verif('PayDunya : le client est un enfant du nœud invoice (pré-remplissage)',
    !!corps0.invoice.customer && corps0.invoice.customer.name === 'Awa NKOLO'
    && corps0.invoice.customer.phone === '237699112233'
    && corps0.customer === undefined,
    JSON.stringify(corps0.invoice.customer));
  verif('PayDunya : l’URL de callback (IPN) est transmise',
    corps0.invoice.actions.callback_url === 'https://exemple.cm/api/psp/paydunya/ipn',
    corps0.invoice.actions.callback_url);
  verif('PayDunya : URL de paiement et jeton extraits de la réponse',
    init.url === 'https://app.paydunya.com/sandbox-checkout/invoice/test_ABC123'
    && init.jeton === 'test_ABC123', init.jeton);

  /* Réponse d'échec : response_code différent de 00 → erreur explicite. */
  reponseProchaine = { statut: 400, corps: { response_code: '11', response_text: 'Invalid private key' } };
  let erreur = null;
  try { await pd.initierPaiement({ reference: 'AB-2026-9002', montant: 1000, client: {} }); }
  catch (e) { erreur = e; }
  verif('PayDunya : échec de création signalé (response_code ≠ 00)',
    !!erreur && /Invalid private key/i.test(erreur.message), erreur && erreur.message);

  /* Montant trop faible. */
  reponseProchaine = null;
  let erreurMontant = null;
  try { await pd.initierPaiement({ reference: 'AB-2026-9003', montant: 50, client: {} }); }
  catch (e) { erreurMontant = e; }
  verif('PayDunya : montant minimum 100 FCFA contrôlé',
    !!erreurMontant && /100 FCFA/.test(erreurMontant.message), erreurMontant && erreurMontant.message);

  /* ------------------------- 2. Vérification d'état ------------------------- */
  const crypto = require('crypto');
  const hash = crypto.createHash('sha512').update(CLES.master, 'utf8').digest('hex');

  const cas = [
    ['completed', 'valide'],
    ['pending', 'en_attente'],
    ['cancelled', 'rejete'],
    ['failed', 'rejete'],
  ];
  for (const [statutPsp, attendu] of cas) {
    reponseProchaine = {
      statut: 200,
      corps: {
        response_code: '00', response_text: 'Transaction Found', hash,
        invoice: { token: 'test_ABC123', total_amount: 11500, description: 'référence AB-2026-9001' },
        custom_data: { reference: 'AB-2026-9001' },
        status: statutPsp, fail_reason: statutPsp === 'cancelled' ? 'Payment cancelled by customer' : '',
        customer: { name: 'Awa NKOLO' },
        receipt_url: 'https://app.paydunya.com/sandbox-checkout/receipt/pdf/test_ABC123.pdf',
      },
    };
    const v = await pd.verifier('test_ABC123');
    verif(`PayDunya : statut « ${statutPsp} » traduit en « ${attendu} »`,
      v.statut === attendu && v.statut_psp === statutPsp, `${v.statut_psp} → ${v.statut}`);
    if (statutPsp === 'completed') {
      verif('PayDunya : montant, reçu et référence relus',
        v.montant === 11500 && v.reference === 'AB-2026-9001'
        && typeof v.recu === 'string' && v.recu.includes('receipt'),
        `montant=${v.montant} ref=${v.reference}`);
      verif('PayDunya : signature SHA-512 de la MasterKey reconnue', v.signature_ok === true);
      verif('PayDunya : GET sur /checkout-invoice/confirm/{token}',
        recus[recus.length - 1].url === '/api/v1/checkout-invoice/confirm/test_ABC123',
        recus[recus.length - 1].url);
    }
  }

  /* Signature invalide : détectée. */
  reponseProchaine = {
    statut: 200,
    corps: {
      response_code: '00', hash: 'mauvais_hash', status: 'completed',
      invoice: { token: 'test_X', total_amount: 1000 },
    },
  };
  const vMauvais = await pd.verifier('test_X');
  verif('PayDunya : signature SHA-512 invalide détectée', vMauvais.signature_ok === false);

  /* ------------------------- 3. Notification (callback) ------------------------- */
  reponseProchaine = {
    statut: 200,
    corps: {
      response_code: '00', response_text: 'Transaction Found', hash,
      invoice: { token: 'test_ABC123', total_amount: 11500 },
      custom_data: { reference: 'AB-2026-9001' },
      status: 'completed',
    },
  };
  const notif = await pd.traiterNotification({
    data: JSON.stringify({ invoice_token: 'test_ABC123', status: 'completed' }),
  });
  verif('PayDunya : notification traitée puis re-vérifiée chez le PSP',
    notif.ok === true && notif.statut === 'valide' && notif.jeton === 'test_ABC123',
    `${notif.statut} jeton=${notif.jeton}`);

  const notifDirecte = await pd.traiterNotification({
    data: { invoice_token: 'test_ABC123', status: 'completed' },
  });
  verif('PayDunya : notification avec nœud « data » objet acceptée',
    notifDirecte.ok === true && notifDirecte.statut === 'valide');

  const notifVide = await pd.traiterNotification({});
  verif('PayDunya : notification sans token refusée', notifVide.ok === false, notifVide.erreur);

  /* ------------------------- 4. Sélecteur de prestataire ------------------------- */
  verif('Sélecteur : PayDunya actif par défaut', PSP.actif() === 'paydunya', PSP.actif());
  verif('Sélecteur : les deux adaptateurs exposent la même interface',
    ['estConfigure', 'etat', 'initierPaiement', 'verifier', 'traiterNotification']
      .every((m) => typeof PSP.fournisseur('paydunya')[m] === 'function'
        && typeof PSP.fournisseur('cinetpay')[m] === 'function'));
  verif('Sélecteur : le prestataire actif est bien PayDunya',
    PSP.courant().code === 'paydunya' && PSP.etat().prestataire === 'PayDunya');
  verif('Sélecteur : bascule par variable d’environnement', (() => {
    process.env.PSP_ACTIF = 'cinetpay';
    const ok = PSP.actif() === 'cinetpay' && PSP.courant().code === 'cinetpay';
    delete process.env.PSP_ACTIF;
    return ok && PSP.actif() === 'paydunya';
  })());
  verif('Sélecteur : prestataire inconnu ignoré (retour au défaut)',
    PSP.fournisseur('stripe') === null);

  serveur.close();
}

principal().then(() => {
  let ok = 0;
  resultats.forEach(([l, r, d]) => {
    if (r) ok += 1;
    console.log((r ? ' ✅ ' : ' ❌ ') + l + (d ? (r ? ' — ' + d : ' → ' + d) : ''));
  });
  console.log('\n' + ok + '/' + resultats.length + ' vérifications réussies.');
  process.exit(ok === resultats.length ? 0 : 1);
}).catch((e) => { console.error('ERREUR', e); process.exit(1); });
