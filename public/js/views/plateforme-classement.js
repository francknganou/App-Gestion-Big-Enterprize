/* ==========================================================================
   Console du propriétaire — CLASSEMENT DES ENTREPRISES
   Quelles entreprises utilisent le plus l'application, mesuré à travers leur
   abonnement : montants encaissés, régularité des paiements, ancienneté,
   puis intensité d'usage (ventes enregistrées, comptes ouverts).
   ========================================================================== */

const COULEUR_PALIER = { Platine: '#7c5cff', Or: '#f5a623', Argent: '#8a94a6', Bronze: '#cd7f32' };
const MEDAILLE = { 1: '🥇', 2: '🥈', 3: '🥉' };

App.enregistrerVue('plateforme-classement', {
  titre: 'Classement des entreprises', icone: '🏆',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    let tri = 'score';
    let donnees = null;

    const CRITERES = {
      score: 'Score d’utilisation',
      total_encaisse: 'Montant encaissé',
      nb_valides: 'Nombre de paiements',
      jours_abonne: 'Ancienneté d’abonnement',
      nb_ventes: 'Ventes enregistrées',
      nb_comptes: 'Comptes ouverts',
    };

    function trier(lignes) {
      const c = [...lignes];
      c.sort((a, b) => (Number(b[tri]) || 0) - (Number(a[tri]) || 0)
        || (Number(b.total_encaisse) || 0) - (Number(a.total_encaisse) || 0));
      c.forEach((l, i) => { l.rang = i + 1; });
      return c;
    }

    function peindre() {
      const lignes = trier(donnees.classement);
      const podium = lignes.slice(0, 3);
      const maxScore = Math.max(1, ...lignes.map((l) => l.score));

      zone.innerHTML = `
        ${entetePage({
          titre: 'Classement des entreprises',
          sous: 'Les entreprises qui utilisent le plus l’application, mesuré à travers leur abonnement.',
          actions: `<select id="c-tri" style="min-width:220px">
              ${Object.entries(CRITERES).map(([k, v]) => `<option value="${k}" ${tri === k ? 'selected' : ''}>Trier par : ${v}</option>`).join('')}
            </select>
            <button class="btn primaire" id="c-rafraichir">↻ Actualiser</button>`,
        })}

        <div class="grille g-4">
          <div class="kpi bleu"><div class="libelle">Entreprises classées</div>
            <div class="valeur">${Fmt.nombre(donnees.nb_entreprises)}</div>
            <div class="petit texte-muted">${Fmt.nombre(donnees.nb_abonnes)} abonnée(s) · ${Fmt.nombre(donnees.nb_essai)} en essai</div></div>
          <div class="kpi vert"><div class="libelle">Total encaissé</div>
            <div class="valeur">${Fmt.fcfa(donnees.total_encaisse)}</div>
            <div class="petit texte-muted">abonnements validés</div></div>
          <div class="kpi ambre"><div class="libelle">Score moyen</div>
            <div class="valeur">${Fmt.nombre(donnees.moyenne_score)}<span style="font-size:14px">/100</span></div>
            <div class="petit texte-muted">intensité d’utilisation</div></div>
          <div class="kpi"><div class="libelle">Leader</div>
            <div class="valeur" style="font-size:18px">${podium[0] ? Fmt.echapper(podium[0].nom) : '—'}</div>
            <div class="petit texte-muted">${podium[0] ? Fmt.fcfa(podium[0].total_encaisse) : ''}</div></div>
        </div>

        ${podium.length ? `<div class="carte">
          <div class="carte-entete"><div><b>Podium</b><div class="sous">Les trois entreprises les plus actives</div></div></div>
          <div class="grille g-3">
            ${podium.map((l) => `
              <div style="border:1px solid var(--bord);border-top:4px solid ${COULEUR_PALIER[l.palier] || 'var(--primary)'};
                          border-radius:12px;padding:14px;text-align:center">
                <div style="font-size:30px">${MEDAILLE[l.rang] || '🏅'}</div>
                <div style="font-weight:600;margin-top:4px">${Fmt.echapper(l.nom)}</div>
                <div class="petit texte-muted">${Fmt.echapper(l.ville || '')} · ${Fmt.echapper(l.plan_libelle)}</div>
                <div style="font-size:20px;font-weight:700;margin:8px 0;color:var(--primary)">${Fmt.fcfa(l.total_encaisse)}</div>
                <div class="petit">
                  <span class="badge" style="background:${COULEUR_PALIER[l.palier] || 'var(--primary)'};color:#fff">${Fmt.echapper(l.palier)}</span>
                  <span class="badge neutre">score ${l.score}/100</span>
                </div>
                <div class="petit texte-muted" style="margin-top:8px">
                  ${Fmt.nombre(l.nb_valides)} paiement(s) · ${Fmt.nombre(l.jours_abonne)} jour(s) d’abonnement<br>
                  ${Fmt.nombre(l.nb_ventes)} vente(s) · ${Fmt.nombre(l.nb_comptes)} compte(s) · ${Fmt.nombre(l.nb_magasins)} magasin(s)
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="carte">
          <div class="carte-entete"><div><b>Classement complet</b>
            <div class="sous">Score = 40 % montants encaissés · 20 % régularité des paiements ·
              15 % ancienneté · 15 % ventes · 10 % comptes ouverts</div></div></div>
          <div class="tableau-enveloppe"><table class="tableau">
            <thead><tr>
              <th class="num">Rang</th><th>Entreprise</th><th>Palier</th>
              <th style="min-width:150px">Score</th><th class="num">Encaissé</th><th class="num">Part</th>
              <th class="num">Paiements</th><th class="num">Abonné depuis</th><th>Formule</th><th>Abonnement</th>
            </tr></thead>
            <tbody>
              ${lignes.map((l) => `<tr>
                <td class="num"><b>${MEDAILLE[l.rang] || '#' + l.rang}</b></td>
                <td>${vignetteEntreprise({ logo: l.logo })} <b>${Fmt.echapper(l.nom)}</b>
                  <div class="petit texte-muted">${Fmt.echapper(l.ville || '')}</div></td>
                <td><span class="badge" style="background:${COULEUR_PALIER[l.palier] || 'var(--primary)'};color:#fff">${Fmt.echapper(l.palier)}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:8px;border-radius:6px;background:var(--fond);overflow:hidden">
                      <div style="width:${Math.round((l.score / maxScore) * 100)}%;height:100%;
                                  background:${COULEUR_PALIER[l.palier] || 'var(--primary)'}"></div>
                    </div>
                    <b style="min-width:38px;text-align:right">${l.score}</b>
                  </div>
                </td>
                <td class="num"><b>${Fmt.fcfa(l.total_encaisse)}</b></td>
                <td class="num">${l.pourcentage_enc} %</td>
                <td class="num">${Fmt.nombre(l.nb_valides)}
                  ${l.nb_attente ? `<div class="petit texte-muted">+${Fmt.nombre(l.nb_attente)} en attente</div>` : ''}</td>
                <td class="num">${Fmt.nombre(l.jours_abonne)} j
                  <div class="petit texte-muted">${l.premier_paiement ? '1er : ' + Fmt.date(l.premier_paiement) : 'aucun paiement'}</div></td>
                <td>${Fmt.echapper(l.plan_libelle)}</td>
                <td>${l.abonnement_statut === 'actif'
                    ? `<span class="badge ok">Actif · ${Fmt.nombre(l.jours_restants)} j</span>`
                    : l.abonnement_statut === 'essai'
                      ? `<span class="badge attente">Essai · ${Fmt.nombre(l.jours_restants)} j</span>`
                      : `<span class="badge ko">Expiré</span>`}
                  <div class="petit texte-muted">fin ${Fmt.date(l.date_fin)}</div></td>
              </tr>`).join('') || `<tr><td colspan="10"><div class="vide"><span>📭</span>Aucune entreprise cliente.</div></td></tr>`}
            </tbody>
          </table></div>
        </div>`;

      zone.querySelector('#c-tri').addEventListener('change', (e) => { tri = e.target.value; peindre(); });
      zone.querySelector('#c-rafraichir').addEventListener('click', charger);
    }

    async function charger() {
      donnees = await Api.get('/plateforme/classement');
      if (!document.body.contains(zone)) return;
      peindre();
    }

    App.suivre({
      vue: 'plateforme-classement', types: ['plateforme', 'vente'],
      rafraichir: () => { if (!document.querySelector('.voile')) charger(); },
    });
    await charger();
  },
});
