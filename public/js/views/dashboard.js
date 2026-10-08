/* ==========================================================================
   Vue : Tableau de bord
   ========================================================================== */
App.enregistrerVue('dashboard', {
  titre: 'Tableau de bord', icone: '📊', permissions: ['dashboard.consulter'], groupe: 'Pilotage',
  async rendre(zone) {
    const magasin = App.magasinCourant();

    /** Dessine (ou redessine) le tableau de bord. Appelée au chargement puis à
     *  chaque opération enregistrée par une boutique : l'administrateur voit les
     *  ventes, entrées et sorties de stock arriver sans recharger la page. */
    const dessiner = async () => {
    const d = await Api.get('/dashboard', magasin && App.global() ? { magasin_id: magasin } : {});
    if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
    const k = d.kpis;
    const ecart = k.evolution;
    const fleche = ecart === null ? '' : ecart >= 0
      ? `<span class="hausse">▲ ${Fmt.pct(Math.abs(ecart))}</span>`
      : `<span class="baisse">▼ ${Fmt.pct(Math.abs(ecart))}</span>`;

    const kpi = (libelle, valeur, pied, couleur = '') => `
      <div class="kpi ${couleur}"><div class="libelle">${libelle}</div>
      <div class="valeur">${valeur}</div><div class="pied">${pied || ''}</div></div>`;

    const objectif = k.objectif_mois
      ? `<div class="carte"><div class="carte-entete"><h3>🎯 Objectif du mois</h3>
           <div class="droite petit texte-muted">${Fmt.fcfa(k.ca_mois)} / ${Fmt.fcfa(k.objectif_mois)}</div></div>
         <div class="carte-corps">
           <div class="jauge ${k.ca_mois >= k.objectif_mois ? '' : 'ambre'}"><span style="width:${Math.min(100, (k.ca_mois / k.objectif_mois) * 100).toFixed(1)}%"></span></div>
           <div class="pied petit texte-muted" style="margin-top:6px">Réalisé à ${Fmt.pct(Math.min(100, (k.ca_mois / k.objectif_mois) * 100))} — reste ${Fmt.fcfa(Math.max(0, k.objectif_mois - k.ca_mois))}</div>
         </div></div>` : '';

    zone.innerHTML = `
      <div class="grille g-kpi" style="margin-bottom:18px">
        ${kpi("Chiffre d'affaires du jour", Fmt.fcfa(k.ca_jour), `${fleche} vs hier (${Fmt.fcfaCourt(k.ca_hier)})`)}
        ${kpi('Ventes du jour', Fmt.nombre(k.nb_ventes_jour), `Panier moyen : ${Fmt.fcfa(Math.round(k.panier_moyen))}`, 'bleu')}
        ${App.voitPrix() ? kpi('Marge du jour (estimée)', Fmt.fcfa(k.marge_jour), `Marge du mois : ${Fmt.fcfa(k.marge_mois)}`, 'vert') : ''}
        ${kpi("Chiffre d'affaires du mois", Fmt.fcfa(k.ca_mois), `${Fmt.nombre(k.nb_ventes_mois)} ventes · Année : ${Fmt.fcfaCourt(k.ca_annee)}`, 'ambre')}
        ${App.voitPrix()
          ? kpi('Valeur du stock', Fmt.fcfa(k.valeur_stock), `Au prix d'achat : ${Fmt.fcfa(k.valeur_stock_achat)}`)
          : kpi('Ventes du mois', Fmt.nombre(k.nb_ventes_mois), `Chiffre d'affaires : ${Fmt.fcfa(k.ca_mois)}`, 'bleu')}
        ${kpi('Alertes de stock', Fmt.nombre(k.alertes_stock), 'Produits sous le seuil d’alerte', k.alertes_stock ? 'rouge' : 'vert')}
      </div>

      <div class="grille g-2">
        <div class="carte" style="grid-column:1/-1">
          <div class="carte-entete"><h3>📈 Chiffre d'affaires des 30 derniers jours</h3>
            <div class="droite petit texte-muted">Total : <b>${Fmt.fcfa(d.serie_30j.reduce((s, x) => s + x.ca, 0))}</b></div></div>
          <div class="carte-corps">${graphiqueCourbe(d.serie_30j, { cle: 'jour', valeur: 'ca' })}</div>
        </div>
        ${objectif}
        <div class="carte">
          <div class="carte-entete"><h3>🏬 Performance par magasin</h3>
            <div class="droite"><a class="btn petit" href="#/magasins">Voir les magasins</a></div></div>
          <div class="carte-corps">
            ${tableau([
              { titre: 'Magasin', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.ville || '')}</div>` },
              { titre: 'CA du mois', num: true, rendre: (l) => Fmt.fcfa(l.ca_mois) },
              { titre: 'Ventes jour', num: true, rendre: (l) => Fmt.nombre(l.ventes_jour) },
              { titre: 'Alertes', num: true, rendre: (l) => l.alertes ? `<span class="badge ko">${l.alertes}</span>` : '<span class="badge ok">0</span>' },
            ], d.par_magasin, { vide: 'Aucun magasin' })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>🏆 Top 10 produits (30 jours)</h3>
            <div class="droite"><a class="btn petit" href="#/rapports">Rapports détaillés</a></div></div>
          <div class="carte-corps">
            ${tableau([
              { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.categorie || '')}</div>` },
              { titre: 'Qté', num: true, rendre: (l) => Fmt.nombre(l.quantite) },
              { titre: 'CA', num: true, rendre: (l) => Fmt.fcfa(l.ca) },
              ...(App.voitPrix() ? [{ titre: 'Marge', num: true, rendre: (l) => `<span class="hausse">${Fmt.fcfa(l.marge)}</span>` }] : []),
            ], d.top_produits, { vide: 'Aucune vente sur la période' })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>💳 Encaissements par mode (30 jours)</h3></div>
          <div class="carte-corps">
            ${listeBarres(d.par_paiement, { cle: 'mode', valeur: 'ca', rendreCle: (l) => `${LIBELLE_MODE[l.mode] || l.mode} <span class="petit texte-muted">(${Fmt.nombre(l.nb)} ventes)</span>` })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>🗂️ Répartition par catégorie (30 jours)</h3></div>
          <div class="carte-corps">
            ${listeBarres(d.par_categorie, { cle: 'categorie', valeur: 'ca', max: 9, couleur: 'ambre' })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>🧾 Dernières ventes</h3>
            <div class="droite"><a class="btn petit" href="#/ventes">Tout l'historique</a></div></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Référence', rendre: (l) => `<b>${Fmt.echapper(l.reference)}</b><div class="petit texte-muted">${Fmt.dateH(l.created_at)}</div>` },
              { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
              { titre: 'Client', rendre: (l) => Fmt.echapper(l.client) },
              { titre: 'Montant', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.total)}</b>` },
              { titre: 'État', rendre: (l) => badgeStatutVente(l.statut) },
            ], d.ventes_recentes, { vide: 'Aucune vente' })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>⚠️ Produits à réapprovisionner</h3>
            <div class="droite"><a class="btn petit" href="#/stocks">Gérer le stock</a></div></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.code)}</div>` },
              { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
              { titre: 'Stock', num: true, rendre: (l) => badgeStock(l.quantite, l.seuil_alerte) },
              { titre: 'Seuil', num: true, rendre: (l) => Fmt.nombre(l.seuil_alerte) },
            ], d.stock_faible, { vide: 'Aucune alerte, tous les stocks sont bons 👌' })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>👥 Meilleurs vendeurs (30 jours)</h3></div>
          <div class="carte-corps">
            ${listeBarres(d.meilleurs_caissiers, { cle: 'nom', valeur: 'ca', rendreCle: (l) => `${Fmt.echapper(l.nom)} <span class="petit texte-muted">(${l.nb} ventes)</span>` })}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>⭐ Meilleurs clients (90 jours)</h3>
            <div class="droite"><a class="btn petit" href="#/clients">Fichier clients</a></div></div>
          <div class="carte-corps">
            ${listeBarres(d.top_clients, { cle: 'nom', valeur: 'ca', couleur: 'ambre', rendreCle: (l) => `${Fmt.echapper(l.nom)} <span class="petit texte-muted">(${l.nb} achats)</span>` })}
          </div>
        </div>
      </div>`;
    };

    await dessiner();

    /* ---- Temps réel : toute opération d'une boutique redessine le tableau de bord ---- */
    App.suivre({
      vue: 'dashboard',
      types: ['vente', 'stock', 'transfert', 'achat', 'compte', 'tiers'],
      rafraichir: () => dessiner(),
    });
  },
});
