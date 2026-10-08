/* ==========================================================================
   Vue : Inventaires — comptage physique et rapprochement des stocks

   Quatre sous-pages, une par question posée par le gérant :
     1. Comptage   → on fait les comptes des stocks actuels (ce qu'on a vraiment)
     2. Montant    → on fait les comptes du montant généré (valeur du stock)
     3. Attendu    → on récupère le stock qu'on devait avoir (théorie + contrôle
                     en le recalculant depuis le journal des mouvements)
     4. Écarts     → on compare les comptes avec ce qu'on devait avoir
   ========================================================================== */
App.enregistrerVue('inventaires', {
  titre: 'Inventaires', icone: '📋', permissions: ['inventaire.consulter'], groupe: 'Catalogue & stock',

  async rendre(zone) {
    const droit = {
      gerer: App.peut('inventaire.gerer'),
      ajuster: App.peut('stock.ajuster'),
      prix: App.voitPrix(),
    };
    let liste = [];
    let session = null;
    let onglet = 'comptage';

    const ONGLETS = [
      ['comptage', '1 · Comptage'],
      ['montant', '2 · Montant généré'],
      ['attendu', '3 · Stock attendu'],
      ['ecarts', '4 · Comparaison'],
    ];

    const fcfa = (v) => (v === null || v === undefined ? '—' : Fmt.fcfa(v));
    const qte = (v) => (v === null || v === undefined ? '—' : Fmt.nombre(v));
    const signe = (v) => (v > 0 ? '+' : '') + Fmt.nombre(v);
    const signeFcfa = (v) => (v > 0 ? '+' : '') + Fmt.fcfa(v);

    /* ------------------------------------------------------------------ */
    /*  Liste des sessions d'inventaire                                    */
    /* ------------------------------------------------------------------ */
    async function chargerListe() {
      const q = {};
      const m = App.magasinCourant();
      if (m) q.magasin_id = m;
      liste = (await Api.get('/inventaires', q)).inventaires || [];
      peindreListe();
    }

    function peindreListe() {
      zone.innerHTML = entetePage({
        titre: '📋 Inventaires',
        sous: 'Comptage physique du stock, valorisation et comparaison avec le stock attendu',
        actions: droit.gerer ? '<button class="btn primaire" id="btn-nouvel-inv">➕ Nouvel inventaire</button>' : '',
      }) + `
        ${liste.length ? '' : `<div class="carte">
          <div class="carte-entete"><h3>Comment se déroule un inventaire ?</h3>
            <div class="sous">Quatre étapes, une par sous-page</div></div>
          <ol style="margin:0;padding-left:20px;line-height:1.9">
            <li><strong>Comptage</strong> — on compte physiquement le stock, produit par produit,
                et on saisit la quantité réellement trouvée en rayon et en réserve.</li>
            <li><strong>Montant généré</strong> — le stock compté est valorisé : ce qu’il a coûté
                (prix d’achat) et ce qu’il peut rapporter s’il est vendu (prix de vente).</li>
            <li><strong>Stock attendu</strong> — on récupère le stock que le système annonce, et on
                le contrôle en le recalculant depuis le journal des mouvements.</li>
            <li><strong>Comparaison</strong> — on compare le compté et l’attendu : manquants,
                excédents et écarts en francs CFA. Les écarts peuvent ensuite être appliqués
                au stock pour réaligner le système.</li>
          </ol>
          <p class="sous" style="margin-top:10px">Pendant un comptage, évitez de saisir des ventes ou
            des entrées de stock : la photographie prise au départ ne bougerait plus.</p>
        </div>`}
        <div class="carte">
          <div class="carte-entete"><h3>Sessions d’inventaire</h3>
            <div class="sous">Chaque session photographie le stock à une date précise</div></div>
          ${tableau([
            { titre: 'Inventaire', rendre: (i) => `<strong>${Fmt.echapper(i.libelle)}</strong><div class="sous">${i.commentaire ? Fmt.echapper(i.commentaire) : ''}</div>` },
            { titre: 'Périmètre', rendre: (i) => i.magasin_nom ? Fmt.echapper(i.magasin_nom) : '<span class="badge neutre">Tous les magasins</span>' },
            { titre: 'Avancement', num: true, rendre: (i) => `${Fmt.nombre(i.nb_comptees)} / ${Fmt.nombre(i.nb_lignes)}` },
            droit.prix
              ? { titre: 'Écart valeur', num: true, rendre: (i) => `<strong style="color:${i.ecart_valeur < 0 ? 'var(--bad)' : i.ecart_valeur > 0 ? 'var(--ok)' : 'inherit'}">${signeFcfa(i.ecart_valeur)}</strong>` }
              : { titre: 'Écarts', num: true, rendre: (i) => Fmt.nombre(i.nb_ecarts) },
            { titre: 'Statut', rendre: (i) => i.statut === 'cloture' ? '<span class="badge ok">Clôturé</span>' : '<span class="badge attente">En cours</span>' },
            { titre: 'Créé le', rendre: (i) => Fmt.dateH(i.created_at) },
            { titre: '', rendre: () => '<button class="btn petit">Ouvrir</button>' },
          ], liste, { vide: 'Aucun inventaire n’a encore été réalisé. Lancez le premier comptage.' })}
        </div>`;

      const btn = zone.querySelector('#btn-nouvel-inv');
      if (btn) btn.addEventListener('click', modaleNouvelInventaire);
      zone.querySelectorAll('tbody tr').forEach((tr) => {
        tr.querySelector('button').addEventListener('click', () => ouvrirSession(Number(tr.dataset.id)));
      });
    }

    function modaleNouvelInventaire() {
      const magasins = (App.etat.magasins || []);
      ouvrirModale({
        titre: '➕ Nouvel inventaire',
        contenu: `
          <div class="champ"><label>Libellé *</label>
            <input name="libelle" value="Inventaire ${new Date().toLocaleDateString('fr-FR')}" required></div>
          <div class="champ"><label>Périmètre</label>
            <select name="magasin_id">
              <option value="">Tous les magasins</option>
              ${options(magasins, 'id', (m) => `${m.nom} — ${m.ville || ''}`, App.magasinCourant())}
            </select></div>
          <div class="champ"><label>Commentaire</label>
            <input name="commentaire" placeholder="Ex. : comptage de fin de mois"></div>
          <p class="sous">Le système photographie l’état du stock : aucune saisie de vente ou
            d’entrée ne doit être faite pendant le comptage.</p>`,
        pied: `<button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-creer>Créer l’inventaire</button>`,
        surOuverture: (modale, fermer) => {
          modale.querySelector('[data-fermer]').addEventListener('click', fermer);
          modale.querySelector('[data-creer]').addEventListener('click', async () => {
            const d = lireFormulaire(modale);
            if (!d.libelle) return notifier('Le libellé est obligatoire', 'erreur');
            try {
              const inv = await Api.post('/inventaires', {
                libelle: d.libelle, magasin_id: d.magasin_id ? Number(d.magasin_id) : null,
                commentaire: d.commentaire || null,
              });
              fermer();
              notifier(`Inventaire créé : ${Fmt.nombre(inv.lignes.length)} produit(s) à compter`);
              await ouvrirSession(inv.inventaire.id);
            } catch (e) { notifier(e.message, 'erreur'); }
          });
        },
      });
    }

    /* ------------------------------------------------------------------ */
    /*  Une session ouverte                                                */
    /* ------------------------------------------------------------------ */
    async function ouvrirSession(id) {
      session = await Api.get('/inventaires/' + id);
      droit.gerer = session.peut_gerer !== undefined ? session.peut_gerer : droit.gerer;
      droit.prix = session.peut_voir_prix !== undefined ? session.peut_voir_prix : droit.prix;
      peindreSession();
    }

    async function recharger() {
      if (!session) return;
      session = await Api.get('/inventaires/' + session.inventaire.id);
    }

    function peindreSession() {
      const c = session.comptes;
      const inv = session.inventaire;
      const cloture = inv.statut === 'cloture';

      zone.innerHTML = entetePage({
        titre: `📋 ${Fmt.echapper(inv.libelle)}`,
        sous: `${inv.magasin_nom ? Fmt.echapper(inv.magasin_nom) : 'Tous les magasins'} ·
               créé le ${Fmt.dateH(inv.created_at)}${cloture ? ' · clôturé le ' + Fmt.dateH(inv.cloture_at) : ''}`,
        actions: `
          <button class="btn" id="btn-retour">← Sessions</button>
          ${clic('btn-cr', '🖨️ Compte rendu')}
          ${clic('btn-export', '⬇️ Export CSV')}
          ${droit.gerer && !cloture ? clic('btn-cloturer', '🔒 Clôturer', 'ambre') : ''}
          ${droit.ajuster ? clic('btn-appliquer', '✅ Appliquer les écarts', 'primaire') : ''}`,
      }) + `
        <div class="grille g-kpi">
          <div class="kpi"><div class="libelle">Stock attendu</div>
            <div class="valeur">${qte(c.quantite_theorique)}</div>
            <div class="pied">${fcfa(c.valeur_theorique)} au prix d’achat</div></div>
          <div class="kpi bleu"><div class="libelle">Stock compté</div>
            <div class="valeur">${qte(c.quantite_comptee)}</div>
            <div class="pied">${c.nb_comptes} produit(s) sur ${c.nb_produits}</div></div>
          <div class="kpi ${c.ecart_valeur < 0 ? 'rouge' : c.ecart_valeur > 0 ? 'vert' : 'ambre'}">
            <div class="libelle">Écart</div>
            <div class="valeur">${signe(c.ecart_quantite)}</div>
            <div class="pied">${signeFcfa(c.ecart_valeur)}</div></div>
          <div class="kpi vert"><div class="libelle">Montant généré</div>
            <div class="valeur">${fcfa(c.valeur_vente_comptee)}</div>
            <div class="pied">Valeur de revente du stock compté</div></div>
        </div>

        ${barreAvancement(c, cloture)}

        <div class="onglets">
          ${ONGLETS.map(([id2, titre]) =>
            `<button data-onglet="${id2}" class="${onglet === id2 ? 'actif' : ''}">${titre}</button>`).join('')}
        </div>
        <div id="contenu-onglet"></div>`;

      zone.querySelector('#btn-retour').addEventListener('click', async () => { session = null; await chargerListe(); });
      zone.querySelectorAll('[data-onglet]').forEach((b) => {
        b.addEventListener('click', () => { onglet = b.dataset.onglet; peindreSession(); });
      });
      zone.querySelector('#btn-cr').addEventListener('click', compteRendu);
      zone.querySelector('#btn-export').addEventListener('click', async () => {
        try { await Api.telecharger(`/inventaires/${inv.id}/export.csv`, `inventaire-${inv.id}.csv`); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
      const bCloture = zone.querySelector('#btn-cloturer');
      if (bCloture) bCloture.addEventListener('click', cloturerSession);
      const bAppliquer = zone.querySelector('#btn-appliquer');
      if (bAppliquer) bAppliquer.addEventListener('click', appliquerEcarts);

      peindreOnglet();
    }

    const clic = (id, libelle, classe = '') => `<button class="btn ${classe}" id="${id}">${libelle}</button>`;

    function barreAvancement(c, cloture) {
      if (cloture) {
        return `<div class="bandeau ok">🔒 Inventaire clôturé le ${Fmt.dateH(session.inventaire.cloture_at)}
          par ${Fmt.echapper(session.inventaire.cloture_par_nom || '—')}. Les chiffres sont figés.</div>`;
      }
      if (!c.nb_produits) return '';
      return `<div class="carte" style="padding:14px 16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>Avancement du comptage</strong>
          <span class="sous">${c.nb_comptes} / ${c.nb_produits} produits comptés (${c.progression} %)</span>
        </div>
        <div style="height:10px;background:var(--line);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${c.progression}%;background:var(--primary);transition:width .3s"></div>
        </div>
        ${droit.gerer ? `<div style="margin-top:10px;text-align:right">
          <button class="btn petit" id="btn-conforme">✓ Tout marquer conforme</button></div>` : ''}
      </div>`;
    }

    /* ------------------------------------------------------------------ */
    /*  Les quatre sous-pages                                              */
    /* ------------------------------------------------------------------ */
    function peindreOnglet() {
      const zoneO = zone.querySelector('#contenu-onglet');
      const b = zone.querySelector('#btn-conforme');
      if (b) b.addEventListener('click', toutConforme);
      if (onglet === 'comptage') peindreComptage(zoneO);
      else if (onglet === 'montant') peindreMontant(zoneO);
      else if (onglet === 'attendu') peindreAttendu(zoneO);
      else peindreEcarts(zoneO);
    }

    /* ---- 1. Comptage des stocks actuels -------------------------------- */
    function peindreComptage(z) {
      const reste = session.comptes.nb_restants;
      z.innerHTML = `<div class="carte">
        <div class="carte-entete"><h3>Comptage physique</h3>
          <div class="sous">Saisissez la quantité réellement trouvée en rayon et en réserve.
            Laissez vide si le produit n’a pas encore été compté. ${reste ? `<strong>${reste} restant(s).</strong>` : ''}</div>
        </div>
        ${tableau([
          { titre: 'Produit', rendre: (l) => `<strong>${Fmt.echapper(l.produit)}</strong>
            <div class="sous">${l.produit_reference ? Fmt.echapper(l.produit_reference) : ''}${l.magasin_nom ? ' · ' + Fmt.echapper(l.magasin_nom) : ''}</div>` },
          { titre: 'Attendu', num: true, rendre: (l) => qte(l.quantite_theorique) },
          { titre: 'Compté', num: true, rendre: (l) => droit.gerer && session.inventaire.statut !== 'cloture'
            ? `<input type="number" min="0" step="1" style="width:110px;text-align:right" class="saisie-comptage"
                 data-ligne="${l.id}" placeholder="—"
                 value="${l.quantite_comptee === null || l.quantite_comptee === undefined ? '' : l.quantite_comptee}">`
            : qte(l.quantite_comptee) },
          { titre: 'Écart', num: true, classe: 'cellule-ecart', rendre: (l) => renduEcart(l) },
          { titre: 'Note', rendre: (l) => droit.gerer && session.inventaire.statut !== 'cloture'
            ? `<input class="saisie-note" data-ligne="${l.id}" style="width:100%" placeholder="Casse, vol, erreur…"
                 value="${Fmt.echapper(l.note || '')}">`
            : Fmt.echapper(l.note || '') },
        ], session.lignes, { vide: 'Aucun produit actif dans ce périmètre.' })}
      </div>`;
      z.querySelectorAll('.saisie-comptage').forEach((i) => i.addEventListener('change', () => saisir(i.dataset.ligne, i.value, null)));
      z.querySelectorAll('.saisie-note').forEach((i) => i.addEventListener('change', () => saisir(i.dataset.ligne, null, i.value)));
    }

    const renduEcart = (l) => l.ecart_quantite === null
      ? '<span class="badge neutre">non compté</span>'
      : l.ecart_quantite === 0
        ? '<span class="badge ok">conforme</span>'
        : `<span class="badge ${l.ecart_quantite < 0 ? 'ko' : 'attente'}">${signe(l.ecart_quantite)}</span>
           ${droit.prix ? `<div class="sous">${signeFcfa(l.ecart_valeur)}</div>` : ''}`;

    async function saisir(ligneId, valeur, note) {
      const ligne = session.lignes.find((l) => String(l.id) === String(ligneId));
      const corps = note === null ? { quantite_comptee: valeur === '' ? null : Number(valeur) } : { note };
      try {
        session = await Api.put(`/inventaires/${session.inventaire.id}/lignes/${ligneId}`, corps);
        /* Mise à jour ciblée : on ne repeint pas toute la table pour ne pas
           faire perdre le focus à l'utilisateur en pleine saisie. */
        const maj = session.lignes.find((l) => String(l.id) === String(ligneId));
        if (maj) Object.assign(ligne, maj);
        rafraichirKpis();
        const tr = zone.querySelector(`.saisie-comptage[data-ligne="${ligneId}"]`);
        if (tr) {
          const cellule = tr.closest('tr').querySelector('.cellule-ecart');
          if (cellule) cellule.innerHTML = renduEcart(maj || ligne);
        }
      } catch (e) {
        notifier(e.message, 'erreur');
        peindreOnglet();
      }
    }

    async function toutConforme() {
      const restants = session.lignes.filter((l) => l.quantite_comptee === null || l.quantite_comptee === undefined);
      if (!restants.length) return notifier('Tous les produits sont déjà comptés', 'attente');
      const ok = await confirmer(
        `Marquer les ${restants.length} produit(s) non compté(s) comme conformes au stock attendu ?`,
        { valider: 'Tout marquer conforme' });
      if (!ok) return;
      try {
        for (const l of restants) {
          await Api.put(`/inventaires/${session.inventaire.id}/lignes/${l.id}`, { quantite_comptee: l.quantite_theorique });
        }
        await recharger();
        peindreSession();
        notifier(`${restants.length} produit(s) marqué(s) conformes`);
      } catch (e) { notifier(e.message, 'erreur'); }
    }

    /* ---- 2. Comptes du montant généré ---------------------------------- */
    function peindreMontant(z) {
      const c = session.comptes;
      const comptees = session.lignes.filter((l) => l.quantite_comptee !== null && l.quantite_comptee !== undefined);
      const taux = c.valeur_comptee ? Math.round((c.marge_potentielle / c.valeur_comptee) * 100) : 0;

      z.innerHTML = `<div class="grille g-kpi">
          <div class="kpi"><div class="libelle">Valeur du stock compté</div>
            <div class="valeur">${fcfa(c.valeur_comptee)}</div>
            <div class="pied">Au prix d’achat (capital immobilisé)</div></div>
          <div class="kpi vert"><div class="libelle">Montant généré</div>
            <div class="valeur">${fcfa(c.valeur_vente_comptee)}</div>
            <div class="pied">Si tout le stock compté était vendu</div></div>
          <div class="kpi bleu"><div class="libelle">Marge potentielle</div>
            <div class="valeur">${fcfa(c.marge_potentielle)}</div>
            <div class="pied">${taux} % du prix d’achat</div></div>
          <div class="kpi ambre"><div class="libelle">Écart de valorisation</div>
            <div class="valeur">${signeFcfa(c.ecart_valeur)}</div>
            <div class="pied">Compté − attendu, au prix d’achat</div></div>
        </div>
        <div class="carte">
          <div class="carte-entete"><h3>Valorisation produit par produit</h3>
            <div class="sous">Basée sur les quantités réellement comptées</div></div>
          ${droit.prix ? '' : '<div class="bandeau">🔒 Les montants sont masqués pour votre compte.</div>'}
          ${tableau([
            { titre: 'Produit', rendre: (l) => `<strong>${Fmt.echapper(l.produit)}</strong>${l.magasin_nom ? `<div class="sous">${Fmt.echapper(l.magasin_nom)}</div>` : ''}` },
            { titre: 'Compté', num: true, rendre: (l) => qte(l.quantite_comptee) },
            { titre: 'Prix d’achat', num: true, rendre: (l) => droit.prix ? fcfa(l.prix_achat) : '—' },
            { titre: 'Valeur comptée', num: true, rendre: (l) => droit.prix ? fcfa(l.valeur_comptee) : '—' },
            { titre: 'Prix de vente', num: true, rendre: (l) => droit.prix ? fcfa(l.prix_vente) : '—' },
            { titre: 'Montant généré', num: true, rendre: (l) => droit.prix ? `<strong>${fcfa(l.valeur_vente_comptee)}</strong>` : '—' },
          ], comptees, { vide: 'Aucun produit compté pour le moment.' })}
        </div>`;
    }

    /* ---- 3. Le stock qu'on devait avoir -------------------------------- */
    function peindreAttendu(z) {
      const c = session.comptes;
      z.innerHTML = `<div class="grille g-kpi">
          <div class="kpi"><div class="libelle">Stock attendu (système)</div>
            <div class="valeur">${qte(c.quantite_theorique)}</div>
            <div class="pied">${fcfa(c.valeur_theorique)} au prix d’achat</div></div>
          <div class="kpi bleu"><div class="libelle">Recalculé des mouvements</div>
            <div class="valeur">${qte(c.quantite_calculee)}</div>
            <div class="pied">Somme des entrées, sorties et ventes du journal</div></div>
          <div class="kpi ${c.nb_incoherences_systeme ? 'rouge' : 'vert'}"><div class="libelle">Incohérences</div>
            <div class="valeur">${Fmt.nombre(c.nb_incoherences_systeme)}</div>
            <div class="pied">Ligne(s) où le système et le journal ne concordent pas</div></div>
        </div>
        <div class="carte">
          <div class="carte-entete"><h3>Stock attendu</h3>
            <div class="sous">« Attendu » = ce que le système annonce. « Recalculé » = ce que le journal
              des mouvements raconte. Les deux doivent être identiques : un écart signale une
              modification du stock hors journal.</div></div>
          ${tableau([
            { titre: 'Produit', rendre: (l) => `<strong>${Fmt.echapper(l.produit)}</strong>${l.magasin_nom ? `<div class="sous">${Fmt.echapper(l.magasin_nom)}</div>` : ''}` },
            { titre: 'Attendu', num: true, rendre: (l) => qte(l.quantite_theorique) },
            { titre: 'Recalculé', num: true, rendre: (l) => qte(l.quantite_calculee) },
            { titre: 'Contrôle', num: true, rendre: (l) => Math.abs(l.ecart_integrite) < 0.0001
              ? '<span class="badge ok">concordant</span>'
              : `<span class="badge ko">${signe(l.ecart_integrite)}</span>` },
            { titre: 'Valeur attendue', num: true, rendre: (l) => droit.prix ? fcfa(l.valeur_theorique) : '—' },
          ], session.lignes, { vide: 'Aucun produit actif dans ce périmètre.' })}
        </div>`;
    }

    /* ---- 4. La comparaison --------------------------------------------- */
    function peindreEcarts(z) {
      const c = session.comptes;
      const ecarts = session.lignes.filter((l) => l.ecart_quantite !== null && Math.abs(l.ecart_quantite) > 0.0001);
      const manquants = ecarts.filter((l) => l.ecart_quantite < 0);
      const excedents = ecarts.filter((l) => l.ecart_quantite > 0);
      const perte = manquants.reduce((s, l) => s + (droit.prix ? -(l.ecart_valeur || 0) : 0), 0);

      z.innerHTML = `<div class="grille g-kpi">
          <div class="kpi"><div class="libelle">Produits en écart</div>
            <div class="valeur">${Fmt.nombre(c.nb_ecarts)}</div>
            <div class="pied">sur ${Fmt.nombre(c.nb_comptes)} produits comptés</div></div>
          <div class="kpi rouge"><div class="libelle">Manquants</div>
            <div class="valeur">${Fmt.nombre(c.nb_manquants)}</div>
            <div class="pied">${droit.prix ? fcfa(perte) + ' de perte' : 'Compté < attendu'}</div></div>
          <div class="kpi vert"><div class="libelle">Excédents</div>
            <div class="valeur">${Fmt.nombre(c.nb_excedents)}</div>
            <div class="pied">Compté > attendu</div></div>
          <div class="kpi ${c.ecart_valeur < 0 ? 'rouge' : 'vert'}"><div class="libelle">Écart net</div>
            <div class="valeur">${signe(c.ecart_quantite)}</div>
            <div class="pied">${signeFcfa(c.ecart_valeur)} · ${signeFcfa(c.ecart_valeur_vente)} à la revente</div></div>
        </div>
        ${session.inventaire.statut === 'cloture'
          ? '<div class="bandeau">🔒 Inventaire clôturé : les écarts sont définitifs.</div>'
          : `<div class="bandeau ${c.nb_ecarts ? 'ambre' : 'ok'}">
              ${c.nb_ecarts
                ? `${c.nb_ecarts} produit(s) en écart. « Appliquer les écarts » crée un ajustement de stock pour aligner le système sur le comptage.`
                : '✅ Aucun écart : le stock compté correspond exactement au stock attendu.'}
            </div>`}
        <div class="carte">
          <div class="carte-entete"><h3>Comparaison compté / attendu</h3>
            <div class="sous">Produits dont le comptage diffère du stock attendu</div></div>
          ${tableau([
            { titre: 'Produit', rendre: (l) => `<strong>${Fmt.echapper(l.produit)}</strong>${l.magasin_nom ? `<div class="sous">${Fmt.echapper(l.magasin_nom)}</div>` : ''}` },
            { titre: 'Attendu', num: true, rendre: (l) => qte(l.quantite_theorique) },
            { titre: 'Compté', num: true, rendre: (l) => qte(l.quantite_comptee) },
            { titre: 'Écart', num: true, rendre: (l) => `<strong style="color:${l.ecart_quantite < 0 ? 'var(--bad)' : 'var(--ok)'}">${signe(l.ecart_quantite)}</strong>` },
            { titre: 'Écart valeur', num: true, rendre: (l) => droit.prix ? signeFcfa(l.ecart_valeur) : '—' },
            { titre: 'Nature', rendre: (l) => l.ecart_quantite < 0
              ? '<span class="badge ko">Manquant</span>' : '<span class="badge attente">Excédent</span>' },
            { titre: 'Note', rendre: (l) => Fmt.echapper(l.note || '') },
          ], ecarts, { vide: '✅ Aucun écart constaté.' })}
        </div>`;
    }

    /* ---- Compte rendu imprimable (logo entreprise + logo app) -------- */
    function compteRendu() {
      const c = session.comptes;
      const inv = session.inventaire;
      const nomEnt = (App.etat.parametres || {}).nom_entreprise || 'Entreprise';
      const logoEnt = App.logoEntreprise();
      const ecarts = session.lignes.filter((l) => l.ecart_quantite !== null && Math.abs(l.ecart_quantite) > 0.0001);
      const ligne = (l) => `<tr><td>${Fmt.echapper(l.produit)}</td><td>${l.magasin_nom ? Fmt.echapper(l.magasin_nom) : 'Tous'}</td>
        <td style="text-align:right">${Fmt.nombre(l.quantite_theorique)}</td>
        <td style="text-align:right">${l.quantite_comptee === null || l.quantite_comptee === undefined ? '—' : Fmt.nombre(l.quantite_comptee)}</td>
        <td style="text-align:right">${l.ecart_quantite === null ? '—' : signe(l.ecart_quantite)}</td>
        <td style="text-align:right">${droit.prix && l.ecart_valeur !== null ? signeFcfa(l.ecart_valeur) : '—'}</td></tr>`;
      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Compte rendu — ${Fmt.echapper(inv.libelle)}</title>
        <style>body{font-family:Arial,Helvetica,sans-serif;color:#12263f;padding:28px}
        h1{font-size:20px;margin:0} .sous{color:#5b6b82;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}
        th,td{border:1px solid #d5dce6;padding:6px 8px;text-align:left} th{background:#eef2f7}
        .kpi{display:inline-block;border:1px solid #d5dce6;border-radius:8px;padding:8px 12px;margin:4px 6px 4px 0}
        .kpi b{display:block;font-size:15px}.kpi span{font-size:11px;color:#5b6b82}
        .pied{margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
        .pied img{height:40px;object-fit:contain}</style></head><body>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>${logoEnt ? `<img src="${logoEnt}" style="height:46px;object-fit:contain">` : ''}</div>
          <div style="text-align:right"><h1>${Fmt.echapper(nomEnt)}</h1><div class="sous">Compte rendu d'inventaire</div></div>
        </div>
        <hr style="margin:14px 0">
        <h1>${Fmt.echapper(inv.libelle)}</h1>
        <div class="sous">${inv.magasin_nom ? Fmt.echapper(inv.magasin_nom) : 'Tous les magasins'} ·
          ${inv.statut === 'cloture' ? 'Clôturé le ' + Fmt.dateH(inv.cloture_at) : 'En cours'} · édité le ${Fmt.dateH(new Date().toISOString().slice(0,19).replace('T',' '))}</div>
        <div style="margin-top:12px">
          <div class="kpi"><b>${Fmt.nombre(c.quantite_theorique)}</b><span>Stock attendu</span></div>
          <div class="kpi"><b>${Fmt.nombre(c.quantite_comptee)}</b><span>Stock compté</span></div>
          <div class="kpi"><b>${signe(c.ecart_quantite)}</b><span>Écart (unités)</span></div>
          ${droit.prix ? `<div class="kpi"><b>${signeFcfa(c.ecart_valeur)}</b><span>Écart (FCFA)</span></div>
          <div class="kpi"><b>${Fmt.fcfa(c.valeur_vente_comptee)}</b><span>Montant généré</span></div>` : ''}
          <div class="kpi"><b>${Fmt.nombre(c.nb_manquants)} / ${Fmt.nombre(c.nb_excedents)}</b><span>Manquants / excédents</span></div>
        </div>
        <table><thead><tr><th>Produit</th><th>Magasin</th><th>Attendu</th><th>Compté</th><th>Écart</th><th>Écart valeur</th></tr></thead>
        <tbody>${ecarts.map(ligne).join('') || '<tr><td colspan="6">Aucun écart constaté.</td></tr>'}</tbody></table>
        <div class="pied">
          <div class="sous">Document édité par ${Fmt.echapper(nomEnt)} — ${Fmt.nombre(c.nb_comptes)} produit(s) compté(s) sur ${Fmt.nombre(c.nb_produits)}.</div>
          <div style="text-align:right"><img src="img/logo-app.jpeg" alt="Inventa GestyPro"><div class="sous">Inventa GestyPro</div></div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print()},300)}</` + `script>
        </body></html>`;
      const w = window.open('', '_blank');
      if (!w) return notifier('Autorisez les fenêtres pop-up pour imprimer le compte rendu', 'attente');
      w.document.write(html); w.document.close();
    }

    /* ------------------------------------------------------------------ */
    /*  Actions                                                            */
    /* ------------------------------------------------------------------ */
    function rafraichirKpis() {
      const c = session.comptes;
      const kpis = zone.querySelectorAll('.grille.g-kpi .kpi');
      if (kpis.length < 4) return;
      kpis[1].querySelector('.valeur').textContent = qte(c.quantite_comptee);
      kpis[1].querySelector('.pied').textContent = `${c.nb_comptes} produit(s) sur ${c.nb_produits}`;
      kpis[2].querySelector('.valeur').textContent = signe(c.ecart_quantite);
      kpis[2].querySelector('.pied').textContent = signeFcfa(c.ecart_valeur);
      kpis[3].querySelector('.valeur').textContent = fcfa(c.valeur_vente_comptee);
      const barre = zone.querySelector('.grille.g-kpi + .carte .sous');
      if (barre) barre.textContent = `${c.nb_comptes} / ${c.nb_produits} produits comptés (${c.progression} %)`;
      const fill = zone.querySelector('.grille.g-kpi + .carte div > div > div');
      if (fill) fill.style.width = c.progression + '%';
    }

    async function cloturerSession() {
      const ok = await confirmer(
        'Clôturer cet inventaire ? Les chiffres seront figés et la session ne pourra plus être modifiée ni supprimée.',
        { valider: 'Clôturer', danger: true });
      if (!ok) return;
      try {
        await Api.post(`/inventaires/${session.inventaire.id}/cloturer`);
        await recharger();
        peindreSession();
        notifier('Inventaire clôturé');
      } catch (e) { notifier(e.message, 'erreur'); }
    }

    async function appliquerEcarts() {
      const ok = await confirmer(
        'Appliquer les écarts au stock ? Le système créera un mouvement d’ajustement par produit '
        + 'en écart afin d’aligner le stock sur le comptage.',
        { valider: 'Appliquer les écarts' });
      if (!ok) return;
      try {
        const r = await Api.post(`/inventaires/${session.inventaire.id}/appliquer`);
        notifier(r.message || `${r.appliques} ajustement(s) appliqué(s)`);
        await recharger();
        peindreSession();
      } catch (e) { notifier(e.message, 'erreur'); }
    }

    /* ------------------------------------------------------------------ */
    try {
      await chargerListe();
    } catch (e) {
      zone.innerHTML = entetePage({ titre: '📋 Inventaires' })
        + `<div class="bandeau ko">${Fmt.echapper(e.message)}</div>`;
    }
  },
});
