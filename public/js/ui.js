/* ==========================================================================
   ui.js — Formatage, composants d'interface, notifications, graphiques
   ========================================================================== */
const Fmt = {
  /** 1 250 000 FCFA — renvoie « — » si la valeur est masquée (null). */
  fcfa(n, avecDevise = true) {
    if (n === null || n === undefined) return '—';
    const v = Number(n) || 0;
    const s = v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    return avecDevise ? s + ' FCFA' : s;
  },
  fcfaCourt(n) {
    if (n === null || n === undefined) return '—';
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' Md';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' M';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' k';
    return String(Math.round(v));
  },
  nombre(n, d = 0) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d }); },
  pct(n) { return n === null || n === undefined ? '—' : (Number(n) || 0).toFixed(1).replace('.', ',') + ' %'; },

  /** '2026-10-04 19:33:20' -> '04/10/2026 19:33' */
  dateH(s) {
    if (!s) return '—';
    const [d, h = ''] = String(s).split(' ');
    const [a, m, j] = d.split('-');
    return `${j}/${m}/${a}${h ? ' ' + h.slice(0, 5) : ''}`;
  },
  date(s) { return s ? String(s).split(' ')[0].split('-').reverse().join('/') : '—'; },
  heure(s) { const p = String(s || '').split(' ')[1] || ''; return p.slice(0, 5) || '—'; },
  iso(joursDecalage = 0) {
    const d = new Date(Date.now() + joursDecalage * 86400000);
    return d.toISOString().slice(0, 10);
  },
  jourLong(s) {
    if (!s) return '';
    const d = new Date(s.slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },
  moisCourt(s) {
    const d = new Date(String(s).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  },
  echapper(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  initiales(nom) {
    return String(nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('');
  },
  titre(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); },
};

const LIBELLE_MODE = { especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte bancaire', credit: 'Crédit' };
const LIBELLE_MOUVEMENT = {
  entree: 'Entrée', sortie: 'Sortie', vente: 'Vente', ajustement: 'Ajustement',
  transfert_entree: 'Transfert reçu', transfert_sortie: 'Transfert envoyé', retour: 'Retour',
};
const LIBELLE_STATUT_ACHAT = { brouillon: 'Brouillon', commandee: 'Commandée', recue: 'Reçue', annulee: 'Annulée' };

/* ------------------------------ Notifications ------------------------------ */
function notifier(message, type = 'ok', duree = 3800) {
  const zone = document.getElementById('notifications');
  const el = document.createElement('div');
  el.className = 'notif ' + type;
  el.innerHTML = Fmt.echapper(message);
  zone.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, duree);
}

/* --------------------------------- Modales --------------------------------- */
function ouvrirModale({ titre, contenu, pied = '', largeur = '', surOuverture }) {
  const voile = document.createElement('div');
  voile.className = 'voile';
  voile.innerHTML = `
    <div class="modale ${largeur}" role="dialog" aria-modal="true">
      <div class="modale-entete">
        <h3>${Fmt.echapper(titre)}</h3>
        <button class="fermer" title="Fermer">✕</button>
      </div>
      <div class="modale-corps">${contenu}</div>
      ${pied ? `<div class="modale-pied">${pied}</div>` : ''}
    </div>`;
  const fermer = () => { voile.remove(); document.removeEventListener('keydown', surTouche); };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };
  voile.querySelector('.fermer').onclick = fermer;
  voile.addEventListener('mousedown', (e) => { if (e.target === voile) fermer(); });
  document.addEventListener('keydown', surTouche);
  document.body.appendChild(voile);
  const m = voile.querySelector('.modale');
  if (surOuverture) surOuverture(m, fermer);
  const premier = m.querySelector('input,select,textarea,button.primaire');
  if (premier && !premier.classList.contains('fermer')) setTimeout(() => premier.focus(), 40);
  return { element: m, fermer, voile };
}

function confirmer(message, { titre = 'Confirmation', valider = 'Confirmer', danger = false } = {}) {
  return new Promise((resoudre) => {
    const m = ouvrirModale({
      titre, largeur: 'etroite',
      contenu: `<p style="margin:0">${Fmt.echapper(message)}</p>`,
      pied: `<button class="btn" data-non>Annuler</button>
             <button class="btn ${danger ? 'danger' : 'primaire'}" data-oui>${Fmt.echapper(valider)}</button>`,
    });
    m.element.querySelector('[data-non]').onclick = () => { m.fermer(); resoudre(false); };
    m.element.querySelector('[data-oui]').onclick = () => { m.fermer(); resoudre(true); };
  });
}

/* --------------------------------- Tableaux -------------------------------- */
/**
 * colonnes : [{ cle, titre, num?, rendre?(ligne), classe? }]
 */
function tableau(colonnes, lignes, { vide = 'Aucune donnée à afficher', classe = '' } = {}) {
  if (!lignes || !lignes.length) {
    return `<div class="vide"><span>📭</span>${Fmt.echapper(vide)}</div>`;
  }
  const th = colonnes.map((c) => `<th class="${c.num ? 'num' : ''}">${Fmt.echapper(c.titre)}</th>`).join('');
  const trs = lignes.map((l) => {
    const tds = colonnes.map((c) => {
      const v = c.rendre ? c.rendre(l) : (l[c.cle] === null || l[c.cle] === undefined ? '—' : l[c.cle]);
      return `<td class="${c.num ? 'num' : ''} ${c.classe || ''}">${v === null || v === undefined ? '—' : v}</td>`;
    }).join('');
    return `<tr data-id="${l.id ?? ''}">${tds}</tr>`;
  }).join('');
  return `<div class="tableau-enveloppe ${classe}"><table class="tableau"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

const badgeStatutVente = (s) => s === 'annulee'
  ? '<span class="badge ko">Annulée</span>' : '<span class="badge ok">Payée</span>';

const badgeStatutTransfert = (s) => ({
  en_attente: '<span class="badge attente">En attente</span>',
  valide: '<span class="badge ok">Validé</span>',
  annule: '<span class="badge ko">Annulé</span>',
}[s] || `<span class="badge neutre">${Fmt.echapper(s)}</span>`);

const badgeStatutAchat = (s) => ({
  brouillon: '<span class="badge neutre">Brouillon</span>',
  commandee: '<span class="badge attente">Commandée</span>',
  recue: '<span class="badge ok">Reçue</span>',
  annulee: '<span class="badge ko">Annulée</span>',
}[s] || `<span class="badge neutre">${Fmt.echapper(s)}</span>`);

function badgeStock(quantite, seuil) {
  const q = Number(quantite) || 0;
  if (q <= 0) return '<span class="badge ko">Rupture</span>';
  if (q <= seuil) return `<span class="badge attente">Stock faible (${Fmt.nombre(q)})</span>`;
  return `<span class="badge ok">${Fmt.nombre(q)}</span>`;
}

/* -------------------------------- Graphiques ------------------------------- */
/** Courbe d'évolution (aire + ligne) en SVG pur. */
function graphiqueCourbe(donnees, { hauteur = 190, cle = 'jour', valeur = 'ca' } = {}) {
  if (!donnees || donnees.length < 2) return `<div class="vide">Pas assez de données</div>`;
  const L = 760, H = hauteur, margeG = 8, margeB = 26, margeH = 12;
  const max = Math.max(...donnees.map((d) => Number(d[valeur]) || 0)) || 1;
  const pasX = (L - margeG * 2) / (donnees.length - 1);
  const y = (v) => margeH + (H - margeH - margeB) * (1 - (Number(v) || 0) / max);
  const pts = donnees.map((d, i) => [margeG + i * pasX, y(d[valeur])]);
  const ligne = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const aire = ligne + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - margeB} L${margeG} ${H - margeB} Z`;
  const etiquettes = donnees.map((d, i) => {
    if (i % Math.ceil(donnees.length / 8) !== 0 && i !== donnees.length - 1) return '';
    return `<text x="${pts[i][0].toFixed(1)}" y="${H - 8}" font-size="10.5" fill="#64748b" text-anchor="middle">${Fmt.moisCourt(d[cle])}</text>`;
  }).join('');
  const points = donnees.map((d, i) =>
    `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="2.6" fill="#0b7a75"><title>${Fmt.date(d[cle])} : ${Fmt.fcfa(d[valeur])}</title></circle>`).join('');
  return `<svg class="graphique" viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" style="max-height:220px">
    <defs><linearGradient id="grad-aire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b7a75" stop-opacity=".28"/><stop offset="100%" stop-color="#0b7a75" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0, .25, .5, .75, 1].map((f) => `<line x1="${margeG}" x2="${L - margeG}" y1="${(margeH + (H - margeH - margeB) * f).toFixed(1)}" y2="${(margeH + (H - margeH - margeB) * f).toFixed(1)}" stroke="#eef2f6" stroke-width="1"/>`).join('')}
    <path d="${aire}" fill="url(#grad-aire)"/>
    <path d="${ligne}" fill="none" stroke="#0b7a75" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${points}${etiquettes}
  </svg>`;
}

/** Liste de barres horizontales (top produits, catégories, magasins). */
function listeBarres(lignes, { cle = 'nom', valeur = 'ca', rendreValeur = (v) => Fmt.fcfa(v), rendreCle, max = 8, couleur } = {}) {
  const data = (lignes || []).slice(0, max);
  if (!data.length) return '<div class="vide">Aucune donnée</div>';
  const maxi = Math.max(...data.map((d) => Number(d[valeur]) || 0)) || 1;
  return `<div class="liste-barres">${data.map((d) => {
    const p = Math.max(2, ((Number(d[valeur]) || 0) / maxi) * 100);
    return `<div>
      <div class="lb-tete"><span>${rendreCle ? rendreCle(d) : Fmt.echapper(d[cle])}</span><b>${rendreValeur(d[valeur], d)}</b></div>
      <div class="jauge ${couleur || ''}"><span style="width:${p.toFixed(1)}%"></span></div>
    </div>`;
  }).join('')}</div>`;
}

/* ------------------------------ Divers helpers ----------------------------- */
function options(liste, valeurCle, libelle, selection) {
  return (liste || []).map((x) => {
    const v = typeof valeurCle === 'function' ? valeurCle(x) : x[valeurCle];
    const l = typeof libelle === 'function' ? libelle(x) : x[libelle];
    return `<option value="${Fmt.echapper(v)}" ${String(v) === String(selection) ? 'selected' : ''}>${Fmt.echapper(l)}</option>`;
  }).join('');
}

function lireFormulaire(racine) {
  const donnees = {};
  racine.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') donnees[el.name] = el.checked;
    else if (el.type === 'number') donnees[el.name] = el.value === '' ? null : Number(el.value);
    else donnees[el.name] = el.value;
  });
  return donnees;
}

function entetePage({ titre, sous, actions = '' }) {
  return `<div class="carte-entete" style="border:none;background:none;padding:0 0 14px;box-shadow:none">
    <div><h3 style="font-size:17px">${Fmt.echapper(titre)}</h3><div class="sous">${sous || ''}</div></div>
    <div class="droite">${actions}</div>
  </div>`;
}
