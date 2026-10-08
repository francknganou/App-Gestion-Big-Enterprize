/* ==========================================================================
   Console du propriétaire — ABONNEMENTS & TARIFS
   Le propriétaire définit librement la DURÉE et le MONTANT de chaque formule,
   crée des RÉDUCTIONS (ou des majorations) du montant qu'il veut, applique des
   AUGMENTATIONS de tarif, et configure les prestataires de paiement
   (PayDunya par défaut, CinetPay en secours).
   ========================================================================== */

App.enregistrerVue('plateforme-tarifs', {
  titre: 'Abonnements & tarifs', icone: '🏷️',
  permissions: ['plateforme.consulter'], groupe: 'Plateforme',

  async rendre(zone) {
    let donnees = null;

    /* ------------------------- Formulaire de formule ------------------------- */
    function editerFormule(f) {
      const edition = !!f;
      ouvrirModale({
        titre: edition ? `Formule « ${f.libelle} »` : 'Nouvelle formule d’abonnement',
        largeur: '520px',
        contenu: `
          <div class="aide" style="margin-bottom:12px">
            Vous choisissez librement la <b>durée</b> (en jours) et le <b>montant</b> de cette formule.
            Exemples : 30 jours / 11 500 FCFA, 90 jours / 32 000 FCFA, 365 jours / 132 000 FCFA.
          </div>
          <label class="champ"><span>Code (identifiant interne)</span>
            <input name="code" value="${Fmt.echapper(f ? f.code : '')}" ${edition ? 'readonly' : ''}
              placeholder="trimestre, semestriel, promo-3m…"></label>
          <label class="champ"><span>Libellé affiché au client</span>
            <input name="libelle" value="${Fmt.echapper(f ? f.libelle : '')}" placeholder="Abonnement trimestriel"></label>
          <div class="grille g-2">
            <label class="champ"><span>Durée (jours)</span>
              <input name="duree_jours" type="number" min="1" max="3650"
                value="${f ? f.duree_jours : 30}"></label>
            <label class="champ"><span>Montant (FCFA)</span>
              <input name="montant" type="number" min="0" step="100"
                value="${f ? f.montant : 11500}"></label>
          </div>
          <div class="grille g-2">
            <label class="champ"><span>Ordre d’affichage</span>
              <input name="ordre" type="number" value="${f ? f.ordre : 0}"></label>
            <label class="champ"><span>État</span>
              <select name="actif">
                <option value="1" ${!f || f.actif ? 'selected' : ''}>Active (proposée aux clients)</option>
                <option value="0" ${f && !f.actif ? 'selected' : ''}>Désactivée</option>
              </select></label>
          </div>
          <label class="champ"><span>Note interne</span>
            <input name="note" value="${Fmt.echapper((f && f.note) || '')}" placeholder="Offre de lancement…"></label>`,
        pied: `<button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-enregistrer>${edition ? 'Enregistrer' : 'Créer la formule'}</button>`,
        surOuverture(m) {
          const d = m.querySelector('[name=duree_jours]');
          const mo = m.querySelector('[name=montant]');
          const apercu = () => {
            const j = Number(d.value) || 0, x = Number(mo.value) || 0;
            const mois = j / 30;
            m.querySelector('[data-apercu]').textContent = mois > 0
              ? `soit ${Math.round(x / mois).toLocaleString('fr-FR')} FCFA par mois équivalent` : '';
          };
          d.addEventListener('input', apercu); mo.addEventListener('input', apercu);
          m.querySelector('[data-enregistrer]').addEventListener('click', async () => {
            const corps = lireFormulaire(m);
            corps.actif = corps.actif === '1' || corps.actif === 1 || corps.actif === true;
            corps.duree_jours = Number(corps.duree_jours);
            corps.montant = Number(corps.montant);
            try {
              const r = await Api.post('/plateforme/formules', corps);
              notifier(r.message);
              m.remove();
              charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          });
        },
      });
      /* Petit aperçu ajouté après coup pour rester lisible. */
      setTimeout(() => {
        const voile = [...document.querySelectorAll('.voile')].pop();
        if (voile && !voile.querySelector('[data-apercu]')) {
          const p = document.createElement('div');
          p.className = 'petit texte-muted';
          p.setAttribute('data-apercu', '');
          voile.querySelector('.modale').appendChild(p);
        }
      }, 0);
    }

    /* ------------------------- Augmentation de tarif ------------------------- */
    function augmenter() {
      ouvrirModale({
        titre: 'Augmenter (ou baisser) les tarifs',
        largeur: '480px',
        contenu: `
          <div class="aide" style="margin-bottom:12px">
            Appliquez une variation à une formule précise ou à <b>toutes</b> les formules.
            Une valeur <b>négative</b> diminue le prix.
          </div>
          <label class="champ"><span>Formule concernée</span>
            <select name="code">
              <option value="">Toutes les formules</option>
              ${donnees.formules.map((f) => `<option value="${Fmt.echapper(f.code)}">${Fmt.echapper(f.libelle)} — ${Fmt.fcfa(f.montant)}</option>`).join('')}
            </select></label>
          <label class="champ"><span>Type de variation</span>
            <select name="type">
              <option value="pourcentage">Pourcentage (%)</option>
              <option value="montant">Montant fixe (FCFA)</option>
            </select></label>
          <label class="champ"><span>Valeur (négative pour une baisse)</span>
            <input name="valeur" type="number" step="0.5" value="10" placeholder="10"></label>`,
        pied: `<button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-appliquer>Appliquer</button>`,
        surOuverture(m) {
          m.querySelector('[data-appliquer]').addEventListener('click', async () => {
            const corps = lireFormulaire(m);
            corps.valeur = Number(corps.valeur);
            const oui = await confirmer(
              `Appliquer ${corps.valeur > 0 ? '+' : ''}${corps.valeur}${corps.type === 'pourcentage' ? ' %' : ' FCFA'}
               ${corps.code ? 'à la formule sélectionnée' : 'à TOUTES les formules'} ?`,
              { valider: 'Appliquer la variation', danger: corps.valeur > 0 });
            if (!oui) return;
            try {
              const r = await Api.post('/plateforme/formules/augmenter', corps);
              notifier(r.message + ' ' + r.modifs.map((x) => `${x.libelle} : ${Fmt.fcfa(x.avant)} → ${Fmt.fcfa(x.apres)}`).join(' · '));
              m.remove();
              charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          });
        },
      });
    }

    /* ------------------------------ Réduction ------------------------------ */
    function editerReduction(r) {
      const edition = !!r;
      ouvrirModale({
        titre: edition ? `Code « ${r.code} »` : 'Nouveau code de réduction',
        largeur: '520px',
        contenu: `
          <div class="aide" style="margin-bottom:12px">
            Le client saisit ce code au moment de payer : le montant est recalculé automatiquement.
            Une valeur <b>négative</b> crée une majoration ciblée.
          </div>
          <div class="grille g-2">
            <label class="champ"><span>Code</span>
              <input name="code" value="${Fmt.echapper(r ? r.code : '')}" ${edition ? 'readonly' : ''}
                placeholder="BIENVENUE20" style="text-transform:uppercase"></label>
            <label class="champ"><span>Libellé</span>
              <input name="libelle" value="${Fmt.echapper((r && r.libelle) || '')}" placeholder="Offre de bienvenue"></label>
          </div>
          <div class="grille g-2">
            <label class="champ"><span>Type</span>
              <select name="type">
                <option value="pourcentage" ${r && r.type === 'pourcentage' ? 'selected' : ''}>Pourcentage (%)</option>
                <option value="montant" ${r && r.type === 'montant' ? 'selected' : ''}>Montant fixe (FCFA)</option>
              </select></label>
            <label class="champ"><span>Valeur</span>
              <input name="valeur" type="number" step="0.5" value="${r ? r.valeur : 10}" placeholder="20"></label>
          </div>
          <div class="grille g-2">
            <label class="champ"><span>Formule concernée</span>
              <select name="formule_code">
                <option value="">Toutes les formules</option>
                ${donnees.formules.map((f) => `<option value="${Fmt.echapper(f.code)}" ${r && r.formule_code === f.code ? 'selected' : ''}>${Fmt.echapper(f.libelle)}</option>`).join('')}
              </select></label>
            <label class="champ"><span>Utilisations maximales</span>
              <input name="max_utilisations" type="number" min="1" value="${(r && r.max_utilisations) || ''}" placeholder="illimité"></label>
          </div>
          <div class="grille g-2">
            <label class="champ"><span>Valide du</span>
              <input name="debut" type="date" value="${(r && r.debut) || ''}"></label>
            <label class="champ"><span>Au</span>
              <input name="fin" type="date" value="${(r && r.fin) || ''}"></label>
          </div>
          <label class="champ"><span>État</span>
            <select name="actif">
              <option value="1" ${!r || r.actif ? 'selected' : ''}>Actif</option>
              <option value="0" ${r && !r.actif ? 'selected' : ''}>Désactivé</option>
            </select></label>`,
        pied: `<button class="btn" data-fermer>Annuler</button>
               <button class="btn primaire" data-enregistrer>${edition ? 'Enregistrer' : 'Créer le code'}</button>`,
        surOuverture(m) {
          m.querySelector('[data-enregistrer]').addEventListener('click', async () => {
            const corps = lireFormulaire(m);
            corps.valeur = Number(corps.valeur);
            if (corps.max_utilisations) corps.max_utilisations = Number(corps.max_utilisations);
            corps.actif = String(corps.actif) === '1';
            try {
              const rep = edition
                ? await Api.put('/plateforme/reductions/' + r.id, corps)
                : await Api.post('/plateforme/reductions', corps);
              notifier(rep.message);
              m.remove();
              charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          });
        },
      });
    }

    /* --------------------------- Configuration PSP --------------------------- */
    function configurerPsp() {
      const p = donnees.psp || {};
      const tous = p.prestataires || [];
      const parCode = {};
      tous.forEach((x) => { parCode[x.code] = x; });
      const pd = parCode.paydunya || {};
      const cp = parCode.cinetpay || {};

      ouvrirModale({
        titre: 'Prestataires de paiement',
        largeur: '640px',
        contenu: `
          <div class="aide" style="margin-bottom:12px">
            Le prestataire actif effectue le <b>débit réel</b> des cartes et reverse les fonds
            sur votre compte. L'autre reste disponible en secours : vous pouvez basculer à tout
            moment. Tant qu'un prestataire n'a pas ses clés, les paiements par carte sont
            enregistrés « en attente » de votre validation.
          </div>

          <label class="champ"><span>Prestataire actif</span>
            <select name="psp_actif">
              <option value="paydunya" ${p.code !== 'cinetpay' ? 'selected' : ''}>
                PayDunya ${pd.configure ? '— ✅ configuré' : '— ⚠️ sans clés'}</option>
              <option value="cinetpay" ${p.code === 'cinetpay' ? 'selected' : ''}>
                CinetPay ${cp.configure ? '— ✅ configuré' : '— ⚠️ sans clés'}</option>
            </select></label>

          <div class="carte" style="box-shadow:none;border:1px solid var(--bord);margin:14px 0">
            <div class="carte-entete"><div><b>PayDunya</b>
              <div class="sous">Cartes Visa / MasterCard et Mobile Money en FCFA —
                ${pd.mode === 'live' ? 'production' : 'sandbox'}</div></div>
              <div class="droite">${pd.configure
                ? '<span class="badge ok">Configuré</span>' : '<span class="badge attente">Sans clés</span>'}</div></div>
            <div class="carte-corps">
              <div class="grille g-2">
                <label class="champ"><span>Master Key</span>
                  <input name="paydunya_master_key" type="password"
                    placeholder="${pd.master_key ? '••••' + Fmt.echapper(pd.master_key) : 'votre master key'}"></label>
                <label class="champ"><span>Private Key</span>
                  <input name="paydunya_private_key" type="password"
                    placeholder="${pd.dev_cle ? '••••' + Fmt.echapper(pd.dev_cle) : 'test_private_… ou live_private_…'}"></label>
              </div>
              <div class="grille g-2">
                <label class="champ"><span>Token</span>
                  <input name="paydunya_token" type="password"
                    placeholder="${pd.token ? '••••' + Fmt.echapper(pd.token) : 'votre token'}"></label>
                <label class="champ"><span>Mode</span>
                  <select name="paydunya_mode">
                    <option value="test" ${pd.mode !== 'live' ? 'selected' : ''}>test (sandbox)</option>
                    <option value="live" ${pd.mode === 'live' ? 'selected' : ''}>live (production)</option>
                  </select></label>
              </div>
              <label class="champ"><span>Nom de la boutique affiché au client</span>
                <input name="paydunya_store" value="${Fmt.echapper(pd.store || '')}" placeholder="INVENTA GESTYPRO"></label>
              <label class="champ"><span>URL de callback (IPN)</span>
                <input name="paydunya_callback_url" value="${Fmt.echapper(pd.notify_url || '')}"
                  placeholder="https://votre-domaine.cm/api/psp/paydunya/ipn"></label>
              <label class="champ"><span>URL de retour après paiement</span>
                <input name="paydunya_return_url" value="${Fmt.echapper(pd.return_url || '')}"
                  placeholder="https://votre-domaine.cm/api/psp/paydunya/retour"></label>
            </div>
          </div>

          <div class="carte" style="box-shadow:none;border:1px solid var(--bord);margin:14px 0">
            <div class="carte-entete"><div><b>CinetPay</b>
              <div class="sous">Agrégateur camerounais — conservé en secours</div></div>
              <div class="droite">${cp.configure
                ? '<span class="badge ok">Configuré</span>' : '<span class="badge neutre">Sans clés</span>'}</div></div>
            <div class="carte-corps">
              <div class="grille g-2">
                <label class="champ"><span>Clé API</span>
                  <input name="cinetpay_apikey" type="password"
                    placeholder="${cp.dev_cle ? '••••' + Fmt.echapper(cp.dev_cle) : 'votre clé API'}"></label>
                <label class="champ"><span>Identifiant du site</span>
                  <input name="cinetpay_site_id" value="${Fmt.echapper(cp.site_id || '')}" placeholder="123456"></label>
              </div>
              <div class="grille g-2">
                <label class="champ"><span>Environnement</span>
                  <select name="cinetpay_env">
                    <option value="SANDBOX" ${cp.mode !== 'PRODUCTION' ? 'selected' : ''}>SANDBOX (test)</option>
                    <option value="PRODUCTION" ${cp.mode === 'PRODUCTION' ? 'selected' : ''}>PRODUCTION</option>
                  </select></label>
                <label class="champ"><span>Canaux acceptés</span>
                  <select name="cinetpay_canaux">
                    <option value="CARD,MOBILE_MONEY" ${cp.canaux === 'CARD,MOBILE_MONEY' ? 'selected' : ''}>Carte + Mobile Money</option>
                    <option value="CARD" ${cp.canaux === 'CARD' ? 'selected' : ''}>Carte uniquement</option>
                    <option value="MOBILE_MONEY" ${cp.canaux === 'MOBILE_MONEY' ? 'selected' : ''}>Mobile Money uniquement</option>
                  </select></label>
              </div>
              <label class="champ"><span>URL de notification (IPN)</span>
                <input name="cinetpay_notify_url" value="${Fmt.echapper(cp.notify_url || '')}"
                  placeholder="https://votre-domaine.cm/api/psp/cinetpay/ipn"></label>
            </div>
          </div>

          <div class="aide">URL de notification à déclarer chez le prestataire actif :
            <code>${Fmt.echapper((location.origin || '') + '/api/psp/' + (p.code === 'cinetpay' ? 'cinetpay' : 'paydunya') + '/ipn')}</code></div>`,
        pied: `<button class="btn" data-fermer>Fermer</button>
               <button class="btn primaire" data-enregistrer>Enregistrer la configuration</button>`,
        surOuverture(m) {
          m.querySelector('[data-enregistrer]').addEventListener('click', async () => {
            const corps = lireFormulaire(m);
            /* Les champs laissés vides en mode mot de passe ne doivent pas écraser
               une clé déjà enregistrée. */
            ['paydunya_master_key', 'paydunya_private_key', 'paydunya_token', 'cinetpay_apikey']
              .forEach((cle) => { if (!corps[cle]) delete corps[cle]; });
            try {
              const r = await Api.put('/plateforme/psp', corps);
              notifier(r.message, r.psp && r.psp.configure ? 'ok' : 'info');
              m.remove();
              charger();
            } catch (e) { notifier(e.message, 'erreur'); }
          });
        },
      });
    }

    /* ------------------------------- Rendu ------------------------------- */
    function peindre() {
      const psp = donnees.psp || {};
      const formules = donnees.formules;
      const reductions = donnees.reductions;

      zone.innerHTML = `
        ${entetePage({
          titre: 'Abonnements & tarifs',
          sous: 'Durée et montant de chaque formule, réductions, augmentations et prestataire de paiement.',
          actions: `<button class="btn" id="t-psp">🔐 Prestataire de paiement</button>
                    <button class="btn" id="t-augmenter">📈 Augmenter les tarifs</button>
                    <button class="btn primaire" id="t-nouvelle">＋ Nouvelle formule</button>`,
        })}

        <div class="bandeau ${psp.configure ? 'abonnement' : 'abonnement attente'}">
          <b>${psp.configure ? '✅ Débit carte actif' : '⚠️ Débit carte non activé'}</b> —
          ${Fmt.echapper(psp.message || '')}
        </div>

        <div class="carte">
          <div class="carte-entete"><div><b>Moyens de paiement</b>
            <div class="sous">Activez ou désactivez chaque moyen : un moyen désactivé disparaît
              de la page de paiement des clients et toute demande le concernant est refusée.</div></div></div>
          <div class="grille g-3">
            ${(donnees.moyens || []).map((m) => `
              <label style="display:flex;align-items:center;gap:12px;border:1px solid var(--bord);
                            border-radius:12px;padding:12px;cursor:pointer;
                            border-left:5px solid ${m.couleur || 'var(--primary)'}">
                <input type="checkbox" data-moyen="${Fmt.echapper(m.code)}" ${m.actif ? 'checked' : ''}
                  style="width:auto">
                <span style="flex:1"><b>${Fmt.echapper(m.nom)}</b>
                  <div class="petit texte-muted">${m.actif ? 'Accepté' : 'Désactivé'}</div></span>
                <span class="badge ${m.actif ? 'ok' : 'neutre'}">${m.actif ? 'Actif' : 'Inactif'}</span>
              </label>`).join('') || '<div class="vide"><span>💳</span>Aucun moyen de paiement configuré.</div>'}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><div><b>Formules proposées aux clients</b>
            <div class="sous">Vous définissez la durée et le montant : rien n'est figé.</div></div>
            <div class="droite"><button class="btn petit primaire" id="t-nouvelle-2">＋ Ajouter</button></div></div>
          <div class="tableau-enveloppe"><table class="tableau">
            <thead><tr><th>Formule</th><th>Code</th><th class="num">Durée</th><th class="num">Montant</th>
              <th class="num">Équivalent / mois</th><th>État</th><th class="num">Actions</th></tr></thead>
            <tbody>
              ${formules.map((f) => `<tr>
                <td><b>${Fmt.echapper(f.libelle)}</b>${f.note ? `<div class="petit texte-muted">${Fmt.echapper(f.note)}</div>` : ''}</td>
                <td class="mono">${Fmt.echapper(f.code)}</td>
                <td class="num">${Fmt.nombre(f.duree_jours)} j<div class="petit texte-muted">${Fmt.echapper(f.duree_libelle)}</div></td>
                <td class="num"><b>${Fmt.fcfa(f.montant)}</b></td>
                <td class="num">${Fmt.fcfa(f.montant_par_mois)}</td>
                <td>${f.actif ? '<span class="badge ok">Active</span>' : '<span class="badge neutre">Désactivée</span>'}</td>
                <td class="num">
                  <button class="btn petit" data-formule="${Fmt.echapper(f.code)}">Modifier</button>
                  <button class="btn petit ${f.actif ? 'ambre' : 'primaire'}" data-bascule="${Fmt.echapper(f.code)}">${f.actif ? 'Désactiver' : 'Activer'}</button>
                  <button class="btn petit danger" data-suppr="${Fmt.echapper(f.code)}">Supprimer</button>
                </td></tr>`).join('')}
            </tbody>
          </table></div>
        </div>

        <div class="carte">
          <div class="carte-entete"><div><b>Codes de réduction</b>
            <div class="sous">Le client les saisit au moment de payer ; le montant est recalculé.</div></div>
            <div class="droite"><button class="btn petit primaire" id="t-reduc">＋ Nouveau code</button></div></div>
          ${reductions.length ? `<div class="tableau-enveloppe"><table class="tableau">
            <thead><tr><th>Code</th><th>Effet</th><th>Portée</th><th class="num">Utilisations</th>
              <th>Validité</th><th>État</th><th class="num">Actions</th></tr></thead>
            <tbody>
              ${reductions.map((r) => {
                const effet = (r.type === 'pourcentage' ? Math.abs(r.valeur) + ' %' : Fmt.fcfa(Math.abs(r.valeur)))
                  .replace('-', '');
                const cible = r.formule_code
                  ? (formules.find((f) => f.code === r.formule_code) || {}).libelle || r.formule_code
                  : 'Toutes les formules';
                return `<tr>
                  <td class="mono"><b>${Fmt.echapper(r.code)}</b>
                    ${r.libelle ? `<div class="petit texte-muted">${Fmt.echapper(r.libelle)}</div>` : ''}</td>
                  <td>${r.valeur >= 0
                    ? `<span class="badge ok">− ${effet}</span>`
                    : `<span class="badge ko">+ ${effet}</span>`}</td>
                  <td>${Fmt.echapper(cible)}</td>
                  <td class="num">${Fmt.nombre(r.utilisations)}${r.max_utilisations ? ' / ' + Fmt.nombre(r.max_utilisations) : ''}</td>
                  <td>${r.debut || r.fin ? `${Fmt.date(r.debut)} → ${Fmt.date(r.fin)}` : 'Permanent'}</td>
                  <td>${r.actif ? '<span class="badge ok">Actif</span>' : '<span class="badge neutre">Désactivé</span>'}</td>
                  <td class="num">
                    <button class="btn petit" data-reduc-edit="${r.id}">Modifier</button>
                    <button class="btn petit danger" data-reduc-suppr="${r.id}">Supprimer</button>
                  </td></tr>`;
              }).join('')}
            </tbody>
          </table></div>` : '<div class="vide"><span>🎟️</span>Aucun code de réduction pour l’instant.</div>'}
        </div>`;

      zone.querySelectorAll('[data-moyen]').forEach((caseACocher) => {
        caseACocher.addEventListener('change', () => {
          basculerMoyen(caseACocher.dataset.moyen, caseACocher.checked);
        });
      });

      const nouvelle = () => editerFormule(null);
      zone.querySelector('#t-nouvelle').addEventListener('click', nouvelle);
      zone.querySelector('#t-nouvelle-2').addEventListener('click', nouvelle);
      zone.querySelector('#t-augmenter').addEventListener('click', augmenter);
      zone.querySelector('#t-psp').addEventListener('click', configurerPsp);
      zone.querySelector('#t-reduc').addEventListener('click', () => editerReduction(null));

      zone.querySelectorAll('[data-formule]').forEach((b) => b.addEventListener('click', () => {
        editerFormule(formules.find((f) => f.code === b.dataset.formule));
      }));
      zone.querySelectorAll('[data-bascule]').forEach((b) => b.addEventListener('click', async () => {
        const f = formules.find((x) => x.code === b.dataset.bascule);
        try {
          const r = await Api.post('/plateforme/formules/' + encodeURIComponent(f.code) + '/statut', { actif: !f.actif });
          notifier(r.message);
          charger();
        } catch (e) { notifier(e.message, 'erreur'); }
      }));
      zone.querySelectorAll('[data-suppr]').forEach((b) => b.addEventListener('click', async () => {
        const code = b.dataset.suppr;
        const oui = await confirmer(`Supprimer définitivement la formule « ${code} » ?`, { danger: true, valider: 'Supprimer' });
        if (!oui) return;
        try { const r = await Api.del('/plateforme/formules/' + encodeURIComponent(code)); notifier(r.message); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      }));
      zone.querySelectorAll('[data-reduc-edit]').forEach((b) => b.addEventListener('click', () => {
        editerReduction(reductions.find((r) => String(r.id) === b.dataset.reducEdit));
      }));
      zone.querySelectorAll('[data-reduc-suppr]').forEach((b) => b.addEventListener('click', async () => {
        const oui = await confirmer('Supprimer ce code de réduction ?', { danger: true, valider: 'Supprimer' });
        if (!oui) return;
        try { const r = await Api.del('/plateforme/reductions/' + b.dataset.reducSuppr); notifier(r.message); charger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      }));
    }

    async function charger() {
      const [formules, moyens] = await Promise.all([
        Api.get('/plateforme/formules'),
        Api.get('/plateforme/moyens-paiement').catch(() => ({ moyens: [] })),
      ]);
      donnees = formules;
      donnees.moyens = moyens.moyens || [];
      if (!document.body.contains(zone)) return;
      peindre();
    }

    /** Active / désactive un moyen de paiement côté plateforme. */
    async function basculerMoyen(code, actif) {
      try {
        const r = await Api.put('/plateforme/moyens-paiement', { [code]: actif });
        notifier(r.message);
        charger();
      } catch (e) { notifier(e.message, 'erreur'); charger(); }
    }

    App.suivre({
      vue: 'plateforme-tarifs', types: ['plateforme'],
      rafraichir: () => { if (!document.querySelector('.voile')) charger(); },
    });
    await charger();
  },
});
