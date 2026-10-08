/**
 * Suite « inventaires » — interface (jsdom).
 *
 * Vérifie l'écran de gestion des inventaires côté navigateur :
 *   • le menu n'apparaît qu'aux comptes qui ont la permission ;
 *   • la liste des sessions, la création via la modale ;
 *   • les quatre sous-pages (comptage, montant généré, stock attendu, comparaison) ;
 *   • la saisie d'une quantité comptée et l'affichage de l'écart ;
 *   • l'absence d'erreur JavaScript dans la console.
 *
 *   node tests/inventaires-ui.js     (serveur démarré : npm start)
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
  /* ---------------- La caissière ne voit pas le menu ---------------- */
  const errsC = [];
  const c = await boot('caisse1@shoppingplus.cm', 'Caisse@2026', errsC);
  const menusC = [...c.document.querySelectorAll('nav a')].map((a) => a.dataset.vue);
  log('La caissière n’a pas l’entrée « Inventaires » au menu', !menusC.includes('inventaires'), menusC.join(', '));
  log('La caissière n’a pas la permission inventaire.consulter', !c.App.peut('inventaire.consulter'));

  /* ---------------- Administrateur ---------------- */
  const errs = [];
  const w = await boot('admin@shoppingplus.cm', 'Admin@2026', errs);
  const menus = [...w.document.querySelectorAll('nav a')].map((a) => a.dataset.vue);
  log('L’administrateur a l’entrée « Inventaires » au menu', menus.includes('inventaires'), menus.join(', '));
  log('L’entrée est rangée dans le groupe « Catalogue & stock »',
    w.App.vues.inventaires && w.App.vues.inventaires.groupe === 'Catalogue & stock',
    (w.App.vues.inventaires || {}).groupe);

  await w.App.monter('inventaires');
  await cond(() => /Sessions d’inventaire/.test(w.document.getElementById('contenu').textContent), 'liste des sessions');
  let z = w.document.getElementById('contenu');
  log('La liste des sessions s’affiche', /Sessions d’inventaire/.test(z.textContent));
  log('Le bouton « Nouvel inventaire » est présent', !!z.querySelector('#btn-nouvel-inv'));

  /* ---------------- Création via la modale ---------------- */
  z.querySelector('#btn-nouvel-inv').click();
  await cond(() => w.document.querySelector('.voile .modale [name=libelle]'), 'modale de création');
  const modale = w.document.querySelector('.voile .modale');
  modale.querySelector('[name=libelle]').value = 'TEST UI inventaire';
  modale.querySelector('[name=magasin_id]').value = '4';
  modale.querySelector('[data-creer]').click();
  await cond(() => /Avancement du comptage/.test(w.document.getElementById('contenu').textContent),
    'session ouverte');
  z = w.document.getElementById('contenu');
  log('La session créée s’ouvre sur l’écran de comptage', /Comptage physique/.test(z.textContent));
  log('Les quatre sous-pages sont présentes',
    w.document.querySelectorAll('[data-onglet]').length === 4,
    [...w.document.querySelectorAll('[data-onglet]')].map((b) => b.textContent).join(' | '));
  log('Les KPI de rapprochement sont affichés',
    /Stock attendu/.test(z.textContent) && /Stock compté/.test(z.textContent)
    && /Écart/.test(z.textContent) && /Montant généré/.test(z.textContent));
  log('La barre d’avancement du comptage est affichée', /Avancement du comptage/.test(z.textContent));
  log('Le bouton « Tout marquer conforme » est proposé', !!z.querySelector('#btn-conforme'));
  log('L’export CSV et la clôture sont proposés',
    !!z.querySelector('#btn-export') && !!z.querySelector('#btn-cloturer'));

  /* ---------------- 1. Comptage : saisie d'une quantité ---------------- */
  const saisie = z.querySelector('.saisie-comptage');
  const idLigne = saisie.dataset.ligne;
  const attendu = Number(z.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1].textContent.replace(/\s/g, ''));
  saisie.value = String(attendu + 5);
  saisie.dispatchEvent(new w.Event('change'));
  await cond(() => /\+5/.test(w.document.getElementById('contenu').textContent), 'écart affiché');
  z = w.document.getElementById('contenu');
  log('La saisie du comptage affiche immédiatement l’écart (+5)', /\+5/.test(z.textContent));
  log('L’avancement progresse après la saisie', /1 \/ \d+ produits comptés/.test(z.textContent),
    (z.textContent.match(/\d+ \/ \d+ produits comptés/) || [])[0]);

  /* ---------------- 2. Montant généré ---------------- */
  w.document.querySelector('[data-onglet=montant]').click();
  await cond(() => /Valorisation produit par produit/.test(w.document.getElementById('contenu').textContent), 'onglet montant');
  z = w.document.getElementById('contenu');
  log('Sous-page « Montant généré » : valorisation affichée', /Valorisation produit par produit/.test(z.textContent));
  log('Sous-page « Montant généré » : valeur, montant et marge',
    /Valeur du stock compté/.test(z.textContent) && /Montant généré/.test(z.textContent)
    && /Marge potentielle/.test(z.textContent));
  log('Sous-page « Montant généré » : le produit compté est valorisé en FCFA', /FCFA/.test(z.textContent));

  /* ---------------- 3. Stock attendu ---------------- */
  w.document.querySelector('[data-onglet=attendu]').click();
  await cond(() => /Recalculé des mouvements/.test(w.document.getElementById('contenu').textContent), 'onglet attendu');
  z = w.document.getElementById('contenu');
  log('Sous-page « Stock attendu » : théorie et recalcul des mouvements',
    /Stock attendu \(système\)/.test(z.textContent) && /Recalculé des mouvements/.test(z.textContent));
  log('Sous-page « Stock attendu » : contrôle de concordance',
    /concordant|incohérence/i.test(z.textContent));

  /* ---------------- 4. Comparaison ---------------- */
  w.document.querySelector('[data-onglet=ecarts]').click();
  await cond(() => /Comparaison compté \/ attendu/.test(w.document.getElementById('contenu').textContent), 'onglet écarts');
  z = w.document.getElementById('contenu');
  log('Sous-page « Comparaison » : les écarts sont listés', /Comparaison compté \/ attendu/.test(z.textContent));
  log('Sous-page « Comparaison » : manquants / excédents / écart net',
    /Manquants/.test(z.textContent) && /Excédents/.test(z.textContent) && /Écart net/.test(z.textContent));
  log('Sous-page « Comparaison » : l’écart de +5 apparaît', /\+5/.test(z.textContent));

  /* ---------------- Retour à la liste et suppression ---------------- */
  w.document.querySelector('#btn-retour').click();
  await cond(() => /TEST UI inventaire/.test(w.document.getElementById('contenu').textContent), 'retour liste');
  z = w.document.getElementById('contenu');
  log('La session créée apparaît dans la liste', /TEST UI inventaire/.test(z.textContent));
  log('La liste affiche l’écart de valorisation de la session', /Écart valeur|Écarts/.test(z.textContent));

  const { db } = require('../server/db');
  const ligne = db.prepare(`SELECT id FROM inventaires WHERE libelle='TEST UI inventaire' ORDER BY id DESC`).get();
  if (ligne) db.prepare('DELETE FROM inventaires WHERE id=?').run(ligne.id);
  log('Nettoyage : la session de test est supprimée',
    !db.prepare(`SELECT id FROM inventaires WHERE libelle='TEST UI inventaire'`).get());

  log('Aucune erreur JavaScript dans la console',
    errs.length === 0 && errsC.length === 0, errs.concat(errsC).slice(0, 3).join(' | '));
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
