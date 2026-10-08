/**
 * Suite « messages & expiration » — messagerie interne et cycle d'abonnement.
 *
 * Messagerie :
 *   • le propriétaire écrit aux administrateurs de toutes les entreprises ;
 *   • l'administrateur écrit aux profils de son entreprise ;
 *   • un compte (caissière) écrit à son administrateur ;
 *   • chaque envoi est consigné dans le journal des emails (type « message ») ;
 *   • lecture / accusé de lecture.
 *
 * Expiration :
 *   • abonnement expiré → les écritures sont refusées (402) ;
 *   • un message « mettez à jour votre abonnement » arrive à l'administrateur ;
 *   • seul le propriétaire réactive (geste), puis l'entreprise refonctionne.
 *
 *   node tests/messages.js     (serveur démarré : npm start)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const resultats = [];
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

async function login(email, mot_de_passe) {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, mot_de_passe }),
  });
  return (await r.json()).token;
}
const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' });
const get = async (t, c) => { const r = await fetch(BASE + c, { headers: H(t) }); return [r.status, await r.json().catch(() => ({}))]; };
const post = async (t, c, b) => { const r = await fetch(BASE + c, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) }); return [r.status, await r.json().catch(() => ({}))]; };

async function principal() {
  const owner = await login('franck06.nganou02oumbe2004@gmail.com', 'Aspirine46@!');
  const admin = await login('admin@shoppingplus.cm', 'Admin@2026');
  const caisse = await login('caisse1@shoppingplus.cm', 'Caisse@2026');
  verif('Connexions (propriétaire, admin, caissière)', !!(owner && admin && caisse));

  /* ---------- Destinataires selon le rôle ---------- */
  const [, mOwner] = await get(owner, '/api/messages');
  verif('Le propriétaire voit les admins de toutes les entreprises',
    (mOwner.destinataires || []).some((d) => d.email === 'admin@shoppingplus.cm'),
    (mOwner.destinataires || []).map((d) => d.email).join(', '));

  const [, mAdmin] = await get(admin, '/api/messages');
  verif('L’administrateur voit les profils de son entreprise',
    (mAdmin.destinataires || []).some((d) => d.email === 'caisse1@shoppingplus.cm')
    && (mAdmin.destinataires || []).some((d) => d.email === 'stock@shoppingplus.cm'));

  const [, mCaisse] = await get(caisse, '/api/messages');
  verif('La caissière voit son administrateur comme destinataire',
    (mCaisse.destinataires || []).some((d) => d.email === 'admin@shoppingplus.cm'));

  /* ---------- Envoi propriétaire -> admin ---------- */
  const adminId = (mOwner.destinataires || []).find((d) => d.email === 'admin@shoppingplus.cm').id;
  const [sSend1] = await post(owner, '/api/messages', {
    a_user_id: adminId, objet: 'Bienvenue sur la plateforme', corps: 'Merci de vérifier vos boutiques.',
  });
  verif('Le propriétaire envoie un message à l’admin (201)', sSend1 === 201, 'HTTP ' + sSend1);

  const [, mAdmin2] = await get(admin, '/api/messages');
  const recu = (mAdmin2.recus || []).find((m) => m.objet === 'Bienvenue sur la plateforme');
  verif('L’admin reçoit le message du propriétaire', !!recu);
  verif('Le message reçu est marqué « nouveau » (non lu)', recu && recu.lu === 0);

  const [sLire] = await post(admin, `/api/messages/${recu.id}/lire`);
  const [, mAdmin3] = await get(admin, '/api/messages');
  verif('L’accusé de lecture fonctionne',
    sLire === 200 && (mAdmin3.recus || []).find((m) => m.id === recu.id).lu === 1);

  /* ---------- Envoi admin -> caissière, et réponse ---------- */
  const caisseId = (mAdmin.destinataires || []).find((d) => d.email === 'caisse1@shoppingplus.cm').id;
  const [sSend2] = await post(admin, '/api/messages', {
    a_user_id: caisseId, objet: 'Consigne de caisse', corps: 'Pensez à clôturer le tiroir ce soir.',
  });
  verif('L’admin envoie un message à la caissière (201)', sSend2 === 201, 'HTTP ' + sSend2);
  const [, mCaisse2] = await get(caisse, '/api/messages');
  verif('La caissière reçoit la consigne', (mCaisse2.recus || []).some((m) => m.objet === 'Consigne de caisse'));

  /* ---------- Destinataire non autorisé ---------- */
  const [sInterdit] = await post(admin, '/api/messages', {
    a_user_id: 999999, objet: 'Test', corps: 'Vers un compte hors périmètre.',
  });
  verif('Un destinataire hors périmètre est refusé (400)', sInterdit === 400, 'HTTP ' + sInterdit);

  /* ---------- Consignation email ---------- */
  const { db } = require('../server/db');
  const mail = db.prepare(`SELECT COUNT(*) c FROM mails_envoyes WHERE type='message' AND destinataire='admin@shoppingplus.cm'`).get().c;
  verif('Le message est aussi consigné dans le journal des emails', mail >= 1, mail + ' ligne(s)');

  /* ---------- Expiration + alerte + réactivation ---------- */
  const avant = db.prepare('SELECT statut, date_fin FROM abonnements WHERE entreprise_id=1').get();
  db.prepare("UPDATE abonnements SET statut='expire', date_fin='2026-01-01' WHERE entreprise_id=1").run();

  const [sBloque, errBloque] = await post(admin, '/api/produits', { nom: 'Interdit' });
  verif('Abonnement expiré : les écritures sont refusées (402)', sBloque === 402, errBloque.code || errBloque.erreur);

  const [, mAdminExp] = await get(admin, '/api/messages');
  verif('Un message « abonnement expiré » arrive à l’administrateur',
    (mAdminExp.recus || []).some((m) => /Abonnement expiré/.test(m.objet)),
    (mAdminExp.recus || []).map((m) => m.objet).slice(0, 3).join(' | '));

  const [sReact] = await post(owner, '/api/plateforme/entreprises/1/abonnement', { jours: 7 });
  verif('Le propriétaire réactive l’entreprise (geste)', sReact === 200, 'HTTP ' + sReact);

  const [sOkApres] = await post(admin, '/api/produits', { nom: 'TEST produit réactivé ' + Date.now() });
  verif('Après réactivation, l’admin peut à nouveau écrire', sOkApres === 201, 'HTTP ' + sOkApres);

  /* ---------- Nettoyage ---------- */
  db.prepare('UPDATE abonnements SET statut=?, date_fin=? WHERE entreprise_id=1').run(avant.statut, avant.date_fin);
  const restaure = db.prepare('SELECT statut, date_fin FROM abonnements WHERE entreprise_id=1').get();
  verif('Nettoyage : abonnement de démo restauré', restaure.statut === avant.statut && restaure.date_fin === avant.date_fin,
    restaure.statut + ' / ' + restaure.date_fin);
  const prod = db.prepare("SELECT id FROM produits WHERE nom LIKE 'TEST produit réactivé%'").get();
  if (prod) db.prepare('UPDATE produits SET actif=0 WHERE id=?').run(prod.id);
  db.prepare("DELETE FROM messages WHERE objet IN ('Bienvenue sur la plateforme','Consigne de caisse','Test') OR objet LIKE 'Abonnement expiré%'").run();
  verif('Nettoyage : messages de test supprimés',
    db.prepare("SELECT COUNT(*) c FROM messages WHERE objet IN ('Bienvenue sur la plateforme','Consigne de caisse','Test') OR objet LIKE 'Abonnement expiré%'").get().c === 0);
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
