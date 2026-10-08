/* ==========================================================================
   Vue : Salaires — suivi mensuel des versements du personnel.
   Chaque employé actif apparaît avec son salaire de référence ; l'administrateur
   enregistre le versement du mois (primes, retenues, net) et le marque payé.
   ========================================================================== */
App.enregistrerVue('salaires', {
  titre: 'Salaires', icone: '💵',
  permissions: ['salaires.consulter'], groupe: 'Ressources humaines',

  async rendre(zone) {
    const peutGerer = App.peut('salaires.gerer');
    let periode = '';
    let filtres = { q: '', magasin_id: App.global() ? '' : (App.magasinCourant() || '') };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete"><h3>💵 Paie du personnel</h3>
          <div class="droite petit texte-muted">Un employé = une ligne par mois</div></div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="champ"><label>Mois de paie</label><select id="s-periode"></select></div>
            ${App.global() ? `<div class="champ"><label>Boutique</label><select id="s-magasin">
              <option value="">Toutes</option>${options(App.etat.magasins, 'id', (m) => m.nom, '')}</select></div>` : ''}
            <div class="recherche"><input id="s-q" placeholder="Rechercher un employé…"></div>
            <button class="btn primaire" id="s-filtrer">Appliquer</button>
          </div>
        </div>
      </div>
      <div class="grille g-kpi" style="margin-bottom:18px" id="s-kpi"></div>
      <div class="carte">
        <div class="carte-entete"><h3>Détail de la paie</h3>
          <div class="droite" id="s-actions"></div></div>
        <div class="carte-corps serre" id="s-liste"></div>
      </div>
      <div class="carte" style="margin-top:18px"><div class="carte-corps" id="s-evolution"></div></div>`;

    function libellePeriode(p) {
      if (!p) return '';
      const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      const [a, m] = p.split('-');
      return (MOIS[Number(m) - 1] || m) + ' ' + a;
    }

    async function charger() {
      document.getElementById('s-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const params = Object.assign({}, filtres);
      if (periode) params.periode = periode;
      const r = await Api.get('/rh/salaires', params);
      if (!document.body.contains(zone)) return;

      /* Sélecteur de mois : période courante + toutes les périodes déjà saisies. */
      const sel = document.getElementById('s-periode');
      const connues = (r.periodes || []).map((p) => p.periode);
      const toutes = [r.periode_courante, ...connues].filter((v, i, t) => v && t.indexOf(v) === i).sort().reverse();
      const choisie = periode || r.periode;
      sel.innerHTML = toutes.map((p) => `<option value="${p}" ${p === choisie ? 'selected' : ''}>${libellePeriode(p)}</option>`).join('');

      const t = r.totaux;
      document.getElementById('s-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Effectif concerné</div><div class="valeur">${Fmt.nombre(r.nb_employes)}</div>
          <div class="pied">${libellePeriode(r.periode)}</div></div>
        <div class="kpi bleu"><div class="libelle">Masse salariale</div><div class="valeur">${Fmt.fcfa(t.masse_salariale)}</div>
          <div class="pied">Salaires de référence</div></div>
        <div class="kpi vert"><div class="libelle">Déjà réglé</div><div class="valeur">${Fmt.fcfa(t.montant_paye)}</div>
          <div class="pied">${Fmt.nombre(t.nb_payes)} employé(s) payé(s)</div></div>
        <div class="kpi ${t.nb_a_payer ? 'ambre' : 'vert'}"><div class="libelle">Reste à payer</div>
          <div class="valeur">${Fmt.fcfa(t.montant_a_payer)}</div>
          <div class="pied">${Fmt.nombre(t.nb_a_payer)} employé(s) en attente</div></div>`;

      document.getElementById('s-actions').innerHTML = peutGerer
        ? `<button class="btn primaire" id="s-tout-payer">✅ Tout marquer payé</button>` : '';
      const boutonTout = document.getElementById('s-tout-payer');
      if (boutonTout) {
        boutonTout.disabled = t.nb_a_payer === 0;
        boutonTout.onclick = async () => {
          const ok = await confirmer(
            `Marquer les ${t.nb_a_payer} versement(s) de ${libellePeriode(r.periode)} comme payés ?`,
            { titre: 'Paiement de la période', valider: 'Tout marquer payé' });
          if (!ok) return;
          try {
            const res = await Api.post('/rh/salaires/payer-periode', { periode: r.periode });
            notifier(`${res.nb_marques} versement(s) marqué(s) payé(s)`);
            charger();
          } catch (e) { notifier(e.message, 'erreur'); }
        };
      }

      document.getElementById('s-liste').innerHTML = tableau([
        { titre: 'Employé', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b>
            <div class="petit texte-muted">${Fmt.echapper(l.poste || '')}${l.magasin ? ' · ' + Fmt.echapper(l.magasin) : ''}</div>` },
        { titre: 'Contrat', rendre: (l) => `<span class="badge ${l.type_contrat === 'CDI' ? 'ok' : 'neutre'}">${Fmt.echapper(l.type_contrat || '—')}</span>` },
        { titre: 'Salaire de référence', num: true, rendre: (l) => Fmt.fcfa(l.salaire_reference) },
        { titre: 'Primes', num: true, rendre: (l) => l.primes ? `<b style="color:var(--ok)">+ ${Fmt.fcfa(l.primes)}</b>` : '—' },
        { titre: 'Retenues', num: true, rendre: (l) => l.retenues ? `<b style="color:var(--bad)">− ${Fmt.fcfa(l.retenues)}</b>` : '—' },
        { titre: 'Net à payer', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.net)}</b>` },
        { titre: 'État', rendre: (l) => l.statut === 'paye'
            ? `<span class="badge ok">Payé</span><div class="petit texte-muted">${Fmt.date(l.date_paiement)}</div>`
            : '<span class="badge ambre">À payer</span>' },
        { titre: 'Mode', rendre: (l) => ({ especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement' }[l.mode_paiement] || '—') },
        { titre: '', rendre: (l) => peutGerer ? `<div class="actions">
            <button class="btn petit" data-saisir="${l.employe_id}">✏️ Saisir</button></div>` : '' },
      ], r.lignes, { vide: 'Aucun employé actif pour cette période' });

      document.querySelectorAll('[data-saisir]').forEach((b) => b.onclick = () => {
        saisir(r.lignes.find((l) => l.employe_id === Number(b.dataset.saisir)), r.periode);
      });

      /* Évolution de la masse salariale sur les 12 derniers mois. */
      const evo = r.evolution || [];
      document.getElementById('s-evolution').innerHTML = evo.length > 1
        ? `<h3 style="margin:0 0 12px">Évolution de la masse salariale</h3>`
          + graphiqueCourbe(evo.map((x) => ({ mois: libellePeriode(x.periode), masse: x.masse })),
            { cle: 'mois', valeur: 'masse' })
        : `<div class="aide">L'évolution apparaîtra dès que plusieurs mois de paie seront enregistrés.</div>`;
    }

    /** Saisie (ou correction) du versement d'un mois pour un employé. */
    function saisir(ligne, per) {
      const v = ligne.versement || {};
      ouvrirModale({
        titre: 'Versement — ' + ligne.nom + ' · ' + libellePeriode(per),
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><div class="aide">Salaire de référence : <b>${Fmt.fcfa(ligne.salaire_reference)}</b></div></div>
            <div class="champ"><label>Salaire de base</label>
              <input name="montant" type="number" min="0" step="100" value="${v.montant ?? ligne.salaire_reference}"></div>
            <div class="champ"><label>Primes</label>
              <input name="primes" type="number" min="0" step="100" value="${v.primes || 0}"></div>
            <div class="champ"><label>Retenues (avances, absences…)</label>
              <input name="retenues" type="number" min="0" step="100" value="${v.retenues || 0}"></div>
            <div class="champ"><label>Net à payer</label>
              <input id="net-affiche" readonly value="${Fmt.fcfa(ligne.net)}" style="font-weight:700"></div>
            <div class="champ"><label>État du versement</label><select name="statut">
              <option value="a_payer" ${v.statut !== 'paye' ? 'selected' : ''}>À payer</option>
              <option value="paye" ${v.statut === 'paye' ? 'selected' : ''}>Payé</option></select></div>
            <div class="champ"><label>Date de paiement</label>
              <input name="date_paiement" type="date" value="${(v.date_paiement || Fmt.iso()).slice(0, 10)}"></div>
            <div class="champ"><label>Mode de paiement</label><select name="mode_paiement">
              <option value="">—</option>
              <option value="especes" ${v.mode_paiement === 'especes' ? 'selected' : ''}>Espèces</option>
              <option value="mobile_money" ${v.mode_paiement === 'mobile_money' ? 'selected' : ''}>Mobile Money</option>
              <option value="virement" ${v.mode_paiement === 'virement' ? 'selected' : ''}>Virement bancaire</option></select></div>
            <div class="champ"><label>Référence (reçu, n° de virement)</label>
              <input name="reference" value="${Fmt.echapper(v.reference || '')}"></div>
            <div class="champ plein"><label>Notes</label>
              <textarea name="notes" rows="2">${Fmt.echapper(v.notes || '')}</textarea></div>
          </div>
          <div id="s-erreur"></div>`,
        pied: `${v.id ? `<button class="btn danger" data-suppr>🗑 Supprimer</button>` : ''}
               <button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-enregistrer>💾 Enregistrer</button>`,
        surOuverture(mod, fermer) {
          const recalculer = () => {
            const base = Number(mod.querySelector('[name=montant]').value) || 0;
            const primes = Number(mod.querySelector('[name=primes]').value) || 0;
            const retenues = Number(mod.querySelector('[name=retenues]').value) || 0;
            mod.querySelector('#net-affiche').value = Fmt.fcfa(Math.max(0, base + primes - retenues));
          };
          ['montant', 'primes', 'retenues'].forEach((n) => mod.querySelector('[name=' + n + ']').oninput = recalculer);
          mod.querySelector('[data-fermer]').onclick = fermer;

          const bSuppr = mod.querySelector('[data-suppr]');
          if (bSuppr) bSuppr.onclick = async () => {
            if (!(await confirmer('Supprimer ce versement ?', { danger: true, valider: 'Supprimer' }))) return;
            try { await Api.del('/rh/salaires/' + v.id); notifier('Versement supprimé'); fermer(); charger(); }
            catch (e) { notifier(e.message, 'erreur'); }
          };

          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const f = lireFormulaire(mod);
            try {
              await Api.post('/rh/salaires', Object.assign(f, {
                employe_id: ligne.employe_id, periode: per,
              }));
              notifier('Versement enregistré');
              fermer(); charger();
            } catch (e) {
              mod.querySelector('#s-erreur').innerHTML =
                `<div class="bandeau erreur" style="margin-top:10px">${Fmt.echapper(e.message)}</div>`;
            }
          };
        },
      });
    }

    document.getElementById('s-filtrer').onclick = () => {
      filtres.q = document.getElementById('s-q').value.trim();
      if (document.getElementById('s-magasin')) filtres.magasin_id = document.getElementById('s-magasin').value;
      periode = document.getElementById('s-periode').value;
      charger();
    };
    document.getElementById('s-periode').onchange = (e) => { periode = e.target.value; charger(); };
    document.getElementById('s-q').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('s-filtrer').click(); };

    charger();
    App.suivre({ vue: 'salaires', types: ['tiers', 'compte'], rafraichir: () => charger() });
  },
});
