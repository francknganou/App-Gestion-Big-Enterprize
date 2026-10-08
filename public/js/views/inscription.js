/* ==========================================================================
   Page publique : création de l'entreprise (inscription)
   L'administrateur renseigne l'email professionnel, son nom et prénom, le nom
   de l'entreprise, la date de création, le NIU et son logo (photo).
   ========================================================================== */

const Inscription = {
  etat: { etape: 1, logo: null, infos: {} },

  /** Réduit l'image choisie (700 Ko max en base) et la convertit en data URL. */
  lireLogo(fichier) {
    return new Promise((resoudre, rejeter) => {
      if (!fichier) return rejeter(new Error('Aucun fichier sélectionné'));
      if (!/^image\//.test(fichier.type)) return rejeter(new Error('Choisissez une image (JPG, PNG…)'));
      const lecteur = new FileReader();
      lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible'));
      lecteur.onload = () => {
        const img = new Image();
        img.onerror = () => rejeter(new Error('Image illisible'));
        img.onload = () => {
          const max = 320;
          const ratio = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * ratio);
          c.height = Math.round(img.height * ratio);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resoudre(c.toDataURL('image/png'));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  },

  async rendre(racine) {
    const etat = await Api.get('/entreprises/etat').catch(() => null);
    const t = (etat && etat.tarifs) || { mensuel: 11500, annuel: 132000, essai_jours: 7 };
    const support = (etat && etat.support) || { numero: '654324282', lien: 'https://wa.me/237654324282', affiche: '654 32 42 82' };
    const wa = support.lien + '?text=' + encodeURIComponent(support.message || 'Bonjour, j’ai besoin d’aide.');
    this.etat = { etape: 1, logo: null, infos: {} };

    racine.innerHTML = `
      <div class="ecran-connexion inscription">
        <div class="connexion-gauche">
          <div class="marque" style="display:block">
            <img class="logo-app-img" src="img/logo-app.jpeg" alt="Inventa GestyPro">
            <div><small>Gestion de réseau de magasins</small></div>
          </div>
          <div>
            <h1>Créez l'espace de votre entreprise en 2 minutes.</h1>
            <p class="accroche">Vos boutiques, vos caissiers, vos stocks et vos rapports — dans un seul espace sécurisé.
              <b>${Fmt.nombre(t.essai_jours)} jours d'essai gratuit</b>, sans carte bancaire.</p>
            <div class="fonctions">
              <div class="fonction"><span>🏬</span>Autant de boutiques que vous voulez</div>
              <div class="fonction"><span>🔐</span>Un caissier(ère) par boutique, avec les droits que vous choisissez</div>
              <div class="fonction"><span>📱</span>Paiement Orange Money / MTN MoMo : ${Fmt.fcfa(t.mensuel)} par mois ou ${Fmt.fcfa(t.annuel)} par an</div>
              <div class="fonction"><span>💬</span>Assistance WhatsApp : ${Fmt.echapper(support.affiche || support.numero)}</div>
            </div>
          </div>
          <div style="color:#7d8ca3;font-size:12px">© ${new Date().getFullYear()} Inventa GestyPro</div>
        </div>

        <div class="connexion-droite">
          <div class="boite-connexion" style="max-width:560px">
            <h2>Créer mon entreprise</h2>
            <p class="sous">Ces informations créent votre compte administrateur et votre espace de travail.</p>
            <form id="form-inscription">
              <div class="grille-form">
                <div class="champ plein">
                  <label>Logo de l'entreprise (photo)</label>
                  <div class="zone-logo">
                    <div class="logo-apercu" id="apercu-logo">🏬</div>
                    <div>
                      <input type="file" id="champ-logo" accept="image/*" style="font-size:12.5px">
                      <div class="aide">JPG ou PNG — l'image apparaît sur vos tickets et en haut de l'application.</div>
                    </div>
                  </div>
                </div>
                <div class="champ plein"><label>Nom de l'entreprise *</label>
                  <input name="nom" placeholder="Ex. SUPERMARCHÉ DOUALA NORD SARL" required></div>
                <div class="champ"><label>Email professionnel *</label>
                  <input type="email" name="email" placeholder="direction@monentreprise.cm" required autocomplete="username">
                  <div class="aide" id="aide-email"></div></div>
                <div class="champ"><label>NIU (numéro contribuable)</label>
                  <input name="niu" placeholder="Ex. M091234567890P"></div>
                <div class="champ"><label>Nom du responsable *</label><input name="nom_contact" required></div>
                <div class="champ"><label>Prénom du responsable *</label><input name="prenom_contact" required></div>
                <div class="champ"><label>Date de création de l'entreprise</label><input type="date" name="date_creation"></div>
                <div class="champ"><label>Téléphone</label><input name="telephone" placeholder="Ex. 699 12 34 56"></div>
                <div class="champ"><label>Ville</label><input name="ville" placeholder="Ex. Douala"></div>
                <div class="champ"><label>Adresse</label><input name="adresse" placeholder="Ex. Boulevard de la Liberté"></div>
                <div class="champ"><label>Nom de la première boutique</label>
                  <input name="boutique" placeholder="Par défaut : Boutique principale <nom>"></div>
                <div class="champ"><label>Mot de passe *</label>
                  <input type="password" name="mot_de_passe" placeholder="6 caractères minimum" required autocomplete="new-password"></div>
                <div class="champ"><label>Confirmer le mot de passe *</label>
                  <input type="password" name="confirmation" required autocomplete="new-password"></div>
              </div>
              <button class="btn primaire btn-bloc" type="submit" style="padding:11px">🏬 Créer mon entreprise et mon compte</button>
              <div class="aide" style="text-align:center;margin-top:8px">
                ${Fmt.nombre(t.essai_jours)} jours d'essai gratuit inclus — aucun paiement demandé aujourd'hui.
              </div>
              <div class="aide" id="erreur-inscription" style="color:#b91c1c;margin-top:8px"></div>
            </form>
            <div style="text-align:center;margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button class="btn" id="btn-vers-connexion">J'ai déjà un compte — Se connecter</button>
              <a class="btn" href="${Fmt.echapper(wa)}" target="_blank" rel="noopener">💬 Aide WhatsApp ${Fmt.echapper(support.affiche || '')}</a>
            </div>
          </div>
        </div>
      </div>`;

    const champLogo = document.getElementById('champ-logo');
    champLogo.onchange = async (e) => {
      try {
        this.etat.logo = await Inscription.lireLogo(e.target.files[0]);
        document.getElementById('apercu-logo').innerHTML =
          `<img src="${this.etat.logo}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px">`;
      } catch (err) { notifier(err.message, 'erreur'); }
    };

    // Vérification de la disponibilité de l'email
    const champEmail = document.querySelector('[name=email]');
    let minuteur = null;
    champEmail.oninput = () => {
      clearTimeout(minuteur);
      const aide = document.getElementById('aide-email');
      aide.textContent = '';
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(champEmail.value)) return;
      minuteur = setTimeout(async () => {
        try {
          const r = await Api.get('/entreprises/email-disponible', { email: champEmail.value });
          aide.textContent = r.disponible ? '✅ Email disponible' : '⛔ Cet email est déjà utilisé';
          aide.style.color = r.disponible ? 'var(--ok)' : 'var(--bad)';
        } catch (e) { /* silencieux */ }
      }, 400);
    };

    document.getElementById('btn-vers-connexion').onclick = () => App.afficherConnexion();
    document.getElementById('form-inscription').onsubmit = async (e) => {
      e.preventDefault();
      const zone = document.getElementById('erreur-inscription');
      zone.textContent = '';
      const d = lireFormulaire(e.target);
      if (!d.mot_de_passe || d.mot_de_passe.length < 6) return (zone.textContent = 'Le mot de passe doit contenir au moins 6 caractères');
      if (d.mot_de_passe !== d.confirmation) return (zone.textContent = 'Les deux mots de passe ne correspondent pas');
      delete d.confirmation;
      d.logo = this.etat.logo;
      const bouton = e.target.querySelector('button[type=submit]');
      bouton.disabled = true;
      bouton.textContent = 'Création de votre espace…';
      try {
        const r = await Api.post('/entreprises/inscription', d);
        Api.definirToken(r.token);
        App.etat.utilisateur = null;
        const me = await Api.get('/auth/me');
        App.etat.utilisateur = me.utilisateur;
        await App.chargerContexte();
        App.rendreCoquille();

        /* L'email de vérification est bloquant : le compte reste sur l'écran de
           vérification jusqu'au clic sur le lien (ou la saisie du code reçu). */
        const v = r.verification || {};
        if (v.requise && me.utilisateur.email_verifie === 0) {
          App.etat.emailBloque = true;
          history.replaceState(null, '', '#/verification');
          App.monter('verification');
          notifier(v.smtp
            ? `Un email de vérification a été envoyé à ${v.email}`
            : 'Vérifiez votre adresse email pour activer votre espace', 'info');
        } else {
          App.etat.emailBloque = false;
          history.replaceState(null, '', '#/dashboard');
          App.monter('dashboard');
          notifier(r.message || 'Votre entreprise est créée !');
        }
      } catch (err) {
        zone.textContent = err.message;
        bouton.disabled = false;
        bouton.textContent = '🏬 Créer mon entreprise et mon compte';
      }
    };
    window.onhashchange = null;
  },
};

window.Inscription = Inscription;
