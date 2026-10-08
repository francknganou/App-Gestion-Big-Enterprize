/* ==========================================================================
   Vue : Stocks — état par boutique, mouvements, réception rapide (sans prix)
   ========================================================================== */
App.enregistrerVue('stocks', {
  titre: 'Stocks', icone: '📦', permissions: ['stock.consulter'], groupe: 'Catalogue & stock',
  async rendre(zone) {
    const droit = {
      entree: App.peut('stock.entree'),
      sortie: App.peut('stock.sortie'),
      ajuster: App.peut('stock.ajuster'),
      journal: App.peut('journal.consulter'),
      prix: App.voitPrix(),
    };
    let magasin = App.magasinCourant();
    let onglet = 'etat';
    const filtres = { q: '', alerte: '' };
    const journalFiltres = { type: '', debut: Fmt.iso(-30), fin: Fmt.iso() };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Gestion des stocks</h3>
          <div class="droite">
            ${App.global() ? `<div class="champ" style="margin:0"><select id="s-magasin">${options(App.etat.magasins, 'id', (m) => `${m.nom} — ${m.ville || ''}`, magasin)}</select></div>` : ''}
            <button class="btn" id="s-export">⬇️ Exporter</button>
          </div>
        </div>
        <div class="carte-corps">
          <div class="onglets" id="s-onglets">
            <button class="actif" data-onglet="etat">📦 État du stock</button>
            ${droit.entree ? '<button data-onglet="reception">📥 Réception rapide</button>' : ''}
            ${droit.journal ? '<button data-onglet="journal">🕓 Journal des mouvements</button>' : ''}
            <button data-onglet="alertes">⚠️ Alertes</button>
          </div>
          <div id="s-contenu"></div>
        </div>
      </div>`;

    const zoneContenu = document.getElementById('s-contenu');
    const selMagasin = document.getElementById('s-magasin');
    if (selMagasin) selMagasin.onchange = (e) => {
      magasin = Number(e.target.value);
      App.etat.magasinActif = magasin;
      Stockage.setItem('sp_magasin', String(magasin));
      charger();
    };
    document.querySelectorAll('#s-onglets button').forEach((b) => b.onclick = () => {
      onglet = b.dataset.onglet;
      document.querySelectorAll('#s-onglets button').forEach((x) => x.classList.toggle('actif', x === b));
      charger();
    });

    async function charger() {
      zoneContenu.innerHTML = '<div class="vide">Chargement…</div>';
      if (onglet === 'etat') return etat();
      if (onglet === 'reception') return reception();
      if (onglet === 'journal') return journal();
      return alertes();
    }

    /* ------------------------------------------------------------ État du stock */
    async function etat() {
      const lignes = await Api.get('/stocks', { magasin_id: magasin, q: filtres.q, alerte: filtres.alerte });
      if (!document.body.contains(zoneContenu)) return;
      const valeurVente = lignes.reduce((s, l) => s + l.valeur, 0);
      const valeurAchat = lignes.reduce((s, l) => s + l.quantite * l.prix_achat, 0);
      const enAlerte = lignes.filter((l) => l.quantite <= l.seuil_alerte);
      const quantiteTotale = lignes.reduce((s, l) => s + l.quantite, 0);
      zoneContenu.innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:16px">
          <div class="kpi"><div class="libelle">Références en stock</div><div class="valeur">${Fmt.nombre(lignes.length)}</div>
            <div class="pied">${Fmt.nombre(quantiteTotale)} article(s) au total</div></div>
          ${droit.prix ? `
            <div class="kpi vert"><div class="libelle">Valeur du stock (vente)</div><div class="valeur">${Fmt.fcfa(valeurVente)}</div>
              <div class="pied">Au prix d'achat : ${Fmt.fcfa(valeurAchat)}</div></div>
            <div class="kpi bleu"><div class="libelle">Marge potentielle</div><div class="valeur">${Fmt.fcfa(valeurVente - valeurAchat)}</div>
              <div class="pied">Si tout le stock est vendu</div></div>` : ''}
          <div class="kpi ${enAlerte.length ? 'rouge' : ''}"><div class="libelle">Références en alerte</div><div class="valeur">${Fmt.nombre(enAlerte.length)}</div>
            <div class="pied">Quantité ≤ seuil d'alerte</div></div>
        </div>
        <div class="filtres" style="margin-bottom:14px">
          <div class="recherche"><input id="s-q" placeholder="Rechercher un produit…" value="${Fmt.echapper(filtres.q)}"></div>
          <div class="champ"><label>Filtre</label><select id="s-alerte">
            <option value="">Tous les produits</option>
            <option value="1" ${filtres.alerte ? 'selected' : ''}>Uniquement en alerte</option></select></div>
          <button class="btn primaire" id="s-appliquer">Appliquer</button>
        </div>
        ${tableau([
          { titre: 'Code', rendre: (l) => `<span class="mono">${Fmt.echapper(l.code)}</span>` },
          { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.categorie || '')}</div>` },
          { titre: 'Quantité', num: true, rendre: (l) => badgeStock(l.quantite, l.seuil_alerte) },
          { titre: 'Seuil', num: true, rendre: (l) => Fmt.nombre(l.seuil_alerte) },
          ...(droit.prix ? [{ titre: 'Valeur (vente)', num: true, rendre: (l) => Fmt.fcfa(l.valeur) }] : []),
          { titre: 'Dernière MAJ', num: true, rendre: (l) => Fmt.date(l.maj_at) },
          { titre: '', rendre: (l) => {
              const boutons = [];
              if (droit.entree) boutons.push(`<button class="btn petit" data-entree="${l.produit_id}">＋ Entrée</button>`);
              if (droit.sortie) boutons.push(`<button class="btn petit" data-sortie="${l.produit_id}">− Sortie</button>`);
              if (droit.ajuster) boutons.push(`<button class="btn petit" data-ajust="${l.produit_id}">Inventaire</button>`);
              return boutons.length ? `<div class="actions">${boutons.join('')}</div>` : '';
            } },
        ], lignes, { vide: 'Aucun produit' })}`;

      document.getElementById('s-appliquer').onclick = () => {
        filtres.q = document.getElementById('s-q').value;
        filtres.alerte = document.getElementById('s-alerte').value;
        charger();
      };
      document.getElementById('s-q').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('s-appliquer').click(); };
      document.querySelectorAll('[data-entree]').forEach((b) => b.onclick = () => mouvement(lignes.find((x) => x.produit_id === Number(b.dataset.entree)), 'entree'));
      document.querySelectorAll('[data-sortie]').forEach((b) => b.onclick = () => mouvement(lignes.find((x) => x.produit_id === Number(b.dataset.sortie)), 'sortie'));
      document.querySelectorAll('[data-ajust]').forEach((b) => b.onclick = () => ajustement(lignes.find((x) => x.produit_id === Number(b.dataset.ajust))));
    }

    /* ------------------------------------------- Réception rapide (sans prix) */
    async function reception() {
      const [produits, fournisseursDb] = await Promise.all([
        Api.get('/produits', { actif: 1 }),
        App.peut('fournisseurs.consulter') ? Api.get('/fournisseurs').catch(() => []) : Promise.resolve([]),
      ]);
      if (!document.body.contains(zoneContenu)) return;
      let lignes = [{ produit_id: produits[0] ? produits[0].id : '', quantite: 1 }];

      zoneContenu.innerHTML = `
        <div class="carte" style="box-shadow:none;border-color:#cfe9e7;background:#f7fdfd">
          <div class="carte-corps">
            <b>📥 Réception / approvisionnement</b>
            <p class="petit texte-muted" style="margin:6px 0 0">
              Saisissez les quantités reçues : <b>aucun prix ne vous est demandé</b>. Les articles entrent
              immédiatement en stock dans la boutique sélectionnée, et chaque entrée est tracée dans le journal
              avec votre nom.
            </p>
          </div>
        </div>
        <div class="grille-form" style="margin-bottom:12px">
          <div class="champ"><label>Boutique de réception</label>
            <input value="${Fmt.echapper((App.etat.magasins.find((m) => Number(m.id) === Number(magasin)) || {}).nom || (App.etat.utilisateur.magasin ? App.etat.utilisateur.magasin.nom : '—'))}" disabled></div>
          <div class="champ"><label>Fournisseur / origine (facultatif)</label>
            <input id="rec-origine" placeholder="Ex. CAMRAIL Import-Export, retour client, dépôt central"></div>
          <div class="champ plein"><label>Observation (facultatif)</label>
            <input id="rec-motif" placeholder="Ex. livraison du 04/10, bon n°1234"></div>
        </div>
        <div id="rec-lignes"></div>
        <div class="barre-outils" style="margin-top:10px">
          <button class="btn" id="rec-ajouter">＋ Ajouter une ligne</button>
          <button class="btn" id="rec-vider">Réinitialiser</button>
          <div style="margin-left:auto"><b id="rec-total">0 article(s) à réceptionner</b></div>
        </div>
        <div style="margin-top:14px">
          <button class="btn primaire" id="rec-valider" style="padding:11px 18px">✅ Valider la réception</button>
        </div>`;

      const zoneLignes = document.getElementById('rec-lignes');

      function dessiner() {
        zoneLignes.innerHTML = lignes.map((l, i) => {
          const p = produits.find((x) => String(x.id) === String(l.produit_id));
          return `<div style="display:grid;grid-template-columns:2.4fr 1fr 0.9fr auto;gap:8px;align-items:center;margin-bottom:8px">
            <select data-prod="${i}">${options(produits, 'id', (x) => `${x.nom} (${x.code})`, l.produit_id)}</select>
            <input type="number" min="0.1" step="1" value="${l.quantite}" data-qte="${i}" placeholder="Quantité reçue">
            <div class="petit texte-muted">${p ? Fmt.echapper(p.unite) : ''}<br>stock : ${p ? Fmt.nombre(p.stock_total) : '—'}</div>
            <button class="btn petit danger" data-suppr="${i}">🗑</button>
          </div>`;
        }).join('');
        const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);
        document.getElementById('rec-total').textContent = `${Fmt.nombre(total)} article(s) sur ${lignes.length} ligne(s)`;
        zoneLignes.querySelectorAll('[data-prod]').forEach((s) => s.onchange = () => { lignes[Number(s.dataset.prod)].produit_id = s.value; dessiner(); });
        zoneLignes.querySelectorAll('[data-qte]').forEach((s) => s.onchange = () => { lignes[Number(s.dataset.qte)].quantite = Number(s.value) || 1; dessiner(); });
        zoneLignes.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = () => {
          lignes.splice(Number(b.dataset.suppr), 1);
          if (!lignes.length) lignes.push({ produit_id: produits[0].id, quantite: 1 });
          dessiner();
        });
      }
      dessiner();

      document.getElementById('rec-ajouter').onclick = () => {
        lignes.push({ produit_id: produits[0].id, quantite: 1 });
        dessiner();
      };
      document.getElementById('rec-vider').onclick = () => {
        lignes = [{ produit_id: produits[0].id, quantite: 1 }];
        document.getElementById('rec-origine').value = '';
        document.getElementById('rec-motif').value = '';
        dessiner();
      };
      document.getElementById('rec-valider').onclick = async () => {
        const valides = lignes.filter((l) => l.produit_id && Number(l.quantite) > 0);
        if (!valides.length) return notifier('Ajoutez au moins une ligne avec une quantité', 'erreur');
        const bouton = document.getElementById('rec-valider');
        bouton.disabled = true;
        try {
          const r = await Api.post('/stocks/reception', {
            magasin_id: magasin,
            lignes: valides.map((l) => ({ produit_id: Number(l.produit_id), quantite: Number(l.quantite) })),
            origine: document.getElementById('rec-origine').value,
            motif: document.getElementById('rec-motif').value,
          });
          notifier(`Réception ${r.reference} enregistrée : ${r.nb_lignes} ligne(s), ${Fmt.nombre(r.quantite_totale)} article(s) entrés en stock`);
          lignes = [{ produit_id: produits[0].id, quantite: 1 }];
          document.getElementById('rec-origine').value = '';
          document.getElementById('rec-motif').value = '';
          const maj = await Api.get('/produits', { actif: 1 });
          produits.length = 0; produits.push(...maj);
          dessiner();
          App.rafraichirAlertes();
        } catch (e) {
          notifier(e.message, 'erreur');
        } finally {
          bouton.disabled = false;
        }
      };
    }

    /* ------------------------------------------------------------- Mouvements */
    function mouvement(ligne, type) {
      const entree = type === 'entree';
      ouvrirModale({
        titre: (entree ? 'Entrée de stock — ' : 'Sortie de stock — ') + ligne.nom,
        largeur: 'etroite',
        contenu: `
          <div class="champ"><label>Quantité actuelle</label><input value="${Fmt.nombre(ligne.quantite)} ${Fmt.echapper(ligne.unite)}" disabled></div>
          <div class="champ"><label>Quantité à ${entree ? 'ajouter' : 'retirer'} *</label><input type="number" name="quantite" min="1" step="1" value="1"></div>
          <div class="champ"><label>Motif</label><input name="motif" value="${entree ? 'Livraison fournisseur' : 'Casse / perte / usage interne'}"></div>
          <div class="aide">Aucun prix n'est demandé pour enregistrer ce mouvement.</div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn ${entree ? 'primaire' : 'danger'}" data-valider>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-valider]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.quantite || d.quantite <= 0) return notifier('Quantité invalide', 'erreur');
            if (!entree && d.quantite > ligne.quantite) return notifier('Quantité supérieure au stock disponible', 'erreur');
            try {
              await Api.post('/stocks/mouvement', { produit_id: ligne.produit_id, magasin_id: magasin, type, quantite: d.quantite, motif: d.motif });
              notifier('Mouvement enregistré'); fermer(); charger(); App.rafraichirAlertes();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    function ajustement(ligne) {
      ouvrirModale({
        titre: 'Ajustement d’inventaire — ' + ligne.nom,
        largeur: 'etroite',
        contenu: `
          <div class="champ"><label>Quantité théorique (système)</label><input value="${Fmt.nombre(ligne.quantite)}" disabled></div>
          <div class="champ"><label>Quantité réelle comptée *</label><input type="number" name="quantite_reelle" min="0" step="1" value="${ligne.quantite}"></div>
          <div class="champ"><label>Motif</label><input name="motif" value="Ajustement après inventaire"></div>
          <div class="aide" id="aj-ecart"></div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-valider>Valider l'ajustement</button>`,
        surOuverture(mod, fermer) {
          const champ = mod.querySelector('[name=quantite_reelle]');
          const ecart = mod.querySelector('#aj-ecart');
          const maj = () => {
            const d = (Number(champ.value) || 0) - ligne.quantite;
            ecart.innerHTML = d === 0 ? 'Aucun écart' : `<b>Écart : ${d > 0 ? '+' : ''}${Fmt.nombre(d)} ${Fmt.echapper(ligne.unite)}</b>`;
          };
          champ.oninput = maj; maj();
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-valider]').onclick = async () => {
            const d = lireFormulaire(mod);
            try {
              await Api.post('/stocks/ajustement', { produit_id: ligne.produit_id, magasin_id: magasin, quantite_reelle: d.quantite_reelle, motif: d.motif });
              notifier('Stock ajusté'); fermer(); charger(); App.rafraichirAlertes();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    /* ----------------------------------------------------------------- Journal */
    async function journal() {
      const lignes = await Api.get('/journal', {
        magasin_id: App.global() ? (magasin || '') : '', type: journalFiltres.type,
        debut: journalFiltres.debut, fin: journalFiltres.fin, limite: 400,
      });
      if (!document.body.contains(zoneContenu)) return;
      zoneContenu.innerHTML = `
        <div class="filtres" style="margin-bottom:14px">
          <div class="champ"><label>Type</label><select id="j-type"><option value="">Tous les mouvements</option>
            ${Object.entries(LIBELLE_MOUVEMENT).map(([k, v]) => `<option value="${k}" ${journalFiltres.type === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select></div>
          <div class="champ"><label>Du</label><input type="date" id="j-debut" value="${journalFiltres.debut}"></div>
          <div class="champ"><label>Au</label><input type="date" id="j-fin" value="${journalFiltres.fin}"></div>
          <button class="btn primaire" id="j-appliquer">Filtrer</button>
          <button class="btn" id="j-export">⬇️ Exporter</button>
        </div>
        ${tableau([
          { titre: 'Date', rendre: (l) => Fmt.dateH(l.created_at) },
          { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.produit)}</b><div class="petit texte-muted">${Fmt.echapper(l.code_produit)}</div>` },
          { titre: 'Type', rendre: (l) => `<span class="puce">${LIBELLE_MOUVEMENT[l.type] || l.type}</span>` },
          { titre: 'Boutique', rendre: (l) => Fmt.echapper(l.magasin) },
          { titre: 'Qté', num: true, rendre: (l) => (l.quantite > 0 ? '<span class="hausse">+' : '<span class="baisse">') + Fmt.nombre(l.quantite) + '</span>' },
          { titre: 'Avant → Après', num: true, rendre: (l) => `${Fmt.nombre(l.quantite_avant)} → ${Fmt.nombre(l.quantite_apres)}` },
          { titre: 'Motif', rendre: (l) => Fmt.echapper(l.motif || '—') },
          { titre: 'Par', rendre: (l) => Fmt.echapper(l.utilisateur || '—') },
        ], lignes, { vide: 'Aucun mouvement sur la période' })}`;
      document.getElementById('j-appliquer').onclick = () => {
        journalFiltres.type = document.getElementById('j-type').value;
        journalFiltres.debut = document.getElementById('j-debut').value;
        journalFiltres.fin = document.getElementById('j-fin').value;
        journal();
      };
      document.getElementById('j-export').onclick = async () => {
        try { await Api.telecharger(`/export.csv?type=journal&debut=${journalFiltres.debut}&fin=${journalFiltres.fin}`, 'journal_stock.csv'); notifier('Export téléchargé'); }
        catch (e) { notifier(e.message, 'erreur'); }
      };
    }

    /* ----------------------------------------------------------------- Alertes */
    async function alertes() {
      const lignes = await Api.get('/stocks/alertes');
      if (!document.body.contains(zoneContenu)) return;
      const urgents = lignes.filter((l) => l.quantite <= 0);
      zoneContenu.innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:16px">
          <div class="kpi rouge"><div class="libelle">Ruptures de stock</div><div class="valeur">${Fmt.nombre(urgents.length)}</div><div class="pied">Quantité nulle</div></div>
          <div class="kpi ambre"><div class="libelle">Total des alertes</div><div class="valeur">${Fmt.nombre(lignes.length)}</div><div class="pied">Produits sous le seuil d'alerte</div></div>
          <div class="kpi"><div class="libelle">Boutiques concernées</div><div class="valeur">${Fmt.nombre(new Set(lignes.map((l) => l.magasin_id)).size)}</div><div class="pied">Sur tout le réseau</div></div>
        </div>
        ${tableau([
          { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted mono">${Fmt.echapper(l.code)}</div>` },
          { titre: 'Boutique', rendre: (l) => Fmt.echapper(l.magasin) },
          { titre: 'Stock', num: true, rendre: (l) => badgeStock(l.quantite, l.seuil_alerte) },
          { titre: 'Seuil', num: true, rendre: (l) => Fmt.nombre(l.seuil_alerte) },
          { titre: 'Priorité', rendre: (l) => l.quantite <= 0 ? '<span class="badge ko">Urgent</span>' : l.quantite <= l.seuil_alerte / 2 ? '<span class="badge attente">Élevée</span>' : '<span class="badge info">Normale</span>' },
        ], lignes, { vide: 'Aucune alerte : tous les stocks sont au-dessus des seuils 👌' })}`;
    }

    document.getElementById('s-export').onclick = async () => {
      try { await Api.telecharger('/export.csv?type=stocks' + (magasin ? '&magasin_id=' + magasin : ''), 'etat_stocks.csv'); notifier('Export téléchargé'); }
      catch (e) { notifier(e.message, 'erreur'); }
    };
    charger();

    /* ---- Temps réel : les opérations des boutiques rafraîchissent cet écran ---- */
    App.suivre({
      vue: 'stocks',
      types: ['stock', 'vente', 'transfert', 'achat'],
      rafraichir: () => charger(),
    });
  },
});
