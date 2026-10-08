/* =====================================================================
   Vérification de l'adresse email — écran bloquant après l'inscription.
   L'administrateur qui vient de créer son entreprise doit saisir le code
   reçu par email avant d'accéder au reste de l'application.
   ===================================================================== */
App.enregistrerVue('verification', {
  titre: 'Vérification de l’email',
  icone: '✉️',
  permissions: ['dashboard.consulter'],
  groupe: 'Compte',
  /* Écran de passage : absent du menu, atteint automatiquement si besoin. */
  menu: false,

  async rendre(zone) {
    /* Le jeton arrive depuis le lien reçu par email : #/verification?jeton=XXXX */
    const jeton = new URLSearchParams((location.hash.split('?')[1] || '')).get('jeton');

    let etat = { verifie: false, email: '', smtp_configure: false };
    try {
      etat = await Api.get('/entreprises/verification');
    } catch (e) {
      zone.innerHTML = `<div class="carte"><div class="carte-corps">
        <div class="bandeau erreur">Impossible de lire l'état de vérification : ${Fmt.echapper(e.message)}</div>
      </div></div>`;
      return;
    }

    if (etat.verifie) {
      zone.innerHTML = `<div class="centre-plein">
        <div class="carte carte-verification">
          <div class="carte-entete"><h3>✉️ Adresse email confirmée</h3>
            <div class="droite"><span class="badge ok">Vérifié</span></div></div>
          <div class="carte-corps">
            <div class="bandeau ok" style="margin-bottom:14px">
              <b>Votre adresse email est confirmée : votre espace est pleinement actif.</b>
              <div style="margin-top:4px">Vous pouvez désormais utiliser tous les modules de l'application
                et recevoir les notifications liées à votre compte.</div>
            </div>
            <div class="bloc-paiement">
              <div class="panier-total"><span>Adresse confirmée</span><b class="mono">${Fmt.echapper(etat.email)}</b></div>
              <div class="panier-total"><span>Entreprise</span>
                <b>${Fmt.echapper((App.etat.parametres && App.etat.parametres.nom_entreprise) || '—')}</b></div>
              <div class="panier-total"><span>Compte</span>
                <b>${Fmt.echapper((App.etat.utilisateur && App.etat.utilisateur.nom) || '—')}</b></div>
              <div class="panier-total"><span>Confirmé le</span>
                <b>${etat.verifie_at ? Fmt.dateH(etat.verifie_at) : '—'}</b></div>
              <div class="panier-total"><span>Serveur d'envoi</span>
                <b>${etat.smtp_configure ? 'Configuré' : 'Non configuré'}</b></div>
            </div>
            <div class="aide" style="margin-top:12px">
              Les identifiants des comptes que vous créez sont envoyés par email à leurs titulaires.
            </div>
            <div class="barre-outils" style="margin-top:14px;justify-content:center">
              <button class="btn primaire" id="v-continuer">🚀 Ouvrir mon espace</button>
            </div>
          </div>
        </div>
      </div>`;
      zone.querySelector('#v-continuer').onclick = () => App.allerA(App.premiereVue());
      return;
    }

    zone.innerHTML = `<div class="centre-plein">
      <div class="carte carte-verification">
        <div class="carte-entete"><h3>✉️ Vérifiez votre adresse email</h3></div>
        <div class="carte-corps">
          <div class="bandeau ambre">
            <b>Votre compte est limité tant que votre email n'est pas confirmé.</b>
            <div style="margin-top:4px">Saisissez le code à 6 chiffres envoyé à
              <b class="mono">${Fmt.echapper(etat.email)}</b>.</div>
          </div>

          ${etat.smtp_configure ? '' : `
          <div class="aide" style="margin-top:10px">
            ⚠️ Aucun serveur d'envoi n'est configuré : l'email n'est pas parti.
            Le code est disponible dans la console du propriétaire, onglet « E-mails ».
          </div>`}

          <form id="form-verification" style="margin-top:14px">
            <div class="champ">
              <label>Code de vérification</label>
              <input name="code" required inputmode="numeric" autocomplete="one-time-code"
                     maxlength="6" placeholder="Ex. 428913" style="letter-spacing:6px;text-align:center;font-size:20px">
            </div>
            <div class="barre-outils">
              <button class="btn primaire" type="submit">✅ Valider mon email</button>
              <button class="btn" type="button" id="v-renvoyer">🔁 Renvoyer le code</button>
            </div>
          </form>

          <div id="v-message"></div>

          <div class="aide" style="margin-top:16px">
            Le lien reçu par email fonctionne aussi : ouvrez-le simplement dans ce navigateur.
          </div>
        </div>
      </div>
    </div>`;

    const msg = zone.querySelector('#v-message');

    /* Le jeton contenu dans le lien remplace la saisie manuelle. */
    if (jeton) {
      try {
        await Api.post('/entreprises/verification/valider', { code: jeton });
        App.etat.emailBloque = false;
        if (App.etat.utilisateur) App.etat.utilisateur.email_verifie = 1;
        msg.innerHTML = '<div class="bandeau ok" style="margin-top:12px"><b>✅ Email vérifié</b></div>';
        await App.chargerContexte().catch(() => {});
        setTimeout(() => App.monter(App.premiereVue()), 700);
        return;
      } catch (e) {
        msg.innerHTML = `<div class="bandeau erreur" style="margin-top:12px">${Fmt.echapper(e.message)}</div>`;
      }
    }

    zone.querySelector('#form-verification').onsubmit = async (ev) => {
      ev.preventDefault();
      const code = (ev.target.querySelector('[name=code]').value || '').trim();
      msg.innerHTML = '';
      try {
        await Api.post('/entreprises/verification/valider', { code });
        /* Lève le blocage et rafraîchit le profil local (email_verifie). */
        App.etat.emailBloque = false;
        if (App.etat.utilisateur) App.etat.utilisateur.email_verifie = 1;
        msg.innerHTML = '<div class="bandeau ok" style="margin-top:12px"><b>✅ Email vérifié — ouverture de votre espace…</b></div>';
        notifier('Adresse email vérifiée');
        await App.chargerContexte().catch(() => {});
        setTimeout(() => App.monter(App.premiereVue()), 700);
      } catch (e) {
        msg.innerHTML = `<div class="bandeau erreur" style="margin-top:12px">${Fmt.echapper(e.message)}</div>`;
      }
    };

    zone.querySelector('#v-renvoyer').onclick = async (ev) => {
      ev.preventDefault();
      try {
        const r = await Api.post('/entreprises/verification/renvoyer', {});
        msg.innerHTML = `<div class="bandeau ${r.statut_envoi === 'erreur' ? 'erreur' : 'ok'}" style="margin-top:12px">
          <b>${r.statut_envoi === 'erreur' ? "⚠️ Envoi en échec" : '🔁 Nouveau code envoyé'}</b>
          <div style="margin-top:4px">${Fmt.echapper(r.email)}</div></div>`;
        notifier('Code renvoyé');
      } catch (e) {
        msg.innerHTML = `<div class="bandeau erreur" style="margin-top:12px">${Fmt.echapper(e.message)}</div>`;
      }
    };
  },
});
