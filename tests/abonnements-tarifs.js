/**
 * Suite « abonnements & tarifs » — API du propriétaire de la plateforme.
 *
 * Couvre :
 *   • le prestataire de paiement (CinetPay) et son état de configuration ;
 *   • les formules d'abonnement (durée et montant libres, création, refus aux非 propriétaires) ;
 *   • les codes de réduction (création, vérification, application au paiement) ;
 *   • la page Ventes (tous les paiements reçus, filtres, totaux, remises) ;
 *   • le classement des entreprises ;
 *   • les augmentations de tarif ;
 *   • la notification (IPN) du prestataire.
 *
 *   node tests/abonnements-tarifs.js      (serveur démarré : npm start)
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

async function principal() {
  const owner = await login('franck06.nganou02oumbe2004@gmail.com', 'Aspirine46@!');
  const admin = await login('admin@shoppingplus.cm', 'Admin@2026');
  const caisse = await login('caisse1@shoppingplus.cm', 'Caisse@2026');
  verif('Connexions (propriétaire, admin, caissière)', !!(owner && admin && caisse));

  /* Fixtures : on repart d'un état propre (test rejouable). */
  let existantes = await (await fetch(BASE + '/api/plateforme/formules', { headers: H(owner) })).json();
  for (const r of (existantes.reductions || [])) {
    if (['BIENVENUE20', 'INCONNU'].includes(r.code)) {
      await fetch(BASE + '/api/plateforme/reductions/' + r.id, { method: 'DELETE', headers: H(owner) });
    }
  }
  const tri = (existantes.formules || []).find((x) => x.code === 'trimestre');
  if (tri) await fetch(BASE + '/api/plateforme/formules/trimestre', { method: 'DELETE', headers: H(owner) });

  /* --- PSP --- */
  const psp = await (await fetch(BASE + '/api/abonnement/psp', { headers: H(admin) })).json();
  verif('PSP : PayDunya est le prestataire actif par défaut',
    psp.actif === 'paydunya' && psp.prestataire === 'PayDunya', 'actif=' + psp.actif);
  verif('PSP : les deux adaptateurs sont installés',
    (psp.prestataires || []).length === 2
      && (psp.prestataires || []).some((x) => x.code === 'paydunya')
      && (psp.prestataires || []).some((x) => x.code === 'cinetpay'),
    (psp.prestataires || []).map((x) => x.code + '=' + x.configure).join(' '));
  verif('PSP : non configuré sans clés API', psp.configure === false);

  /* --- Bascule de prestataire (PayDunya actif, CinetPay en secours) --- */
  const bascule = await fetch(BASE + '/api/plateforme/psp', {
    method: 'POST', headers: H(owner),
    body: JSON.stringify({ psp_actif: 'cinetpay' }),
  });
  /* La route est un PUT : on vérifie que le mauvais verbe est refusé. */
  verif('PSP : la configuration passe par PUT (POST refusé)', bascule.status === 404, 'HTTP ' + bascule.status);
  const versCinetpay = await (await fetch(BASE + '/api/plateforme/psp', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ psp_actif: 'cinetpay' }),
  })).json();
  verif('PSP : bascule sur CinetPay (secours)',
    versCinetpay.actif === 'cinetpay' && versCinetpay.psp.prestataire === 'CinetPay',
    'actif=' + versCinetpay.actif);
  const pspAdmin2 = await (await fetch(BASE + '/api/abonnement/psp', { headers: H(admin) })).json();
  verif('PSP : la bascule est visible côté entreprise cliente', pspAdmin2.prestataire === 'CinetPay');
  const retourPaydunya = await (await fetch(BASE + '/api/plateforme/psp', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ psp_actif: 'paydunya' }),
  })).json();
  verif('PSP : retour sur PayDunya', retourPaydunya.actif === 'paydunya');
  const invalide = await fetch(BASE + '/api/plateforme/psp', {
    method: 'PUT', headers: H(owner), body: JSON.stringify({ psp_actif: 'inconnu' }),
  });
  verif('PSP : prestataire inconnu refusé', invalide.status === 400, 'HTTP ' + invalide.status);
  const pspFinal = await (await fetch(BASE + '/api/abonnement/psp', { headers: H(admin) })).json();
  verif('PSP : état final = PayDunya', pspFinal.actif === 'paydunya' && pspFinal.prestataire === 'PayDunya');

  /* --- Formules --- */
  let f = await (await fetch(BASE + '/api/abonnement/formules', { headers: H(admin) })).json();
  verif('Formules : mensuel + annuel présentes', f.formules.length >= 2,
    f.formules.map((x) => x.code + '=' + x.montant).join(', '));

  const trimestriel = await fetch(BASE + '/api/plateforme/formules', {
    method: 'POST', headers: H(owner),
    body: JSON.stringify({ code: 'trimestre', libelle: 'Abonnement trimestriel', duree_jours: 90, montant: 32000 }),
  });
  const tj = await trimestriel.json();
  /* 201 si la formule est nouvelle, 200 si elle existait déjà (test rejouable). */
  verif('Formule trimestre : 90 jours / 32 000 FCFA enregistrés',
    (trimestriel.status === 201 || trimestriel.status === 200)
      && !!tj.formule && Number(tj.formule.duree_jours) === 90 && Number(tj.formule.montant) === 32000,
    tj.message);

  const badFormule = await fetch(BASE + '/api/plateforme/formules', {
    method: 'POST', headers: H(admin), body: JSON.stringify({ code: 'x', libelle: 'x', duree_jours: 1, montant: 1 }),
  });
  verif('Formule : refusée à un non-propriétaire (403)', badFormule.status === 403, 'HTTP ' + badFormule.status);

  /* --- Réductions --- */
  const red = await fetch(BASE + '/api/plateforme/reductions', {
    method: 'POST', headers: H(owner),
    body: JSON.stringify({ code: 'BIENVENUE20', libelle: 'Offre de bienvenue', type: 'pourcentage', valeur: 20 }),
  });
  verif('Réduction BIENVENUE20 créée (−20 %)', red.status === 201, (await red.json()).message);

  const controle = await (await fetch(BASE + '/api/abonnement/reduction/verifier', {
    method: 'POST', headers: H(admin), body: JSON.stringify({ code: 'BIENVENUE20', plan: 'mensuel' }),
  })).json();
  verif('Réduction vérifiée : 11 500 → 9 200 FCFA', controle.montant === 9200 && controle.remise === 2300,
    `remise=${controle.remise} net=${controle.montant}`);

  const r = await (await fetch(BASE + '/api/abonnement/reduction/verifier', {
    method: 'POST', headers: H(admin), body: JSON.stringify({ code: 'INCONNU', plan: 'mensuel' }),
  })).json();
  verif('Réduction inconnue : erreur explicite', /inconnu/i.test(r.erreur || ''), r.erreur);

  /* --- Paiement avec réduction --- */
  const dem = await fetch(BASE + '/api/abonnement/demande', {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ service: 'orange_money', plan: 'mensuel', code_reduction: 'BIENVENUE20' }),
  });
  const dj = await dem.json();
  verif('Paiement avec réduction : 9 200 FCFA enregistrés', dj.montant === 9200 && dj.remise === 2300,
    dj.reference ? `${dj.reference} net=${dj.montant} brut=${dj.montant_brut} remise=${dj.remise}` : dj.erreur);
  const paiementId = dj.id;

  /* --- Carte bancaire (PSP non configuré → en attente) --- */
  const carte = await fetch(BASE + '/api/abonnement/payer-carte', {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ plan: 'trimestre', titulaire: 'AWA NKOLO', numero_masque: '**** **** **** 4242', expiration: '12/28' }),
  });
  const cj = await carte.json();
  verif('Paiement carte : formule trimestre 32 000 FCFA', carte.status === 201 && cj.montant === 32000,
    `HTTP ${carte.status} ${cj.reference || cj.erreur}`);
  verif('Paiement carte : PSP non configuré → en attente', cj.psp && cj.psp.configure === false && !cj.url_paiement,
    JSON.stringify(cj.psp));

  /* --- Ventes --- */
  const ventes = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  verif('Ventes : liste consolidée renvoyée', Array.isArray(ventes.paiements) && ventes.paiements.length >= 2,
    ventes.paiements.length + ' ligne(s)');
  verif('Ventes : totaux par statut calculés',
    typeof ventes.totaux.attente === 'number' && typeof ventes.totaux.encaisse === 'number',
    `attente=${ventes.totaux.attente} (${ventes.totaux.nb_attente}) validé=${ventes.totaux.encaisse} (${ventes.totaux.nb_valides})`);
  verif('Ventes : remise accordée visible', typeof ventes.totaux.remise_accordee === 'number',
    ventes.totaux.remise_accordee + ' FCFA');
  const filtrees = await (await fetch(BASE + '/api/plateforme/ventes?statut=en_attente', { headers: H(owner) })).json();
  verif('Ventes : filtre par statut fonctionne',
    filtrees.paiements.every((p) => p.statut === 'en_attente'), filtrees.paiements.length + ' en attente');
  const ventesCaisse = await fetch(BASE + '/api/plateforme/ventes', { headers: H(caisse) });
  verif('Ventes : refusées à la caissière (403)', ventesCaisse.status === 403, 'HTTP ' + ventesCaisse.status);

  /* --- Classement --- */
  const cl = await (await fetch(BASE + '/api/plateforme/classement', { headers: H(owner) })).json();
  verif('Classement : entreprises classées avec score', Array.isArray(cl.classement) && cl.classement.length >= 1,
    cl.classement.map((l) => `#${l.rang} ${l.nom} score=${l.score} ${l.palier}`).join(' | '));
  verif('Classement : montants encaissés agrégés', typeof cl.total_encaisse === 'number', cl.total_encaisse + ' FCFA');

  /* --- Augmentation de tarif --- */
  const aug = await (await fetch(BASE + '/api/plateforme/formules/augmenter', {
    method: 'POST', headers: H(owner), body: JSON.stringify({ type: 'pourcentage', valeur: 10 }),
  })).json();
  verif('Augmentation : +10 % appliquée à toutes les formules', aug.modifs && aug.modifs.length >= 3,
    aug.modifs && aug.modifs.map((m) => `${m.code}: ${m.avant}→${m.apres}`).join(', '));
  const f2 = await (await fetch(BASE + '/api/abonnement/formules', { headers: H(admin) })).json();
  const mensuel2 = f2.formules.find((x) => x.code === 'mensuel');
  verif('Augmentation : le tarif mensuel passe à 12 650 FCFA', mensuel2.montant === 12650, mensuel2.montant + ' FCFA');

  /* --- Restauration des tarifs de démonstration --- */
  for (const [code, montant] of [['mensuel', 11500], ['annuel', 132000], ['trimestre', 32000]]) {
    await fetch(BASE + '/api/plateforme/formules', {
      method: 'POST', headers: H(owner),
      body: JSON.stringify({ code, libelle: code === 'annuel' ? 'Abonnement annuel'
        : code === 'mensuel' ? 'Abonnement mensuel' : 'Abonnement trimestriel',
        duree_jours: code === 'annuel' ? 365 : code === 'mensuel' ? 30 : 90, montant }),
    });
  }
  const f3 = await (await fetch(BASE + '/api/abonnement/formules', { headers: H(admin) })).json();
  verif('Tarifs de démonstration restaurés (11 500 / 132 000)',
    f3.formules.find((x) => x.code === 'mensuel').montant === 11500
    && f3.formules.find((x) => x.code === 'annuel').montant === 132000);

  /* --- Validation propriétaire + compteur de réduction --- */
  const val = await fetch(BASE + '/api/plateforme/paiements/' + paiementId + '/valider', {
    method: 'POST', headers: H(owner), body: JSON.stringify({}),
  });
  verif('Validation propriétaire du paiement réduit (200)', val.status === 200, 'HTTP ' + val.status);
  const reds = await (await fetch(BASE + '/api/plateforme/formules', { headers: H(owner) })).json();
  const b20 = reds.reductions.find((r) => r.code === 'BIENVENUE20');
  verif('Réduction : compteur d’utilisation incrémenté', b20 && b20.utilisations === 1, 'utilisations=' + (b20 && b20.utilisations));
  const ab = await (await fetch(BASE + '/api/abonnement', { headers: H(admin) })).json();
  /* La prolongation est cumulative : les jours d'essai restants ne sont pas perdus. */
  verif('Abonnement actif et prolongé (jours cumulés, ≥ 30)',
    ab.statut === 'actif' && ab.jours_restants >= 30,
    `${ab.statut} ${ab.jours_restants} j restants`);

  /* --- IPN du PSP (route publique) --- */
  const ipn = await fetch(BASE + '/api/psp/cinetpay/ipn', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ cpm_trans_id: 'AB-1999-9999', cpm_amount: '1000', payment_status: 'ACCEPTED' }).toString(),
  });
  verif('IPN : référence inconnue acquittée sans planter (KO)', ipn.status === 200 && (await ipn.text()) === 'KO');
  const ipnPaydunya = await fetch(BASE + '/api/psp/paydunya/ipn', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'data[invoice_token]': 'test_INCONNU', 'data[status]': 'completed' }).toString(),
  });
  verif('IPN PayDunya : jeton inconnu acquitté sans planter (KO)',
    ipnPaydunya.status === 200 && (await ipnPaydunya.text()) === 'KO');
  const ipnEtat = await (await fetch(BASE + '/api/psp/etat')).json();
  verif('IPN : état des prestataires accessible publiquement',
    ipnEtat.actif === 'paydunya' && (ipnEtat.prestataires || []).length === 2,
    'actif=' + ipnEtat.actif);

  /* --- Nettoyage : uniquement les paiements créés par cette suite ---
     (les demandes de paiement déjà présentes en démonstration sont conservées) */
  const referencesTest = [dj.reference, cj.reference].filter(Boolean);
  const apres = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  let supprimes = 0;
  for (const p of apres.paiements.filter((x) => referencesTest.includes(x.reference))) {
    const rep = await fetch(BASE + '/api/plateforme/paiements/' + p.id, { method: 'DELETE', headers: H(owner) });
    if (rep.ok) supprimes += 1;
  }
  verif('Nettoyage : seuls les paiements de la suite sont supprimés', supprimes >= 1, supprimes + ' ligne(s)');
  const fin = await (await fetch(BASE + '/api/plateforme/ventes', { headers: H(owner) })).json();
  verif('Nettoyage : aucune référence de test ne subsiste',
    fin.paiements.every((p) => !referencesTest.includes(p.reference)));
  /* L'essai gratuit de 7 jours est rétabli pour la démonstration. */
  await fetch(BASE + '/api/abonnement/essai', {
    method: 'POST', headers: H(admin), body: JSON.stringify({ jours: 7 }),
  });
  const etat = await (await fetch(BASE + '/api/abonnement', { headers: H(admin) })).json();
  verif('Nettoyage : essai gratuit de 7 jours rétabli', etat.en_essai === true, etat.statut);

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
