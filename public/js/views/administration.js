/* ==========================================================================
   Vues : Magasins, Utilisateurs, Paramètres de l'entreprise
   ========================================================================== */
/* Boutique fraîchement créée : on propose aussitôt d'y affecter son caissier(ère). */
let boutiqueEnAttenteDEquipe = null;
App.enregistrerVue('magasins', {
  titre: 'Magasins', icone: '🏬', permissions: ['magasins.consulter', 'magasins.gerer'], groupe: 'Administration',
  async rendre(zone) {
    const peutGererMagasins = App.peut('magasins.gerer');

    async function charger() {
      const [magasins, apercu] = await Promise.all([
        Api.get('/magasins'),
        Api.get('/magasins/apercu').catch(() => ({ points: [] })),
      ]);
      const met = Object.fromEntries((apercu.points || []).map((x) => [x.id, x]));
      magasins.forEach((m) => { if (met[m.id]) Object.assign(m, met[m.id]); });
      if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
      zone.innerHTML = `
        <div class="carte">
          <div class="carte-entete">
            <h3>Réseau de magasins</h3>
            <div class="droite">
              ${peutGererMagasins ? '<button class="btn primaire" id="m-nouveau">＋ Nouvelle boutique</button>' : '<span class="petit texte-muted">Votre rôle permet la consultation uniquement</span>'}
            </div>
          </div>
          <div class="carte-corps">
            <div class="grille g-3">
              ${magasins.map((m) => `
                <div class="carte" style="margin:0">
                  <div class="carte-entete">
                    <h3>🏬 ${Fmt.echapper(m.nom)}</h3>
                    <div class="droite">${m.type === 'magasin' ? '<span class="badge neutre">🏭 Magasin (stock)</span>' : '<span class="badge attente">🛍️ Boutique (ventes)</span>'}
                      ${m.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge ko">Fermé</span>'}</div>
                  </div>
                  <div class="carte-corps">
                    <div class="petit texte-muted mono">${Fmt.echapper(m.code)}</div>
                    <div style="margin:8px 0">📍 ${Fmt.echapper(m.adresse || '—')}<br>
                      🏙️ ${Fmt.echapper(m.ville || '—')}<br>
                      ☎️ ${Fmt.echapper(m.telephone || '—')}<br>
                      👤 ${Fmt.echapper(m.responsable || '—')}</div>
                    <div class="panier-total"><span>CA du jour</span><b>${Fmt.fcfa(m.ca_jour)}</b></div>
                    <div class="panier-total"><span>CA du mois</span><b>${Fmt.fcfa(m.ca_mois)}</b></div>
                    <div class="panier-total"><span>Valeur du stock</span><b>${Fmt.fcfa(m.valeur_stock)}</b></div>
                    ${m.type === 'magasin'
                      ? `<div class="panier-total"><span>Entrées du jour</span><b>${Fmt.nombre(m.entrees_jour || 0)}</b></div>
                         <div class="panier-total"><span>Sorties du jour</span><b>${Fmt.nombre(m.sorties_jour || 0)}</b></div>`
                      : `<div class="panier-total"><span>Ventes aujourd'hui</span><b>${Fmt.nombre(m.ventes_jour)}</b></div>`}
                    ${peutGererMagasins ? `<div class="barre-outils" style="margin-top:12px">
                      <button class="btn petit" data-modif="${m.id}">✏️ Modifier</button>
                      <button class="btn petit danger" data-suppr="${m.id}">${m.actif ? 'Fermer' : 'Supprimer'}</button>
                    </div>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>`;

      if (!document.body.contains(zone)) return;   // la vue a été remplacée entre-temps
      zone.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(magasins.find((m) => m.id === Number(b.dataset.modif))));
      zone.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        const m = magasins.find((x) => x.id === Number(b.dataset.suppr));
        if (!(await confirmer(`Supprimer / fermer le magasin « ${m.nom} » ? S'il possède des ventes, il sera simplement désactivé.`, { danger: true, valider: 'Confirmer' }))) return;
        try {
          const r = await Api.del('/magasins/' + m.id);
          notifier(r.desactive ? r.message : 'Magasin supprimé');
          charger();
          App.chargerContexte().then(() => App.rendreCoquille());
        } catch (e) { notifier(e.message, 'erreur'); }
      });

      const bNouveauMagasin = peutGererMagasins ? zone.querySelector('#m-nouveau') : null;
      if (bNouveauMagasin) bNouveauMagasin.onclick = () => formulaire(null);
    }

    async function formulaire(m0) {
      const m = m0 || { actif: 1, type: 'boutique', code: 'MG-' + String(100 + Math.floor(Math.random() * 899)) };
      const produits = await Api.get('/produits', { actif: 1 });
      let dotation = [];
      const renduDotation = () => dotation.map((l, i) => {
        const pr = produits.find((x) => x.id === l.produit_id);
        return `<div class="panier-total"><span>${Fmt.echapper(pr ? pr.nom : '?')} × ${Fmt.nombre(l.quantite)}</span>
          <button class="btn petit danger" data-dot-suppr="${i}">🗑</button></div>`;
      }).join('') || '<div class="petit texte-muted">Aucune dotation : le point de vente partira avec un stock vide.</div>';
      ouvrirModale({
        titre: m0 ? 'Modifier le magasin' : 'Nouveau magasin',
        contenu: `
          <div class="grille-form">
            <div class="champ"><label>Code *</label><input name="code" value="${Fmt.echapper(m.code || '')}"></div>
            <div class="champ"><label>Nom du magasin *</label><input name="nom" value="${Fmt.echapper(m.nom || '')}"></div>
            <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(m.ville || '')}"></div>
            <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(m.telephone || '')}"></div>
            <div class="champ plein"><label>Adresse</label><input name="adresse" value="${Fmt.echapper(m.adresse || '')}"></div>
            <div class="champ"><label>Responsable</label><input name="responsable" value="${Fmt.echapper(m.responsable || '')}"></div>
            <div class="champ"><label>Type de point de vente</label>
              <select name="type">
                <option value="boutique" ${(m.type || 'boutique') === 'boutique' ? 'selected' : ''}>🛍️ Boutique (stock + ventes)</option>
                <option value="magasin" ${m.type === 'magasin' ? 'selected' : ''}>🏭 Magasin (stock seul)</option>
              </select></div>
            <div class="champ"><label><input type="checkbox" name="actif" ${m.actif ? 'checked' : ''} style="width:auto;margin-right:6px">Point de vente ouvert</label></div>
          </div>
          ${!m0 ? `<div class="champ plein"><label>Dotation initiale de stock (transfert)</label>
            <div class="grille g-3" style="margin-top:4px">
              <select id="dot-produit">${options(produits, 'id', (x) => x.nom, '')}</select>
              <input type="number" min="1" step="1" id="dot-qte" value="10">
              <button class="btn" id="dot-ajouter" type="button">＋ Ajouter</button>
            </div>
            <div id="dot-liste" style="margin-top:8px">${''}</div>
          </div>` : ''}`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          const liste = mod.querySelector('#dot-liste');
          const majListe = () => { if (liste) liste.innerHTML = renduDotation();
            if (liste) liste.querySelectorAll('[data-dot-suppr]').forEach((b) => b.onclick = () => {
              dotation.splice(Number(b.dataset.dotSuppr), 1); majListe(); }); };
          const bDot = mod.querySelector('#dot-ajouter');
          if (bDot) bDot.onclick = () => {
            const pid = Number(mod.querySelector('#dot-produit').value);
            const q = Number(mod.querySelector('#dot-qte').value) || 0;
            if (!pid || q <= 0) return notifier('Choisissez un produit et une quantité', 'erreur');
            const ex = dotation.find((l) => l.produit_id === pid);
            if (ex) ex.quantite += q; else dotation.push({ produit_id: pid, quantite: q });
            majListe();
          };
          majListe();
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.code || !d.nom) return notifier('Code et nom obligatoires', 'erreur');
            try {
              if (m0) await Api.put('/magasins/' + m0.id, d); else await Api.post('/magasins', { ...d, stock: dotation });
              notifier(m0 ? 'Magasin mis à jour' : 'Magasin créé'); fermer(); charger();
              App.chargerContexte().then(() => App.rendreCoquille());
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }
    charger();
  },
});

App.enregistrerVue('utilisateurs', {
  titre: 'Comptes & rôles', icone: '🔐',
  permissions: ['utilisateurs.gerer', 'utilisateurs.gerer_boutique'],
  groupe: 'Administration',

  async rendre(zone) {
    const infos = await Api.get('/roles-attribuables');
    const droits = infos.droits;
    const monMagasin = infos.mon_magasin;
    let catalogue = null;      // catalogue des permissions (chargé à la demande)
    async function charger() {
      const users = await Api.get('/utilisateurs');
      if (!document.body.contains(zone)) return;   // la vue a été remplacée entre-temps
      const parBoutique = {};
      users.forEach((u) => {
        const cle = u.magasin || 'Toutes les boutiques (réseau)';
        (parBoutique[cle] = parBoutique[cle] || []).push(u);
      });

      zone.innerHTML = `
        <div class="carte">
          <div class="carte-entete">
            <h3>👥 Comptes utilisateurs${monMagasin ? ' — ' + Fmt.echapper(monMagasin.nom) : ' — tout le réseau'}</h3>
            <div class="droite">
              ${App.peut('magasins.gerer') ? '<button class="btn" id="u-boutique">🏬 Nouvelle boutique</button>' : ''}
              ${droits.roles ? '<button class="btn" id="u-roles">🧩 Gérer les rôles</button>' : ''}
              <button class="btn primaire" id="u-nouveau">＋ Nouveau compte</button>
            </div>
          </div>
          <div class="carte-corps">
            ${droits.tous ? '' : `<div class="carte" style="box-shadow:none;border-color:#cfe9e7;background:#f7fdfd;margin:0 0 14px">
              <div class="carte-corps petit">
                <b>Responsable de boutique :</b> vous créez les comptes de <b>${Fmt.echapper(monMagasin ? monMagasin.nom : 'votre boutique')}</b> uniquement,
                avec les rôles autorisés : ${infos.roles.filter((r) => r.attribuable_boutique).map((r) => Fmt.echapper(r.nom)).join(', ')}.
              </div></div>`}
            <div class="grille g-kpi" style="margin-bottom:8px">
              <div class="kpi"><div class="libelle">Comptes</div><div class="valeur">${Fmt.nombre(users.length)}</div>
                <div class="pied">${users.filter((u) => u.actif).length} actif(s)</div></div>
              <div class="kpi bleu"><div class="libelle">Boutiques couvertes</div>
                <div class="valeur">${Fmt.nombre(Object.keys(parBoutique).length)}</div><div class="pied">Ayant au moins un compte</div></div>
              <div class="kpi ambre"><div class="libelle">Rôles disponibles</div>
                <div class="valeur">${Fmt.nombre(infos.roles.length)}</div><div class="pied">dont ${infos.roles.filter((r) => r.attribuable_boutique).length} de boutique</div></div>
            </div>
          </div>
        </div>

        ${Object.entries(parBoutique).map(([boutique, liste]) => `
          <div class="carte">
            <div class="carte-entete">
              <h3>🏬 ${Fmt.echapper(boutique)}</h3>
              <div class="droite petit texte-muted">${liste.length} compte(s)</div>
            </div>
            <div class="carte-corps serre">
              ${tableau([
                { titre: 'Nom', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b><div class="petit texte-muted">${Fmt.echapper(l.email)}</div>` },
                { titre: 'Rôle', rendre: (l) => `<span class="badge ${l.portee === 'reseau' ? 'info' : 'neutre'}">${Fmt.echapper(l.libelle_role)}</span>
                    <div class="petit texte-muted">${l.portee === 'reseau' ? 'portée réseau' : 'portée boutique'}</div>` },
                { titre: 'Habilitations', rendre: (l) => {
                    const h = l.habilitations || {};
                    const ecarts = (h.accordees || []).length + (h.retirees || []).length;
                    return `<b>${Fmt.nombre(h.nb_effectives || 0)}</b> permission(s)
                      ${ecarts ? `<div class="petit texte-muted">${(h.accordees || []).length ? '+' + h.accordees.length : ''}${(h.accordees || []).length && (h.retirees || []).length ? ' · ' : ''}${(h.retirees || []).length ? '−' + h.retirees.length : ''} sur mesure</div>`
                        : '<div class="petit texte-muted">rôle uniquement</div>'}`;
                  } },
                { titre: 'Créé par', rendre: (l) => Fmt.echapper(l.createur || '—') },
                { titre: 'Dernière connexion', rendre: (l) => Fmt.dateH(l.dernier_login) },
                { titre: 'État', rendre: (l) => l.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge ko">Désactivé</span>' },
                { titre: '', rendre: (l) => l.modifiable ? `<div class="actions">
                    <button class="btn petit" data-modif="${l.id}">Modifier</button>
                    ${l.id !== App.etat.utilisateur.id ? `<button class="btn petit danger" data-suppr="${l.id}">Suppr.</button>` : ''}
                  </div>` : '<span class="petit texte-muted">—</span>' },
              ], liste, { vide: 'Aucun compte' })}
            </div>
          </div>`).join('')}

        <div class="carte">
          <div class="carte-entete"><h3>🔑 Rôles et permissions</h3>
            <div class="droite petit texte-muted">${droits.roles ? 'Vous pouvez créer des rôles personnalisés' : 'Rôles attribuables par un responsable de boutique'}</div></div>
          <div class="carte-corps">
            <div class="grille g-2">
              ${infos.roles.map((r) => `
                <div style="border:1px solid var(--line);border-radius:10px;padding:12px 14px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <b>${Fmt.echapper(r.nom)}</b>
                    <span class="badge ${r.portee === 'reseau' ? 'info' : 'neutre'}">${r.portee === 'reseau' ? 'réseau' : 'boutique'}</span>
                    ${r.attribuable_boutique ? '<span class="badge attente">créable en boutique</span>' : ''}
                    ${r.systeme ? '' : '<span class="badge ok">personnalisé</span>'}
                  </div>
                  <div class="petit texte-muted" style="margin-top:5px">${Fmt.echapper(r.description || '')}</div>
                  <div class="petit mono texte-muted" style="margin-top:6px">${r.code}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>`;

      zone.querySelectorAll('[data-modif]').forEach((b) => b.onclick = () => formulaire(users.find((u) => u.id === Number(b.dataset.modif))));
      zone.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.suppr));
        if (!(await confirmer(`Supprimer le compte de ${u.nom} ?`, { danger: true, valider: 'Supprimer' }))) return;
        try { await Api.del('/utilisateurs/' + u.id); notifier('Compte supprimé'); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });
      const bNouveauCompte = zone.querySelector('#u-nouveau');
      if (bNouveauCompte) bNouveauCompte.onclick = () => formulaire(null);
      const bBoutique = zone.querySelector('#u-boutique');
      if (bBoutique) bBoutique.onclick = () => formulaireBoutique();

      // Une boutique vient d'être créée : on ouvre directement la fiche de son caissier.
      if (boutiqueEnAttenteDEquipe) {
        const id = boutiqueEnAttenteDEquipe;
        boutiqueEnAttenteDEquipe = null;
        formulaire(null, { magasinDefaut: id });
      }
      const bRoles = zone.querySelector('#u-roles');
      if (bRoles) bRoles.onclick = () => gestionRoles(charger);
    }

    /** Charge (une fois) le catalogue des permissions accordables. */
    async function chargerCatalogue() {
      if (!catalogue) catalogue = await Api.get('/permissions');
      return catalogue;
    }

    const roleDonneTout = (role) => (role && role.permissions || []).includes('*');

    /** Case à cocher d'une permission, avec l'état « vient du rôle » ou « accordée ». */
    function casePermission(code, libelle, coche, duRole, desactive, reservee) {
      return `<label class="hab-ligne ${desactive ? 'fige' : ''}">
        <input type="checkbox" class="hab" value="${code}" ${coche ? 'checked' : ''} ${desactive ? 'disabled' : ''}>
        <span><b>${Fmt.echapper(libelle)}</b>
          <span class="petit texte-muted mono">${code}</span>
          ${duRole ? '<span class="badge neutre">du rôle</span>' : ''}
          ${reservee ? '<span class="badge attente">réservé admin</span>' : ''}</span>
      </label>`;
    }

    /** Création / modification d'un compte : boutique, rôle et habilitations fines. */
    async function formulaire(u0, { magasinDefaut = null } = {}) {
      let cat = { groupes: {}, reservees_admin: [] };
      try { cat = await chargerCatalogue(); } catch (e) { cat = { groupes: {}, reservees_admin: [] }; }
      const groupes = cat.groupes || {};
      const reservees = cat.reservees_admin || [];
      const u = u0 || { role: (infos.roles.find((r) => r.attribuable_boutique) || infos.roles[0]).code, actif: 1 };
      const roleActuel = infos.roles.find((r) => r.code === u.role) || infos.roles[0];
      const magasinsDisponibles = droits.tous ? App.etat.magasins : [monMagasin].filter(Boolean);
      const hab0 = (u0 && u0.habilitations) || { accordees: [], retirees: [] };

      /** Cases cochées au départ : rôle + accordées − retirées. */
      const cochesInitiales = () => {
        if (roleDonneTout(roleActuel)) return Object.values(groupes).flatMap((g) => Object.keys(g));
        return Object.entries(groupes).flatMap(([, g]) => Object.keys(g)).filter((c) =>
          ((roleActuel.permissions || []).includes(c) || (hab0.accordees || []).includes(c))
          && !(hab0.retirees || []).includes(c));
      };

      const corpsPerms = Object.entries(groupes).map(([groupe, liste]) => `
        <div class="hab-groupe">
          <b class="petit">${Fmt.echapper(groupe)}</b>
          ${Object.entries(liste).map(([code, libelle]) => {
            const duRole = roleDonneTout(roleActuel) || (roleActuel.permissions || []).includes(code);
            const coche = cochesInitiales().includes(code);
            return casePermission(code, libelle, coche, duRole, roleDonneTout(roleActuel), reservees.includes(code));
          }).join('')}
        </div>`).join('');

      ouvrirModale({
        titre: u0 ? 'Modifier le compte de ' + u.nom : 'Nouveau compte utilisateur',
        largeur: 'large',
        contenu: `
          <div class="carte" style="box-shadow:none;border-color:#cfe9e7;background:#f7fdfd;margin-bottom:14px">
            <div class="carte-corps petit">
              Chaque personne est rattachée à une <b>boutique</b> et reçoit un <b>rôle</b> — puis vous ajustez
              finement ses <b>habilitations</b> ci-dessous. Un agent de stock <b>n'a jamais à saisir de prix</b>.
            </div>
          </div>
          <div class="grille-form">
            <div class="champ"><label>Nom complet *</label><input name="nom" value="${Fmt.echapper(u.nom || '')}" placeholder="Ex. Awa Nkolo"></div>
            <div class="champ"><label>Email / identifiant *</label><input type="email" name="email" value="${Fmt.echapper(u.email || '')}"></div>
            <div class="champ"><label>Mot de passe ${u0 ? '(laisser vide pour conserver)' : '*'}</label>
              <input type="text" name="mot_de_passe" placeholder="6 caractères minimum" autocomplete="new-password"></div>
            <div class="champ"><label>Boutique d'affectation *</label>
              <select name="magasin_id" ${droits.tous ? '' : 'disabled'}>
                ${droits.tous ? '<option value="">— aucune (rôle réseau) —</option>' : ''}
                ${options(magasinsDisponibles, 'id', (m) => `${m.nom} — ${m.ville || ''}`, u.magasin_id ?? magasinDefaut ?? (monMagasin ? monMagasin.id : ''))}
              </select>
              ${droits.tous ? '' : '<div class="aide">Votre compte ne peut créer que dans votre boutique.</div>'}</div>
            <div class="champ"><label>Rôle *</label>
              <select name="role" id="champ-role">
                ${infos.roles.map((r) => `<option value="${r.code}" ${u.role === r.code ? 'selected' : ''}>${Fmt.echapper(r.nom)} — ${r.portee === 'reseau' ? 'réseau' : 'boutique'}</option>`).join('')}
              </select>
              <div class="aide" id="aide-role">${Fmt.echapper(roleActuel.description || '')}</div></div>
            <div class="champ"><label><input type="checkbox" name="actif" ${u.actif ? 'checked' : ''} style="width:auto;margin-right:6px">Compte actif</label></div>
          </div>

          <div class="carte" style="box-shadow:none;margin:4px 0 0">
            <div class="carte-entete">
              <h3>🔐 Habilitations de ce compte</h3>
              <div class="droite petit texte-muted" id="hab-resume"></div>
            </div>
            <div class="carte-corps">
              <div class="aide" style="margin-bottom:10px">
                Le rôle donne un socle de permissions. Cochez une case pour <b>accorder</b> une permission
                supplémentaire à cette personne, décochez pour lui <b>retirer</b> une permission de son rôle.
                Ces réglages ne concernent que ce compte — les autres gardent celles de leur rôle.
              </div>
              <div class="barre-outils" style="margin-bottom:10px">
                <button class="btn petit" type="button" data-perm="role">↺ Revenir au rôle</button>
                <button class="btn petit" type="button" data-perm="toutes">Tout cocher</button>
                <button class="btn petit" type="button" data-perm="aucune">Tout décocher</button>
              </div>
              <div id="zone-hab" class="grille g-2">${corpsPerms || '<div class="vide">Aucune permission accordable pour votre profil</div>'}</div>
            </div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-enregistrer>Enregistrer le compte</button>`,
        surOuverture(mod, fermer) {
          const sel = mod.querySelector('#champ-role');
          const aide = mod.querySelector('#aide-role');
          const resume = mod.querySelector('#hab-resume');
          const cases = () => [...mod.querySelectorAll('.hab')];
          const lireCoches = () => cases().filter((c) => c.checked).map((c) => c.value);

          /** Coche les cases correspondant à un ensemble de permissions. */
          const cocher = (liste) => cases().forEach((c) => { c.checked = liste.includes(c.value); });
          const roleCourant = () => infos.roles.find((x) => x.code === sel.value) || infos.roles[0];

          /** Recalcule l'affichage « N permissions : x du rôle, +y accordées, −z retirées ». */
          const majResume = () => {
            const r = roleCourant();
            const toutes = roleDonneTout(r);
            const duRole = toutes ? cases().length : (r.permissions || []).filter((p) => cases().some((c) => c.value === p)).length;
            const coches = lireCoches();
            const accordees = toutes ? [] : coches.filter((c) => !(r.permissions || []).includes(c));
            const retirees = toutes ? [] : (r.permissions || []).filter((p) => cases().some((c) => c.value === p) && !coches.includes(p));
            resume.innerHTML = `<b>${coches.length}</b> permission(s) active(s) — ${duRole} du rôle`
              + (accordees.length ? `, <span style="color:var(--ok)">+${accordees.length} accordée(s)</span>` : '')
              + (retirees.length ? `, <span style="color:var(--bad)">−${retirees.length} retirée(s)</span>` : '');
            cases().forEach((c) => {
              const lbl = c.closest('.hab-ligne');
              const badge = lbl && lbl.querySelector('.badge.neutre');
              const estDuRole = toutes || (r.permissions || []).includes(c.value);
              if (badge) badge.style.display = estDuRole ? '' : 'none';
              if (lbl) lbl.classList.toggle('accordee', !estDuRole && c.checked);
            });
          };

          // Changement de rôle : on garde les choix manuels déjà faits et on les réinterprète.
          sel.onchange = () => {
            const r = roleCourant();
            aide.textContent = r ? r.description : '';
            if (roleDonneTout(r)) { cocher(cases().map((c) => c.value)); cases().forEach((c) => { c.disabled = true; }); }
            else {
              const anciennes = lireCoches();
              cases().forEach((c) => {
                c.disabled = false;
                c.checked = r.permissions.includes(c.value) || anciennes.includes(c.value);
              });
            }
            majResume();
          };

          mod.querySelectorAll('[data-perm]').forEach((b) => b.onclick = () => {
            const mode = b.dataset.perm;
            const r = roleCourant();
            if (mode === 'toutes') cocher(cases().map((c) => c.value));
            else if (mode === 'aucune') cocher([]);
            else cocher(roleDonneTout(r) ? cases().map((c) => c.value) : r.permissions || []);
            majResume();
          });
          cases().forEach((c) => c.onchange = majResume);
          majResume();

          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-enregistrer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.nom || !d.email) return notifier('Nom et email obligatoires', 'erreur');
            if (!u0 && (!d.mot_de_passe || d.mot_de_passe.length < 6)) return notifier('Mot de passe : 6 caractères minimum', 'erreur');
            if (!droits.tous) d.magasin_id = monMagasin ? monMagasin.id : null;

            const r = roleCourant();
            const coches = lireCoches();
            if (roleDonneTout(r)) { d.permissions_extra = []; d.permissions_retirees = []; }
            else {
              d.permissions_extra = coches.filter((c) => !r.permissions.includes(c));
              d.permissions_retirees = r.permissions.filter((p) => cases().some((c) => c.value === p) && !coches.includes(p));
            }
            try {
              if (u0) await Api.put('/utilisateurs/' + u0.id, d);
              else await Api.post('/utilisateurs', d);
              const extra = d.permissions_extra.length + d.permissions_retirees.length;
              notifier((u0 ? 'Compte mis à jour' : 'Compte créé avec succès') + (extra ? ` — ${extra} habilitation(s) sur mesure` : ''));
              fermer(); charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    /** Crée une boutique puis propose immédiatement d'y affecter son caissier. */
    function formulaireBoutique() {
      const modele = { actif: 1, code: 'MG-' + String(100 + Math.floor(Math.random() * 899)) };
      ouvrirModale({
        titre: 'Nouvelle boutique',
        contenu: `
          <div class="carte" style="box-shadow:none;border-color:#cfe9e7;background:#f7fdfd;margin-bottom:14px">
            <div class="carte-corps petit">Créez autant de boutiques que vous voulez : chacune aura sa caisse,
              son stock, ses comptes et ses rapports. Vous pourrez ensuite y affecter un(e) caissier(ère)
              avec ses propres habilitations.</div>
          </div>
          <div class="grille-form">
            <div class="champ"><label>Code *</label><input name="code" value="${Fmt.echapper(modele.code)}"></div>
            <div class="champ"><label>Nom de la boutique *</label><input name="nom" placeholder="Ex. Inventa GestyPro Douala Bonabéri"></div>
            <div class="champ"><label>Ville</label><input name="ville" placeholder="Ex. Douala"></div>
            <div class="champ"><label>Téléphone</label><input name="telephone"></div>
            <div class="champ plein"><label>Adresse</label><input name="adresse"></div>
            <div class="champ"><label>Responsable</label><input name="responsable"></div>
          </div>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-creer>Créer la boutique</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-creer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.code || !d.nom) return notifier('Code et nom obligatoires', 'erreur');
            try {
              const r = await Api.post('/magasins', d);
              boutiqueEnAttenteDEquipe = r.id || r.magasin_id || (r.magasin && r.magasin.id) || null;
              notifier(`Boutique « ${d.nom} » créée — affectez-lui maintenant son caissier(ère)`);
              fermer();
              await App.chargerContexte();
              App.rendreCoquille();
              App.monter('utilisateurs');   // la fiche du caissier s'ouvre à la fin du chargement
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    /** Éditeur de rôles personnalisés (administrateur). */
    async function gestionRoles(rafraichir) {
      const [rolesData, perms] = await Promise.all([Api.get('/roles'), Api.get('/permissions')]);
      const groupes = perms.groupes;
      const modale = ouvrirModale({
        titre: 'Rôles et permissions',
        largeur: 'large',
        contenu: `<div class="vide">Chargement…</div>`,
        pied: `<button class="btn" data-fermer>Fermer</button><button class="btn primaire" data-nouveau>＋ Créer un rôle personnalisé</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = fermer;
          const corps = mod.querySelector('.modale-corps');
          const dessiner = () => {
            corps.innerHTML = `
              <p class="petit texte-muted">Les rôles « système » ne sont pas modifiables : créez un rôle personnalisé
              pour coller exactement à votre organisation (ex. « Vendeur caisse du soir », « Agent dépôt »).</p>
              ${tableau([
                { titre: 'Rôle', rendre: (l) => `<b>${Fmt.echapper(l.nom)}</b> <span class="mono petit texte-muted">${l.code}</span>
                    <div class="petit texte-muted">${Fmt.echapper(l.description || '')}</div>` },
                { titre: 'Portée', rendre: (l) => `<span class="badge ${l.portee === 'reseau' ? 'info' : 'neutre'}">${l.portee}</span>` },
                { titre: 'Permissions', num: true, rendre: (l) => l.permissions.includes('*') ? 'toutes' : Fmt.nombre(l.permissions.length) },
                { titre: 'Comptes', num: true, rendre: (l) => Fmt.nombre(l.nb_utilisateurs) },
                { titre: '', rendre: (l) => l.systeme ? '<span class="badge neutre">système</span>' : `<div class="actions">
                    <button class="btn petit danger" data-suppr="${l.code}">Supprimer</button></div>` },
              ], rolesData.roles)}`;
            corps.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
              if (!(await confirmer('Supprimer ce rôle ?', { danger: true, valider: 'Supprimer' }))) return;
              try { await Api.del('/roles/' + b.dataset.suppr); notifier('Rôle supprimé'); rafraichir(); gestionRoles(rafraichir); }
              catch (e) { notifier(e.message, 'erreur'); }
            });
          };
          dessiner();
          mod.querySelector('[data-nouveau]').onclick = () => {
            ouvrirModale({
              titre: 'Nouveau rôle personnalisé',
              largeur: 'large',
              contenu: `
                <div class="grille-form">
                  <div class="champ"><label>Nom du rôle *</label><input name="nom" placeholder="Ex. Agent dépôt soir"></div>
                  <div class="champ"><label>Portée *</label><select name="portee">
                    <option value="magasin">Boutique (limité à sa boutique)</option>
                    <option value="reseau">Réseau (toutes les boutiques)</option></select></div>
                  <div class="champ plein"><label>Description</label><input name="description" placeholder="À quoi sert ce rôle…"></div>
                  <div class="champ plein"><label><input type="checkbox" name="attribuable_boutique" checked style="width:auto;margin-right:6px">
                    Peut être attribué par un responsable de boutique</label></div>
                </div>
                <h4 style="margin:14px 0 8px">Permissions</h4>
                ${Object.entries(groupes).map(([groupe, liste]) => `
                  <div style="margin-bottom:12px">
                    <b class="petit">${Fmt.echapper(groupe)}</b>
                    <div class="grille g-2" style="margin-top:6px">
                      ${Object.entries(liste).map(([code, libelle]) => `
                        <label class="petit" style="display:flex;gap:7px;align-items:flex-start">
                          <input type="checkbox" value="${code}" class="perm" style="width:auto;margin-top:3px">
                          <span>${Fmt.echapper(libelle)}<br><span class="mono texte-muted" style="font-size:11px">${code}</span></span>
                        </label>`).join('')}
                    </div>
                  </div>`).join('')}`,
              pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-creer>Créer le rôle</button>`,
              surOuverture(mod2, fermer2) {
                mod2.querySelector('[data-annuler]').onclick = fermer2;
                mod2.querySelector('[data-creer]').onclick = async () => {
                  const d = lireFormulaire(mod2);
                  const permissions = [...mod2.querySelectorAll('.perm:checked')].map((c) => c.value);
                  if (!d.nom) return notifier('Nom obligatoire', 'erreur');
                  if (!permissions.length) return notifier('Cochez au moins une permission', 'erreur');
                  try {
                    await Api.post('/roles', { ...d, permissions });
                    notifier('Rôle créé'); fermer2(); rafraichir();
                    await gestionRoles(rafraichir);
                  } catch (e) { notifier(e.message, 'erreur'); }
                };
              },
            });
          };
        },
      });
      return modale;
    }

    charger();
  },
});

App.enregistrerVue('parametres', {
  titre: 'Paramètres', icone: '⚙️', permissions: ['parametres.gerer'], groupe: 'Administration',
  async rendre(zone) {
    const p = await Api.get('/parametres');
    if (!document.body.contains(zone)) return; // vue remplacée pendant le chargement
    const peutModifier = App.peut('parametres.gerer');
    zone.innerHTML = `
      <div class="carte">
        <div class="carte-entete"><h3>🏢 Informations de l'entreprise</h3>
          <div class="droite petit texte-muted">Ces informations apparaissent sur les tickets et factures</div></div>
        <div class="carte-corps">
          <form id="form-params">
            <div class="grille-form">
              <div class="champ plein"><label>Nom de l'entreprise</label><input name="nom_entreprise" value="${Fmt.echapper(p.nom_entreprise || '')}"></div>
              <div class="champ plein"><label>Slogan</label><input name="slogan" value="${Fmt.echapper(p.slogan || '')}"></div>
              <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(p.telephone || '')}"></div>
              <div class="champ"><label>Email</label><input name="email" value="${Fmt.echapper(p.email || '')}"></div>
              <div class="champ plein"><label>Adresse</label><input name="adresse" value="${Fmt.echapper(p.adresse || '')}"></div>
              <div class="champ"><label>Numéro contribuable (NIU)</label><input name="contribuable" value="${Fmt.echapper(p.contribuable || '')}"></div>
              <div class="champ"><label>TVA par défaut (%)</label><input type="number" step="0.01" name="tva_defaut" value="${Fmt.echapper(p.tva_defaut || '19.25')}"></div>
              <div class="champ"><label>Préfixe des tickets</label><input name="prefixe_vente" value="${Fmt.echapper(p.prefixe_vente || 'VTE')}"></div>
              <div class="champ"><label>Objectif de CA mensuel (FCFA)</label><input type="number" step="1000" name="objectif_mensuel" value="${Fmt.echapper(p.objectif_mensuel || 0)}"></div>
              <div class="champ plein"><label>Message bas de ticket</label><textarea name="message_ticket" rows="2">${Fmt.echapper(p.message_ticket || '')}</textarea></div>
            </div>
            ${peutModifier ? '<button class="btn primaire" type="submit">💾 Enregistrer les paramètres</button>'
              : '<div class="aide">Seuls un administrateur ou un gestionnaire peuvent modifier ces informations.</div>'}
          </form>
        </div>
      </div>
      <div class="carte">
        <div class="carte-entete"><h3>🎨 Apparence</h3>
          <div class="droite petit texte-muted">Langue et thème de l'application</div></div>
        <div class="carte-corps">
          <div class="grille-form">
            <div class="champ">
              <label>Langue de l'application</label>
              <select id="choix-langue">
                ${Object.values(window.LANGUES || { fr: { code: 'fr', nom: 'Français' } }).map((l) =>
                  `<option value="${l.code}" ${I18n.langue === l.code ? 'selected' : ''}>${l.drapeau || ''} ${l.nom}</option>`).join('')}
              </select>
              <div class="aide">Français, English ou 中文 — appliqué à toute l'application, y compris la console du propriétaire.</div>
            </div>
            <div class="champ">
              <label>Thème de l'application</label>
              <div class="barre-outils" style="margin:0">
                <button type="button" class="btn ${I18n.theme === 'clair' ? 'primaire' : ''}" data-theme-choix="clair">☀️ Clair (blanc)</button>
                <button type="button" class="btn ${I18n.theme === 'sombre' ? 'primaire' : ''}" data-theme-choix="sombre">🌙 Sombre (noir)</button>
              </div>
              <div class="aide">Mémorisé sur ce poste et appliqué dès l'écran de connexion.</div>
            </div>
          </div>
        </div>
      </div>
      <div class="grille g-2">
        <div class="carte">
          <div class="carte-entete"><h3>🔐 Ma sécurité</h3></div>
          <div class="carte-corps">
            <p class="petit texte-muted">Modifiez votre mot de passe depuis le bouton <b>Mon profil</b> en haut à droite.</p>
            <div class="panier-total"><span>Profil</span><b>${Fmt.echapper(App.etat.utilisateur.libelle_role || App.etat.utilisateur.role)}</b></div>
            <div class="panier-total"><span>Magasin</span><b>${Fmt.echapper(App.etat.utilisateur.magasin ? App.etat.utilisateur.magasin.nom : 'Tous')}</b></div>
            <div class="panier-total"><span>Modules accessibles</span><b>${App.etat.utilisateur.permissions.includes('*') ? 'Tous' : App.etat.utilisateur.permissions.length}</b></div>
          </div>
        </div>
        <div class="carte">
          <div class="carte-entete"><h3>💾 Sauvegarde des données</h3></div>
          <div class="carte-corps">
            <p class="petit texte-muted">Toutes les données sont stockées dans le fichier <span class="mono">data/shopmanager.db</span> (base SQLite).
            Pour sauvegarder, copiez ce fichier. Pour le remettre à zéro avec les données de démonstration, utilisez la commande <span class="mono">npm run seed</span>.</p>
            <div class="barre-outils">
              <button class="btn" id="pr-export-produits">⬇️ Produits (CSV)</button>
              <button class="btn" id="pr-export-clients">⬇️ Clients (CSV)</button>
              <button class="btn" id="pr-export-stocks">⬇️ Stocks (CSV)</button>
            </div>
          </div>
        </div>
      </div>`;

    /* --- Apparence : langue et thème (disponibles pour tous les rôles) --- */
    const choixLangue = document.getElementById('choix-langue');
    if (choixLangue) {
      choixLangue.onchange = (ev) => {
        notifier(I18n.t('Langue') + ' : ' + ev.target.options[ev.target.selectedIndex].text);
        I18n.changerLangue(ev.target.value);   // recharge l'interface dans la langue choisie
      };
    }
    document.querySelectorAll('[data-theme-choix]').forEach((b) => {
      b.onclick = () => {
        I18n.changerTheme(b.dataset.themeChoix);
        document.querySelectorAll('[data-theme-choix]').forEach((x) => {
          x.classList.toggle('primaire', x === b);
        });
        notifier(b.dataset.themeChoix === 'sombre' ? '🌙 Thème sombre appliqué' : '☀️ Thème clair appliqué');
      };
    });

    const form = document.getElementById('form-params');
    if (form && peutModifier) form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await Api.put('/parametres', lireFormulaire(form));
        notifier('Paramètres enregistrés');
        App.etat.parametres = await Api.get('/parametres');
        App.rendreCoquille();
      } catch (err) { notifier(err.message, 'erreur'); }
    };
    document.getElementById('pr-export-produits').onclick = () => Api.telecharger('/export.csv?type=produits', 'catalogue_produits.csv').then(() => notifier('Export téléchargé')).catch((e) => notifier(e.message, 'erreur'));
    document.getElementById('pr-export-clients').onclick = () => Api.telecharger('/export.csv?type=clients', 'clients.csv').then(() => notifier('Export téléchargé')).catch((e) => notifier(e.message, 'erreur'));
    document.getElementById('pr-export-stocks').onclick = () => Api.telecharger('/export.csv?type=stocks', 'etat_stocks.csv').then(() => notifier('Export téléchargé')).catch((e) => notifier(e.message, 'erreur'));
  },
});
