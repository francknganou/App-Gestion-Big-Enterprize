/**
 * Lance les suites de test à la suite et récapitule le résultat.
 *
 *   npm test                 (serveur démarré au préalable : npm start)
 *   node tests/tout.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  'smoke',
  'multi-entreprises',
  'parcours-proprietaire',
  'interface-parcours',
  'temps-reel',
  'apparence',
  'nouvelles-options',
  'rh',
  'psp-paydunya',            // adaptateur PayDunya testé contre un faux serveur (sans clés)
  'abonnements-tarifs',      // formules, réductions, augmentations, PSP, ventes, classement (API)
  'console-proprietaire',    // écrans du propriétaire + code de réduction côté client (jsdom)
  'inventaires',             // comptage physique, valorisation, stock attendu, écarts (API)
  'inventaires-ui',          // écran de gestion des inventaires, 4 sous-pages (jsdom)
  'moyens-paiement',         // activation/désactivation des moyens + retour navigateur non activant
  'boutiques-magasins',      // type magasin/boutique, dotation de stock, prix à la vente, aperçu réseau
  'messages',                // messagerie interne + expiration/réactivation d'abonnement
];

const lignes = [];
let totalOk = 0;
let totalTests = 0;
let echecs = 0;

console.log('Serveur attendu sur ' + (process.env.BASE_URL || 'http://localhost:3000') + '\n');

for (const suite of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, suite + '.js')], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sortie = (r.stdout || '') + (r.stderr || '');
  const m = sortie.match(/(\d+)\s*\/\s*(\d+)\s*vérifications réussies/);
  if (!m) {
    const m2 = sortie.match(/(\d+)\/(\d+)/);
    if (m2) { lignes.push([suite, Number(m2[1]), Number(m2[2])]); totalOk += Number(m2[1]); totalTests += Number(m2[2]); }
    else { lignes.push([suite, 0, 0]); }
    if (r.status !== 0) echecs++;
    continue;
  }
  const ok = Number(m[1]);
  const nb = Number(m[2]);
  totalOk += ok; totalTests += nb;
  if (ok !== nb || r.status !== 0) echecs++;
  lignes.push([suite, ok, nb]);
  if (ok !== nb) {
    sortie.split('\n').filter((l) => l.includes('❌')).forEach((l) => console.log('   ' + l.trim()));
  }
}

const largeur = Math.max(...lignes.map((l) => l[0].length));
console.log('');
lignes.forEach(([s, ok, nb]) => {
  console.log('  ' + s.padEnd(largeur) + '  ' + (ok + '/' + nb).padStart(9) + '  ' + (ok === nb && nb > 0 ? '✅' : '❌'));
});
console.log('  ' + '—'.repeat(largeur + 14));
console.log('  ' + 'TOTAL'.padEnd(largeur) + '  ' + (totalOk + '/' + totalTests).padStart(9)
  + '  ' + (echecs === 0 ? '✅ tout est vert' : '❌ ' + echecs + ' suite(s) en échec'));
process.exit(echecs === 0 ? 0 : 1);
