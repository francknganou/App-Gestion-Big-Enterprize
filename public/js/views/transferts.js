/* ==========================================================================
   Vue : Transferts entre magasins
   ========================================================================== */
App.enregistrerVue('transferts', {
  titre: 'Transferts', icone: '🔄', permissions: ['transferts.consulter'], groupe: 'Catalogue & stock',
  async rendre(zone) {
    const peutCreer = App.peut('transferts.creer');
    const peutValider = App.peut('transferts.valider');
    let statut = '';

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Transferts inter-magasins</h3>
          <div class="droite">
            <div class="champ" style="margin:0"><select id="t-statut">
              <option value="">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="valide">Validés</option>
              <option value="annule">Annulés</option></select></div>
            ${peutCreer ? '<button class="btn primaire" id="t-nouveau">＋ Nouveau transfert</button>' : ''}
          </div>
        </div>
        <div class="carte-corps serre" id="t-liste"></div>
      </div>
      <div class="carte">
        <div class="carte-entete"><h3>💡 Comment ça marche ?</h3></div>
        <div class="carte-corps petit texte-muted">
          Un transfert déplace un produit d'un magasin à un autre. Tant qu'il n'est pas <b>validé</b>, les stocks ne bougent pas :
          la validation retire la quantité du magasin source et l'ajoute au magasin de destination, et crée deux mouvements tracés dans le journal de stock.
        </div>
      </div>`;

    async function charger() {
      document.getElementById('t-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const lignes = await Api.get('/transferts', { statut });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      document.getElementById('t-liste').innerHTML = tableau([
        { titre: 'Référence', rendre: (l) => `<b>${Fmt.echapper(l.reference)}</b><div class="petit texte-muted">${Fmt.dateH(l.created_at)}</div>` },
        { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.produit)}</b><div class="petit texte-muted mono">${Fmt.echapper(l.code_produit)}</div>` },
        { titre: 'Trajet', rendre: (l) => `${Fmt.echapper(l.source)} <b>→</b> ${Fmt.echapper(l.destination)}` },
        { titre: 'Quantité', num: true, rendre: (l) => `<b>${Fmt.nombre(l.quantite)}</b>` },
        { titre: 'Statut', rendre: (l) => badgeStatutTransfert(l.statut) },
        { titre: 'Demandé par', rendre: (l) => Fmt.echapper(l.utilisateur || '—') },
        { titre: 'Note', rendre: (l) => Fmt.echapper(l.note || '—') },
        { titre: '', rendre: (l) => l.statut === 'en_attente' && peutValider ? `<div class="actions">
            <button class="btn petit primaire" data-valider="${l.id}">Valider</button>
            <button class="btn petit danger" data-annuler="${l.id}">Annuler</button></div>` : '' },
      ], lignes, { vide: 'Aucun transfert enregistré' });

      document.querySelectorAll('[data-valider]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Valider ce transfert ? Les stocks des deux magasins seront mis à jour.', { valider: 'Valider' }))) return;
        try { await Api.post(`/transferts/${b.dataset.valider}/valider`); notifier('Transfert validé'); charger(); App.rafraichirAlertes(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
      document.querySelectorAll('[data-annuler]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Annuler ce transfert ?', { danger: true, valider: 'Annuler' }))) return;
        try { await Api.post(`/transferts/${b.dataset.annuler}/annuler`); notifier('Transfert annulé'); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
    }

    document.getElementById('t-statut').onchange = (e) => { statut = e.target.value; charger(); };

    if (peutCreer) document.getElementById('t-nouveau').onclick = async () => {
      const [magasins, produits] = await Promise.all([Api.get('/magasins'), Api.get('/produits', { actif: 1 })]);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const sourceDefaut = App.magasinCourant() || (magasins[0] && magasins[0].id);
      ouvrirModale({
        titre: 'Nouveau transfert de stock',
        contenu: `
          <div class="grille-form">
            <div class="champ"><label>Magasin source *</label><select name="magasin_source_id">${options(magasins.filter((m) => m.actif), 'id', (m) => `${m.nom} — ${m.ville || ''}`, sourceDefaut)}</select></div>
            <div class="champ"><label>Magasin de destination *</label><select name="magasin_dest_id">${options(magasins.filter((m) => m.actif), 'id', (m) => `${m.nom} — ${m.ville || ''}`, magasins.find((m) => Number(m.id) !== Number(sourceDefaut))?.id)}</select></div>
            <div class="champ plein"><label>Produit *</label><select name="produit_id">${options(produits, 'id', (p) => `${p.nom} (${p.code})`, '')}</select>
              <div class="aide" id="tf-dispo"></div></div>
            <div class="champ"><label>Quantité *</label><input type="number" name="quantite" min="1" step="1" value="1"></div>
            <div class="champ"><label>Motif / note</label><input name="note" placeholder="Rééquilibrage de stock"></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-envoyer>Créer le transfert</button>`,
        surOuverture(mod, fermer) {
          const selProduit = mod.querySelector('[name=produit_id]');
          const selSource = mod.querySelector('[name=magasin_source_id]');
          const info = mod.querySelector('#tf-dispo');
          async function majDispo() {
            const stock = await Api.get('/stocks', { magasin_id: selSource.value, q: '' });
            const ligne = stock.find((s) => String(s.produit_id) === String(selProduit.value));
            const nomMagasin = selSource.options[selSource.selectedIndex].textContent;
            info.innerHTML = ligne
              ? `Disponible dans ${Fmt.echapper(nomMagasin)} : <b>${Fmt.nombre(ligne.quantite)}</b> ${Fmt.echapper(ligne.unite)}`
              : 'Disponibilité inconnue';
            mod.dataset.dispo = ligne ? ligne.quantite : 0;
          }
          selProduit.onchange = majDispo; selSource.onchange = majDispo; majDispo();
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-envoyer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (String(d.magasin_source_id) === String(d.magasin_dest_id)) return notifier('Choisissez deux magasins différents', 'erreur');
            try {
              await Api.post('/transferts', d);
              notifier('Transfert créé — en attente de validation'); fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    };
    charger();

    /* ---- Temps réel : les opérations des boutiques rafraîchissent cet écran ---- */
    App.suivre({
      vue: 'transferts',
      types: ['transfert', 'stock'],
      rafraichir: () => charger(),
    });
  },
});
