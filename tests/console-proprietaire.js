/**
 * Suite « console du propriétaire » — interface (jsdom).
 *
 * Vérifie les écrans réservés au propriétaire de la plateforme :
 *   • Ventes d'abonnements (tous les paiements reçus, filtres, export) ;
 *   • Classement des entreprises (podium, score, tri) ;
 *   • Abonnements & tarifs (formules à durée/montant libres, réductions,
 *     augmentations, configuration du prestataire CinetPay) ;
 * et, côté entreprise cliente, les formules dynamiques + le code de réduction.
 *
 *   node tests/console-proprietaire.js    (serveur démarré : npm start)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const resultats = [];
const log = (nom, cond, detail) => resultats.push([nom, !!cond, detail]);
const cond = (f, m) => new Promise((res, rej) => {
  let i = 0;
  (function t() { const v = f(); if (v) return res(v); if (++i > 150) return rej(new Error(m)); setTimeout(t, 100); })();
});
async function boot(email, mdp, erreurs) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => erreurs.push(String(e.message).split('\n')[0]));
  vc.on('error', (m) => erreurs.push('console: ' + String(m).slice(0, 160)));
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, BASE), o);
  w.alert = () => {};
  w.prompt = () => 'test';
  w.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {} });
  await cond(() => w.App && w.document.querySelector('#form-connexion'), 'écran de connexion');
  const f = w.document.getElementById('form-connexion');
  f.querySelector('[name=email]').value = email;
  f.querySelector('[name=mot_de_passe]').value = mdp;
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await cond(() => w.document.querySelector('nav a'), 'coquille');
  return w;
}

async function principal() {
  /* ---------------- Propriétaire ---------------- */
  const errsO = [];
  const o = await boot('franck06.nganou02oumbe2004@gmail.com', 'Aspirine46@!', errsO);
  const menus = [...o.document.querySelectorAll('nav a')].map((a) => a.dataset.vue);
  log('Menu propriétaire : page Ventes présente', menus.includes('plateforme-ventes'), menus.join(', '));
  log('Menu propriétaire : page Classement présente', menus.includes('plateforme-classement'));
  log('Menu propriétaire : page Abonnements & tarifs présente', menus.includes('plateforme-tarifs'));
  log('Menu propriétaire : aucune page de gestion d’entreprise',
    !menus.some((m) => ['caisse', 'stocks', 'produits', 'ventes', 'rh'].includes(m)));

  await o.App.monter('plateforme-ventes');
  await cond(() => o.document.querySelector('#v-export'), 'page ventes');
  let z = o.document.getElementById('contenu');
  log('Ventes : KPI « Déjà encaissé » affiché', /Déjà encaissé/.test(z.textContent));
  log('Ventes : filtres (statut, service, entreprise, dates)',
    !!z.querySelector('[name=statut]') && !!z.querySelector('[name=service]')
    && !!z.querySelector('[name=entreprise_id]') && !!z.querySelector('[name=depuis]'));
  log('Ventes : export CSV disponible', /Exporter en CSV/.test(z.textContent));
  z.querySelector('[name=statut]').value = 'en_attente';
  z.querySelector('#v-filtrer').click();
  await new Promise((r) => setTimeout(r, 900));
  z = o.document.getElementById('contenu');
  log('Ventes : filtre appliqué sans erreur', /ligne\(s\) affichée/.test(z.textContent),
    (z.textContent.match(/(\d+) ligne\(s\) affichée/) || [])[0]);

  await o.App.monter('plateforme-classement');
  await cond(() => o.document.querySelector('#c-tri'), 'page classement');
  z = o.document.getElementById('contenu');
  log('Classement : podium affiché', /Podium/.test(z.textContent));
  log('Classement : tableau avec score et palier', /Score/.test(z.textContent) && /Platine|Or|Argent|Bronze/.test(z.textContent));
  log('Classement : sélecteur de tri', o.document.querySelectorAll('#c-tri option').length >= 5,
    o.document.querySelectorAll('#c-tri option').length + ' critères');
  o.document.querySelector('#c-tri').value = 'total_encaisse';
  o.document.querySelector('#c-tri').dispatchEvent(new o.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  log('Classement : tri par montant encaissé', /Trier par : Montant encaissé/.test(o.document.querySelector('#c-tri').textContent));

  await o.App.monter('plateforme-tarifs');
  await cond(() => o.document.querySelector('#t-nouvelle'), 'page tarifs');
  z = o.document.getElementById('contenu');
  log('Tarifs : formules listées avec durée et montant', /Formules proposées aux clients/.test(z.textContent)
    && /Abonnement mensuel/.test(z.textContent));
  log('Tarifs : bouton « Augmenter les tarifs »', !!z.querySelector('#t-augmenter'));
  log('Tarifs : section codes de réduction', /Codes de réduction/.test(z.textContent));
  log('Tarifs : état du prestataire affiché', /CinetPay|Débit carte/.test(z.textContent));
  z.querySelector('#t-nouvelle').click();
  await new Promise((r) => setTimeout(r, 500));
  const modF = [...o.document.querySelectorAll('.voile')].pop();
  log('Tarifs : modale « nouvelle formule » (durée + montant libres)',
    !!modF && !!modF.querySelector('[name=duree_jours]') && !!modF.querySelector('[name=montant]'));
  modF.querySelector('[data-fermer]').click();
  await new Promise((r) => setTimeout(r, 200));
  z = o.document.getElementById('contenu');
  z.querySelector('#t-reduc').click();
  await new Promise((r) => setTimeout(r, 500));
  const modR = [...o.document.querySelectorAll('.voile')].pop();
  log('Tarifs : modale « nouveau code de réduction »',
    !!modR && !!modR.querySelector('[name=valeur]') && !!modR.querySelector('[name=formule_code]'));
  modR.querySelector('[data-fermer]').click();
  await new Promise((r) => setTimeout(r, 200));
  z.querySelector('#t-augmenter').click();
  await new Promise((r) => setTimeout(r, 500));
  const modA = [...o.document.querySelectorAll('.voile')].pop();
  log('Tarifs : modale d’augmentation (toutes formules ou une seule)',
    !!modA && !!modA.querySelector('[name=valeur]')
    && /Toutes les formules/.test(modA.querySelector('[name=code]').textContent));
  modA.querySelector('[data-fermer]').click();
  z.querySelector('#t-psp').click();
  await new Promise((r) => setTimeout(r, 500));
  const modP = [...o.document.querySelectorAll('.voile')].pop();
  log('Tarifs : sélecteur du prestataire actif (PayDunya / CinetPay)',
    !!modP && !!modP.querySelector('[name=psp_actif]')
    && [...modP.querySelectorAll('[name=psp_actif] option')].map((o) => o.value).join(',') === 'paydunya,cinetpay');
  log('Tarifs : clés PayDunya (master, privée, token) + mode',
    !!modP && !!modP.querySelector('[name=paydunya_master_key]')
    && !!modP.querySelector('[name=paydunya_private_key]')
    && !!modP.querySelector('[name=paydunya_token]')
    && !!modP.querySelector('[name=paydunya_mode]'));
  log('Tarifs : CinetPay conservé en secours',
    !!modP && !!modP.querySelector('[name=cinetpay_apikey]') && !!modP.querySelector('[name=cinetpay_site_id]'));
  modP.querySelector('[data-fermer]').click();
  log('Propriétaire : aucune erreur JavaScript', errsO.length === 0, errsO.slice(0, 2).join(' | '));
  o.close();

  /* ---------------- Administrateur (client) ---------------- */
  const errsA = [];
  const a = await boot('admin@shoppingplus.cm', 'Admin@2026', errsA);
  await a.App.monter('abonnement');
  await cond(() => a.document.querySelector('#recap-montant'), 'page abonnement');
  let za = a.document.getElementById('contenu');
  const plans = [...za.querySelectorAll('input[name=plan]')].map((i) => i.value);
  log('Abonnement : formules dynamiques du propriétaire', plans.length >= 3, plans.join(', '));
  log('Abonnement : champ code de réduction', !!za.querySelector('#code-reduction')
    && !!za.querySelector('#verif-reduction'));
  /* On choisit explicitement la formule mensuelle avant d'appliquer le code. */
  za.querySelector('input[name=plan][value=mensuel]').click();
  await new Promise((r) => setTimeout(r, 500));
  za = a.document.getElementById('contenu');
  za.querySelector('#code-reduction').value = 'BIENVENUE20';
  za.querySelector('#verif-reduction').click();
  await new Promise((r) => setTimeout(r, 900));
  za = a.document.getElementById('contenu');
  const montantApres = za.querySelector('#recap-montant').textContent;
  log('Abonnement : réduction appliquée (11 500 → 9 200 FCFA)', /9\s?200/.test(montantApres), montantApres);
  log('Abonnement : message de remise affiché', /BIENVENUE20/.test(za.querySelector('#reduction-retour').textContent));
  za.querySelector('#code-reduction').value = 'INCONNU';
  za.querySelector('#verif-reduction').click();
  await new Promise((r) => setTimeout(r, 800));
  za = a.document.getElementById('contenu');
  log('Abonnement : code inconnu signalé', /❌|inconnu/i.test(za.querySelector('#reduction-retour').textContent),
    za.querySelector('#reduction-retour').textContent.trim().slice(0, 60));
  za.querySelector('input[name=plan][value=annuel]').click();
  await new Promise((r) => setTimeout(r, 700));
  za = a.document.getElementById('contenu');
  log('Abonnement : changement de formule recalcule le montant',
    /132\s?000/.test(za.querySelector('#recap-montant').textContent), za.querySelector('#recap-montant').textContent);
  log('Administrateur : aucune erreur JavaScript', errsA.length === 0, errsA.slice(0, 2).join(' | '));
  a.close();

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
