/* ==========================================================================
   Vue : Rapports & analyses
   ========================================================================== */
App.enregistrerVue('rapports', {
  titre: 'Rapports', icone: '📈', permissions: ['rapports.consulter'], groupe: 'Pilotage',
  async rendre(zone) {
    const etat = { debut: Fmt.iso(-29), fin: Fmt.iso(), group: 'jour', onglet: 'ventes' };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Paramètres du rapport</h3>
          <div class="droite">
            <button class="btn petit" id="r-export">⬇️ Export CSV (ventes)</button>
            <button class="btn petit" id="r-export-stocks">⬇️ Export CSV (stocks)</button>
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="champ"><label>Du</label><input type="date" id="r-debut" value="${etat.debut}"></div>
            <div class="champ"><label>Au</label><input type="date" id="r-fin" value="${etat.fin}"></div>
            <div class="champ"><label>Regrouper par</label><select id="r-group">
              <option value="jour">Jour</option><option value="mois">Mois</option><option value="magasin">Magasin</option>
              <option value="produit">Produit</option><option value="categorie">Catégorie</option>
              <option value="caissier">Vendeur / Caissier</option><option value="client">Client</option><option value="mode">Mode de paiement</option>
            </select></div>
            <div class="champ"><label>Raccourcis</label><select id="r-raccourci">
              <option value="">—</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option><option value="mois">Mois en cours</option></select></div>
            <button class="btn primaire" id="r-appliquer">Générer</button>
          </div>
          <div class="onglets" id="r-onglets" style="margin-top:16px;margin-bottom:0">
            <button class="actif" data-onglet="ventes">Ventes</button>
            <button data-onglet="produits">Rentabilité produits</button>
            <button data-onglet="stocks">Valorisation du stock</button>
          </div>
        </div>
      </div>
      <div id="r-contenu"><div class="vide">Chargement…</div></div>`;

    const contenu = document.getElementById('r-contenu');

    async function charger() {
      contenu.innerHTML = '<div class="vide">Chargement…</div>';
      if (etat.onglet === 'ventes') return rapportVentes();
      if (etat.onglet === 'produits') return rapportProduits();
      return rapportStocks();
    }

    async function rapportVentes() {
      const r = await Api.get('/rapports/ventes', { debut: etat.debut, fin: etat.fin, group: etat.group });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const marge = r.lignes.reduce((s, l) => s + (l.marge !== undefined ? l.marge : (l.marge_brute || 0)), 0);
      const titreAxe = {
        jour: 'Jour', mois: 'Mois', magasin: 'Magasin', produit: 'Produit', categorie: 'Catégorie',
        caissier: 'Vendeur / Caissier', client: 'Client', mode: 'Mode de paiement',
      }[etat.group];
      const maxi = Math.max(...r.lignes.map((l) => l.ca), 1);

      contenu.innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:18px">
          <div class="kpi"><div class="libelle">Chiffre d'affaires</div><div class="valeur">${Fmt.fcfa(r.total)}</div>
            <div class="pied">Du ${Fmt.date(r.debut)} au ${Fmt.date(r.fin)}</div></div>
          <div class="kpi bleu"><div class="libelle">Nombre de ventes</div><div class="valeur">${Fmt.nombre(r.nb_ventes)}</div>
            <div class="pied">Panier moyen : ${Fmt.fcfa(Math.round(r.panier_moyen))}</div></div>
          <div class="kpi vert"><div class="libelle">Marge estimée</div><div class="valeur">${Fmt.fcfa(marge)}</div>
            <div class="pied">${r.total ? Fmt.pct((marge / r.total) * 100) : '—'} du chiffre d'affaires</div></div>
          <div class="kpi ambre"><div class="libelle">Lignes du rapport</div><div class="valeur">${Fmt.nombre(r.lignes.length)}</div>
            <div class="pied">Regroupement : ${titreAxe}</div></div>
        </div>
        ${['jour', 'mois'].includes(etat.group) ? `<div class="carte"><div class="carte-entete"><h3>📈 Évolution du chiffre d'affaires</h3></div>
          <div class="carte-corps">${graphiqueCourbe(r.lignes.map((l) => ({ jour: l.cle + (etat.group === 'mois' ? '-01' : ''), ca: l.ca })), { cle: 'jour', valeur: 'ca' })}</div></div>` : ''}
        <div class="carte">
          <div class="carte-entete"><h3>Détail par ${titreAxe.toLowerCase()}</h3>
            <div class="droite petit texte-muted">Cliquez sur une ligne pour voir sa contribution</div></div>
          <div class="carte-corps">
            ${listeBarres(r.lignes.map((l) => ({ ...l, nom: l.cle })), { cle: 'nom', valeur: 'ca', max: 10, rendreCle: (l) => Fmt.echapper(l.cle) })}
          </div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: titreAxe, rendre: (l) => `<b>${Fmt.echapper(l.cle)}</b>` },
              { titre: 'Ventes', num: true, rendre: (l) => Fmt.nombre(l.nb_ventes) },
              { titre: "Chiffre d'affaires", num: true, rendre: (l) => `<b>${Fmt.fcfa(l.ca)}</b>` },
              { titre: 'Part', num: true, rendre: (l) => `<div style="min-width:90px"><div class="jauge"><span style="width:${((l.ca / maxi) * 100).toFixed(1)}%"></span></div><span class="petit texte-muted">${r.total ? Fmt.pct((l.ca / r.total) * 100) : '—'}</span></div>` },
              { titre: 'Panier moyen', num: true, rendre: (l) => Fmt.fcfa(Math.round(l.panier_moyen)) },
            ], r.lignes, { vide: 'Aucune vente sur cette période' })}
          </div>
        </div>`;
    }

    async function rapportProduits() {
      const r = await Api.get('/rapports/produits', { debut: etat.debut, fin: etat.fin });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const vendus = r.lignes.filter((l) => l.quantite_vendue > 0);
      const meilleurs = vendus.slice(0, 10);
      const dormants = r.lignes.filter((l) => l.quantite_vendue === 0 && l.stock_total > 0).slice(0, 12);
      contenu.innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:18px">
          <div class="kpi"><div class="libelle">Produits vendus</div><div class="valeur">${Fmt.nombre(vendus.length)}</div><div class="pied">sur ${r.lignes.length} références actives</div></div>
          <div class="kpi vert"><div class="libelle">Marge totale dégagée</div><div class="valeur">${Fmt.fcfa(vendus.reduce((s, l) => s + l.marge, 0))}</div><div class="pied">CA : ${Fmt.fcfa(vendus.reduce((s, l) => s + l.ca, 0))}</div></div>
          <div class="kpi ambre"><div class="libelle">Produits dormants</div><div class="valeur">${Fmt.nombre(r.lignes.filter((l) => l.quantite_vendue === 0).length)}</div><div class="pied">Aucune vente sur la période</div></div>
        </div>
        <div class="carte"><div class="carte-entete"><h3>💎 Top 10 des produits les plus rentables</h3></div>
          <div class="carte-corps">${listeBarres(meilleurs, { cle: 'nom', valeur: 'marge', rendreCle: (l) => Fmt.echapper(l.nom) })}</div></div>
        <div class="carte">
          <div class="carte-entete"><h3>Rentabilité détaillée</h3></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.categorie)}</div>` },
              { titre: 'Qté vendue', num: true, rendre: (l) => Fmt.nombre(l.quantite_vendue) },
              { titre: 'CA', num: true, rendre: (l) => Fmt.fcfa(l.ca) },
              { titre: 'Coût marchandises', num: true, rendre: (l) => Fmt.fcfa(l.cout) },
              { titre: 'Marge', num: true, rendre: (l) => `<b class="${l.marge >= 0 ? 'hausse' : 'baisse'}">${Fmt.fcfa(l.marge)}</b>` },
              { titre: 'Taux de marge', num: true, rendre: (l) => l.ca ? Fmt.pct((l.marge / l.ca) * 100) : '—' },
              { titre: 'Stock actuel', num: true, rendre: (l) => badgeStock(l.stock_total, l.seuil_alerte) },
            ], r.lignes, { vide: 'Aucune donnée' })}
          </div>
        </div>
        ${dormants.length ? `<div class="carte"><div class="carte-entete"><h3>😴 Produits dormants (stock immobilisé)</h3></div>
          <div class="carte-corps serre">${tableau([
            { titre: 'Produit', rendre: (l) => Fmt.echapper(l.nom) },
            { titre: 'Catégorie', rendre: (l) => Fmt.echapper(l.categorie) },
            { titre: 'Stock', num: true, rendre: (l) => Fmt.nombre(l.stock_total) },
            { titre: 'Valeur immobilisée', num: true, rendre: (l) => Fmt.fcfa(l.stock_total * l.prix_achat) },
          ], dormants)}</div></div>` : ''}`;
    }

    async function rapportStocks() {
      const r = await Api.get('/rapports/stocks');
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const totalVente = r.reduce((s, l) => s + l.valeur_vente, 0);
      const totalAchat = r.reduce((s, l) => s + l.valeur_achat, 0);
      const alertes = r.filter((l) => l.ecart_seuil <= 0);
      const parMagasin = {};
      r.forEach((l) => {
        parMagasin[l.magasin] = parMagasin[l.magasin] || { valeur: 0, refs: 0, alertes: 0 };
        parMagasin[l.magasin].valeur += l.valeur_vente;
        parMagasin[l.magasin].refs++;
        if (l.ecart_seuil <= 0) parMagasin[l.magasin].alertes++;
      });
      contenu.innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:18px">
          <div class="kpi"><div class="libelle">Valeur du stock (prix de vente)</div><div class="valeur">${Fmt.fcfa(totalVente)}</div><div class="pied">Au prix d'achat : ${Fmt.fcfa(totalAchat)}</div></div>
          <div class="kpi vert"><div class="libelle">Marge potentielle</div><div class="valeur">${Fmt.fcfa(totalVente - totalAchat)}</div><div class="pied">Si tout le stock est vendu</div></div>
          <div class="kpi ${alertes.length ? 'rouge' : ''}"><div class="libelle">Lignes en alerte</div><div class="valeur">${Fmt.nombre(alertes.length)}</div><div class="pied">sur ${r.length} lignes de stock</div></div>
        </div>
        <div class="carte"><div class="carte-entete"><h3>Valorisation par magasin</h3></div>
          <div class="carte-corps serre">${tableau([
            { titre: 'Magasin', rendre: (l) => `<b>${Fmt.echapper(l[0])}</b>` },
            { titre: 'Références', num: true, rendre: (l) => Fmt.nombre(l[1].refs) },
            { titre: 'Valeur (vente)', num: true, rendre: (l) => Fmt.fcfa(l[1].valeur) },
            { titre: 'Alertes', num: true, rendre: (l) => l[1].alertes ? `<span class="badge ko">${l[1].alertes}</span>` : '<span class="badge ok">0</span>' },
          ], Object.entries(parMagasin), { vide: 'Aucun stock' })}</div></div>
        <div class="carte">
          <div class="carte-entete"><h3>Détail des lignes de stock</h3>
            <div class="droite"><button class="btn petit" id="r-stocks-export">⬇️ Exporter</button></div></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
              { titre: 'Produit', rendre: (l) => `<b>${Fmt.echapper(l.produit)}</b><div class="petit texte-muted mono">${Fmt.echapper(l.code)}</div>` },
              { titre: 'Quantité', num: true, rendre: (l) => badgeStock(l.quantite, l.seuil_alerte) },
              { titre: 'Prix achat', num: true, rendre: (l) => Fmt.fcfa(l.prix_achat) },
              { titre: 'Valeur achat', num: true, rendre: (l) => Fmt.fcfa(l.valeur_achat) },
              { titre: 'Valeur vente', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.valeur_vente)}</b>` },
              { titre: 'Dernière MAJ', num: true, rendre: (l) => Fmt.date(l.derniere_maj) },
            ], r.slice(0, 200), { vide: 'Aucun stock' })}
            ${r.length > 200 ? `<div class="vide petit">Affichage limité aux 200 premières lignes — utilisez l'export CSV pour la liste complète.</div>` : ''}
          </div>
        </div>`;
      const b = document.getElementById('r-stocks-export');
      if (b) b.onclick = async () => {
        try { await Api.telecharger('/export.csv?type=stocks', 'etat_stocks.csv'); notifier('Export téléchargé'); }
        catch (e) { notifier(e.message, 'erreur'); }
      };
    }

    document.getElementById('r-appliquer').onclick = () => {
      etat.debut = document.getElementById('r-debut').value;
      etat.fin = document.getElementById('r-fin').value;
      etat.group = document.getElementById('r-group').value;
      charger();
    };
    document.getElementById('r-raccourci').onchange = (e) => {
      const v = e.target.value;
      if (!v) return;
      if (v === 'mois') {
        const d = new Date(); etat.debut = Fmt.iso(-d.getDate() + 1); etat.fin = Fmt.iso();
      } else {
        etat.debut = Fmt.iso(-Number(v) + 1); etat.fin = Fmt.iso();
      }
      document.getElementById('r-debut').value = etat.debut;
      document.getElementById('r-fin').value = etat.fin;
      charger();
    };
    document.querySelectorAll('#r-onglets button').forEach((b) => b.onclick = () => {
      etat.onglet = b.dataset.onglet;
      document.querySelectorAll('#r-onglets button').forEach((x) => x.classList.toggle('actif', x === b));
      charger();
    });
    document.getElementById('r-export').onclick = async () => {
      try {
        await Api.telecharger(`/export.csv?type=ventes&debut=${etat.debut}&fin=${etat.fin}`, `ventes_${etat.debut}_${etat.fin}.csv`);
        notifier('Export téléchargé');
      } catch (e) { notifier(e.message, 'erreur'); }
    };
    document.getElementById('r-export-stocks').onclick = async () => {
      try { await Api.telecharger('/export.csv?type=stocks', 'etat_stocks.csv'); notifier('Export téléchargé'); }
      catch (e) { notifier(e.message, 'erreur'); }
    };
    charger();

    /* ---- Temps réel : les opérations des boutiques rafraîchissent cet écran ---- */
    App.suivre({
      vue: 'rapports',
      types: ['vente', 'stock'],
      rafraichir: () => charger(),
    });
  },
});
