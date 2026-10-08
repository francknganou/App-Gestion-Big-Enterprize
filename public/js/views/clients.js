/* ==========================================================================
   Vue : Clients (fichier client, fidélité, historique)
   ========================================================================== */
App.enregistrerVue('clients', {
  titre: 'Clients', icone: '👥', permissions: ['clients.consulter'], groupe: 'Tiers',
  async rendre(zone) {
    const peutGerer = App.peut('clients.gerer');
    let filtres = { q: '', type: '' };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Fichier clients</h3>
          <div class="droite">
            <button class="btn" id="c-export">⬇️ Exporter</button>
            <button class="btn primaire" id="c-nouveau">＋ Nouveau client</button>
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="recherche"><input id="c-q" placeholder="Rechercher un client (nom, téléphone, code)…"></div>
            <div class="champ"><label>Type</label><select id="c-type">
              <option value="">Tous</option><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></div>
            <button class="btn primaire" id="c-filtrer">Appliquer</button>
          </div>
        </div>
      </div>
      <div class="grille g-kpi" style="margin-bottom:18px" id="c-kpi"></div>
      <div class="carte"><div class="carte-entete"><h3>Liste</h3><div class="droite petit texte-muted" id="c-info"></div></div>
        <div class="carte-corps serre" id="c-liste"></div></div>`;

    async function charger() {
      document.getElementById('c-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const r = await Api.get('/clients', filtres);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const ca = r.reduce((s, c) => s + c.total_achats, 0);
      const actifs = r.filter((c) => (c.dernier_achat || '').slice(0, 7) === Fmt.iso().slice(0, 7)).length;
      document.getElementById('c-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Clients enregistrés</div><div class="valeur">${Fmt.nombre(r.length)}</div><div class="pied">dont ${r.filter((c) => c.type === 'entreprise').length} entreprise(s)</div></div>
        <div class="kpi vert"><div class="libelle">Chiffre d'affaires cumulé</div><div class="valeur">${Fmt.fcfa(ca)}</div><div class="pied">Toutes ventes confondues</div></div>
        <div class="kpi bleu"><div class="libelle">Clients actifs ce mois</div><div class="valeur">${Fmt.nombre(actifs)}</div><div class="pied">Au moins un achat ce mois-ci</div></div>
        <div class="kpi ambre"><div class="libelle">Points de fidélité distribués</div><div class="valeur">${Fmt.nombre(r.reduce((s, c) => s + c.points, 0))}</div><div class="pied">1 point par 5 000 FCFA d'achat</div></div>`;
      document.getElementById('c-info').textContent = `${r.length} client(s)`;

      document.getElementById('c-liste').innerHTML = tableau([
        { titre: 'Code', rendre: (l) => `<span class="mono">${Fmt.echapper(l.code || '—')}</span>` },
        { titre: 'Client', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.email || '')}</div>` },
        { titre: 'Téléphone', rendre: (l) => Fmt.echapper(l.telephone || '—') },
        { titre: 'Ville', rendre: (l) => Fmt.echapper(l.ville || '—') },
        { titre: 'Type', rendre: (l) => l.type === 'entreprise' ? '<span class="badge info">Entreprise</span>' : '<span class="badge neutre">Particulier</span>' },
        { titre: 'Achats', num: true, rendre: (l) => Fmt.nombre(l.nb_achats) },
        { titre: 'Total dépensé', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.total_achats)}</b>` },
        { titre: 'Points', num: true, rendre: (l) => `<span class="puce">${Fmt.nombre(l.points)}</span>` },
        { titre: 'Dernier achat', num: true, rendre: (l) => Fmt.date(l.dernier_achat) },
        { titre: '', rendre: (l) => `<div class="actions">
            <button class="btn petit" data-fiche="${l.id}">Historique</button>
            <button class="btn petit" data-modif="${l.id}">Modifier</button></div>` },
      ], r, { vide: 'Aucun client trouvé' });

      document.querySelectorAll('[data-fiche]').forEach((b) => b.onclick = () => fiche(Number(b.dataset.fiche)));
      document.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(r.find((c) => c.id === Number(b.dataset.modif))));
    }

    async function fiche(id) {
      const c = await Api.get('/clients/' + id);
      ouvrirModale({
        titre: c.nom, largeur: 'large',
        contenu: `
          <div class="grille g-3" style="margin-bottom:14px">
            <div><div class="petit texte-muted">Code</div><b class="mono">${Fmt.echapper(c.code || '—')}</b></div>
            <div><div class="petit texte-muted">Téléphone</div><b>${Fmt.echapper(c.telephone || '—')}</b></div>
            <div><div class="petit texte-muted">Email</div><b>${Fmt.echapper(c.email || '—')}</b></div>
            <div><div class="petit texte-muted">Adresse</div><b>${Fmt.echapper(c.adresse || '—')}</b></div>
            <div><div class="petit texte-muted">Ville</div><b>${Fmt.echapper(c.ville || '—')}</b></div>
            <div><div class="petit texte-muted">Points de fidélité</div><b>${Fmt.nombre(c.points)} points</b></div>
          </div>
          ${tableau([
            { titre: 'Référence', rendre: (l) => Fmt.echapper(l.reference) },
            { titre: 'Date', rendre: (l) => Fmt.dateH(l.created_at) },
            { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin) },
            { titre: 'Montant', num: true, rendre: (l) => Fmt.fcfa(l.total) },
            { titre: 'État', rendre: (l) => badgeStatutVente(l.statut) },
          ], c.ventes, { vide: 'Aucun achat enregistré' })}`,
        pied: '<button class="btn primaire" data-fermer>Fermer</button>',
        surOuverture(mod, fermer) { mod.querySelector('[data-fermer]').onclick = fermer; },
      });
    }

    function formulaire(client) {
      const c = client || { type: 'particulier' };
      ouvrirModale({
        titre: client ? 'Modifier le client' : 'Nouveau client',
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><label>Nom / raison sociale *</label><input name="nom" value="${Fmt.echapper(c.nom || '')}" required></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(c.telephone || '')}" placeholder="+237 6 XX XX XX XX"></div>
            <div class="champ"><label>Email</label><input type="email" name="email" value="${Fmt.echapper(c.email || '')}"></div>
            <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(c.ville || '')}"></div>
            <div class="champ"><label>Type</label><select name="type">
              <option value="particulier" ${c.type === 'particulier' ? 'selected' : ''}>Particulier</option>
              <option value="entreprise" ${c.type === 'entreprise' ? 'selected' : ''}>Entreprise</option></select></div>
            <div class="champ plein"><label>Adresse</label><input name="adresse" value="${Fmt.echapper(c.adresse || '')}"></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.nom) return notifier('Le nom est obligatoire', 'erreur');
            try {
              if (client) await Api.put('/clients/' + client.id, d); else await Api.post('/clients', d);
              notifier(client ? 'Client mis à jour' : 'Client créé'); fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    document.getElementById('c-filtrer').onclick = () => {
      filtres = { q: document.getElementById('c-q').value, type: document.getElementById('c-type').value };
      charger();
    };
    document.getElementById('c-q').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('c-filtrer').click(); };
    document.getElementById('c-nouveau').onclick = () => formulaire(null);
    document.getElementById('c-export').onclick = async () => {
      try { await Api.telecharger('/export.csv?type=clients', 'clients.csv'); notifier('Export téléchargé'); }
      catch (e) { notifier(e.message, 'erreur'); }
    };
    charger();
  },
});

/* ============================ FOURNISSEURS ============================ */
App.enregistrerVue('fournisseurs', {
  titre: 'Fournisseurs', icone: '🏭', permissions: ['fournisseurs.consulter'], groupe: 'Tiers',
  async rendre(zone) {
    const peutGerer = App.peut('fournisseurs.gerer');
    let q = '';

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Fournisseurs & partenaires</h3>
          <div class="droite">
            ${peutGerer ? '<button class="btn primaire" id="f-nouveau">＋ Nouveau fournisseur</button>' : ''}
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="recherche"><input id="f-q" placeholder="Rechercher un fournisseur (nom, contact, code)…"></div>
            <button class="btn primaire" id="f-filtrer">Rechercher</button>
          </div>
        </div>
      </div>
      <div class="grille g-kpi" style="margin-bottom:18px" id="f-kpi"></div>
      <div class="carte"><div class="carte-corps serre" id="f-liste"></div></div>`;

    async function charger() {
      document.getElementById('f-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const r = await Api.get('/fournisseurs', { q });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      document.getElementById('f-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Fournisseurs</div><div class="valeur">${Fmt.nombre(r.length)}</div><div class="pied">Partenaires référencés</div></div>
        <div class="kpi vert"><div class="libelle">Achats reçus (total)</div><div class="valeur">${Fmt.fcfa(r.reduce((s, f) => s + f.total_achats, 0))}</div><div class="pied">Commandes réceptionnées</div></div>
        <div class="kpi bleu"><div class="libelle">Commandes enregistrées</div><div class="valeur">${Fmt.nombre(r.reduce((s, f) => s + f.nb_commandes, 0))}</div><div class="pied">Tous statuts confondus</div></div>`;
      document.getElementById('f-liste').innerHTML = tableau([
        { titre: 'Code', rendre: (l) => `<span class="mono">${Fmt.echapper(l.code || '—')}</span>` },
        { titre: 'Fournisseur', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.categorie || '')}</div>` },
        { titre: 'Contact', rendre: (l) => `${Fmt.echapper(l.contact || '—')}<div class="petit texte-muted">${Fmt.echapper(l.telephone || '')}</div>` },
        { titre: 'Email', rendre: (l) => Fmt.echapper(l.email || '—') },
        { titre: 'Ville', rendre: (l) => Fmt.echapper(l.ville || '—') },
        { titre: 'Commandes', num: true, rendre: (l) => Fmt.nombre(l.nb_commandes) },
        { titre: 'Total achats', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.total_achats)}</b>` },
        { titre: '', rendre: (l) => peutGerer ? `<div class="actions">
            <button class="btn petit" data-modif="${l.id}">Modifier</button>
            <button class="btn petit danger" data-suppr="${l.id}">Suppr.</button></div>` : '' },
      ], r, { vide: 'Aucun fournisseur' });

      document.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(r.find((f) => f.id === Number(b.dataset.modif))));
      document.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        const f = r.find((x) => x.id === Number(b.dataset.suppr));
        if (!(await confirmer(`Supprimer le fournisseur « ${f.nom} » ?`, { danger: true, valider: 'Supprimer' }))) return;
        try { await Api.del('/fournisseurs/' + f.id); notifier('Fournisseur supprimé'); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
    }

    function formulaire(f0) {
      const f = f0 || {};
      ouvrirModale({
        titre: f0 ? 'Modifier le fournisseur' : 'Nouveau fournisseur',
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><label>Nom / raison sociale *</label><input name="nom" value="${Fmt.echapper(f.nom || '')}" required></div>
            <div class="champ"><label>Personne de contact</label><input name="contact" value="${Fmt.echapper(f.contact || '')}"></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(f.telephone || '')}"></div>
            <div class="champ"><label>Email</label><input type="email" name="email" value="${Fmt.echapper(f.email || '')}"></div>
            <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(f.ville || '')}"></div>
            <div class="champ"><label>Spécialité</label><input name="categorie" value="${Fmt.echapper(f.categorie || '')}" placeholder="Alimentation, Boissons…"></div>
            <div class="champ plein"><label>Adresse</label><input name="adresse" value="${Fmt.echapper(f.adresse || '')}"></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.nom) return notifier('Nom obligatoire', 'erreur');
            try {
              if (f0) await Api.put('/fournisseurs/' + f0.id, d); else await Api.post('/fournisseurs', d);
              notifier(f0 ? 'Fournisseur mis à jour' : 'Fournisseur créé'); fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    document.getElementById('f-filtrer').onclick = () => { q = document.getElementById('f-q').value; charger(); };
    document.getElementById('f-q').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('f-filtrer').click(); };
    if (peutGerer) document.getElementById('f-nouveau').onclick = () => formulaire(null);
    charger();
  },
});

/* ============================== EMPLOYÉS ============================== */
App.enregistrerVue('employes', {
  titre: 'Employés', icone: '🧑‍💼', permissions: ['employes.consulter'], groupe: 'Ressources humaines',
  async rendre(zone) {
    const peutGerer = App.peut('employes.gerer');
    let filtres = { q: '', magasin_id: App.global() ? '' : (App.magasinCourant() || '') };

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Personnel du réseau</h3>
          <div class="droite">
            ${peutGerer ? '<button class="btn primaire" id="e-nouveau">＋ Nouvel employé</button>' : ''}
          </div>
        </div>
        <div class="carte-corps">
          <div class="filtres">
            <div class="recherche"><input id="e-q" placeholder="Rechercher (nom, poste, code)…"></div>
            ${App.global() ? `<div class="champ"><label>Magasin</label><select id="e-magasin">
              <option value="">Tous</option>${options(App.etat.magasins, 'id', (m) => m.nom, '')}</select></div>` : ''}
            <button class="btn primaire" id="e-filtrer">Appliquer</button>
          </div>
        </div>
      </div>
      <div class="grille g-kpi" style="margin-bottom:18px" id="e-kpi"></div>
      <div class="carte"><div class="carte-corps serre" id="e-liste"></div></div>`;

    async function charger() {
      document.getElementById('e-liste').innerHTML = '<div class="vide">Chargement…</div>';
      const r = await Api.get('/employes', filtres);
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      const liste = r.employes || [];
      const parMagasin = {};
      liste.filter((e) => e.actif).forEach((e) => { parMagasin[e.magasin || 'Sans affectation'] = (parMagasin[e.magasin || 'Sans affectation'] || 0) + 1; });
      document.getElementById('e-kpi').innerHTML = `
        <div class="kpi"><div class="libelle">Effectif total</div><div class="valeur">${Fmt.nombre(liste.length)}</div><div class="pied">${liste.filter((e) => e.actif).length} actif(s)</div></div>
        <div class="kpi vert"><div class="libelle">Masse salariale mensuelle</div><div class="valeur">${Fmt.fcfa(r.masse_salariale)}</div><div class="pied">Employés actifs</div></div>
        <div class="kpi bleu"><div class="libelle">Contrats CDI</div><div class="valeur">${Fmt.nombre(liste.filter((e) => e.type_contrat === 'CDI').length)}</div><div class="pied">CDD : ${liste.filter((e) => e.type_contrat === 'CDD').length}</div></div>
        <div class="kpi ambre"><div class="libelle">Répartition</div><div class="valeur" style="font-size:15px">${Object.entries(parMagasin).map(([m, n]) => `${Fmt.echapper(m)} : <b>${n}</b>`).join('<br>') || '—'}</div></div>`;
      document.getElementById('e-liste').innerHTML = tableau([
        { titre: 'Code', rendre: (l) => `<span class="mono">${Fmt.echapper(l.code || '—')}</span>` },
        { titre: 'Employé', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.poste || '')}</div>` },
        { titre: 'Magasin', rendre: (l) => Fmt.echapper(l.magasin || '—') },
        { titre: 'Téléphone', rendre: (l) => Fmt.echapper(l.telephone || '—') },
        { titre: 'Embauche', num: true, rendre: (l) => Fmt.date(l.date_embauche) },
        { titre: 'CNI', rendre: (l) => l.numero_cni
            ? `<span class="mono petit">${Fmt.echapper(l.numero_cni)}</span>`
            : '<span class="badge ambre">manquante</span>' },
        { titre: 'Contrat', rendre: (l) => `<span class="badge ${l.type_contrat === 'CDI' ? 'ok' : 'neutre'}">${Fmt.echapper(l.type_contrat || '—')}</span>` },
        { titre: 'Salaire', num: true, rendre: (l) => Fmt.fcfa(l.salaire) },
        { titre: 'Documents', num: true, rendre: (l) => l.nb_documents
            ? `<span class="badge ok">${Fmt.nombre(l.nb_documents)}</span>`
            : '<span class="badge">aucun</span>' },
        { titre: 'Paie', rendre: (l) => l.dernier_statut_salaire === 'paye'
            ? `<span class="badge ok">Payé</span><div class="petit texte-muted mono">${Fmt.echapper(l.derniere_periode || '')}</div>`
            : (l.derniere_periode ? `<span class="badge ambre">À payer</span><div class="petit texte-muted mono">${Fmt.echapper(l.derniere_periode)}</div>` : '—') },
        { titre: 'État', rendre: (l) => l.statut_dossier === 'sorti'
            ? '<span class="badge erreur">Sorti</span>'
            : (l.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>') },
        { titre: '', rendre: (l) => `<div class="actions">
            <button class="btn petit" data-dossier="${l.id}">🗂 Dossier</button>
            ${peutGerer ? `<button class="btn petit" data-modif="${l.id}">Modifier</button>
            <button class="btn petit danger" data-suppr="${l.id}">Suppr.</button>` : ''}</div>` },
      ], liste, { vide: 'Aucun employé' });

      document.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(liste.find((e) => e.id === Number(b.dataset.modif))));
      /* Le dossier complet (pièces PDF, historique de paie) vit dans « Recrutements ». */
      document.querySelectorAll('[data-dossier]').forEach((b) => b.onclick = () => App.allerA('recrutement'));
      document.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        const e = liste.find((x) => x.id === Number(b.dataset.suppr));
        if (!(await confirmer(`Supprimer « ${e.nom} » du fichier du personnel ?`, { danger: true, valider: 'Supprimer' }))) return;
        try { await Api.del('/employes/' + e.id); notifier('Employé supprimé'); charger(); }
        catch (err) { notifier(err.message, 'erreur'); }
      });
    }

    function formulaire(emp) {
      const e = emp || { type_contrat: 'CDI', actif: 1, date_embauche: Fmt.iso() };
      ouvrirModale({
        titre: emp ? 'Modifier l’employé' : 'Nouvel employé',
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><label>Nom complet *</label><input name="nom" value="${Fmt.echapper(e.nom || '')}" required></div>
            <div class="champ"><label>Poste</label><input name="poste" value="${Fmt.echapper(e.poste || '')}" placeholder="Caissière, Magasinier…"></div>
            <div class="champ"><label>Magasin</label><select name="magasin_id"><option value="">—</option>${options(App.etat.magasins, 'id', (m) => m.nom, e.magasin_id)}</select></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(e.telephone || '')}"></div>
            <div class="champ"><label>Email</label><input type="email" name="email" value="${Fmt.echapper(e.email || '')}"></div>
            <div class="champ"><label>Date d'embauche</label><input type="date" name="date_embauche" value="${(e.date_embauche || '').slice(0, 10)}"></div>
            <div class="champ"><label>Type de contrat</label><select name="type_contrat">
              <option value="CDI" ${e.type_contrat === 'CDI' ? 'selected' : ''}>CDI</option>
              <option value="CDD" ${e.type_contrat === 'CDD' ? 'selected' : ''}>CDD</option>
              <option value="Stage" ${e.type_contrat === 'Stage' ? 'selected' : ''}>Stage</option>
              <option value="Journalier" ${e.type_contrat === 'Journalier' ? 'selected' : ''}>Journalier</option></select></div>
            <div class="champ"><label>Salaire mensuel (FCFA)</label><input type="number" name="salaire" min="0" step="1000" value="${e.salaire || 0}"></div>
          </div>

          <div class="groupe-titre" style="margin:14px 0 8px">État civil</div>
          <div class="grille-form">
            <div class="champ"><label>Civilité</label><select name="civilite">
              ${['M.', 'Mme', 'Mlle', 'Dr'].map((c) => `<option ${(e.civilite || 'M.') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="champ"><label>Sexe</label><select name="sexe">
              <option value="">—</option>
              <option value="M" ${e.sexe === 'M' ? 'selected' : ''}>Masculin</option>
              <option value="F" ${e.sexe === 'F' ? 'selected' : ''}>Féminin</option></select></div>
            <div class="champ"><label>Date de naissance</label>
              <input type="date" name="date_naissance" value="${(e.date_naissance || '').slice(0, 10)}"></div>
            <div class="champ"><label>Lieu de naissance</label><input name="lieu_naissance" value="${Fmt.echapper(e.lieu_naissance || '')}"></div>
            <div class="champ"><label>Situation matrimoniale</label><select name="situation_matrimoniale">
              <option value="">—</option>
              ${['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'].map((c) => `<option ${e.situation_matrimoniale === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(e.ville || '')}"></div>
            <div class="champ plein"><label>Adresse</label><input name="adresse" value="${Fmt.echapper(e.adresse || '')}"></div>
          </div>

          <div class="groupe-titre" style="margin:14px 0 8px">Pièces administratives et contrat</div>
          <div class="grille-form">
            <div class="champ"><label>N° CNI</label><input name="numero_cni" value="${Fmt.echapper(e.numero_cni || '')}"></div>
            <div class="champ"><label>N° CNPS</label><input name="numero_cnps" value="${Fmt.echapper(e.numero_cnps || '')}"></div>
            <div class="champ"><label>N° IFU</label><input name="numero_ifu" value="${Fmt.echapper(e.numero_ifu || '')}"></div>
            <div class="champ"><label>Fin de contrat (CDD)</label>
              <input type="date" name="date_fin_contrat" value="${(e.date_fin_contrat || '').slice(0, 10)}"></div>
            <div class="champ plein"><label>Formation / diplôme</label><input name="formation" value="${Fmt.echapper(e.formation || '')}"></div>
            <div class="champ"><label>Contact d'urgence — nom</label><input name="contact_urgence_nom" value="${Fmt.echapper(e.contact_urgence_nom || '')}"></div>
            <div class="champ"><label>Contact d'urgence — téléphone</label><input name="contact_urgence_tel" value="${Fmt.echapper(e.contact_urgence_tel || '')}"></div>
            <div class="champ plein"><label>Notes</label><textarea name="notes" rows="2">${Fmt.echapper(e.notes || '')}</textarea></div>
            <div class="champ plein"><label><input type="checkbox" name="actif" ${e.actif ? 'checked' : ''} style="width:auto;margin-right:6px">Employé actif</label></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.nom) return notifier('Nom obligatoire', 'erreur');
            try {
              if (emp) await Api.put('/employes/' + emp.id, d); else await Api.post('/employes', d);
              notifier(emp ? 'Employé mis à jour' : 'Employé ajouté'); fermer(); charger();
            } catch (err) { notifier(err.message, 'erreur'); }
          };
        },
      });
    }

    document.getElementById('e-filtrer').onclick = () => {
      filtres = {
        q: document.getElementById('e-q').value,
        magasin_id: document.getElementById('e-magasin') ? document.getElementById('e-magasin').value : (App.magasinCourant() || ''),
      };
      charger();
    };
    document.getElementById('e-q').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('e-filtrer').click(); };
    if (peutGerer) document.getElementById('e-nouveau').onclick = () => formulaire(null);
    charger();
  },
});
