/* ==========================================================================
   Vue : Ventes (historique, détail, annulation, export)
   ========================================================================== */
App.enregistrerVue('ventes', {
  titre: 'Ventes', icone: '📑', permissions: ['ventes.consulter'], groupe: 'Ventes',
  async rendre(zone) {
    const filtres = {
      debut: Fmt.iso(-30), fin: Fmt.iso(), magasin_id: App.global() ? (App.magasinCourant() || '') : '',
      mode_paiement: '', statut: '', q: '',
    };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Filtres</h3>
          <div class="droite">
            <button class="btn petit" id="v-export">⬇️ Exporter en CSV</button>
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="champ"><label>Du</label><input type="date" id="v-debut" value="${filtres.debut}"></div>
            <div class="champ"><label>Au</label><input type="date" id="v-fin" value="${filtres.fin}"></div>
            ${App.global() ? `<div class="champ"><label>Magasin</label><select id="v-magasin">
              <option value="">Tous les magasins</option>${options(App.etat.magasins, 'id', (m) => m.nom, filtres.magasin_id)}</select></div>` : ''}
            <div class="champ"><label>Paiement</label><select id="v-mode">
              <option value="">Tous</option>${Object.entries(LIBELLE_MODE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
            <div class="champ"><label>État</label><select id="v-statut">
              <option value="">Tous</option><option value="payee">Payée</option><option value="annulee">Annulée</option></select></div>
            <div class="recherche"><input id="v-q" placeholder="Rechercher une référence ou un client…"></div>
            <button class="btn primaire" id="v-filtrer">Appliquer</button>
          </div>
        </div>
      </div>

      <div class="grille g-kpi" style="margin-bottom:18px" id="v-kpi"></div>

      <div class="carte">
        <div class="carte-entete"><h3>Journal des ventes</h3><div class="droite petit texte-muted" id="v-info"></div></div>
        <div class="carte-corps serre" id="v-liste"></div>
      </div>`;

    const lire = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };

    async function charger() {
      document.getElementById('v-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const requete = {
        debut: lire('v-debut'), fin: lire('v-fin'), mode_paiement: lire('v-mode'),
        statut: lire('v-statut'), q: lire('v-q'), limite: 500,
      };
      const mag = lire('v-magasin') || (App.global() ? '' : App.magasinCourant());
      if (mag) requete.magasin_id = mag;
      const r = await Api.get('/ventes', requete);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const payees = r.ventes.filter((v) => v.statut === 'payee');
      const annulees = r.ventes.filter((v) => v.statut === 'annulee');
      const panier = payees.length ? r.total_affiche / payees.length : 0;
      document.getElementById('v-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Chiffre d'affaires (période)</div><div class="valeur">${Fmt.fcfa(r.total_affiche)}</div>
          <div class="pied">${payees.length} vente(s) payée(s)</div></div>
        <div class="kpi bleu"><div class="libelle">Panier moyen</div><div class="valeur">${Fmt.fcfa(Math.round(panier))}</div>
          <div class="pied">Sur les ventes payées</div></div>
        <div class="kpi rouge"><div class="libelle">Ventes annulées</div><div class="valeur">${Fmt.nombre(annulees.length)}</div>
          <div class="pied">Montant : ${Fmt.fcfa(annulees.reduce((s, v) => s + v.total, 0))}</div></div>`;
      document.getElementById('v-info').textContent =
        `${r.ventes.length} vente(s) affichée(s) · du ${Fmt.date(lire('v-debut'))} au ${Fmt.date(lire('v-fin'))}`;
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement

      document.getElementById('v-liste').innerHTML = tableau([
        { titre: 'Référence', rendre: (l) => `<b>${Fmt.echapper(l.reference)}</b><div class="petit texte-muted">${Fmt.dateH(l.created_at)}</div>` },
        { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
        { titre: 'Client', rendre: (l) => Fmt.echapper(l.client || 'Client de passage') },
        { titre: 'Caissier', rendre: (l) => Fmt.echapper(l.caissier || '—') },
        { titre: 'Articles', num: true, rendre: (l) => Fmt.nombre(l.nb_articles) },
        { titre: 'Paiement', rendre: (l) => `${Fmt.echapper(LIBELLE_MODE[l.mode_paiement] || l.mode_paiement)}<div class="petit texte-muted">${Fmt.fcfa(l.total)}</div>` },
        { titre: 'État', rendre: (l) => badgeStatutVente(l.statut) },
        { titre: '', rendre: (l) => `<div class="actions"><button class="btn petit" data-voir="${l.id}">Détail</button></div>` },
      ], r.ventes, { vide: 'Aucune vente sur cette période' });

      document.querySelectorAll('[data-voir]').forEach((b) => b.onclick = (e) => {
        e.stopPropagation(); detail(Number(b.dataset.voir));
      });
      document.querySelectorAll('#v-liste tbody tr').forEach((tr) => tr.onclick = () => tr.dataset.id && detail(Number(tr.dataset.id)));
    }

    async function detail(id) {
      const v = await Api.get('/ventes/' + id);
      const peutAnnuler = App.peut('ventes.annuler') && v.statut === 'payee';
      const m = ouvrirModale({
        titre: 'Vente ' + v.reference,
        largeur: 'large',
        contenu: `
          <div class="grille g-3" style="margin-bottom:14px">
            <div><div class="petit texte-muted">Date</div><b>${Fmt.dateH(v.created_at)}</b></div>
            <div><div class="petit texte-muted">Magasin</div><b>${Fmt.echapper(v.magasin)}</b></div>
            <div><div class="petit texte-muted">Caissier</div><b>${Fmt.echapper(v.caissier || '—')}</b></div>
            <div><div class="petit texte-muted">Client</div><b>${Fmt.echapper(v.client || 'Client de passage')}</b></div>
            <div><div class="petit texte-muted">Mode de paiement</div><b>${Fmt.echapper(LIBELLE_MODE[v.mode_paiement] || v.mode_paiement)}</b></div>
            <div><div class="petit texte-muted">État</div>${badgeStatutVente(v.statut)}</div>
          </div>
          ${tableau([
            { titre: 'Article', rendre: (l) => Fmt.echapper(l.nom_produit) },
            { titre: 'Qté', num: true, rendre: (l) => Fmt.nombre(l.quantite) },
            { titre: 'Prix unitaire', num: true, rendre: (l) => Fmt.fcfa(l.prix_unitaire) },
            { titre: 'Remise', num: true, rendre: (l) => (l.remise ? '-' + Fmt.fcfa(l.remise) : '—') },
            { titre: 'Total', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.total)}</b>` },
          ], v.lignes)}
          <div style="max-width:340px;margin-left:auto;margin-top:14px">
            <div class="panier-total"><span>Sous-total</span><span>${Fmt.fcfa(v.sous_total)}</span></div>
            <div class="panier-total"><span>Remise</span><span>${Fmt.fcfa(v.remise)}</span></div>
            <div class="panier-total grand"><span>Total</span><span>${Fmt.fcfa(v.total)}</span></div>
            <div class="panier-total"><span>Montant reçu</span><span>${Fmt.fcfa(v.montant_paye)}</span></div>
            <div class="panier-total"><span>Monnaie rendue</span><span>${Fmt.fcfa(v.monnaie)}</span></div>
          </div>`,
        pied: `<button class="btn" data-ticket>🖨️ Ticket</button>
               ${peutAnnuler ? '<button class="btn danger" data-annuler>Annuler la vente</button>' : ''}
               <button class="btn primaire" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          mod.querySelector('[data-ticket]').onclick = () => App.afficherTicket(v.id);
          const bAnnuler = mod.querySelector('[data-annuler]');
          if (bAnnuler) bAnnuler.onclick = async () => {
            if (!(await confirmer(`Annuler la vente ${v.reference} ? Les articles seront remis en stock.`, { danger: true, valider: 'Annuler la vente' }))) return;
            try {
              await Api.post(`/ventes/${v.id}/annuler`);
              notifier('Vente annulée, stock réintégré');
              fermer(); charger(); App.rafraichirAlertes();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
      return m;
    }

    document.getElementById('v-filtrer').onclick = charger;
    document.getElementById('v-q').onkeydown = (e) => { if (e.key === 'Enter') charger(); };
    document.getElementById('v-export').onclick = async () => {
      try {
        await Api.telecharger(`/export.csv?type=ventes&debut=${lire('v-debut')}&fin=${lire('v-fin')}`, `ventes_${lire('v-debut')}_${lire('v-fin')}.csv`);
        notifier('Export téléchargé');
      } catch (e) { notifier(e.message, 'erreur'); }
    };
    charger();

    /* ---- Temps réel : les opérations des boutiques rafraîchissent cet écran ---- */
    App.suivre({
      vue: 'ventes',
      types: ['vente'],
      rafraichir: () => charger(),
    });
  },
});
