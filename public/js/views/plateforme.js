/* ==========================================================================
   Console du propriétaire : toutes les entreprises clientes, leurs boutiques,
   leurs comptes et tous leurs paiements d'abonnement.
   ========================================================================== */
const LIBELLE_SERVICE_PLAT = { orange_money: 'Orange Money', mtn_momo: 'MTN Mobile Money' };
const LIBELLE_STATUT_PAIEMENT = {
  en_attente: '<span class="badge attente">En attente</span>',
  valide: '<span class="badge ok">Validé</span>',
  rejete: '<span class="badge ko">Rejeté</span>',
};

function numeroJoliPlat(n) {
  const c = String(n || '').replace(/\D/g, '');
  if (c.length === 9) return `${c.slice(0, 3)} ${c.slice(3, 5)} ${c.slice(5, 7)} ${c.slice(7, 9)}`;
  return String(n || '—');
}

function vignetteEntreprise(e, taille = 38) {
  const style = `width:${taille}px;height:${taille}px;border-radius:9px;background:var(--primary-soft);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;font-size:${taille * 0.5}px;flex:none`;
  return e.logo
    ? `<span style="${style}"><img src="${Fmt.echapper(e.logo)}" style="width:100%;height:100%;object-fit:contain"></span>`
    : `<span style="${style}">🏬</span>`;
}

/* ------------------------------- Vue : tableau de bord plateforme ------------------------------- */
App.enregistrerVue('plateforme', {
  titre: 'Tableau de bord plateforme', icone: '🛰️',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    const r = await Api.get('/plateforme/resume');
    if (!document.body.contains(zone)) return;
    const attente = r.attente_nb
      ? `<div class="bandeau abonnement attente"><b>⏳ ${Fmt.nombre(r.attente_nb)} paiement(s) en attente</b>
          (${Fmt.fcfa(r.attente_montant)}) — <a href="#/plateforme-paiements" style="color:inherit;text-decoration:underline">voir et valider</a></div>`
      : '';
    zone.innerHTML = `
      ${attente}
      <div class="grille g-4">
        <div class="kpi bleu"><div class="libelle">Entreprises clientes</div><div class="valeur">${Fmt.nombre(r.nb_entreprises)}</div>
          <div class="pied">${r.nb_actives} active(s) · ${r.nb_suspendues} suspendue(s)</div></div>
        <div class="kpi ambre"><div class="libelle">En essai gratuit</div><div class="valeur">${Fmt.nombre(r.nb_essai)}</div>
          <div class="pied">${r.nb_abonnes} abonné(s) payant(s)</div></div>
        <div class="kpi vert"><div class="libelle">Encaissé (abonnements)</div><div class="valeur">${Fmt.fcfaCourt(r.encaisse)}</div>
          <div class="pied">${Fmt.nombre(r.nb_paiements_valides)} paiement(s) validé(s)</div></div>
        <div class="kpi rouge"><div class="libelle">Abonnements expirés</div><div class="valeur">${Fmt.nombre(r.nb_expirees)}</div>
          <div class="pied">À relancer</div></div>
      </div>

      <div class="grille g-4" style="margin-top:14px">
        <div class="kpi"><div class="libelle">Boutiques créées</div><div class="valeur">${Fmt.nombre(r.nb_magasins)}</div>
          <div class="pied">sur ${r.nb_entreprises} entreprise(s)</div></div>
        <div class="kpi"><div class="libelle">Comptes utilisateurs</div><div class="valeur">${Fmt.nombre(r.nb_comptes)}</div>
          <div class="pied">administrateurs, caissiers, agents…</div></div>
        <div class="kpi"><div class="libelle">Ventes enregistrées</div><div class="valeur">${Fmt.nombre(r.nb_ventes)}</div>
          <div class="pied">toutes entreprises</div></div>
        <div class="kpi"><div class="libelle">Chiffre d'affaires cumulé</div><div class="valeur">${Fmt.fcfaCourt(r.ca_reseau)}</div>
          <div class="pied">${Fmt.fcfa(r.ca_mois, false)} ce mois-ci</div></div>
      </div>

      <div class="carte" style="margin-top:14px">
        <div class="carte-entete"><h3>🏢 Dernières entreprises inscrites</h3>
          <div class="droite"><a class="btn petit primaire" href="#/plateforme-entreprises">Voir toutes les entreprises</a></div></div>
        <div class="carte-corps serre">
          ${tableau([
            { titre: 'Entreprise', rendre: (l) => `<div style="display:flex;align-items:center;gap:9px">${vignetteEntreprise(l, 32)}
                <div><b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.email)}</div></div></div>` },
            { titre: 'Contact', rendre: (l) => `${Fmt.echapper((l.responsable && l.responsable.nom) || '—')}
                <div class="petit texte-muted">${Fmt.echapper(l.telephone || '')}</div>` },
            { titre: 'Boutiques', num: true, rendre: (l) => Fmt.nombre(l.nb_magasins) },
            { titre: 'Comptes', num: true, rendre: (l) => Fmt.nombre(l.nb_comptes) },
            { titre: 'Ventes', num: true, rendre: (l) => Fmt.nombre(l.nb_ventes) },
            { titre: 'Abonnement', rendre: (l) => `<span class="badge ${l.abonnement.expire ? 'ko' : (l.abonnement.en_essai ? 'attente' : 'ok')}">${Fmt.echapper(l.abonnement.statut_libelle)}</span>
                <div class="petit texte-muted">${l.abonnement.jours_restants} jour(s) · fin ${Fmt.date(l.abonnement.date_fin)}</div>` },
            { titre: 'Inscrite le', rendre: (l) => Fmt.date(l.created_at) },
          ], r.entreprises.slice(0, 6), { vide: 'Aucune entreprise pour le moment' })}
        </div>
      </div>

      <div class="carte">
        <div class="carte-entete"><h3>⚙️ Réglages de la plateforme</h3>
          <div class="droite petit texte-muted">Tarifs, numéros de paiement et assistance</div></div>
        <div class="carte-corps">
          <form id="form-plateforme">
            <div class="grille-form">
              <div class="champ"><label>Tarif mensuel (FCFA)</label><input type="number" step="500" name="tarif_mensuel" value="${Fmt.echapper(r.tarifs.mensuel)}"></div>
              <div class="champ"><label>Tarif annuel (FCFA)</label><input type="number" step="1000" name="tarif_annuel" value="${Fmt.echapper(r.tarifs.annuel)}"></div>
              <div class="champ"><label>Jours d'essai gratuit</label><input type="number" name="essai_jours" value="${Fmt.echapper(r.tarifs.essai_jours)}"></div>
              <div class="champ"><label>Nom du marchand</label><input name="paiement_marchand" placeholder="INVENTA GESTYPRO"></div>
              <div class="champ"><label>Numéro Orange Money</label><input name="om_numero" placeholder="693007397"></div>
              <div class="champ"><label>Code USSD Orange</label><input name="om_ussd" placeholder="#150#"></div>
              <div class="champ"><label>Numéro MTN MoMo</label><input name="mtn_numero" placeholder="654324282"></div>
              <div class="champ"><label>Code USSD MTN</label><input name="mtn_ussd" placeholder="*126#"></div>
              <div class="champ"><label>WhatsApp d'assistance</label><input name="whatsapp_support" placeholder="654324282"></div>
              <div class="champ"><label>Email d'assistance</label><input name="support_email"></div>
              <div class="champ plein"><label>Message WhatsApp pré-rempli</label><input name="whatsapp_message"></div>
            </div>
            <button class="btn primaire" type="submit">💾 Enregistrer les réglages</button>
          </form>
        </div>
      </div>`;

    // Pré-remplissage des réglages actuels
    Api.get('/plateforme/parametres').then((p) => {
      const f = document.getElementById('form-plateforme');
      if (!f) return;
      Object.entries(p.valeurs || {}).forEach(([k, v]) => {
        const champ = f.querySelector(`[name=${k}]`);
        if (champ) champ.value = v === null || v === undefined ? '' : v;
      });
    }).catch(() => {});

    const form = document.getElementById('form-plateforme');
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await Api.put('/plateforme/parametres', lireFormulaire(form));
        notifier('Réglages de la plateforme enregistrés');
        App.monter('plateforme');
      } catch (err) { notifier(err.message, 'erreur'); }
    };
  },
});

/* ------------------------------- Vue : entreprises clientes ------------------------------- */
App.enregistrerVue('plateforme-entreprises', {
  titre: 'Entreprises clientes', icone: '🏢',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    let filtreStatut = '';
    let recherche = '';

    async function charger() {
      const params = {};
      if (recherche) params.q = recherche;
      if (filtreStatut) params.statut = filtreStatut;
      const liste = await Api.get('/plateforme/entreprises', Object.keys(params).length ? params : null);
      if (!document.body.contains(zone)) return;
      zone.innerHTML = `
        <div class="carte">
          <div class="carte-entete">
            <h3>🏢 ${Fmt.nombre(liste.length)} entreprise(s) cliente(s)</h3>
            <div class="droite" style="display:flex;gap:8px;align-items:center">
              <div class="recherche"><input id="pl-recherche" placeholder="Nom, email ou NIU…" value="${Fmt.echapper(recherche)}"></div>
              <select id="pl-statut" style="width:auto">
                <option value="">Tous les statuts</option>
                <option value="actif" ${filtreStatut === 'actif' ? 'selected' : ''}>Accès actif</option>
                <option value="suspendu" ${filtreStatut === 'suspendu' ? 'selected' : ''}>Accès suspendu</option>
              </select>
            </div>
          </div>
          <div class="carte-corps">
            <div class="grille g-2">
              ${liste.map((e) => `
                <div class="carte" style="margin:0">
                  <div class="carte-entete">
                    <h3 style="display:flex;align-items:center;gap:9px">
                      ${vignetteEntreprise(e, 34)} ${Fmt.echapper(e.nom)}
                    </h3>
                    <div class="droite">
                      <span class="badge ${e.abonnement.expire ? 'ko' : (e.abonnement.en_essai ? 'attente' : 'ok')}">${Fmt.echapper(e.abonnement.statut_libelle)}</span>
                    </div>
                  </div>
                  <div class="carte-corps">
                    <div class="petit texte-muted">${Fmt.echapper(e.email)} · ${Fmt.echapper(e.telephone || 'téléphone non renseigné')}</div>
                    <div style="margin:8px 0" class="petit">
                      👤 <b>${Fmt.echapper((e.responsable && e.responsable.nom) || '—')}</b> (${Fmt.echapper((e.responsable && e.responsable.email) || '—')})<br>
                      🧾 NIU : ${Fmt.echapper(e.niu || '—')}<br>
                      📅 Créée le ${Fmt.date(e.date_creation)} · inscrite le ${Fmt.date(e.created_at)}<br>
                      🏙️ ${Fmt.echapper(e.ville || '—')} · ${Fmt.echapper(e.pays || 'Cameroun')}<br>
                      ${e.statut === 'suspendu' ? '<span class="badge ko">Accès suspendu</span>' : ''}
                    </div>
                    <div class="panier-total"><span>Boutiques / magasins</span><b>${Fmt.nombre(e.nb_magasins)}${e.nb_magasins_actifs !== e.nb_magasins ? ` (${e.nb_magasins_actifs} ouvertes)` : ''}</b></div>
                    <div class="panier-total"><span>Comptes · produits · clients</span><b>${Fmt.nombre(e.nb_comptes)} · ${Fmt.nombre(e.nb_produits)} · ${Fmt.nombre(e.nb_clients)}</b></div>
                    <div class="panier-total"><span>Ventes / CA cumulé</span><b>${Fmt.nombre(e.nb_ventes)} · ${Fmt.fcfaCourt(e.ca_total)}</b></div>
                    <div class="panier-total"><span>Abonnement</span><b>${Fmt.echapper(e.abonnement.statut_libelle)} — ${e.abonnement.jours_restants} j</b></div>
                    <div class="panier-total"><span>Total payé</span><b>${Fmt.fcfa(e.total_paye)}${e.paiements_en_attente ? ` <span class="badge attente">${e.paiements_en_attente} en attente</span>` : ''}</b></div>
                    <div class="petit texte-muted" style="margin-top:6px">Dernière vente : ${Fmt.dateH(e.derniere_vente)}</div>
                    <div class="barre-outils" style="margin-top:12px">
                      <button class="btn petit primaire" data-fiche="${e.id}">🔍 Fiche complète</button>
                      ${App.peut('plateforme.gerer') ? `<button class="btn petit" data-statut="${e.id}" data-actuel="${e.statut}">${e.statut === 'suspendu' ? '✅ Réactiver' : '⏸️ Suspendre l\'accès'}</button>` : ''}
                    </div>
                  </div>
                </div>`).join('') || '<div class="vide">Aucune entreprise ne correspond</div>'}
            </div>
          </div>
        </div>`;

      document.getElementById('pl-recherche').oninput = (ev) => {
        recherche = ev.target.value;
        clearTimeout(charger.minuteur);
        charger.minuteur = setTimeout(charger, 400);
      };
      document.getElementById('pl-statut').onchange = (ev) => { filtreStatut = ev.target.value; charger(); };
      document.querySelectorAll('[data-fiche]').forEach((b) => b.onclick = () => fiche(Number(b.dataset.fiche)));
      document.querySelectorAll('[data-statut]').forEach((b) => b.onclick = async () => {
        const nouveau = b.dataset.actuel === 'suspendu' ? 'actif' : 'suspendu';
        if (!(await confirmer(nouveau === 'suspendu'
          ? 'Suspendre l\'accès de cette entreprise ? Ses utilisateurs ne pourront plus travailler.'
          : 'Rétablir l\'accès de cette entreprise ?', { danger: nouveau === 'suspendu', valider: 'Confirmer' }))) return;
        try { const r = await Api.post('/plateforme/entreprises/' + b.dataset.statut + '/statut', { statut: nouveau }); notifier(r.message); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
    }

    /** Fiche détaillée : informations, boutiques, comptes et paiements. */
    async function fiche(id) {
      const d = await Api.get('/plateforme/entreprises/' + id);
      const e = d.entreprise;
      const ab = d.abonnement;
      ouvrirModale({
        titre: 'Fiche entreprise — ' + e.nom,
        largeur: 'large',
        contenu: `
          <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
            ${vignetteEntreprise(e, 74)}
            <div style="flex:1;min-width:240px">
              <h3>${Fmt.echapper(e.nom)}</h3>
              <div class="petit texte-muted">${Fmt.echapper(e.email)} · ${Fmt.echapper(e.telephone || '—')}</div>
              <div class="petit">👤 ${Fmt.echapper([e.prenom_contact, e.nom_contact].filter(Boolean).join(' ') || '—')}</div>
              <div class="petit">🧾 NIU : <span class="mono">${Fmt.echapper(e.niu || '—')}</span></div>
              <div class="petit">📅 Entreprise créée le ${Fmt.date(e.date_creation)} · inscrite sur la plateforme le ${Fmt.date(e.created_at)}</div>
              <div class="petit">🏙️ ${Fmt.echapper(e.ville || '—')} · ${Fmt.echapper(e.pays || 'Cameroun')}</div>
              ${e.notes ? `<div class="aide">${Fmt.echapper(e.notes)}</div>` : ''}
            </div>
            <div style="min-width:210px">
              <span class="badge ${ab.expire ? 'ko' : (ab.en_essai ? 'attente' : 'ok')}">${Fmt.echapper(ab.statut_libelle)}</span>
              <div class="petit" style="margin-top:6px">Fin : <b>${Fmt.date(ab.date_fin)}</b> (${ab.jours_restants} j)</div>
              <div class="petit">Total payé : <b>${Fmt.fcfa(e.total_paye)}</b></div>
              ${App.peut('plateforme.gerer') ? `<div class="barre-outils" style="margin-top:8px">
                <button class="btn petit" data-offrir>🎁 Offrir 7 jours</button>
                <button class="btn petit" data-prolonger>➕ Prolonger 1 mois</button>
                <button class="btn petit danger" data-supprimer>🗑 Supprimer</button>
              </div>` : ''}
            </div>
          </div>

          <div class="grille g-4" style="margin-top:14px">
            <div class="kpi"><div class="libelle">Boutiques</div><div class="valeur">${Fmt.nombre(e.nb_magasins)}</div></div>
            <div class="kpi"><div class="libelle">Comptes</div><div class="valeur">${Fmt.nombre(e.nb_comptes)}</div></div>
            <div class="kpi"><div class="libelle">CA cumulé</div><div class="valeur">${Fmt.fcfaCourt(e.ca_total)}</div><div class="pied">${Fmt.nombre(e.nb_ventes)} ventes</div></div>
            <div class="kpi"><div class="libelle">Valeur du stock</div><div class="valeur">${Fmt.fcfaCourt(e.valeur_stock)}</div></div>
          </div>

          <h4 style="margin:16px 0 8px">🏬 Boutiques / magasins</h4>
          ${tableau([
            { titre: 'Boutique', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.code)} · ${Fmt.echapper(l.ville || '')}</div>` },
            { titre: 'Comptes', num: true, rendre: (l) => Fmt.nombre(l.nb_comptes) },
            { titre: 'Ventes', num: true, rendre: (l) => Fmt.nombre(l.nb_ventes) },
            { titre: 'CA total', num: true, rendre: (l) => Fmt.fcfa(l.ca_total, false) },
            { titre: "CA aujourd'hui", num: true, rendre: (l) => Fmt.fcfa(l.ca_jour, false) },
            { titre: 'Valeur stock', num: true, rendre: (l) => Fmt.fcfa(l.valeur_stock, false) },
            { titre: 'État', rendre: (l) => l.actif ? '<span class="badge ok">Ouverte</span>' : '<span class="badge ko">Fermée</span>' },
          ], d.magasins, { vide: 'Aucune boutique créée' })}

          <h4 style="margin:16px 0 8px">👥 Comptes utilisateurs</h4>
          ${tableau([
            { titre: 'Nom', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.email)}</div>` },
            { titre: 'Rôle', rendre: (l) => Fmt.echapper(l.role) },
            { titre: 'Boutique', rendre: (l) => Fmt.echapper(l.magasin || 'réseau') },
            { titre: 'Dernière connexion', rendre: (l) => Fmt.dateH(l.dernier_login) },
            { titre: 'État', rendre: (l) => l.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge ko">Désactivé</span>' },
          ], d.utilisateurs, { vide: 'Aucun compte' })}

          <h4 style="margin:16px 0 8px">💳 Paiements d'abonnement</h4>
          ${tableau([
            { titre: 'Référence', rendre: (l) => `<b class="mono">${Fmt.echapper(l.reference)}</b>` },
            { titre: 'Date', rendre: (l) => Fmt.dateH(l.created_at) },
            { titre: 'Service', rendre: (l) => `${Fmt.echapper(LIBELLE_SERVICE_PLAT[l.service] || l.service)}<div class="petit texte-muted mono">${Fmt.echapper(l.telephone_payeur || '—')}</div>` },
            { titre: 'Formule', rendre: (l) => `${Fmt.echapper(l.plan)} (${l.duree_jours} j)` },
            { titre: 'Montant', num: true, rendre: (l) => Fmt.fcfa(l.montant) },
            { titre: 'Statut', rendre: (l) => (LIBELLE_STATUT_PAIEMENT[l.statut] || l.statut)
                + (l.valide_par_nom ? `<div class="petit texte-muted">par ${Fmt.echapper(l.valide_par_nom)}</div>` : '') },
            { titre: '', rendre: (l) => App.peut('plateforme.gerer') ? (l.statut === 'en_attente'
                ? `<div class="actions"><button class="btn petit primaire" data-valider="${l.id}">Valider</button>
                   <button class="btn petit danger" data-rejeter="${l.id}">Rejeter</button></div>`
                : `<button class="btn petit" data-suppr="${l.id}">🗑</button>`) : '' },
          ], d.paiements, { vide: 'Aucun paiement' })}

          ${d.top_produits.length ? `<h4 style="margin:16px 0 8px">🏆 Produits les plus vendus</h4>
            ${listeBarres(d.top_produits, { cle: 'nom', valeur: 'ca', rendreCle: (x) => `${Fmt.echapper(x.nom)} <span class="petit texte-muted">×${Fmt.nombre(x.quantite)}</span>` })}` : ''}`,
        pied: `<button class="btn" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          mod.querySelectorAll('[data-valider]').forEach((b) => b.onclick = async () => {
            try {
              const r = await Api.post('/plateforme/paiements/' + b.dataset.valider + '/valider');
              notifier(`Paiement validé — ${r.entreprise} actif jusqu'au ${Fmt.date(r.etat.date_fin)}`);
              fermer(); charger();
            } catch (err) { notifier(err.message, 'erreur'); }
          });
          mod.querySelectorAll('[data-rejeter]').forEach((b) => b.onclick = async () => {
            const motif = prompt('Motif du rejet (facultatif) :') || '';
            try { await Api.post('/plateforme/paiements/' + b.dataset.rejeter + '/rejeter', { motif }); notifier('Paiement rejeté', 'attente'); fermer(); charger(); }
            catch (err) { notifier(err.message, 'erreur'); }
          });
          mod.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
            if (!(await confirmer('Supprimer cette ligne de paiement ?', { danger: true, valider: 'Supprimer' }))) return;
            try { await Api.del('/plateforme/paiements/' + b.dataset.suppr); notifier('Ligne supprimée', 'attente'); fermer(); charger(); }
            catch (err) { notifier(err.message, 'erreur'); }
          });
          const offrir = mod.querySelector('[data-offrir]');
          if (offrir) offrir.onclick = async () => {
            try { const r = await Api.post(`/plateforme/entreprises/${id}/abonnement`, { jours: 7 }); notifier(`7 jours offerts — fin ${Fmt.date(r.etat.date_fin)}`); fermer(); charger(); }
            catch (err) { notifier(err.message, 'erreur'); }
          };
          const prolonger = mod.querySelector('[data-prolonger]');
          if (prolonger) prolonger.onclick = async () => {
            try { const r = await Api.post(`/plateforme/entreprises/${id}/abonnement`, { plan: 'mensuel', motif: 'Prolongation offerte' }); notifier(`Abonnement prolongé — fin ${Fmt.date(r.etat.date_fin)}`); fermer(); charger(); }
            catch (err) { notifier(err.message, 'erreur'); }
          };
          const supprimer = mod.querySelector('[data-supprimer]');
          if (supprimer) supprimer.onclick = async () => {
            if (!(await confirmer(`Supprimer définitivement ${e.nom} et TOUTES ses données (boutiques, ventes, comptes) ?`, { danger: true, valider: 'Supprimer' }))) return;
            try { await Api.del('/plateforme/entreprises/' + id); notifier('Entreprise supprimée', 'attente'); fermer(); charger(); }
            catch (err) { notifier(err.message, 'erreur'); }
          };
        },
      });
    }

    charger();

    /* ---- Temps réel : les paiements déclarés par les entreprises arrivent ici ---- */
    App.suivre({
      vue: 'plateforme-paiements',
      types: ['plateforme', 'abonnement'],
      rafraichir: () => charger(),
    });
  },
});

/* ------------------------------- Vue : paiements ------------------------------- */
App.enregistrerVue('plateforme-paiements', {
  titre: 'Paiements des entreprises', icone: '💳',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    let filtre = { statut: '', service: '' };
    let referenceOuverte = null;

    async function charger() {
      const params = {};
      if (filtre.statut) params.statut = filtre.statut;
      if (filtre.service) params.service = filtre.service;
      const [paiements, resume] = await Promise.all([
        Api.get('/plateforme/paiements', Object.keys(params).length ? params : null),
        Api.get('/plateforme/resume'),
      ]);
      if (!document.body.contains(zone)) return;
      const totaux = paiements.reduce((acc, p) => {
        acc[p.statut] = acc[p.statut] || { nb: 0, montant: 0 };
        acc[p.statut].nb++; acc[p.statut].montant += p.montant;
        return acc;
      }, {});
      zone.innerHTML = `
        <div class="grille g-4">
          <div class="kpi vert"><div class="libelle">Validés</div><div class="valeur">${Fmt.fcfaCourt((totaux.valide || {}).montant)}</div>
            <div class="pied">${Fmt.nombre((totaux.valide || {}).nb)} paiement(s)</div></div>
          <div class="kpi ambre"><div class="libelle">En attente</div><div class="valeur">${Fmt.fcfaCourt((totaux.en_attente || {}).montant)}</div>
            <div class="pied">${Fmt.nombre((totaux.en_attente || {}).nb)} à valider</div></div>
          <div class="kpi rouge"><div class="libelle">Rejetés</div><div class="valeur">${Fmt.nombre((totaux.rejete || {}).nb)}</div>
            <div class="pied">${Fmt.fcfa((totaux.rejete || {}).montant || 0, false)}</div></div>
          <div class="kpi bleu"><div class="libelle">Tarifs par défaut</div>
            <div class="valeur" style="font-size:19px">${Fmt.fcfa(resume.tarifs.mensuel, false)} / mois</div>
            <div class="pied">${Fmt.fcfa(resume.tarifs.annuel)} par an</div></div>
        </div>

        <div class="carte" style="margin-top:14px">
          <div class="carte-entete">
            <h3>💳 Paiements reçus (${Fmt.nombre(paiements.length)})</h3>
            <div class="droite" style="display:flex;gap:8px">
              <select id="pl-p-statut" style="width:auto">
                <option value="">Tous les statuts</option>
                <option value="en_attente" ${filtre.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
                <option value="valide" ${filtre.statut === 'valide' ? 'selected' : ''}>Validés</option>
                <option value="rejete" ${filtre.statut === 'rejete' ? 'selected' : ''}>Rejetés</option>
              </select>
              <select id="pl-p-service" style="width:auto">
                <option value="">Tous les services</option>
                <option value="orange_money" ${filtre.service === 'orange_money' ? 'selected' : ''}>Orange Money</option>
                <option value="mtn_momo" ${filtre.service === 'mtn_momo' ? 'selected' : ''}>MTN MoMo</option>
              </select>
            </div>
          </div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Référence', rendre: (l) => `<b class="mono">${Fmt.echapper(l.reference)}</b><div class="petit texte-muted">${Fmt.dateH(l.created_at)}</div>` },
              { titre: 'Entreprise', rendre: (l) => `<b>${Fmt.echapper(l.entreprise || '—')}</b>` },
              { titre: 'Service', rendre: (l) => `${Fmt.echapper(LIBELLE_SERVICE_PLAT[l.service] || l.service)}
                  <div class="petit texte-muted mono">${Fmt.echapper(numeroJoliPlat(l.telephone_payeur ? l.telephone_payeur : l.numero_paiement))}</div>` },
              { titre: 'Formule', rendre: (l) => `${Fmt.echapper(l.plan)}<div class="petit texte-muted">${Fmt.nombre(l.duree_jours)} jours</div>` },
              { titre: 'Montant', num: true, rendre: (l) => Fmt.fcfa(l.montant) },
              { titre: 'Statut', rendre: (l) => (LIBELLE_STATUT_PAIEMENT[l.statut] || l.statut)
                  + (l.valide_par_nom ? `<div class="petit texte-muted">par ${Fmt.echapper(l.valide_par_nom)}</div>` : '') },
              { titre: 'Payeur', rendre: (l) => Fmt.echapper(l.utilisateur || l.nom_payeur || '—') },
              { titre: '', rendre: (l) => App.peut('plateforme.gerer') ? `<div class="actions">
                  ${l.statut === 'en_attente' ? `<button class="btn petit primaire" data-valider="${l.id}">Valider</button>
                  <button class="btn petit danger" data-rejeter="${l.id}">Rejeter</button>` : ''}
                  <button class="btn petit" data-suppr="${l.id}" title="Supprimer la ligne">🗑</button></div>` : '' },
            ], paiements, { vide: 'Aucun paiement enregistré' })}
          </div>
        </div>`;

      document.getElementById('pl-p-statut').onchange = (e) => { filtre.statut = e.target.value; charger(); };
      document.getElementById('pl-p-service').onchange = (e) => { filtre.service = e.target.value; charger(); };
      document.querySelectorAll('[data-valider]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Confirmer la réception de ce paiement Mobile Money et activer l\'abonnement ?', { valider: 'Valider le paiement' }))) return;
        try {
          const r = await Api.post('/plateforme/paiements/' + b.dataset.valider + '/valider');
          notifier(`${r.entreprise} — abonnement actif jusqu'au ${Fmt.date(r.etat.date_fin)}`);
          charger();
        } catch (e) { notifier(e.message, 'erreur'); }
      });
      document.querySelectorAll('[data-rejeter]').forEach((b) => b.onclick = async () => {
        const motif = prompt('Motif du rejet (facultatif) :') || '';
        try { await Api.post('/plateforme/paiements/' + b.dataset.rejeter + '/rejeter', { motif }); notifier('Paiement rejeté', 'attente'); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
      document.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Supprimer cette ligne de paiement ?', { danger: true, valider: 'Supprimer' }))) return;
        try { await Api.del('/plateforme/paiements/' + b.dataset.suppr); notifier('Ligne supprimée', 'attente'); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
    }
    charger();

    /* ---- Temps réel : une nouvelle entreprise inscrite ou un paiement déclaré
       apparaît sans recharger la console ---- */
    App.suivre({
      vue: 'plateforme-entreprises',
      types: ['plateforme', 'compte', 'boutique', 'vente', 'stock', 'tiers', 'transfert', 'achat'],
      rafraichir: () => charger(),
    });
  },
});

/* ==========================================================================
   Console du propriétaire — E-mails envoyés et serveur d'envoi.
   Sans serveur SMTP configuré, chaque message est consigné ici (statut
   « simulé ») et reste consultable : rien n'est perdu.
   ========================================================================== */
App.enregistrerVue('plateforme-mails', {
  titre: 'E-mails', icone: '✉️',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    let filtre = '';

    async function charger() {
      const params = filtre ? { statut: filtre } : null;
      const d = await Api.get('/plateforme/mails', params);
      if (!document.body.contains(zone)) return;
      const m = d.messages || [];
      const compte = m.reduce((a, x) => { a[x.statut] = (a[x.statut] || 0) + 1; return a; }, {});

      zone.innerHTML = `
        <div class="grille g-4">
          <div class="kpi"><div class="libelle">Messages consignés</div><div class="valeur">${Fmt.nombre(m.length)}</div>
            <div class="pied">${Fmt.nombre(compte.envoye || 0)} envoyé(s) · ${Fmt.nombre(compte.simule || 0)} simulé(s) · ${Fmt.nombre(compte.erreur || 0)} en erreur</div></div>
          <div class="kpi ${d.smtp.configure ? 'vert' : 'ambre'}"><div class="libelle">Serveur d'envoi</div>
            <div class="valeur">${d.smtp.configure ? 'Configuré' : 'Non configuré'}</div>
            <div class="pied">${d.smtp.configure ? Fmt.echapper(d.smtp.hote + ':' + d.smtp.port) : 'Les messages restent dans ce journal'}</div></div>
          <div class="kpi"><div class="libelle">Validité des codes</div><div class="valeur">${Fmt.nombre(d.validite_codes_minutes)} min</div>
            <div class="pied">Vérification d'email à l'inscription</div></div>
          <div class="kpi"><div class="libelle">Expéditeur</div>
            <div class="valeur" style="font-size:15px">${Fmt.echapper(d.smtp.expediteur || '—')}</div>
            <div class="pied">${d.smtp.utilisateur ? 'Compte : ' + Fmt.echapper(d.smtp.utilisateur) : 'Aucun compte'}</div></div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>🔌 Serveur d'envoi (SMTP)</h3>
            <div class="droite"><span class="badge ${d.smtp.configure ? 'ok' : 'ambre'}">${d.smtp.configure ? 'Actif' : 'En attente de configuration'}</span></div></div>
          <div class="carte-corps">
            ${d.smtp.configure ? '' : `<div class="bandeau ambre" style="margin-bottom:12px">
              <b>Aucun serveur configuré : les e-mails ne partent pas.</b>
              <div style="margin-top:4px">Renseignez les coordonnées ci-dessous (ou les variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS),
              puis testez l'envoi. Tant que ce n'est pas fait, les codes de vérification et les identifiants
              restent lisibles dans le journal ci-dessous.</div></div>`}
            <form id="form-smtp" class="grille g-3">
              <div class="champ"><label>Serveur (hôte)</label><input name="smtp_host" value="${Fmt.echapper(d.smtp.hote)}" placeholder="smtp.gmail.com"></div>
              <div class="champ"><label>Port</label><input name="smtp_port" value="${Fmt.echapper(d.smtp.port || '587')}"></div>
              <div class="champ"><label>Connexion sécurisée (TLS/SSL)</label>
                <select name="smtp_secure"><option value="0" ${d.smtp.secure ? '' : 'selected'}>Non (STARTTLS, port 587)</option>
                  <option value="1" ${d.smtp.secure ? 'selected' : ''}>Oui (port 465)</option></select></div>
              <div class="champ"><label>Utilisateur</label><input name="smtp_user" value="${Fmt.echapper(d.smtp.utilisateur)}" placeholder="compte@exemple.com"></div>
              <div class="champ"><label>Mot de passe</label><input name="smtp_pass" type="password" placeholder="${d.smtp.mot_de_passe_defini ? '•••••••• (déjà enregistré)' : ''}"></div>
              <div class="champ"><label>Adresse expéditeur</label><input name="mail_from" value="${Fmt.echapper(d.smtp.expediteur)}" placeholder="Inventa GestyPro <noreply@exemple.com>"></div>
              <div class="champ" style="grid-column:1/-1">
                <div class="barre-outils">
                  <button class="btn primaire" type="submit">💾 Enregistrer</button>
                  <button class="btn" type="button" id="smtp-tester">🧪 Tester l'envoi</button>
                </div>
              </div>
            </form>
            <div id="smtp-message"></div>
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>📬 Journal des e-mails</h3>
            <div class="droite"><select id="m-filtre">
              <option value="">Tous les statuts</option>
              <option value="envoye" ${filtre === 'envoye' ? 'selected' : ''}>Envoyés</option>
              <option value="simule" ${filtre === 'simule' ? 'selected' : ''}>Simulés (non partis)</option>
              <option value="erreur" ${filtre === 'erreur' ? 'selected' : ''}>En erreur</option>
            </select></div></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Destinataire', rendre: (l) => `<b class="mono">${Fmt.echapper(l.destinataire)}</b>
                  <div class="petit texte-muted">${Fmt.echapper(l.entreprise || '—')}</div>` },
              { titre: 'Type', rendre: (l) => `<span class="badge">${Fmt.echapper(l.type)}</span>` },
              { titre: 'Sujet', rendre: (l) => Fmt.echapper(l.sujet) },
              { titre: 'Statut', rendre: (l) => `<span class="badge ${l.statut === 'envoye' ? 'ok' : l.statut === 'erreur' ? 'erreur' : 'ambre'}">${Fmt.echapper(l.statut)}</span>
                  ${l.erreur ? `<div class="petit texte-muted">${Fmt.echapper(String(l.erreur).slice(0, 60))}</div>` : ''}` },
              { titre: 'Date', rendre: (l) => `<span class="mono petit">${Fmt.dateH(l.date)}</span>` },
              { titre: 'Actions', rendre: (l) => `<div class="barre-outils">
                  <button class="btn petit" data-voir="${l.id}">👁 Voir</button>
                  <button class="btn petit" data-renvoyer="${l.id}">🔁 Renvoyer</button></div>` },
            ], m, { vide: 'Aucun e-mail pour le moment. Ils apparaîtront ici dès la première inscription ou création de compte.' })}
          </div>
        </div>`;

      zone.querySelector('#m-filtre').onchange = (e) => { filtre = e.target.value; charger(); };

      zone.querySelector('#form-smtp').onsubmit = async (ev) => {
        ev.preventDefault();
        const f = lireFormulaire(ev.target);
        const msg = zone.querySelector('#smtp-message');
        if (!f.smtp_pass) delete f.smtp_pass; // conserve le mot de passe déjà enregistré
        try {
          await Api.put('/plateforme/parametres', f);
          msg.innerHTML = '<div class="bandeau ok" style="margin-top:10px"><b>✅ Configuration enregistrée</b></div>';
          notifier('Serveur d’envoi enregistré');
          setTimeout(charger, 600);
        } catch (e) {
          msg.innerHTML = `<div class="bandeau erreur" style="margin-top:10px">${Fmt.echapper(e.message)}</div>`;
        }
      };

      zone.querySelector('#smtp-tester').onclick = async () => {
        const email = (prompt('Adresse de test :', 'franck06.nganou02oumbe2004@gmail.com') || '').trim();
        if (!email) return;
        const msg = zone.querySelector('#smtp-message');
        try {
          const r = await Api.post('/plateforme/mails/tester', { email });
          msg.innerHTML = r.ok
            ? '<div class="bandeau ok" style="margin-top:10px"><b>✅ Message de test envoyé</b></div>'
            : `<div class="bandeau erreur" style="margin-top:10px"><b>⚠️ Envoi en échec (${Fmt.echapper(r.statut)})</b><div class="petit">${Fmt.echapper(r.erreur || '')}</div></div>`;
          setTimeout(charger, 800);
        } catch (e) {
          msg.innerHTML = `<div class="bandeau erreur" style="margin-top:10px">${Fmt.echapper(e.message)}</div>`;
        }
      };

      zone.querySelectorAll('[data-voir]').forEach((b) => b.onclick = () => {
        const l = m.find((x) => x.id === Number(b.dataset.voir));
        if (!l) return;
        ouvrirModale({
          titre: 'E-mail #' + l.id,
          contenu: `<div class="bloc-paiement">
              <div class="panier-total"><span>Destinataire</span><b class="mono">${Fmt.echapper(l.destinataire)}</b></div>
              <div class="panier-total"><span>Type</span><b>${Fmt.echapper(l.type)}</b></div>
              <div class="panier-total"><span>Statut</span><b>${Fmt.echapper(l.statut)}</b></div>
              <div class="panier-total"><span>Sujet</span><b>${Fmt.echapper(l.sujet)}</b></div>
            </div>
            <div class="champ" style="margin-top:12px"><label>Contenu du message</label>
              <textarea rows="14" readonly style="font-family:ui-monospace,monospace;font-size:12px">${Fmt.echapper(l.corps_texte || '')}</textarea></div>
            ${l.statut === 'simule' ? '<div class="aide">Ce message n’est pas parti : aucun serveur d’envoi n’était configuré au moment de sa création.</div>' : ''}`,
          pied: `<button class="btn" data-fermer>Fermer</button>`,
          surOuverture(el, fermer) { el.querySelector('[data-fermer]').onclick = fermer; },
        });
      });

      zone.querySelectorAll('[data-renvoyer]').forEach((b) => b.onclick = async () => {
        try {
          const r = await Api.post('/plateforme/mails/' + b.dataset.renvoyer + '/renvoyer', {});
          notifier(r.ok ? 'Message renvoyé' : (r.erreur || 'Envoi en échec'), r.ok ? 'succes' : 'erreur');
          charger();
        } catch (e) { notifier(e.message, 'erreur'); }
      });
    }

    charger();
    App.suivre({ vue: 'plateforme-mails', types: ['compte', 'plateforme'], rafraichir: () => charger() });
  },
});
