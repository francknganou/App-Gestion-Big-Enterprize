/* ==========================================================================
   Vue : Catalogue produits
   ========================================================================== */
App.enregistrerVue('produits', {
  titre: 'Produits', icone: '🏷️', permissions: ['produits.consulter'], groupe: 'Catalogue & stock',
  async rendre(zone) {
    const peutGerer = App.peut('produits.gerer');
    const voitPrix = App.voitPrix();
    const [categories] = await Promise.all([Api.get('/categories')]);
    if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
    const filtres = { q: '', categorie_id: '', alerte: '', actif: '1' };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Filtres</h3>
          <div class="droite">
            ${peutGerer ? '<button class="btn" id="p-categorie">＋ Catégorie</button>' : ''}
            <button class="btn" id="p-export">⬇️ Exporter</button>
            ${peutGerer ? '<button class="btn primaire" id="p-nouveau">＋ Nouveau produit</button>' : ''}
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="recherche"><input id="p-q" placeholder="Rechercher par nom, code ou code-barres…"></div>
            <div class="champ"><label>Catégorie</label><select id="p-cat"><option value="">Toutes</option>${options(categories, 'id', 'nom', '')}</select></div>
            <div class="champ"><label>État</label><select id="p-actif">
              <option value="1">Produits actifs</option><option value="0">Produits désactivés</option><option value="">Tous</option></select></div>
            <div class="champ"><label>Alerte</label><select id="p-alerte">
              <option value="">Tous</option><option value="1">Stock sous le seuil</option></select></div>
            <button class="btn primaire" id="p-filtrer">Appliquer</button>
          </div>
        </div>
      </div>
      <div class="grille g-kpi" style="margin-bottom:18px" id="p-kpi"></div>
      <div class="carte">
        <div class="carte-entete"><h3>Catalogue</h3><div class="droite petit texte-muted" id="p-info"></div></div>
        <div class="carte-corps serre" id="p-liste"></div>
      </div>`;

    const lire = (id) => document.getElementById(id).value;

    async function charger() {
      document.getElementById('p-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const r = await Api.get('/produits', {
        q: lire('p-q'), categorie_id: lire('p-cat'), actif: lire('p-actif'), alerte: lire('p-alerte'),
        magasin_id: App.global() ? '' : App.magasinCourant(),
      });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const valeur = r.reduce((s, p) => s + p.stock_total * p.prix_vente, 0);
      const alertes = r.filter((p) => p.stock_total <= p.seuil_alerte).length;
      const margeMoy = r.length ? r.reduce((s, p) => s + (p.prix_vente ? (p.marge_unitaire / p.prix_vente) * 100 : 0), 0) / r.length : 0;
      document.getElementById('p-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Références affichées</div><div class="valeur">${Fmt.nombre(r.length)}</div><div class="pied">sur ${categories.reduce((s, c) => s + c.nb_produits, 0)} produits actifs</div></div>
        ${voitPrix ? `<div class="kpi vert"><div class="libelle">Valeur du stock (prix de vente)</div><div class="valeur">${Fmt.fcfa(valeur)}</div><div class="pied">Toutes les boutiques</div></div>` : ''}
        <div class="kpi ${alertes ? 'rouge' : ''}"><div class="libelle">Produits en alerte</div><div class="valeur">${Fmt.nombre(alertes)}</div><div class="pied">Stock ≤ seuil d'alerte</div></div>
        ${voitPrix ? `<div class="kpi ambre"><div class="libelle">Marge moyenne</div><div class="valeur">${Fmt.pct(margeMoy)}</div><div class="pied">Sur les produits affichés</div></div>` : ''}`;
      document.getElementById('p-info').textContent = `${r.length} produit(s)`;

      // Les colonnes de prix d'achat et de marge ne sont affichées qu'aux profils
      // disposant de la permission « prix.consulter ».
      const colonnesProduits = [
        { titre: 'Code', rendre: (l) => `<span class="mono">${Fmt.echapper(l.code)}</span>` },
        { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.categorie || 'Sans catégorie')} · ${Fmt.echapper(l.unite)}</div>` },
        ...(voitPrix ? [{ titre: 'Prix achat', num: true, rendre: (l) => Fmt.fcfa(l.prix_achat) }] : []),
        { titre: 'Prix vente', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.prix_vente)}</b>` },
        ...(voitPrix ? [{ titre: 'Marge', num: true, rendre: (l) => (l.prix_vente ? `<span class="hausse">${Fmt.pct((l.marge_unitaire / l.prix_vente) * 100)}</span>` : '—') }] : []),
        { titre: 'Stock total', num: true, rendre: (l) => badgeStock(l.stock_total, l.seuil_alerte) },
      ];
      const reste = [
        { titre: 'Seuil', num: true, rendre: (l) => Fmt.nombre(l.seuil_alerte) },
        { titre: 'État', rendre: (l) => (l.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge neutre">Désactivé</span>') },
        { titre: '', rendre: (l) => `<div class="actions">
            <button class="btn petit" data-fiche="${l.id}">Fiche</button>
            ${peutGerer ? `<button class="btn petit" data-modif="${l.id}">Modifier</button>` : ''}
            ${peutGerer ? `<button class="btn petit danger" data-suppr="${l.id}">Suppr.</button>` : ''}
          </div>` },
      ];
      document.getElementById('p-liste').innerHTML = tableau([...colonnesProduits, ...reste], r, { vide: 'Aucun produit ne correspond aux filtres' });


      document.querySelectorAll('[data-fiche]').forEach((b) => b.onclick = () => fiche(Number(b.dataset.fiche)));
      document.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(r.find((p) => p.id === Number(b.dataset.modif))));
      document.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        const p = r.find((x) => x.id === Number(b.dataset.suppr));
        if (!(await confirmer(`Supprimer « ${p.nom} » ? S'il appartient à des ventes, il sera simplement désactivé.`, { danger: true, valider: 'Supprimer' }))) return;
        try {
          const res = await Api.del('/produits/' + p.id);
          notifier(res.desactive ? res.message : 'Produit supprimé');
          charger();
        } catch (e) { notifier(e.message, 'erreur'); }
      });
    }

    async function fiche(id) {
      const p = await Api.get('/produits/' + id);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      ouvrirModale({
        titre: p.nom, largeur: 'large',
        contenu: `
          <div class="grille g-3" style="margin-bottom:16px">
            <div><div class="petit texte-muted">Code</div><b class="mono">${Fmt.echapper(p.code)}</b></div>
            <div><div class="petit texte-muted">Catégorie</div><b>${Fmt.echapper(p.categorie || '—')}</b></div>
            <div><div class="petit texte-muted">Unité</div><b>${Fmt.echapper(p.unite)}</b></div>
            ${App.voitPrix() ? `<div><div class="petit texte-muted">Prix d'achat</div><b>${Fmt.fcfa(p.prix_achat)}</b></div>` : ''}
            <div><div class="petit texte-muted">Prix de vente</div><b>${Fmt.fcfa(p.prix_vente)}</b></div>
            <div><div class="petit texte-muted">Stock total</div><b>${Fmt.nombre(p.stock_total)} ${Fmt.echapper(p.unite)}</b></div>
          </div>
          <h4 style="margin-bottom:8px">Stock par magasin</h4>
          ${tableau([
            { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
            { titre: 'Quantité', num: true, rendre: (l) => badgeStock(l.quantite, p.seuil_alerte) },
            { titre: 'Dernière mise à jour', num: true, rendre: (l) => Fmt.dateH(l.maj_at) },
          ], p.stocks)}
          <h4 style="margin:18px 0 8px">Derniers mouvements</h4>
          ${tableau([
            { titre: 'Date', rendre: (l) => Fmt.dateH(l.created_at) },
            { titre: 'Type', rendre: (l) => `<span class="puce">${LIBELLE_MOUVEMENT[l.type] || l.type}</span>` },
            { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
            { titre: 'Qté', num: true, rendre: (l) => (l.quantite > 0 ? '<span class="hausse">+' : '<span class="baisse">') + Fmt.nombre(l.quantite) + '</span>' },
            { titre: 'Motif', rendre: (l) => Fmt.echapper(l.motif || '—') },
            { titre: 'Par', rendre: (l) => Fmt.echapper(l.utilisateur || '—') },
          ], p.mouvements, { vide: 'Aucun mouvement' })}`,
        pied: `<button class="btn primaire" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) { mod.querySelector('[data-fermer]').onclick = fermer; },
      });
    }

    function formulaire(produit) {
      const p = produit || { unite: 'pièce', tva: 19.25, seuil_alerte: 5, prix_achat: 0, prix_vente: 0, actif: 1 };
      ouvrirModale({
        titre: produit ? 'Modifier le produit' : 'Nouveau produit',
        largeur: 'large',
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><label>Désignation *</label><input name="nom" value="${Fmt.echapper(p.nom || '')}" required></div>
            <div class="champ"><label>Code article</label><input name="code" value="${Fmt.echapper(p.code || '')}" placeholder="auto si vide"></div>
            <div class="champ"><label>Code-barres</label><input name="code_barres" value="${Fmt.echapper(p.code_barres || '')}"></div>
            <div class="champ"><label>Catégorie</label><select name="categorie_id"><option value="">—</option>${options(categories, 'id', 'nom', p.categorie_id)}</select></div>
            <div class="champ"><label>Unité</label><input name="unite" value="${Fmt.echapper(p.unite || 'pièce')}"></div>
            <div class="champ"><label>Prix d'achat (FCFA)</label><input type="number" name="prix_achat" min="0" step="1" value="${p.prix_achat}"></div>
            <div class="champ"><label>Prix de vente (FCFA) *</label><input type="number" name="prix_vente" min="0" step="1" value="${p.prix_vente}" required></div>
            <div class="champ"><label>Seuil d'alerte</label><input type="number" name="seuil_alerte" min="0" step="1" value="${p.seuil_alerte}"></div>
            <div class="champ"><label>TVA (%)</label><input type="number" name="tva" step="0.01" value="${p.tva}"></div>
            <div class="champ plein"><label><input type="checkbox" name="actif" ${p.actif ? 'checked' : ''} style="width:auto;margin-right:6px">Produit actif (visible en caisse)</label></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.nom || !d.prix_vente) return notifier('Désignation et prix de vente sont obligatoires', 'erreur');
            try {
              if (produit) await Api.put('/produits/' + produit.id, d);
              else await Api.post('/produits', d);
              notifier(produit ? 'Produit mis à jour' : 'Produit créé');
              fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    document.getElementById('p-filtrer').onclick = charger;
    document.getElementById('p-q').onkeydown = (e) => { if (e.key === 'Enter') charger(); };
    document.getElementById('p-actif').onchange = charger;
    document.getElementById('p-alerte').onchange = charger;
    document.getElementById('p-export').onclick = async () => {
      try { await Api.telecharger('/export.csv?type=produits', 'catalogue_produits.csv'); notifier('Export téléchargé'); }
      catch (e) { notifier(e.message, 'erreur'); }
    };
    if (peutGerer) {
      document.getElementById('p-nouveau').onclick = () => formulaire(null);
      document.getElementById('p-categorie').onclick = () => {
        ouvrirModale({
          titre: 'Catégories de produits',
          contenu: `${tableau([
            { titre: 'Catégorie', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.description || '')}</div>` },
            { titre: 'Produits', num: true, rendre: (l) => Fmt.nombre(l.nb_produits) },
          ], categories)}
          <h4 style="margin:16px 0 8px">Ajouter une catégorie</h4>
          <div class="grille-form">
            <div class="champ"><label>Nom *</label><input name="nom"></div>
            <div class="champ"><label>Description</label><input name="description"></div>
          </div>`,
          pied: '<button class="btn" data-annuler>Fermer</button><button class="btn primaire" data-ajouter>Ajouter</button>',
          surOuverture(mod, fermer) {
            mod.querySelector('[data-annuler]').onclick = fermer;
            mod.querySelector('[data-ajouter]').onclick = async () => {
              const d = lireFormulaire(mod);
              if (!d.nom) return notifier('Nom obligatoire', 'erreur');
              try {
                await Api.post('/categories', d);
                notifier('Catégorie ajoutée'); fermer();
                const maj = await Api.get('/categories'); categories.length = 0; categories.push(...maj);
                document.getElementById('p-cat').innerHTML = '<option value="">Toutes</option>' + options(categories, 'id', 'nom', '');
                charger();
              } catch (e) { notifier(e.message, 'erreur'); }
            };
          },
        });
      };
    }
    charger();
  },
});
