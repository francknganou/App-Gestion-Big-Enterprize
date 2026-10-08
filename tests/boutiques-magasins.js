/**
 * Suite « boutiques & magasins » — modèle de points de vente.
 *
 * Vérifie :
 *   • la création d'un « magasin » (stock seul) avec dotation initiale de stock ;
 *   • qu'un « magasin » ne peut PAS encaisser de vente (400) ;
 *   • la création d'une « boutique » (stock + ventes) qui, elle, encaisse ;
 *   • le prix de vente optionnel à la création produit, donné lors de la vente
 *     (et mémorisé sur le produit) ;
 *   • l'endpoint d'aperçu réseau (ventes du jour / stock / entrées / sorties) ;
 *   • la suppression des points de vente de test.
 *
 *   node tests/boutiques-magasins.js     (serveur démarré : npm start)
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
const del = async (t, c) => { const r = await fetch(BASE + c, { method: 'DELETE', headers: H(t) }); return [r.status, await r.json().catch(() => ({}))]; };

async function principal() {
  const admin = await login('admin@shoppingplus.cm', 'Admin@2026');
  verif('Connexion administrateur', !!admin);

  /* Codes uniques par run + purge complète des restes éventuels (idempotence). */
  const run = Date.now();
  const { db } = require('../server/db');
  const purgeTest = () => {
    db.prepare("SELECT id FROM magasins WHERE code LIKE 'TEST-%'").all().forEach(({ id }) => {
      const vs = db.prepare('SELECT id FROM ventes WHERE magasin_id=?').all(id).map((v) => v.id);
      if (vs.length) db.prepare('DELETE FROM ventes_lignes WHERE vente_id IN (' + vs.map(() => '?') + ')').run(...vs);
      db.prepare('DELETE FROM ventes WHERE magasin_id=?').run(id);
      db.prepare('DELETE FROM mouvements_stock WHERE magasin_id=?').run(id);
      db.prepare('DELETE FROM stocks WHERE magasin_id=?').run(id);
      db.prepare('UPDATE users SET magasin_id=NULL WHERE magasin_id=?').run(id);
      db.prepare('DELETE FROM magasins WHERE id=?').run(id);
    });
    db.prepare("SELECT id FROM produits WHERE nom LIKE 'TEST%'").all().forEach(({ id }) => {
      db.prepare('DELETE FROM ventes_lignes WHERE produit_id=?').run(id);
      db.prepare('DELETE FROM mouvements_stock WHERE produit_id=?').run(id);
      db.prepare('DELETE FROM stocks WHERE produit_id=?').run(id);
      db.prepare('DELETE FROM produits WHERE id=?').run(id);
    });
  };
  purgeTest();

  const produits = (await get(admin, '/api/produits?actif=1'))[1];
  const p1 = produits[0];
  verif('Des produits actifs existent', !!p1, p1 && p1.nom);

  /* --- Produit sans prix de vente --- */
  const [sProd, prodSans] = await post(admin, '/api/produits', {
    nom: 'TEST produit sans prix ' + Date.now(), unite: 'pcs',
  });
  verif('Un produit peut être créé sans prix de vente (201)', sProd === 201, 'HTTP ' + sProd);
  verif('Le produit sans prix a un prix de vente à 0', Number(prodSans.prix_vente) === 0, 'prix_vente=' + prodSans.prix_vente);

  /* --- Création d'un MAGASIN (stock seul) avec dotation --- */
  const [sMag, mag] = await post(admin, '/api/magasins', {
    code: 'TEST-MAG-' + run, nom: 'TEST entrepôt ' + run, type: 'magasin',
    stock: [{ produit_id: p1.id, quantite: 10 }],
  });
  verif('Un magasin de stock se crée avec dotation (201)', sMag === 201, 'HTTP ' + sMag);
  verif('Le magasin créé porte le type « magasin »', mag.type === 'magasin', 'type=' + mag.type);
  let stk = (await get(admin, '/api/stocks?magasin_id=' + mag.id))[1];
  let ligneStock = stk.find((x) => x.produit_id === p1.id);
  verif('La dotation initiale a alimenté le stock du magasin (10)',
    ligneStock && Number(ligneStock.quantite) === 10, ligneStock && ligneStock.quantite);

  /* --- Un magasin ne peut pas encaisser --- */
  const [sVenteMag, errVenteMag] = await post(admin, '/api/ventes', {
    magasin_id: mag.id, lignes: [{ produit_id: p1.id, quantite: 1, prix_unitaire: 500 }],
    mode_paiement: 'especes', montant_paye: 500,
  });
  verif('Un magasin de stock ne peut pas encaisser de vente (400)', sVenteMag === 400, errVenteMag.erreur);

  /* --- Création d'une BOUTIQUE (stock + ventes) avec dotation --- */
  const [sBout, bout] = await post(admin, '/api/magasins', {
    code: 'TEST-BOUT-' + run, nom: 'TEST boutique ' + run, type: 'boutique',
    stock: [{ produit_id: p1.id, quantite: 5 }, { produit_id: prodSans.id, quantite: 4 }],
  });
  verif('Une boutique se crée avec dotation (201)', sBout === 201, 'HTTP ' + sBout);
  verif('La boutique porte le type « boutique »', bout.type === 'boutique', 'type=' + bout.type);

  /* --- Une boutique encaisse ; le prix est donné à la vente et mémorisé --- */
  const [sVente, vente] = await post(admin, '/api/ventes', {
    magasin_id: bout.id,
    lignes: [
      { produit_id: p1.id, quantite: 1 },
      { produit_id: prodSans.id, quantite: 2, prix_unitaire: 750 },
    ],
    mode_paiement: 'especes', montant_paye: 100000,
  });
  verif('La boutique encaisse une vente (200/201)', sVente === 200 || sVente === 201, 'HTTP ' + sVente + ' ' + (vente.erreur || ''));
  const prodMaj = (await get(admin, '/api/produits/' + prodSans.id))[1];
  verif('Le prix donné à la vente est mémorisé sur le produit (750)',
    Number(prodMaj.prix_vente) === 750, 'prix_vente=' + prodMaj.prix_vente);

  /* --- Aperçu réseau --- */
  const [sApercu, apercu] = await get(admin, '/api/magasins/apercu');
  verif('L’aperçu réseau répond (200)', sApercu === 200, 'HTTP ' + sApercu);
  const ligneMag = (apercu.points || []).find((x) => x.id === mag.id);
  const ligneBout = (apercu.points || []).find((x) => x.id === bout.id);
  verif('L’aperçu distingue magasins et boutiques',
    ligneMag && ligneMag.type === 'magasin' && ligneBout && ligneBout.type === 'boutique');
  verif('Le magasin montre ses entrées du jour (10)',
    ligneMag && Number(ligneMag.entrees_jour) >= 10, ligneMag && ligneMag.entrees_jour);
  verif('La boutique montre sa vente du jour',
    ligneBout && Number(ligneBout.ventes_jour_nb) >= 1, ligneBout && ligneBout.ventes_jour_nb);

  /* --- Suppression des points de test --- */
  const [sSupMag] = await del(admin, '/api/magasins/' + mag.id);
  const [sSupBout] = await del(admin, '/api/magasins/' + bout.id);
  purgeTest();   // retire aussi les dépendances pour garder une base de démo propre
  verif('Les points de vente de test sont supprimés',
    sSupMag === 200 && sSupBout === 200
    && db.prepare("SELECT COUNT(*) c FROM magasins WHERE code LIKE 'TEST-%'").get().c === 0,
    `mag=${sSupMag} bout=${sSupBout}`);

  /* --- Nettoyage produit de test --- */
  purgeTest();
  verif('Nettoyage : produit de test supprimé',
    !db.prepare('SELECT id FROM produits WHERE id=?').get(prodSans.id));
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
