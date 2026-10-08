/* ==========================================================================
   Console du propriétaire — VENTES D'ABONNEMENTS
   Tous les paiements reçus des entreprises clientes : validés, en attente ou
   rejetés, avec filtres, totaux, validation et export.
   ========================================================================== */

const LIBELLE_SERVICE_VENTE = {
  orange_money: 'Orange Money',
  mtn_momo: 'MTN Mobile Money',
  mastercard: 'Carte bancaire',
};
const BADGE_STATUT_VENTE = {
  en_attente: '<span class="badge attente">En attente</span>',
  valide: '<span class="badge ok">Validé</span>',
  rejete: '<span class="badge ko">Rejeté</span>',
};

App.enregistrerVue('plateforme-ventes', {
  titre: 'Ventes d’abonnements', icone: '🧾',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    const filtres = { statut: '', service: '', entreprise_id: '', depuis: '', jusqu: '', q: '' };
    let entreprises = [];
    let derniereReponse = null;

    /* ------------------------------ Export CSV ------------------------------ */
    function exporterCsv() {
      if (!derniereReponse || !derniereReponse.paiements.length) {
        notifier('Aucune ligne à exporter', 'erreur');
        return;
      }
      const entetes = ['Référence', 'Date', 'Entreprise', 'Formule', 'Service', 'Montant brut',
        'Remise', 'Montant net', 'Statut', 'Payeur', 'Code réduction', 'PSP'];
      const lignes = derniereReponse.paiements.map((p) => [
        p.reference, (p.created_at || '').slice(0, 16), p.entreprise || '',
        p.formule_libelle || p.plan || '', LIBELLE_SERVICE_VENTE[p.service] || p.service,
        Number(p.montant_brut || p.montant), Number(p.montant_brut || p.montant) - Number(p.montant),
        Number(p.montant), p.statut, p.nom_payeur || p.utilisateur || '',
        p.code_reduction || '', p.psp || 'manuel',
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));
      const csv = '\uFEFF' + [entetes.join(';'), ...lignes].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `ventes-abonnements-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    /* ------------------------------ Détail ------------------------------ */
    function detail(p) {
      const remise = Number(p.montant_brut || p.montant) - Number(p.montant);
      const psp = (p.psp && p.psp !== 'manuel')
        ? `<tr><th>Prestataire</th><td>${Fmt.echapper(p.psp)} (${Fmt.echapper(p.psp_mode || '—')})
             — statut ${Fmt.echapper(p.psp_statut || '—')}</td></tr>` : '';
      const carte = p.carte_numero_masque
        ? `<tr><th>Carte</th><td class="mono">${Fmt.echapper(p.carte_numero_masque)}
             — exp. ${Fmt.echapper(p.carte_expiration || '—')} — ${Fmt.echapper(p.carte_titulaire || '')}</td></tr>` : '';
      ouvrirModale({
        titre: `Paiement ${p.reference}`,
        largeur: '620px',
        contenu: `
          <table class="tableau" style="margin:0">
            <tr><th>Entreprise</th><td>${Fmt.echapper(p.entreprise || '—')}</td></tr>
            <tr><th>Formule</th><td>${Fmt.echapper(p.formule_libelle || p.plan)} — ${Fmt.nombre(p.duree_jours)} jour(s)</td></tr>
            <tr><th>Service</th><td>${Fmt.echapper(LIBELLE_SERVICE_VENTE[p.service] || p.service)}</td></tr>
            <tr><th>Montant brut</th><td>${Fmt.fcfa(p.montant_brut || p.montant)}</td></tr>
            ${remise ? `<tr><th>Remise${p.code_reduction ? ` (${Fmt.echapper(p.code_reduction)})` : ''}</th>
              <td>− ${Fmt.fcfa(remise)}</td></tr>` : ''}
            <tr><th>Montant net</th><td><b>${Fmt.fcfa(p.montant)}</b></td></tr>
            <tr><th>Statut</th><td>${BADGE_STATUT_VENTE[p.statut] || Fmt.echapper(p.statut)}</td></tr>
            <tr><th>Déclaré par</th><td>${Fmt.echapper(p.nom_payeur || p.utilisateur || '—')}
              ${p.telephone_payeur ? `— <span class="mono">${Fmt.echapper(p.telephone_payeur)}</span>` : ''}</td></tr>
            <tr><th>Créé le</th><td>${Fmt.dateH(p.created_at)}</td></tr>
            ${p.traite_at ? `<tr><th>Traité le</th><td>${Fmt.dateH(p.traite_at)} par ${Fmt.echapper(p.valide_par_nom || 'le propriétaire')}</td></tr>` : ''}
            ${carte}${psp}
            ${p.message ? `<tr><th>Message</th><td style="white-space:pre-wrap">${Fmt.echapper(p.message)}</td></tr>` : ''}
          </table>`,
        pied: p.statut === 'en_attente'
          ? `<button class="btn" data-fermer>Fermer</button>
             <button class="btn danger" data-rejeter="${p.id}">Rejeter</button>
             <button class="btn primaire" data-valider="${p.id}">Valider le paiement</button>`
          : '<button class="btn primaire" data-fermer>Fermer</button>',
        surOuverture(m) {
          const v = m.querySelector('[data-valider]');
          const r = m.querySelector('[data-rejeter]');
          if (v) v.addEventListener('click', () => valider(p, m));
          if (r) r.addEventListener('click', () => rejeter(p, m));
        },
      });
    }

    async function valider(p, modale) {
      const oui = await confirmer(
        `Valider le paiement ${p.reference} de ${p.entreprise || 'cette entreprise'} pour ${Fmt.fcfa(p.montant)} ?
         L'abonnement sera prolongé de ${Fmt.nombre(p.duree_jours)} jour(s).`,
        { valider: 'Valider et prolonger' });
      if (!oui) return;
      try {
        const r = await Api.post('/plateforme/paiements/' + p.id + '/valider', {});
        notifier(`Paiement ${p.reference} validé — abonnement actif jusqu'au ${Fmt.date(r.etat && r.etat.date_fin)}`);
        if (modale && modale.remove) modale.remove();
        document.querySelectorAll('.voile').forEach((v) => v.remove());
        charger();
      } catch (e) { notifier(e.message, 'erreur'); }
    }

    async function rejeter(p, modale) {
      const motif = window.prompt('Motif du rejet (transmis à l’entreprise) :', 'Paiement non retrouvé');
      if (motif === null) return;
      try {
        await Api.post('/plateforme/paiements/' + p.id + '/rejeter', { motif });
        notifier(`Paiement ${p.reference} rejeté`);
        if (modale && modale.remove) modale.remove();
        document.querySelectorAll('.voile').forEach((v) => v.remove());
        charger();
      } catch (e) { notifier(e.message, 'erreur'); }
    }

    /* ------------------------------ Rendu ------------------------------ */
    async function charger() {
      const q = {};
      Object.entries(filtres).forEach(([k, v]) => { if (v) q[k] = v; });
      const r = await Api.get('/plateforme/ventes', q);
      derniereReponse = r;
      if (!document.body.contains(zone)) return;
      peindre(r);
    }

    function peindre(r) {
      const t = r.totaux;
      const lignes = r.paiements.map((p) => {
        const remise = Number(p.montant_brut || p.montant) - Number(p.montant);
        return `<tr data-ligne="${p.id}">
          <td><a href="#" data-voir="${p.id}" class="mono">${Fmt.echapper(p.reference)}</a></td>
          <td>${Fmt.dateH(p.created_at)}</td>
          <td>${vignetteEntreprise({ logo: p.entreprise_logo })} ${Fmt.echapper(p.entreprise || '—')}</td>
          <td>${Fmt.echapper(p.formule_libelle || p.plan || '—')}
            <div class="petit texte-muted">${Fmt.nombre(p.duree_jours)} j</div></td>
          <td>${Fmt.echapper(LIBELLE_SERVICE_VENTE[p.service] || p.service)}
            ${p.psp && p.psp !== 'manuel' ? `<div class="petit texte-muted">via ${Fmt.echapper(p.psp)}</div>` : ''}</td>
          <td class="num">${remise ? `<s class="texte-muted">${Fmt.fcfaCourt(p.montant_brut)}</s><br>` : ''}
            <b>${Fmt.fcfa(p.montant)}</b></td>
          <td>${BADGE_STATUT_VENTE[p.statut] || Fmt.echapper(p.statut)}</td>
          <td>${Fmt.echapper(p.nom_payeur || p.utilisateur || '—')}</td>
          <td class="num">
            <button class="btn petit" data-voir="${p.id}">Détail</button>
            ${p.statut === 'en_attente' ? `
              <button class="btn petit primaire" data-valider="${p.id}">Valider</button>
              <button class="btn petit danger" data-rejeter="${p.id}">Rejeter</button>` : ''}
          </td>
        </tr>`;
      }).join('');

      zone.innerHTML = `
        ${entetePage({
          titre: 'Ventes d’abonnements',
          sous: 'Tous les paiements reçus des entreprises clientes — validés, en attente ou rejetés.',
          actions: `<button class="btn" id="v-export">⬇️ Exporter en CSV</button>
                    <button class="btn primaire" id="v-rafraichir">↻ Actualiser</button>`,
        })}

        <div class="grille g-4">
          <div class="kpi vert"><div class="libelle">Déjà encaissé</div>
            <div class="valeur">${Fmt.fcfa(t.encaisse)}</div>
            <div class="petit texte-muted">${Fmt.nombre(t.nb_valides)} paiement(s) validé(s)</div></div>
          <div class="kpi ambre"><div class="libelle">En attente de validation</div>
            <div class="valeur">${Fmt.fcfa(t.attente)}</div>
            <div class="petit texte-muted">${Fmt.nombre(t.nb_attente)} demande(s)</div></div>
          <div class="kpi rouge"><div class="libelle">Rejeté</div>
            <div class="valeur">${Fmt.fcfa(t.rejete)}</div>
            <div class="petit texte-muted">${Fmt.nombre(t.nb_rejetes)} ligne(s)</div></div>
          <div class="kpi bleu"><div class="libelle">Remises accordées</div>
            <div class="valeur">${Fmt.fcfa(t.remise_accordee)}</div>
            <div class="petit texte-muted">sur les paiements validés</div></div>
        </div>

        <div class="carte">
          <div class="carte-entete"><div><b>Filtres</b>
            <div class="sous">${Fmt.nombre(r.nb_resultats)} ligne(s) affichée(s)</div></div></div>
          <div class="grille g-4" style="gap:10px">
            <label class="champ"><span>Statut</span>
              <select name="statut">
                <option value="">Tous</option>
                <option value="en_attente" ${filtres.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
                <option value="valide" ${filtres.statut === 'valide' ? 'selected' : ''}>Validés</option>
                <option value="rejete" ${filtres.statut === 'rejete' ? 'selected' : ''}>Rejetés</option>
              </select></label>
            <label class="champ"><span>Service</span>
              <select name="service">
                <option value="">Tous</option>
                <option value="orange_money" ${filtres.service === 'orange_money' ? 'selected' : ''}>Orange Money</option>
                <option value="mtn_momo" ${filtres.service === 'mtn_momo' ? 'selected' : ''}>MTN MoMo</option>
                <option value="mastercard" ${filtres.service === 'mastercard' ? 'selected' : ''}>Carte bancaire</option>
              </select></label>
            <label class="champ"><span>Entreprise</span>
              <select name="entreprise_id">
                <option value="">Toutes</option>
                ${entreprises.map((e) => `<option value="${e.id}" ${String(filtres.entreprise_id) === String(e.id) ? 'selected' : ''}>${Fmt.echapper(e.nom)}</option>`).join('')}
              </select></label>
            <label class="champ"><span>Recherche</span>
              <input name="q" placeholder="Référence, payeur, code…" value="${Fmt.echapper(filtres.q)}"></label>
            <label class="champ"><span>Du</span><input type="date" name="depuis" value="${Fmt.echapper(filtres.depuis)}"></label>
            <label class="champ"><span>Au</span><input type="date" name="jusqu" value="${Fmt.echapper(filtres.jusqu)}"></label>
            <div style="align-self:end;display:flex;gap:8px">
              <button class="btn" id="v-reinit">Réinitialiser</button>
              <button class="btn primaire" id="v-filtrer">Filtrer</button>
            </div>
          </div>
        </div>

        <div class="carte">
          <div class="tableau-enveloppe"><table class="tableau">
            <thead><tr>
              <th>Référence</th><th>Date</th><th>Entreprise</th><th>Formule</th>
              <th>Service</th><th class="num">Montant</th><th>Statut</th><th>Payeur</th><th class="num">Actions</th>
            </tr></thead>
            <tbody>${lignes || `<tr><td colspan="9"><div class="vide"><span>📭</span>Aucun paiement ne correspond à ces filtres.</div></td></tr>`}</tbody>
          </table></div>
        </div>`;

      zone.querySelectorAll('[name]').forEach((el) => {
        el.addEventListener('change', () => { filtres[el.name] = el.value; });
        if (el.name === 'q') {
          el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { filtres.q = el.value; charger(); } });
        }
      });
      const appliquer = () => {
        zone.querySelectorAll('[name]').forEach((el) => { filtres[el.name] = el.value; });
        charger();
      };
      zone.querySelector('#v-filtrer').addEventListener('click', appliquer);
      zone.querySelector('#v-reinit').addEventListener('click', () => {
        Object.keys(filtres).forEach((k) => { filtres[k] = ''; });
        charger();
      });
      zone.querySelector('#v-rafraichir').addEventListener('click', charger);
      zone.querySelector('#v-export').addEventListener('click', exporterCsv);
      zone.querySelectorAll('[data-voir]').forEach((b) => b.addEventListener('click', (ev) => {
        ev.preventDefault();
        detail(r.paiements.find((p) => String(p.id) === b.dataset.voir));
      }));
      zone.querySelectorAll('[data-valider]').forEach((b) => b.addEventListener('click', () => {
        valider(r.paiements.find((p) => String(p.id) === b.dataset.valider));
      }));
      zone.querySelectorAll('[data-rejeter]').forEach((b) => b.addEventListener('click', () => {
        rejeter(r.paiements.find((p) => String(p.id) === b.dataset.rejeter));
      }));
    }

    try {
      const resume = await Api.get('/plateforme/resume');
      entreprises = (resume && resume.entreprises) || [];
    } catch (e) { entreprises = []; }
    /* Actualisation silencieuse toutes les 15 s (sauf si une fenêtre est ouverte). */
    App.suivre({
      vue: 'plateforme-ventes', types: ['plateforme'],
      rafraichir: () => { if (!document.querySelector('.voile')) charger(); },
    });
    await charger();
  },
});
