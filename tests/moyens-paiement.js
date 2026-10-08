/**
 * Suite « moyens de paiement & retour navigateur » — API.
 *
 * Couvre deux exigences du propriétaire de la plateforme :
 *
 *  A. Le propriétaire peut activer ou désactiver chaque moyen de paiement.
 *     Un moyen désactivé disparaît de l'écran de paiement de l'entreprise et
 *     toute demande réglée par ce moyen est refusée. Il doit toujours rester
 *     au moins un moyen actif.
 *
 *  B. Le retour du navigateur après un paiement n'active JAMAIS l'abonnement :
 *     seule la notification (webhook) vérifiée auprès du prestataire fait foi.
 *     La procédure d'intégration du PSP l'exige explicitement.
 *
 *   node tests/moyens-paiement.js     (serveur démarré : npm start)
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
const CODES = ['orange_money', 'mtn_momo', 'mastercard'];

async function principal() {
  const owner = await login('franck06.nganou02oumbe2004@gmail.com', 'Aspirine46@!');
  const admin = await login('admin@shoppingplus.cm', 'Admin@2026');
  verif('Connexions (propriétaire, administrateur)', !!(owner && admin));

  /* ================= A. Activation / désactivation par le propriétaire ================= */
  let r = await fetch(BASE + '/api/plateforme/moyens-paiement', { headers: H(owner) });
  let d = await r.json();
  verif('Le propriétaire lit la liste des moyens de paiement (200)', r.status === 200, 'HTTP ' + r.status);
  verif('Les trois moyens sont proposés',
    CODES.every((c) => (d.moyens || []).some((m) => m.code === c)),
    (d.moyens || []).map((m) => m.code).join(', '));
  verif('Les trois moyens sont actifs par défaut',
    (d.moyens || []).every((m) => m.actif === true));
  verif('Les coordonnées de paiement sont fournies avec l’état actif',
    d.coordonnees && CODES.every((c) => d.coordonnees[c] && d.coordonnees[c].actif === true));
  verif('Les numéros Mobile Money de la plateforme sont inchangés',
    d.coordonnees.orange_money.numero === '693007397' && d.coordonnees.mtn_momo.numero === '654324282',
    d.coordonnees.orange_money.numero + ' / ' + d.coordonnees.mtn_momo.numero);

  r = await fetch(BASE + '/api/plateforme/moyens-paiement', { headers: H(admin) });
  verif('L’administrateur d’une entreprise ne gère pas les moyens de paiement (403)',
    r.status === 403, 'HTTP ' + r.status);

  /* --- Désactivation d'un moyen --- */
  r = await fetch(BASE + '/api/plateforme/moyens-paiement', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ mtn_momo: false }),
  });
  d = await r.json();
  verif('Le propriétaire désactive MTN MoMo (200)', r.status === 200, 'HTTP ' + r.status);
  verif('MTN MoMo est marqué inactif, les autres restent actifs',
    (d.moyens || []).every((m) => m.actif === (m.code !== 'mtn_momo')),
    (d.moyens || []).map((m) => m.code + '=' + m.actif).join(' '));

  /* --- Répercussion côté entreprise cliente --- */
  let abo = await (await fetch(BASE + '/api/abonnement', { headers: H(admin) })).json();
  verif('L’écran d’abonnement de l’entreprise voit MTN MoMo désactivé',
    abo.paiement && abo.paiement.services.mtn_momo.actif === false
    && abo.paiement.services.orange_money.actif === true);

  /* --- Une demande réglée par un moyen désactivé est refusée --- */
  r = await fetch(BASE + '/api/abonnement/demande', {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ service: 'mtn_momo', plan: 'mensuel', telephone_payeur: '677000111', nom_payeur: 'Test' }),
  });
  d = await r.json();
  verif('Une demande réglée par un moyen désactivé est refusée (400)', r.status === 400, d.erreur);
  verif('Le refus explique qu’il faut choisir un autre moyen',
    /désactivé|autre moyen/i.test(d.erreur || ''), d.erreur);

  /* --- Garde-fous --- */
  r = await fetch(BASE + '/api/plateforme/moyens-paiement', {
    method: 'PUT', headers: H(owner),
    body: JSON.stringify({ orange_money: false, mastercard: false }),
  });
  d = await r.json();
  verif('On ne peut pas désactiver le dernier moyen restant (400)', r.status === 400, d.erreur);

  r = await fetch(BASE + '/api/plateforme/moyens-paiement', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ virement_bancaire: true }),
  });
  d = await r.json();
  verif('Un code de moyen inconnu est refusé (400)', r.status === 400, d.erreur);

  r = await fetch(BASE + '/api/plateforme/moyens-paiement', {
    method: 'PUT', headers: H(admin), body: JSON.stringify({ mtn_momo: true }),
  });
  verif('L’administrateur d’une entreprise ne peut rien modifier (403)', r.status === 403, 'HTTP ' + r.status);

  /* --- Réactivation --- */
  r = await fetch(BASE + '/api/plateforme/moyens-paiement', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ mtn_momo: true }),
  });
  d = await r.json();
  verif('Le propriétaire réactive MTN MoMo (200)', r.status === 200, 'HTTP ' + r.status);
  abo = await (await fetch(BASE + '/api/abonnement', { headers: H(admin) })).json();
  verif('L’écran d’abonnement retrouve les trois moyens actifs',
    abo.paiement && CODES.every((c) => abo.paiement.services[c].actif === true));

  /* ================= B. Le retour navigateur n'active jamais l'abonnement ================= */
  const avant = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  const cible = (avant.paiements || []).find((p) => p.reference === 'AB-2026-0003' && p.statut === 'en_attente');
  verif('Fixture : un paiement carte en attente existe (AB-2026-0003)', !!cible,
    cible ? cible.reference + ' / ' + cible.statut : 'introuvable');

  const retourPaydunya = await fetch(BASE + '/api/psp/paydunya/retour?token=test_demo_ticket_0003',
    { redirect: 'manual' });
  const locPaydunya = retourPaydunya.headers.get('location') || '';
  verif('Le retour PayDunya redirige vers l’écran Abonnement',
    [301, 302, 303, 307, 308].includes(retourPaydunya.status) && locPaydunya.includes('/#/abonnement?retour='),
    retourPaydunya.status + ' → ' + locPaydunya);
  verif('Le retour PayDunya rappelle la référence du paiement',
    locPaydunya.includes('AB-2026-0003'), locPaydunya);

  const apresPaydunya = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  const p1 = (apresPaydunya.paiements || []).find((p) => p.reference === 'AB-2026-0003');
  verif('Le retour PayDunya n’a PAS activé l’abonnement (paiement toujours en attente)',
    p1 && p1.statut === 'en_attente', p1 && p1.statut);

  const retourCinetpay = await fetch(BASE + '/api/psp/cinetpay/retour?transaction_id=AB-2026-0003',
    { redirect: 'manual' });
  const locCinetpay = retourCinetpay.headers.get('location') || '';
  verif('Le retour CinetPay redirige aussi sans activer',
    [301, 302, 303, 307, 308].includes(retourCinetpay.status) && locCinetpay.includes('/#/abonnement?retour='),
    retourCinetpay.status + ' → ' + locCinetpay);

  const apresCinetpay = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  const p2 = (apresCinetpay.paiements || []).find((p) => p.reference === 'AB-2026-0003');
  verif('Le retour CinetPay n’a PAS activé l’abonnement', p2 && p2.statut === 'en_attente', p2 && p2.statut);

  const retourInconnu = await fetch(BASE + '/api/psp/paydunya/retour?token=jeton_inexistant',
    { redirect: 'manual' });
  verif('Un retour avec un jeton inconnu ne provoque pas d’erreur (302)',
    [301, 302, 303, 307, 308].includes(retourInconnu.status), 'HTTP ' + retourInconnu.status);

  const etat = await (await fetch(BASE + '/api/abonnement', { headers: H(admin) })).json();
  verif('L’entreprise de démonstration reste en période d’essai',
    etat.statut === 'essai', etat.statut);

  const final = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  verif('Les trois paiements de démonstration sont préservés',
    (final.paiements || []).length === 3 && final.totaux.attente === 149100,
    (final.paiements || []).length + ' paiement(s), ' + final.totaux.attente + ' FCFA en attente');
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
