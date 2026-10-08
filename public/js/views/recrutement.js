/* ==========================================================================
   Vue : Recrutements — candidatures, dossiers du personnel et documents PDF.

   Deux volets :
     • les CANDIDATURES (vivier) : réception, entretien, décision, embauche ;
     • les DOSSIERS des employés : toutes leurs informations et leurs pièces
       (CNI, diplôme, CV, contrat…) téléversées en PDF et téléchargeables.
   ========================================================================== */
App.enregistrerVue('recrutement', {
  titre: 'Recrutements', icone: '📋',
  permissions: ['recrutement.consulter'], groupe: 'Ressources humaines',

  async rendre(zone) {
    const peutGerer = App.peut('recrutement.gerer');
    const peutEmployes = App.peut('employes.consulter');
    let onglet = 'candidats';
    let filtreCandidat = '';
    let filtreDossier = { q: '', magasin_id: App.global() ? '' : (App.magasinCourant() || '') };

    const LIBELLE_STATUT = {
      recu: 'Candidature reçue', entretien: 'Entretien planifié', retenu: 'Retenu',
      embauche: 'Embauché', refuse: 'Refusé',
    };
    const COULEUR_STATUT = {
      recu: 'neutre', entretien: 'ambre', retenu: 'info', embauche: 'ok', refuse: 'erreur',
    };
    let CATEGORIES = {};

    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete"><h3>📋 Recrutements et dossiers du personnel</h3>
          <div class="droite">
            <div class="onglets">
              <button class="btn petit" data-onglet="candidats">🧑‍ Candidatures</button>
              <button class="btn petit" data-onglet="dossiers">🗂 Dossiers & documents</button>
              <button class="btn petit" data-onglet="archives">🗄 Archives</button>
            </div>
          </div></div>
        <div class="carte-corps" id="r-corps"></div>
      </div>`;

    const corps = () => document.getElementById('r-corps');

    function peindreOnglets() {
      zone.querySelectorAll('[data-onglet]').forEach((b) =>
        b.classList.toggle('primaire', b.dataset.onglet === onglet));
    }

    /* ==================================================================== */
    /* Onglet 1 — Candidatures                                              */
    /* ==================================================================== */
    async function chargerCandidats() {
      corps().innerHTML = '<div class="vide">Chargement…</div>';
      const params = filtreCandidat ? { statut: filtreCandidat } : null;
      const r = await Api.get('/rh/candidats', params);
      if (!document.body.contains(zone)) return;
      const s = r.stats || {};
      const liste = r.candidats || [];

      corps().innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:16px">
          <div class="kpi"><div class="libelle">Candidatures</div><div class="valeur">${Fmt.nombre(s.total)}</div>
            <div class="pied">${Fmt.nombre(s.en_cours)} en cours de traitement</div></div>
          <div class="kpi ambre"><div class="libelle">Entretiens à venir</div>
            <div class="valeur">${Fmt.nombre(s.entretiens_a_venir)}</div><div class="pied">Planifiés</div></div>
          <div class="kpi vert"><div class="libelle">Embauches</div><div class="valeur">${Fmt.nombre(s.embauches)}</div>
            <div class="pied">Taux : ${Fmt.nombre(s.taux_embauche)} %</div></div>
          <div class="kpi"><div class="libelle">Refus</div><div class="valeur">${Fmt.nombre(s.refuses)}</div>
            <div class="pied">Candidatures closes</div></div>
        </div>

        <div class="filtres">
          <div class="champ"><label>Statut</label><select id="c-statut">
            <option value="">Tous les statuts</option>
            ${Object.entries(LIBELLE_STATUT).map(([k, v]) =>
              `<option value="${k}" ${filtreCandidat === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select></div>
          ${peutGerer ? '<button class="btn primaire" id="c-nouveau">＋ Nouvelle candidature</button>' : ''}
        </div>

        <div class="serre">${tableau([
          { titre: 'Candidat', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b>
              <div class="petit texte-muted">${Fmt.echapper(l.poste_vise || 'poste non précisé')}</div>` },
          { titre: 'Contact', rendre: (l) => `${Fmt.echapper(l.telephone || '—')}
              <div class="petit texte-muted">${Fmt.echapper(l.email || '')}</div>` },
          { titre: 'Boutique', rendre: (l) => Fmt.echapper(l.magasin || '—') },
          { titre: 'Reçue le', rendre: (l) => `<span class="mono petit">${Fmt.date(l.date_candidature)}</span>
              <div class="petit texte-muted">${Fmt.echapper(l.source || '')}</div>` },
          { titre: 'Expérience', num: true, rendre: (l) => Fmt.nombre(l.experience_annees) + ' an(s)' },
          { titre: 'Salaire proposé', num: true, rendre: (l) => l.salaire_propose ? Fmt.fcfa(l.salaire_propose) : '—' },
          { titre: 'Statut', rendre: (l) => `<span class="badge ${COULEUR_STATUT[l.statut] || 'neutre'}">${Fmt.echapper(LIBELLE_STATUT[l.statut] || l.statut)}</span>
              ${l.date_entretien ? `<div class="petit texte-muted">Entretien : ${Fmt.date(l.date_entretien)}</div>` : ''}
              ${l.employe_nom ? `<div class="petit texte-muted">→ ${Fmt.echapper(l.employe_code)}</div>` : ''}` },
          { titre: '', rendre: (l) => `<div class="actions">
              <button class="btn petit" data-candidat="${l.id}">👁 Dossier</button>
              <button class="btn petit" data-pieces-candidat="${l.id}" title="Documents PDF de la candidature">📎 Pièces</button>
              ${peutGerer && !l.employe_id && l.statut !== 'refuse'
                ? `<button class="btn petit primaire" data-embaucher="${l.id}">✅ Embaucher</button>` : ''}
            </div>` },
        ], liste, { vide: 'Aucune candidature pour le moment' })}</div>`;

      const selStatut = document.getElementById('c-statut');
      if (selStatut) selStatut.onchange = (e) => { filtreCandidat = e.target.value; chargerCandidats(); };

      const bNouveau = document.getElementById('c-nouveau');
      if (bNouveau) bNouveau.onclick = () => formulaireCandidat(null);

      zone.querySelectorAll('[data-pieces-candidat]').forEach((b) => b.onclick = () =>
        piecesCandidat(Number(b.dataset.piecesCandidat)));
      zone.querySelectorAll('[data-candidat]').forEach((b) => b.onclick = () =>
        ficheCandidat(liste.find((c) => c.id === Number(b.dataset.candidat))));
      zone.querySelectorAll('[data-embaucher]').forEach((b) => b.onclick = () =>
        embaucher(liste.find((c) => c.id === Number(b.dataset.embaucher))));
    }

    /** Saisie d'une candidature. */
    function formulaireCandidat(c) {
      const x = c || { statut: 'recu', source: 'spontanee', date_candidature: Fmt.iso() };
      ouvrirModale({
        titre: c ? 'Modifier la candidature' : 'Nouvelle candidature',
        contenu: `
          <div class="grille-form">
            <div class="champ plein"><label>Nom complet *</label>
              <input name="nom" value="${Fmt.echapper(x.nom || '')}" required></div>
            <div class="champ"><label>Poste visé</label>
              <input name="poste_vise" value="${Fmt.echapper(x.poste_vise || '')}" placeholder="Caissière, magasinier…"></div>
            <div class="champ"><label>Boutique d'affectation</label>
              <select name="magasin_id"><option value="">—</option>
                ${options(App.etat.magasins, 'id', (m) => m.nom, x.magasin_id)}</select></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(x.telephone || '')}"></div>
            <div class="champ"><label>Email</label><input type="email" name="email" value="${Fmt.echapper(x.email || '')}"></div>
            <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(x.ville || '')}"></div>
            <div class="champ"><label>Date de naissance</label>
              <input type="date" name="date_naissance" value="${(x.date_naissance || '').slice(0, 10)}"></div>
            <div class="champ"><label>Date de candidature</label>
              <input type="date" name="date_candidature" value="${(x.date_candidature || Fmt.iso()).slice(0, 10)}"></div>
            <div class="champ"><label>Origine</label><select name="source">
              ${[['spontanee', 'Candidature spontanée'], ['annonce', 'Réponse à une annonce'],
                 ['recommendation', 'Recommandation'], ['agence', 'Agence / cabinet']]
                .map(([k, v]) => `<option value="${k}" ${x.source === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
            <div class="champ"><label>Statut</label><select name="statut">
              ${Object.entries(LIBELLE_STATUT).map(([k, v]) =>
                `<option value="${k}" ${x.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="champ"><label>Date d'entretien</label>
              <input type="date" name="date_entretien" value="${(x.date_entretien || '').slice(0, 10)}"></div>
            <div class="champ"><label>Années d'expérience</label>
              <input type="number" min="0" max="60" name="experience_annees" value="${x.experience_annees || 0}"></div>
            <div class="champ"><label>Salaire proposé</label>
              <input type="number" min="0" step="1000" name="salaire_propose" value="${x.salaire_propose || 0}"></div>
            <div class="champ plein"><label>Formation</label>
              <input name="formation" value="${Fmt.echapper(x.formation || '')}" placeholder="Diplôme, école…"></div>
            <div class="champ plein"><label>Motif (refus ou décision)</label>
              <textarea name="motif" rows="2">${Fmt.echapper(x.motif || '')}</textarea></div>
            <div class="champ plein"><label>Notes d'entretien</label>
              <textarea name="notes" rows="2">${Fmt.echapper(x.notes || '')}</textarea></div>
          </div>
          <div id="c-erreur"></div>`,
        pied: `${c ? '<button class="btn danger" data-suppr>🗑 Supprimer</button>' : ''}
               <button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-enregistrer>💾 Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          const bSuppr = mod.querySelector('[data-suppr]');
          if (bSuppr) bSuppr.onclick = async () => {
            if (!(await confirmer('Supprimer cette candidature ?', { danger: true, valider: 'Supprimer' }))) return;
            try { await Api.del('/rh/candidats/' + c.id); notifier('Candidature supprimée'); fermer(); chargerCandidats(); }
            catch (e) { notifier(e.message, 'erreur'); }
          };
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const f = lireFormulaire(mod);
            try {
              if (c) await Api.put('/rh/candidats/' + c.id, f);
              else await Api.post('/rh/candidats', f);
              notifier(c ? 'Candidature mise à jour' : 'Candidature enregistrée');
              fermer(); chargerCandidats();
            } catch (e) {
              mod.querySelector('#c-erreur').innerHTML =
                `<div class="bandeau erreur" style="margin-top:10px">${Fmt.echapper(e.message)}</div>`;
            }
          };
        },
      });
    }

    /** Fiche complète d'une candidature. */
    async function ficheCandidat(c) {
      if (!c) return;
      const d = await Api.get('/rh/candidats/' + c.id);
      const x = d.candidat;
      ouvrirModale({
        titre: 'Candidature — ' + x.nom,
        contenu: `
          <div class="bloc-paiement">
            <div class="panier-total"><span>Poste visé</span><b>${Fmt.echapper(x.poste_vise || '—')}</b></div>
            <div class="panier-total"><span>Statut</span>
              <b><span class="badge ${COULEUR_STATUT[x.statut] || 'neutre'}">${Fmt.echapper(LIBELLE_STATUT[x.statut] || x.statut)}</span></b></div>
            <div class="panier-total"><span>Téléphone</span><b>${Fmt.echapper(x.telephone || '—')}</b></div>
            <div class="panier-total"><span>Email</span><b>${Fmt.echapper(x.email || '—')}</b></div>
            <div class="panier-total"><span>Ville</span><b>${Fmt.echapper(x.ville || '—')}</b></div>
            <div class="panier-total"><span>Date de naissance</span><b>${Fmt.date(x.date_naissance)}</b></div>
            <div class="panier-total"><span>Candidature reçue</span><b>${Fmt.date(x.date_candidature)}</b></div>
            <div class="panier-total"><span>Entretien</span><b>${x.date_entretien ? Fmt.date(x.date_entretien) : '—'}</b></div>
            <div class="panier-total"><span>Expérience</span><b>${Fmt.nombre(x.experience_annees)} an(s)</b></div>
            <div class="panier-total"><span>Formation</span><b>${Fmt.echapper(x.formation || '—')}</b></div>
            <div class="panier-total"><span>Salaire proposé</span><b>${x.salaire_propose ? Fmt.fcfa(x.salaire_propose) : '—'}</b></div>
            <div class="panier-total"><span>Boutique</span><b>${Fmt.echapper(x.magasin || '—')}</b></div>
          </div>
          ${x.motif ? `<div class="aide" style="margin-top:10px"><b>Motif :</b> ${Fmt.echapper(x.motif)}</div>` : ''}
          ${x.notes ? `<div class="aide" style="margin-top:6px"><b>Notes :</b> ${Fmt.echapper(x.notes)}</div>` : ''}
          ${x.employe_nom ? `<div class="bandeau ok" style="margin-top:12px">
              <b>✅ Embauché — fiche du personnel ${Fmt.echapper(x.employe_code)}</b>
              <div style="margin-top:4px">${Fmt.echapper(x.employe_nom)}</div></div>` : ''}`,
        pied: `${peutGerer ? '<button class="btn" data-modifier>✏️ Modifier</button>' : ''}
               ${peutGerer && !x.employe_id && x.statut !== 'refuse'
                 ? '<button class="btn primaire" data-embaucher>✅ Embaucher</button>' : ''}
               <button class="btn" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          const bMod = mod.querySelector('[data-modifier]');
          if (bMod) bMod.onclick = () => { fermer(); formulaireCandidat(x); };
          const bEmb = mod.querySelector('[data-embaucher]');
          if (bEmb) bEmb.onclick = () => { fermer(); embaucher(x); };
        },
      });
    }

    /** Embauche : crée la fiche du personnel à partir de la candidature. */
    function embaucher(c) {
      if (!c) return;
      ouvrirModale({
        titre: 'Embaucher — ' + c.nom,
        contenu: `
          <div class="aide" style="margin-bottom:12px">
            La fiche du personnel est créée avec les informations de la candidature.
            Vous pourrez compléter son dossier et téléverser ses pièces ensuite.
          </div>
          <div class="grille-form">
            <div class="champ plein"><label>Nom complet *</label>
              <input name="nom" value="${Fmt.echapper(c.nom || '')}" required></div>
            <div class="champ"><label>Poste</label><input name="poste" value="${Fmt.echapper(c.poste_vise || '')}"></div>
            <div class="champ"><label>Boutique</label><select name="magasin_id"><option value="">—</option>
              ${options(App.etat.magasins, 'id', (m) => m.nom, c.magasin_id)}</select></div>
            <div class="champ"><label>Date d'embauche</label>
              <input type="date" name="date_embauche" value="${Fmt.iso()}"></div>
            <div class="champ"><label>Type de contrat</label><select name="type_contrat">
              <option value="CDI">CDI</option><option value="CDD">CDD</option>
              <option value="Stage">Stage</option><option value="Journalier">Journalier</option></select></div>
            <div class="champ"><label>Salaire mensuel</label>
              <input type="number" min="0" step="1000" name="salaire" value="${c.salaire_propose || 0}"></div>
            <div class="champ"><label>N° CNI</label><input name="numero_cni" value=""></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(c.telephone || '')}"></div>
            <div class="champ"><label>Email</label><input type="email" name="email" value="${Fmt.echapper(c.email || '')}"></div>
            <div class="champ plein"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
          </div>
          <div id="e-erreur"></div>`,
        pied: `<button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-confirmer>✅ Confirmer l'embauche</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          mod.querySelector('[data-confirmer]').onclick = async () => {
            const f = lireFormulaire(mod);
            try {
              const r = await Api.post('/rh/candidats/' + c.id + '/embaucher', f);
              notifier('Embauche enregistrée — fiche ' + r.employe.code);
              fermer();
              onglet = 'dossiers'; peindreOnglets(); chargerDossiers();
            } catch (e) {
              mod.querySelector('#e-erreur').innerHTML =
                `<div class="bandeau erreur" style="margin-top:10px">${Fmt.echapper(e.message)}</div>`;
            }
          };
        },
      });
    }

    /* ==================================================================== */
    /* Onglet 2 — Dossiers du personnel et documents PDF                    */
    /* ==================================================================== */
    async function chargerDossiers() {
      if (!peutEmployes) {
        corps().innerHTML = '<div class="vide">Votre rôle ne permet pas de consulter le fichier du personnel.</div>';
        return;
      }
      corps().innerHTML = '<div class="vide">Chargement…</div>';
      const r = await Api.get('/rh/employes', Object.assign({ avec_sortis: '1' }, filtreDossier));
      if (!document.body.contains(zone)) return;
      const liste = r.employes || [];

      corps().innerHTML = `
        <div class="grille g-kpi" style="margin-bottom:16px">
          <div class="kpi"><div class="libelle">Dossiers</div><div class="valeur">${Fmt.nombre(liste.length)}</div>
            <div class="pied">${Fmt.nombre(r.nb_actifs)} actif(s)</div></div>
          <div class="kpi bleu"><div class="libelle">Masse salariale</div>
            <div class="valeur">${Fmt.fcfaCourt(r.masse_salariale)}</div><div class="pied">Employés actifs</div></div>
          <div class="kpi ${r.nb_dossiers_incomplets ? 'ambre' : 'vert'}"><div class="libelle">Dossiers sans CNI</div>
            <div class="valeur">${Fmt.nombre(r.nb_dossiers_incomplets)}</div><div class="pied">À compléter</div></div>
          <div class="kpi"><div class="libelle">Sorties</div>
            <div class="valeur">${Fmt.nombre(liste.filter((e) => e.statut_dossier === 'sorti').length)}</div>
            <div class="pied">Fiches conservées</div></div>
        </div>

        <div class="filtres">
          <div class="recherche"><input id="d-q" placeholder="Rechercher (nom, poste, CNI, téléphone)…"
            value="${Fmt.echapper(filtreDossier.q)}"></div>
          ${App.global() ? `<div class="champ"><label>Boutique</label><select id="d-magasin">
            <option value="">Toutes</option>${options(App.etat.magasins, 'id', (m) => m.nom, filtreDossier.magasin_id)}</select></div>` : ''}
          <button class="btn primaire" id="d-filtrer">Appliquer</button>
        </div>

        <div class="serre">${tableau([
          { titre: 'Employé', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b>
              <div class="petit texte-muted mono">${Fmt.echapper(l.code || '')}</div>` },
          { titre: 'Poste', rendre: (l) => `${Fmt.echapper(l.poste || '—')}
              <div class="petit texte-muted">${Fmt.echapper(l.magasin || '')}</div>` },
          { titre: 'CNI', rendre: (l) => l.numero_cni
              ? `<span class="mono">${Fmt.echapper(l.numero_cni)}</span>`
              : '<span class="badge ambre">manquante</span>' },
          { titre: 'Embauche', rendre: (l) => Fmt.date(l.date_embauche) },
          { titre: 'Contrat', rendre: (l) => `<span class="badge ${l.type_contrat === 'CDI' ? 'ok' : 'neutre'}">${Fmt.echapper(l.type_contrat || '—')}</span>` },
          { titre: 'Documents', num: true, rendre: (l) => l.nb_documents
              ? `<span class="badge ok">${Fmt.nombre(l.nb_documents)}</span>`
              : '<span class="badge">aucun</span>' },
          { titre: 'État', rendre: (l) => l.statut_dossier === 'sorti'
              ? `<span class="badge erreur">Sorti</span><div class="petit texte-muted">${Fmt.date(l.date_sortie)}</div>`
              : (l.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>') },
          { titre: '', rendre: (l) => `<div class="actions">
              <button class="btn petit" data-dossier="${l.id}">🗂 Dossier & documents</button></div>` },
        ], liste, { vide: 'Aucun dossier' })}</div>`;

      document.getElementById('d-filtrer').onclick = () => {
        filtreDossier.q = document.getElementById('d-q').value.trim();
        const m = document.getElementById('d-magasin');
        if (m) filtreDossier.magasin_id = m.value;
        chargerDossiers();
      };
      document.getElementById('d-q').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('d-filtrer').click();
      };
      zone.querySelectorAll('[data-dossier]').forEach((b) => b.onclick = () =>
        dossierEmploye(Number(b.dataset.dossier)));
      zone.querySelectorAll('[data-renvoyer]').forEach((b) => b.onclick = async () => {
        const e = liste.find((x) => x.id === Number(b.dataset.renvoyer));
        const motif = prompt(`Motif du renvoi de ${e ? e.nom : ''} (laisser vide si aucun) :`, '') || '';
        if (!(await confirmer('Renvoyer cet employé ? Il sera archivé (ses documents restent téléchargeables).',
          { valider: 'Renvoyer / archiver' }))) return;
        try {
          await Api.post('/rh/employes/' + b.dataset.renvoyer + '/renvoyer', { motif: motif || null });
          notifier('Employé renvoyé et archivé'); chargerDossiers();
        } catch (err) { notifier(err.message, 'erreur'); }
      });
    }

    /* ---------- Pièces PDF d'une candidature (téléversement + téléchargement) ---------- */
    async function piecesCandidat(id) {
      const r = await Api.get('/rh/candidats/' + id + '/documents');
      const docs = r.documents || [];
      ouvrirModale({
        titre: '📎 Documents de candidature',
        largeur: 'large',
        contenu: `
          ${peutGerer ? `
          <div class="champ" style="margin-bottom:12px">
            <label>Téléverser un document PDF (CV, lettre, diplôme…)</label>
            <div class="barre-outils">
              <select id="pc-categorie">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${Fmt.echapper(v)}</option>`).join('')}</select>
              <input type="file" id="pc-fichier" accept="application/pdf,.pdf">
              <button class="btn primaire" id="pc-envoyer">📤 Téléverser</button>
            </div>
            <div class="aide" id="pc-message"></div>
          </div>` : ''}
          ${docs.length ? tableau([
            { titre: 'Pièce', rendre: (l) => `<b>${Fmt.echapper(CATEGORIES[l.categorie] || l.categorie)}</b>
                <div class="petit texte-muted">${Fmt.echapper(l.nom_original)} · ${Fmt.nombre(Math.round(l.taille / 1024))} Ko</div>` },
            { titre: 'Ajouté le', rendre: (l) => Fmt.dateH(l.created_at) },
            { titre: '', rendre: (l) => `<a class="btn petit" href="/api/rh/documents-candidat/${l.id}"
                data-token-doccand="${l.id}" data-nom-doc="${Fmt.echapper(l.nom_original)}">⬇ Télécharger</a>` },
          ], docs, { vide: 'Aucun document' }) : '<div class="vide">Aucun document téléversé pour cette candidature.</div>'}`,
        surOuverture(mod) {
          mod.querySelectorAll('[data-token-doccand]').forEach((a) => a.onclick = async (ev) => {
            ev.preventDefault();
            try { await Api.telecharger('/rh/documents-candidat/' + a.dataset.tokenDoccand, a.dataset.nomDoc); notifier('Document téléchargé'); }
            catch (err) { notifier(err.message, 'erreur'); }
          });
          const bouton = mod.querySelector('#pc-envoyer');
          if (!bouton) return;
          bouton.onclick = async () => {
            const fichier = mod.querySelector('#pc-fichier').files[0];
            if (!fichier) return notifier('Choisissez un fichier PDF', 'erreur');
            try {
              const contenu = await lireFichierBase64(fichier);
              await Api.post('/rh/candidats/' + id + '/documents', {
                categorie: mod.querySelector('#pc-categorie').value,
                nom: fichier.name, contenu,
              });
              notifier('Document de candidature enregistré');
              piecesCandidat(id);
            } catch (err) { notifier(err.message, 'erreur'); }
          };
        },
      });
    }

    /* ---------- Archives : employés renvoyés / sortis, documents téléchargeables ---------- */
    async function chargerArchives() {
      corps().innerHTML = '<div class="vide">Chargement des archives…</div>';
      const r = await Api.get('/rh/employes', Object.assign({ avec_sortis: '1' }, { q: '', magasin_id: '' }));
      const sortis = (r.employes || []).filter((e) => e.statut_dossier === 'sorti');
      corps().innerHTML = `<div class="aide" style="margin-bottom:10px">Les employés renvoyés sont conservés ici :
        leur dossier et leurs documents restent consultables et téléchargeables, puis peuvent être supprimés définitivement.</div>
        ${sortis.length ? tableau([
          { titre: 'Employé', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted mono">${Fmt.echapper(l.code)}</div>` },
          { titre: 'Poste', rendre: (l) => Fmt.echapper(l.poste || '—') },
          { titre: 'Sorti le', rendre: (l) => Fmt.date(l.date_sortie) },
          { titre: 'Motif', rendre: (l) => Fmt.echapper(l.motif_sortie || '—') },
          { titre: 'Documents', num: true, rendre: (l) => Fmt.nombre(l.nb_documents) },
          { titre: '', rendre: (l) => `<div class="actions">
              <button class="btn petit" data-dossier-arch="${l.id}">🗂 Dossier</button>
              ${peutGerer ? `<button class="btn petit danger" data-purger="${l.id}">🗑 Supprimer définitivement</button>` : ''}</div>` },
        ], sortis, { vide: 'Aucun employé archivé' }) : '<div class="vide">Aucun employé archivé pour le moment.</div>'}`;

      zone.querySelectorAll('[data-dossier-arch]').forEach((b) => b.onclick = () =>
        dossierEmploye(Number(b.dataset.dossierArch)));
      zone.querySelectorAll('[data-purger]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Supprimer définitivement cette fiche archivée et tous ses documents ?',
          { valider: 'Supprimer définitivement' }))) return;
        try { await Api.del('/rh/employes/' + b.dataset.purger); notifier('Fiche supprimée des archives'); chargerArchives(); }
        catch (err) { notifier(err.message, 'erreur'); }
      });
    }

    /** Dossier complet : informations, salaires et documents téléchargeables. */
    async function dossierEmploye(id) {
      const d = await Api.get('/rh/employes/' + id);
      const e = d.employe;
      const docs = d.documents || [];
      const salaires = d.salaires || [];
      const piecesManquantes = (d.dossier || {}).pieces_manquantes || [];

      ouvrirModale({
        titre: 'Dossier — ' + e.nom,
        largeur: 'large',
        contenu: `
          <div class="onglets" style="margin-bottom:12px">
            <button class="btn petit primaire" data-fiche>👤 Informations</button>
            <button class="btn petit" data-pieces>📎 Documents (${docs.length})</button>
            <button class="btn petit" data-paie>💵 Salaires (${salaires.length})</button>
          </div>
          <div id="d-contenu"></div>`,
        pied: `${App.peut('employes.gerer') ? '<button class="btn" data-modifier>✏️ Modifier la fiche</button>' : ''}
               <button class="btn" data-fermer>Fermer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          const conteneur = mod.querySelector('#d-contenu');

          const ligne = (k, v) => `<div class="panier-total"><span>${k}</span><b>${v || '—'}</b></div>`;

          const fiche = () => `
            <div class="bloc-paiement">
              ${ligne('Code', Fmt.echapper(e.code || ''))}
              ${ligne('Civilité', Fmt.echapper(e.civilite || ''))}
              ${ligne('Nom complet', Fmt.echapper(e.nom))}
              ${ligne('Poste', Fmt.echapper(e.poste || ''))}
              ${ligne('Boutique', Fmt.echapper(e.magasin || ''))}
              ${ligne('Téléphone', Fmt.echapper(e.telephone || ''))}
              ${ligne('Email', Fmt.echapper(e.email || ''))}
              ${ligne('Date de naissance', Fmt.date(e.date_naissance))}
              ${ligne('Lieu de naissance', Fmt.echapper(e.lieu_naissance || ''))}
              ${ligne('Situation matrimoniale', Fmt.echapper(e.situation_matrimoniale || ''))}
              ${ligne('Adresse', Fmt.echapper(e.adresse || ''))}
              ${ligne('Ville', Fmt.echapper(e.ville || ''))}
              ${ligne('N° CNI', Fmt.echapper(e.numero_cni || ''))}
              ${ligne('N° CNPS', Fmt.echapper(e.numero_cnps || ''))}
              ${ligne('N° IFU', Fmt.echapper(e.numero_ifu || ''))}
              ${ligne('Contact d’urgence', Fmt.echapper((e.contact_urgence_nom || '') + (e.contact_urgence_tel ? ' · ' + e.contact_urgence_tel : '')))}
              ${ligne('Formation', Fmt.echapper(e.formation || ''))}
              ${ligne('Date d’embauche', Fmt.date(e.date_embauche))}
              ${ligne('Fin de contrat', Fmt.date(e.date_fin_contrat))}
              ${ligne('Type de contrat', Fmt.echapper(e.type_contrat || ''))}
              ${ligne('Salaire mensuel', Fmt.fcfa(e.salaire))}
              ${ligne('Statut', e.statut_dossier === 'sorti'
                ? 'Sorti le ' + Fmt.date(e.date_sortie) : (e.actif ? 'Actif' : 'Inactif'))}
            </div>
            ${e.motif_sortie ? `<div class="aide" style="margin-top:10px"><b>Motif de sortie :</b> ${Fmt.echapper(e.motif_sortie)}</div>` : ''}
            ${e.notes ? `<div class="aide" style="margin-top:6px"><b>Notes :</b> ${Fmt.echapper(e.notes)}</div>` : ''}
            ${piecesManquantes.length ? `<div class="bandeau ambre" style="margin-top:12px">
                <b>Pièces manquantes :</b> ${piecesManquantes.map(Fmt.echapper).join(', ')}</div>` : ''}`;

          const pieces = () => `
            ${peutGerer ? `
            <div class="champ" style="margin-bottom:12px">
              <label>Téléverser un document (PDF — 10 Mo maximum)</label>
              <div class="barre-outils">
                <select id="doc-categorie">
                  ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${Fmt.echapper(v)}</option>`).join('')}
                </select>
                <input type="file" id="doc-fichier" accept="application/pdf,.pdf">
                <button class="btn primaire" id="doc-envoyer">📤 Téléverser</button>
              </div>
              <div class="aide" id="doc-message"></div>
            </div>` : ''}
            ${docs.length ? tableau([
              { titre: 'Pièce', rendre: (l) => `<b>${Fmt.echapper(CATEGORIES[l.categorie] || l.categorie)}</b>
                  <div class="petit texte-muted">${Fmt.echapper(l.nom_original)}</div>` },
              { titre: 'Date du document', rendre: (l) => Fmt.date(l.date_document) },
              { titre: 'Taille', num: true, rendre: (l) => Fmt.nombre(l.taille / 1024) + ' Ko' },
              { titre: 'Téléversé', rendre: (l) => `<span class="petit texte-muted">${Fmt.dateH(l.created_at)}</span>
                  <div class="petit texte-muted">${Fmt.echapper(l.televerse_par_nom || '')}</div>` },
              { titre: '', rendre: (l) => `<div class="actions">
                  <a class="btn petit" href="/api/rh/documents/${l.id}" data-token-doc="${l.id}"
                     data-nom-doc="${Fmt.echapper(l.nom_original)}">⬇️ Télécharger</a>
                  ${peutGerer ? `<button class="btn petit danger" data-suppr-doc="${l.id}">🗑</button>` : ''}</div>` },
            ], docs) : '<div class="vide">Aucun document téléversé pour cet employé</div>'}`;

          const paie = () => salaires.length ? tableau([
            { titre: 'Période', rendre: (l) => `<b class="mono">${Fmt.echapper(l.periode)}</b>` },
            { titre: 'Base', num: true, rendre: (l) => Fmt.fcfa(l.montant) },
            { titre: 'Primes', num: true, rendre: (l) => l.primes ? Fmt.fcfa(l.primes) : '—' },
            { titre: 'Retenues', num: true, rendre: (l) => l.retenues ? Fmt.fcfa(l.retenues) : '—' },
            { titre: 'Net', num: true, rendre: (l) => `<b>${Fmt.fcfa(l.net)}</b>` },
            { titre: 'État', rendre: (l) => l.statut === 'paye'
                ? `<span class="badge ok">Payé</span><div class="petit texte-muted">${Fmt.date(l.date_paiement)}</div>`
                : '<span class="badge ambre">À payer</span>' },
          ], salaires) : '<div class="vide">Aucun versement enregistré</div>';

          const montrer = (quoi, actif) => {
            conteneur.innerHTML = quoi === 'pieces' ? pieces() : quoi === 'paie' ? paie() : fiche();
            mod.querySelectorAll('[data-fiche],[data-pieces],[data-paie]').forEach((b) => {
              const nom = b.hasAttribute('data-fiche') ? 'fiche' : b.hasAttribute('data-pieces') ? 'pieces' : 'paie';
              b.classList.toggle('primaire', nom === actif);
            });
            if (quoi === 'pieces') brancherTeleversement();
          };

          /* Téléchargement : l'API exige le jeton, on passe par fetch + blob. */
          function brancherTeleversement() {
            conteneur.querySelectorAll('[data-token-doc]').forEach((a) => {
              a.onclick = async (ev) => {
                ev.preventDefault();
                try {
                  /* Api.telecharger envoie le jeton et déclenche le téléchargement. */
                  await Api.telecharger('/rh/documents/' + a.dataset.tokenDoc, a.dataset.nomDoc);
                  notifier('Document téléchargé');
                } catch (err) { notifier(err.message, 'erreur'); }
              };
            });
            conteneur.querySelectorAll('[data-suppr-doc]').forEach((b) => b.onclick = async () => {
              if (!(await confirmer('Supprimer ce document ?', { danger: true, valider: 'Supprimer' }))) return;
              try {
                await Api.del('/rh/documents/' + b.dataset.supprDoc);
                notifier('Document supprimé');
                fermer(); dossierEmploye(id); chargerDossiers();
              } catch (err) { notifier(err.message, 'erreur'); }
            });
            const bouton = conteneur.querySelector('#doc-envoyer');
            if (bouton) bouton.onclick = async () => {
              const input = conteneur.querySelector('#doc-fichier');
              const msg = conteneur.querySelector('#doc-message');
              const fichier = input.files[0];
              if (!fichier) { msg.textContent = 'Choisissez d’abord un fichier PDF.'; return; }
              if (!/\.pdf$/i.test(fichier.name)) { msg.textContent = 'Seuls les fichiers PDF sont acceptés.'; return; }
              bouton.disabled = true;
              msg.textContent = 'Téléversement en cours…';
              try {
                const contenu = await lireFichierBase64(fichier);
                await Api.post('/rh/employes/' + id + '/documents', {
                  categorie: conteneur.querySelector('#doc-categorie').value,
                  nom: fichier.name, type: fichier.type, contenu,
                });
                notifier('Document ajouté');
                fermer(); dossierEmploye(id); chargerDossiers();
              } catch (err) {
                msg.textContent = err.message;
                bouton.disabled = false;
              }
            };
          }

          mod.querySelector('[data-fiche]').onclick = () => montrer('fiche', 'fiche');
          mod.querySelector('[data-pieces]').onclick = () => montrer('pieces', 'pieces');
          mod.querySelector('[data-paie]').onclick = () => montrer('paie', 'paie');
          const bMod = mod.querySelector('[data-modifier]');
          if (bMod) bMod.onclick = () => { fermer(); App.monter('employes', id); };

          montrer('fiche', 'fiche');
        },
      });
    }

    /** Lecture d'un fichier en data URL base64 (pour l'envoi en JSON). */
    function lireFichierBase64(fichier) {
      return new Promise((resoudre, rejeter) => {
        const lecteur = new FileReader();
        lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible'));
        lecteur.onload = () => resoudre(String(lecteur.result));
        lecteur.readAsDataURL(fichier);
      });
    }

    /* Chargement des catégories de documents puis affichage de l'onglet actif. */
    zone.querySelectorAll('[data-onglet]').forEach((b) => b.onclick = () => {
      onglet = b.dataset.onglet; peindreOnglets();
      if (onglet === 'candidats') chargerCandidats();
      else if (onglet === 'archives') chargerArchives();
      else chargerDossiers();
    });
    peindreOnglets();

    try {
      const cat = await Api.get('/rh/documents-categories');
      CATEGORIES = cat.categories || {};
    } catch (e) {
      CATEGORIES = { cni: 'CNI', diplome: 'Diplôme', cv: 'CV', contrat: 'Contrat', autre: 'Autre' };
    }
    chargerCandidats();
    App.suivre({ vue: 'recrutement', types: ['compte', 'tiers'], rafraichir: () =>
      (onglet === 'candidats' ? chargerCandidats()
        : onglet === 'archives' ? chargerArchives() : chargerDossiers()) });
  },
});
