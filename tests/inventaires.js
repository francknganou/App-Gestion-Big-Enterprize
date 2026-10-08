/**
 * Suite « inventaires » — comptage physique et rapprochement des stocks.
 *
 * Modèle de droits actuel : SEUL l'administrateur crée, saisit, clôture, applique
 * et SUPPRIME les inventaires (y compris clôturés). Les autres rôles n'ont que la
 * consultation (agent de stock, réception) ou rien du tout (caissière).
 *
 * Couvre :
 *   • droits d'accès (caissière refusée, lecture seule pour stock/réception) ;
 *   • photographie du stock (théorique + recalculé des mouvements) ;
 *   • saisie du comptage et écarts (quantité et valeur) ;
 *   • valorisation (« montant généré ») et marge potentielle ;
 *   • masquage des prix aux comptes sans `prix.consulter` ;
 *   • application des écarts au stock (non rejouable) ;
 *   • clôture puis suppression par l'admin ; export CSV ;
 *   • nettoyage : stock remis à son état de départ, sessions de test purgées.
 *
 *   node tests/inventaires.js      (serveur démarré : npm start)
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
const put = async (t, c, b) => { const r = await fetch(BASE + c, { method: 'PUT', headers: H(t), body: JSON.stringify(b || {}) }); return [r.status, await r.json().catch(() => ({}))]; };
const del = async (t, c) => { const r = await fetch(BASE + c, { method: 'DELETE', headers: H(t) }); return [r.status, await r.json().catch(() => ({}))]; };

async function principal() {
  const admin = await login('admin@shoppingplus.cm', 'Admin@2026');
  const stockeur = await login('stock@shoppingplus.cm', 'Stock@2026');
  const caisse = await login('caisse1@shoppingplus.cm', 'Caisse@2026');
  const reception = await login('reception.mvogmbi@shoppingplus.cm', 'Reception@2026');
  verif('Connexions (admin, agent de stock, caissière, réception)', !!(admin && stockeur && caisse && reception));

  /* ---------------- Droits d'accès ---------------- */
  const [sCaisse] = await get(caisse, '/api/inventaires');
  verif('La caissière n’a pas accès aux inventaires (403)', sCaisse === 403, 'HTTP ' + sCaisse);
  const [sRecep] = await get(reception, '/api/inventaires');
  verif('L’agent de réception consulte les inventaires (lecture seule)', sRecep === 200, 'HTTP ' + sRecep);
  const [sStockCreer] = await post(stockeur, '/api/inventaires', { libelle: 'Interdit', magasin_id: 4 });
  verif('L’agent de stock ne peut plus créer d’inventaire (403)', sStockCreer === 403, 'HTTP ' + sStockCreer);
  const [sRecepPost] = await post(reception, '/api/inventaires', { libelle: 'Interdit' });
  verif('L’agent de réception ne peut pas créer d’inventaire (403)', sRecepPost === 403, 'HTTP ' + sRecepPost);

  /* ---------------- Création par l'administrateur ---------------- */
  const [sCreer, inv] = await post(admin, '/api/inventaires', {
    libelle: 'TEST inventaire automatisé', commentaire: 'suite tests/inventaires.js', magasin_id: 4,
  });
  verif('L’administrateur crée un inventaire (201)', sCreer === 201, 'HTTP ' + sCreer);
  verif('L’inventaire porte sur le magasin demandé (4)',
    inv.inventaire && inv.inventaire.magasin_id === 4, 'magasin_id=' + (inv.inventaire || {}).magasin_id);
  verif('La photographie liste les produits actifs du magasin',
    inv.lignes && inv.lignes.length > 0, (inv.lignes || []).length + ' lignes');

  /* ---------------- Contrôle de la photographie ---------------- */
  const stocksReels = (await get(admin, '/api/stocks?magasin_id=4'))[1];
  const stockDe = (pid) => (stocksReels.find((x) => x.produit_id === pid) || {}).quantite;
  const echantillon = inv.lignes.slice(0, 8);
  verif('Le stock théorique photographié correspond au stock réel du magasin',
    echantillon.every((l) => Math.abs(l.quantite_theorique - (stockDe(l.produit_id) || 0)) < 0.001));
  verif('Chaque ligne porte un stock recalculé depuis les mouvements',
    echantillon.every((l) => typeof l.quantite_calculee === 'number'));
  verif('L’administrateur voit les prix photographiés',
    inv.lignes.every((l) => typeof l.prix_achat === 'number' && typeof l.prix_vente === 'number'));

  /* ---------------- Saisie du comptage (admin) ---------------- */
  const [l1, l2] = inv.lignes;
  const cible1 = Math.max(0, l1.quantite_theorique + 3);
  const cible2 = Math.max(0, l2.quantite_theorique - 2);
  const [sSaisieStock] = await put(stockeur, `/api/inventaires/${inv.inventaire.id}/lignes/${l1.id}`, { quantite_comptee: 1 });
  verif('L’agent de stock ne peut pas saisir de comptage (403)', sSaisieStock === 403, 'HTTP ' + sSaisieStock);

  const [sS1, d1] = await put(admin, `/api/inventaires/${inv.inventaire.id}/lignes/${l1.id}`,
    { quantite_comptee: cible1, note: 'Trouvé en réserve' });
  verif('La saisie du comptage est enregistrée (200)', sS1 === 200, 'HTTP ' + sS1);
  const ligne1 = d1.lignes.find((x) => x.id === l1.id);
  verif('L’écart de quantité est calculé (+3)', ligne1.ecart_quantite === cible1 - l1.quantite_theorique,
    'écart=' + ligne1.ecart_quantite);
  verif('L’écart est valorisé au prix d’achat (vue admin)',
    ligne1.ecart_valeur === Math.round((cible1 - l1.quantite_theorique) * l1.prix_achat),
    ligne1.ecart_valeur + ' FCFA');
  verif('La note de comptage est conservée', ligne1.note === 'Trouvé en réserve');

  await put(admin, `/api/inventaires/${inv.inventaire.id}/lignes/${l2.id}`, { quantite_comptee: cible2 });
  const [, d2] = await get(admin, '/api/inventaires/' + inv.inventaire.id);
  const c2 = d2.comptes;
  verif('Le comptage progresse (2 produits comptés)', c2.nb_comptes === 2, 'nb_comptes=' + c2.nb_comptes);
  verif('Les écarts sont classés : 1 manquant, 1 excédent',
    c2.nb_manquants === 1 && c2.nb_excedents === 1 && c2.nb_ecarts === 2,
    `manq=${c2.nb_manquants} exc=${c2.nb_excedents}`);
  verif('L’écart net de quantité est la somme algébrique',
    Math.abs(c2.ecart_quantite - (cible1 - l1.quantite_theorique + cible2 - l2.quantite_theorique)) < 0.001,
    'écart net=' + c2.ecart_quantite);

  /* ---------------- Masquage des prix pour un compte sans prix.consulter ---------------- */
  const [, dStock] = await get(stockeur, '/api/inventaires/' + inv.inventaire.id);
  const ligneStock = dStock.lignes.find((x) => x.id === l1.id);
  verif('L’écart en FCFA et les prix restent masqués à l’agent de stock',
    ligneStock.ecart_valeur === null && ligneStock.prix_achat === null && ligneStock.valeur_comptee === null);
  verif('Les totaux valorisés sont masqués à l’agent de stock',
    dStock.comptes.valeur_theorique === null && dStock.comptes.valeur_vente_comptee === null);

  /* ---------------- Valorisation (« montant généré ») ---------------- */
  const attendu = Math.round(cible1 * l1.prix_vente) + Math.round(cible2 * l2.prix_vente);
  verif('Le « montant généré » valorise le stock compté au prix de vente',
    c2.valeur_vente_comptee === attendu, `${c2.valeur_vente_comptee} vs ${attendu} FCFA`);
  const attenduAchat = Math.round(cible1 * l1.prix_achat) + Math.round(cible2 * l2.prix_achat);
  verif('La valeur comptée au prix d’achat est correcte',
    c2.valeur_comptee === attenduAchat, `${c2.valeur_comptee} vs ${attenduAchat} FCFA`);
  verif('La marge potentielle = montant généré − valeur comptée',
    c2.marge_potentielle === attendu - attenduAchat, c2.marge_potentielle + ' FCFA');

  /* ---------------- Stock attendu vs recalculé ---------------- */
  verif('Le stock attendu total est la somme des lignes',
    Math.abs(c2.quantite_theorique - inv.lignes.reduce((s, l) => s + l.quantite_theorique, 0)) < 0.001);
  verif('Le stock recalculé total est la somme des mouvements',
    Math.abs(c2.quantite_calculee - inv.lignes.reduce((s, l) => s + l.quantite_calculee, 0)) < 0.001);

  /* ---------------- Clôture refusée tant que tout n'est pas compté ---------------- */
  const [sCloturerTropTot, errCloture] = await post(admin, `/api/inventaires/${inv.inventaire.id}/cloturer`);
  verif('La clôture est refusée tant que des produits ne sont pas comptés (400)',
    sCloturerTropTot === 400, errCloture.erreur);

  /* ---------------- Application des écarts au stock ---------------- */
  const avantAppli = (await get(admin, '/api/stocks?magasin_id=4'))[1];
  const stockAvant1 = avantAppli.find((x) => x.produit_id === l1.produit_id);
  const [sAppliquer, resAppli] = await post(admin, `/api/inventaires/${inv.inventaire.id}/appliquer`);
  verif('Les écarts sont appliqués au stock', sAppliquer === 200 && resAppli.appliques === 2,
    (resAppli.appliques || 0) + ' ajustement(s)');
  const apresAppli = (await get(admin, '/api/stocks?magasin_id=4'))[1];
  const stockApres1 = apresAppli.find((x) => x.produit_id === l1.produit_id);
  verif('Le stock du système rejoint le stock compté',
    stockApres1 && Math.abs(stockApres1.quantite - cible1) < 0.001,
    (stockAvant1 || {}).quantite + ' → ' + (stockApres1 || {}).quantite);
  const [sReappliquer, errRe] = await post(admin, `/api/inventaires/${inv.inventaire.id}/appliquer`);
  verif('Les écarts ne peuvent pas être appliqués deux fois (400)', sReappliquer === 400, errRe.erreur);

  /* ---------------- Export CSV ---------------- */
  const rCsv = await fetch(BASE + `/api/inventaires/${inv.inventaire.id}/export.csv`, { headers: H(admin) });
  const csv = await rCsv.text();
  verif('L’export CSV est produit', rCsv.status === 200
    && /text\/csv/.test(rCsv.headers.get('content-type') || ''), rCsv.headers.get('content-type'));
  verif('L’export CSV contient les colonnes de rapprochement',
    csv.includes('Stock théorique') && csv.includes('Stock compté') && csv.includes('Écart quantité'));
  const rCsvCaisse = await fetch(BASE + `/api/inventaires/${inv.inventaire.id}/export.csv`, { headers: H(caisse) });
  verif('L’export CSV est refusé à la caissière (403)', rCsvCaisse.status === 403, 'HTTP ' + rCsvCaisse.status);

  /* ---------------- Inventaire inconnu ---------------- */
  const [sInconnu] = await get(admin, '/api/inventaires/999999');
  verif('Un inventaire inconnu renvoie 404', sInconnu === 404, 'HTTP ' + sInconnu);

  /* ---------------- Suppression d'un brouillon ---------------- */
  const [sSuppr] = await del(admin, '/api/inventaires/' + inv.inventaire.id);
  verif('Un inventaire en brouillon peut être supprimé', sSuppr === 200, 'HTTP ' + sSuppr);

  /* ---------------- Clôture puis suppression d'un inventaire complet ---------------- */
  const [, inv2] = await post(admin, '/api/inventaires', { libelle: 'TEST clôture automatisée', magasin_id: 4 });
  let tousConformes = true;
  for (const l of inv2.lignes) {
    const [s] = await put(admin, `/api/inventaires/${inv2.inventaire.id}/lignes/${l.id}`,
      { quantite_comptee: l.quantite_theorique });
    if (s !== 200) { tousConformes = false; break; }
  }
  verif('Toutes les lignes peuvent être marquées conformes', tousConformes);
  const [sCloture, dCloture] = await post(admin, `/api/inventaires/${inv2.inventaire.id}/cloturer`);
  verif('La clôture réussit une fois tout compté', sCloture === 200 && dCloture.inventaire.statut === 'cloture',
    'HTTP ' + sCloture);
  const [sApresCloture, errApres] = await put(admin,
    `/api/inventaires/${inv2.inventaire.id}/lignes/${inv2.lignes[0].id}`, { quantite_comptee: 0 });
  verif('Aucune saisie n’est possible après clôture (400)', sApresCloture === 400, errApres.erreur);
  const [sSupprCloture] = await del(admin, '/api/inventaires/' + inv2.inventaire.id);
  verif('L’administrateur peut supprimer un inventaire clôturé (200)', sSupprCloture === 200, 'HTTP ' + sSupprCloture);

  /* ---------------- Nettoyage : remise du stock à son état de départ ---------------- */
  let restaure = true;
  for (const [ligne, cible] of [[l1, cible1], [l2, cible2]]) {
    const original = ligne.quantite_theorique;
    const [s] = await post(admin, '/api/stocks/ajustement', {
      produit_id: ligne.produit_id, magasin_id: 4, quantite_reelle: original,
      motif: 'Restauration après test inventaire',
    });
    if (s !== 200) restaure = false;
  }
  verif('Nettoyage : le stock du magasin 4 est remis à sa valeur d’origine', restaure);

  const { db } = require('../server/db');
  const purge = db.prepare(`DELETE FROM inventaires WHERE entreprise_id = 1 AND libelle LIKE 'TEST %'`).run();
  verif('Nettoyage : les sessions de test sont retirées de la base',
    db.prepare(`SELECT COUNT(*) c FROM inventaires WHERE libelle LIKE 'TEST %'`).get().c === 0,
    purge.changes + ' session(s) supprimée(s)');
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
