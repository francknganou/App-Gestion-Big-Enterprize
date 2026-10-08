/* ==========================================================================
   Vue : Commandes d'achat (approvisionnement fournisseurs)
   ========================================================================== */
App.enregistrerVue('achats', {
  titre: 'Achats', icone: '🚚', permissions: ['achats.consulter'], groupe: 'Catalogue & stock',
  async rendre(zone) {
    const peutCreer = App.peut('achats.creer');
    const peutReceptionner = App.peut('achats.receptionner');
    const peutAgir = peutCreer || peutReceptionner;
    let statut = '';

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Commandes fournisseurs</h3>
          <div class="droite">
            <div class="champ" style="margin:0"><select id="a-statut">
              <option value="">Tous les statuts</option>
              <option value="brouillon">Brouillons</option>
              <option value="commandee">Commandées</option>
              <option value="recue">Reçues</option>
              <option value="annulee">Annulées</option>
            </select></div>
            ${peutCreer ? '<button class="btn primaire" id="a-nouveau">＋ Nouvelle commande</button>' : ''}
          </div>
        </div>
        <div class="carte-corps serre" id="a-liste"></div>
      </div>`;

    async function charger() {
      document.getElementById('a-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const lignes = await Api.get('/achats', { statut });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      document.getElementById('a-liste').innerHTML = tableau([
        { titre: 'Référence', rendre: (l) => `<b>${Fmt.echapper(l.reference)}</b><div class="petit texte-muted">${Fmt.dateH(l.created_at)}</div>` },
        { titre: 'Fournisseur', rendre: (l) => Fmt.echapper(l.fournisseur) },
        { titre: 'Magasin livré', rendre: (l) => Fmt.echapper(l.magasin) },
        { titre: 'Lignes', num: true, rendre: (l) => Fmt.nombre(l.nb_lignes) },
        { titre: 'Montant', num: true, rendre: (l) => (l.total === null ? '<span class="petit texte-muted">masqué</span>' : `<b>${Fmt.fcfa(l.total)}</b>`) },
        { titre: 'Statut', rendre: (l) => badgeStatutAchat(l.statut) },
        { titre: '', rendre: (l) => `<div class="actions"><button class="btn petit" data-voir="${l.id}">Ouvrir</button></div>` },
      ], lignes, { vide: 'Aucune commande d’achat' });
      document.querySelectorAll('[data-voir]').forEach((b) => b.onclick = () => ouvrir(Number(b.dataset.voir)));
    }

    async function ouvrir(id) {
      const c = await Api.get('/achats/' + id);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      ouvrirModale({
        titre: 'Commande ' + c.reference, largeur: 'large',
        contenu: `
          <div class="grille g-3" style="margin-bottom:14px">
            <div><div class="petit texte-muted">Fournisseur</div><b>${Fmt.echapper(c.fournisseur)}</b><div class="petit texte-muted">${Fmt.echapper(c.fournisseur_tel || '')}</div></div>
            <div><div class="petit texte-muted">Magasin de livraison</div><b>${Fmt.echapper(c.magasin)}</b></div>
            <div><div class="petit texte-muted">Créée le</div><b>${Fmt.dateH(c.created_at)}</b></div>
            <div><div class="petit texte-muted">Statut</div>${badgeStatutAchat(c.statut)}</div>
            ${c.reception_at ? `<div><div class="petit texte-muted">Réceptionnée le</div><b>${Fmt.dateH(c.reception_at)}</b></div>` : ''}
          </div>
          ${tableau([
            { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.produit)}</b><div class="petit texte-muted mono">${Fmt.echapper(l.code_produit)}</div>` },
            { titre: 'Quantité', num: true, rendre: (l) => Fmt.nombre(l.quantite) },
            { titre: 'Prix unitaire', num: true, rendre: (l) => (l.prix_unitaire === null ? '<span class="petit texte-muted">—</span>' : Fmt.fcfa(l.prix_unitaire)) },
            { titre: 'Total', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.quantite * l.prix_unitaire)}</b>` },
          ], c.lignes)}
          <div class="panier-total grand" style="margin-top:12px"><span>Total commande</span><span>${Fmt.fcfa(c.total)}</span></div>
          ${c.note ? `<p class="petit texte-muted" style="margin-top:10px">Note : ${Fmt.echapper(c.note)}</p>` : ''}
          <div class="aide" style="margin-top:12px">💡 À la réception, les quantités entrent automatiquement en stock dans le magasin choisi et le prix d'achat du produit est mis à jour.</div>`,
        pied: `
          ${c.statut === 'brouillon' && peutCreer ? '<button class="btn" data-commander>Marquer commandée</button>' : ''}
          ${['brouillon', 'commandee'].includes(c.statut) && peutReceptionner ? '<button class="btn primaire" data-recevoir>✅ Réceptionner</button>' : ''}
          ${['brouillon', 'commandee'].includes(c.statut) && peutCreer ? '<button class="btn danger" data-annuler>Annuler</button>' : ''}
          <button class="btn" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          const bCmd = mod.querySelector('[data-commander]');
          if (bCmd) bCmd.onclick = async () => {
            try { await Api.put(`/achats/${c.id}/statut`, { statut: 'commandee' }); notifier('Commande transmise au fournisseur'); fermer(); charger(); }
            catch (e) { notifier(e.message, 'erreur'); }
          };
          const bRec = mod.querySelector('[data-recevoir]');
          if (bRec) bRec.onclick = async () => {
            if (!(await confirmer('Confirmer la réception ? Les articles seront ajoutés au stock du magasin.', { valider: 'Réceptionner' }))) return;
            try { await Api.put(`/achats/${c.id}/statut`, { statut: 'recue' }); notifier('Commande réceptionnée, stock mis à jour'); fermer(); charger(); App.rafraichirAlertes(); }
            catch (e) { notifier(e.message, 'erreur'); }
          };
          const bAnn = mod.querySelector('[data-annuler]');
          if (bAnn) bAnn.onclick = async () => {
            if (!(await confirmer('Annuler cette commande ?', { danger: true, valider: 'Annuler la commande' }))) return;
            try { await Api.put(`/achats/${c.id}/statut`, { statut: 'annulee' }); notifier('Commande annulée'); fermer(); charger(); }
            catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    document.getElementById('a-statut').onchange = (e) => { statut = e.target.value; charger(); };

    if (peutCreer) document.getElementById('a-nouveau').onclick = async () => {
      const [fournisseurs, magasins, produits] = await Promise.all([
        Api.get('/fournisseurs'), Api.get('/magasins'), Api.get('/produits', { actif: 1 }),
      ]);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      let lignes = [{ produit_id: produits[0] ? produits[0].id : '', quantite: 10, prix_unitaire: produits[0] ? produits[0].prix_achat : 0 }];
      const m = ouvrirModale({
        titre: 'Nouvelle commande d’achat', largeur: 'large',
        contenu: `
          <div class="grille-form">
            <div class="champ"><label>Fournisseur *</label><select name="fournisseur_id">${options(fournisseurs, 'id', 'nom', '')}</select></div>
            <div class="champ"><label>Magasin de livraison *</label><select name="magasin_id">${options(magasins.filter((x) => x.actif), 'id', (x) => x.nom, App.magasinCourant() || '')}</select></div>
            <div class="champ plein"><label>Note</label><input name="note" placeholder="Réassort mensuel, promotion…"></div>
          </div>
          <h4 style="margin:14px 0 8px">Lignes de commande</h4>
          <div id="a-lignes"></div>
          <button class="btn petit" id="a-ajouter" style="margin-top:8px">＋ Ajouter une ligne</button>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Créer la commande</button>`,
        surOuverture(mod, fermer) {
          const zoneLignes = mod.querySelector('#a-lignes');
          const dessiner = () => {
            zoneLignes.innerHTML = lignes.map((l, i) => `
              <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center">
                <select data-prod="${i}">${options(produits, 'id', (p) => `${p.nom} (${p.code})`, l.produit_id)}</select>
                <input type="number" min="1" step="1" value="${l.quantite}" data-qte="${i}" placeholder="Qté">
                <input type="number" min="0" step="1" value="${l.prix_unitaire}" data-pu="${i}" placeholder="Prix achat">
                <button class="btn petit danger" data-suppr="${i}">🗑</button>
              </div>`).join('') +
              `<div class="droite"><b>Total : ${Fmt.fcfa(lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0))}</b></div>`;
            zoneLignes.querySelectorAll('[data-prod]').forEach((s) => s.onchange = () => {
              const i = Number(s.dataset.prod);
              lignes[i].produit_id = s.value;
              const p = produits.find((x) => String(x.id) === String(s.value));
              lignes[i].prix_unitaire = p ? p.prix_achat : 0;
              dessiner();
            });
            zoneLignes.querySelectorAll('[data-qte]').forEach((s) => s.onchange = () => { lignes[Number(s.dataset.qte)].quantite = Number(s.value) || 1; dessiner(); });
            zoneLignes.querySelectorAll('[data-pu]').forEach((s) => s.onchange = () => { lignes[Number(s.dataset.pu)].prix_unitaire = Number(s.value) || 0; dessiner(); });
            zoneLignes.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = () => { lignes.splice(Number(b.dataset.suppr), 1); if (!lignes.length) lignes.push({ produit_id: produits[0].id, quantite: 1, prix_unitaire: 0 }); dessiner(); });
          };
          dessiner();
          mod.querySelector('#a-ajouter').onclick = () => { lignes.push({ produit_id: produits[0].id, quantite: 10, prix_unitaire: produits[0].prix_achat }); dessiner(); };
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.fournisseur_id || !d.magasin_id) return notifier('Fournisseur et magasin obligatoires', 'erreur');
            try {
              const r = await Api.post('/achats', { ...d, lignes });
              notifier('Commande ' + r.reference + ' créée'); fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
      return m;
    };
    charger();
  },
});
