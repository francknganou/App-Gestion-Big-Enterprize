/* ==========================================================================
   app.js — Coquille de l'application : session, navigation, routage
   ========================================================================== */
const App = {
  vues: {},
  etat: {
    utilisateur: null,
    magasins: [],
    parametres: {},
    magasinActif: null,
    alertes: 0,
    abonnement: null,
    vue: 'dashboard',
    paramVue: null,
  },

  /* ------------------------------ Vues ------------------------------ */
  enregistrerVue(nom, def) {
    this.vues[nom] = Object.assign(
      { titre: nom, icone: '•', permissions: ['dashboard.consulter'], groupe: 'Général' }, def);
  },

  /** L'utilisateur possède-t-il cette permission ? */
  peut(permission) {
    const u = this.etat.utilisateur;
    if (!u) return false;
    // La console des entreprises clientes n'existe que pour le propriétaire de la plateforme.
    if (/^plateforme\./.test(permission) && !u.plateforme) return false;
    return u.permissions.includes('*') || u.permissions.includes(permission);
  },

  /** Possède-t-il au moins une des permissions listées ? */
  peutLune(...permissions) {
    return permissions.flat().some((p) => this.peut(p));
  },

  /** Peut-il voir les prix d'achat, marges et valeurs de stock ? */
  voitPrix() { return this.peut('prix.consulter'); },

  /** Affiche-t-il plusieurs boutiques (portée réseau) ou seulement la sienne ? */
  global() { return this.etat.utilisateur && this.etat.utilisateur.portee === 'reseau'; },

  /** Peut-il gérer des comptes utilisateurs (tous, ou ceux de sa boutique) ? */
  gereComptes() { return this.peutLune('utilisateurs.gerer', 'utilisateurs.gerer_boutique'); },

  /** Magasin de travail courant. */
  magasinCourant() {
    if (!this.global()) return this.etat.utilisateur ? this.etat.utilisateur.magasin_id : null;
    return this.etat.magasinActif || (this.etat.magasins[0] ? this.etat.magasins[0].id : null);
  },

  /* --------------------------- Démarrage --------------------------- */
  async demarrer() {
    if (!Api.token) return this.ecranInitial();
    try {
      const { utilisateur } = await Api.get('/auth/me');
      this.etat.utilisateur = utilisateur;

      /* Un compte dont l'email n'est pas confirmé reste bloqué sur l'écran de
         vérification : le serveur refuse déjà les autres routes (403). */
      if (utilisateur && utilisateur.email_verifie === 0) {
        this.etat.utilisateur.email_verifie = 0;
        await this.chargerContexte();
        this.rendreCoquille();
        this.etat.emailBloque = true;
        this.monter('verification');
        return;
      }
      this.etat.emailBloque = false;

      await this.chargerContexte();
      const hash = (location.hash || '#/dashboard').replace('#/', '');
      const [vue, param] = hash.split('/');
      this.rendreCoquille();
      this.monter(vue && this.vues[vue] ? vue : this.premiereVue(), param || null);
    } catch (e) {
      Api.definirToken(null);
      this.afficherConnexion();
    }
  },

  async chargerContexte() {
    const taches = [Api.get('/parametres').catch(() => ({}))];
    taches.push(Api.get('/abonnement/etat').catch(() => null));
    if (this.global()) taches.push(Api.get('/magasins').catch(() => []));
    else taches.push(Promise.resolve([]));
    if (this.peut('stock.consulter')) taches.push(Api.get('/stocks/alertes').catch(() => []));
    else taches.push(Promise.resolve([]));
    // Propriétaire : chiffres consolidés de toutes les entreprises clientes.
    if (this.etat.utilisateur && this.etat.utilisateur.plateforme) taches.push(Api.get('/plateforme/resume').catch(() => null));
    else taches.push(Promise.resolve(null));
    taches.push(Api.get('/messages').then((m) => m.non_lus || 0).catch(() => 0));
    const [params, abonnement, magasins, alertes, plateforme, messagesNb] = await Promise.all(taches);
    this.etat.messages_nb = messagesNb || 0;
    this.etat.plateforme = plateforme || null;
    this.etat.parametres = params || {};
    this.etat.abonnement = abonnement || null;
    this.etat.magasins = magasins || [];
    this.etat.alertes = Array.isArray(alertes) ? alertes.length : 0;
    if (this.global()) {
      const sauve = Number(Stockage.getItem('sp_magasin'));
      const valide = this.etat.magasins.some((m) => Number(m.id) === sauve);
      this.etat.magasinActif = valide ? sauve : (this.etat.magasins[0] ? Number(this.etat.magasins[0].id) : null);
    }
  },

  changerMagasin(id) {
    this.etat.magasinActif = Number(id);
    Stockage.setItem('sp_magasin', String(id));
    this.monter(this.etat.vue, this.etat.paramVue);
  },

  premiereVue() {
    const ordre = ['plateforme', 'plateforme-ventes', 'plateforme-classement', 'plateforme-tarifs',
      'plateforme-entreprises', 'plateforme-paiements',
      'dashboard', 'caisse', 'stocks', 'produits', 'transferts', 'achats', 'clients', 'fournisseurs', 'rapports', 'utilisateurs'];
    return ordre.find((v) => this.vues[v] && this.peutLune(this.vues[v].permissions))
      || Object.keys(this.vues).find((v) => this.peutLune(this.vues[v].permissions))
      || 'dashboard';
  },

  /** Lien WhatsApp d'assistance, sur le numéro défini par la plateforme. */
  lienAide(message) {
    const s = (this.etat.utilisateur && this.etat.utilisateur.support) || {};
    const numero = String(s.numero || '654324282').replace(/\D/g, '');
    const international = numero.startsWith('237') ? numero : '237' + numero;
    const texte = message || s.message || 'Bonjour, j’ai besoin d’aide sur Inventa GestyPro.';
    return 'https://wa.me/' + international + '?text=' + encodeURIComponent(texte);
  },

  /* ---------------------------- Connexion ---------------------------- */
  /** Première page vue : l'inscription si l'adresse le demande, sinon la connexion. */
  ecranInitial() {
    const demande = /^#\/?(inscription|creer-entreprise|creer_mon_entreprise)/.test(location.hash || '');
    if (demande && window.Inscription) return this.afficherInscription();
    return this.afficherConnexion();
  },

  /** Page publique de création d'entreprise (avant tout accès à l'application). */
  afficherInscription() {
    this.etat.utilisateur = null;
    if (!window.Inscription) {
      notifier('Page d\'inscription indisponible', 'erreur');
      return this.afficherConnexion();
    }
    if (location.hash !== '#/inscription') history.replaceState(null, '', '#/inscription');
    window.Inscription.rendre(document.getElementById('racine'));
  },

  afficherConnexion() {
    if (location.hash === '#/inscription') history.replaceState(null, '', '#/connexion');
    this.etat.utilisateur = null;
    document.getElementById('racine').innerHTML = `
      <div class="ecran-connexion">
        <div class="connexion-gauche">
          <div class="marque" style="display:block">
            <img class="logo-app-img" src="img/logo-app.jpeg" alt="Inventa GestyPro">
            <div><small>Gestion de réseau de magasins</small></div>
          </div>
          <div>
            <h1>Pilotez toute votre entreprise de shopping depuis un seul poste.</h1>
            <p class="accroche">Caisse, stocks multi-magasins, transferts, achats fournisseurs, clients, employés et rapports : tout est centralisé et mis à jour en temps réel.</p>
            <div class="fonctions">
              <div class="fonction"><span>🧾</span>Caisse rapide & tickets imprimables</div>
              <div class="fonction"><span>📦</span>Stock temps réel par magasin</div>
              <div class="fonction"><span>🔄</span>Transferts et réceptions automatisés</div>
              <div class="fonction"><span>📊</span>Tableaux de bord & rapports exportables</div>
            </div>
          </div>
          <div style="color:#7d8ca3;font-size:12px">© ${new Date().getFullYear()} Inventa GestyPro — v1.0</div>
        </div>
        <div class="connexion-droite">
          <div class="boite-connexion">
            <h2>Connexion à votre espace</h2>
            <p class="sous">Accédez à la gestion de votre réseau de magasins.</p>
            <form id="form-connexion">
              <div class="champ"><label>Adresse email</label>
                <input type="email" name="email" value="admin@shoppingplus.cm" required autocomplete="username"></div>
              <div class="champ"><label>Mot de passe</label>
                <input type="password" name="mot_de_passe" value="Admin@2026" required autocomplete="current-password"></div>
              <button class="btn primaire btn-bloc" type="submit" style="padding:11px">Se connecter</button>
              <div class="aide" id="erreur-connexion" style="color:#b91c1c;margin-top:10px"></div>
            </form>
            <div class="bloc-inscription">
              <p class="aide">Vous n'avez pas encore d'espace pour votre entreprise ?</p>
              <button class="btn btn-bloc" id="btn-inscription" style="padding:10px">🏬 Créer mon entreprise</button>
              <a class="btn btn-bloc" id="btn-aide-connexion" style="padding:10px;margin-top:8px"
                 href="https://wa.me/237654324282" target="_blank" rel="noopener">💬 Aide WhatsApp 654 32 42 82</a>
            </div>
            <div class="comptes-demo">
              <p>Comptes de démonstration (cliquez pour remplir) :</p>
              ${[
                ['Administrateur — accès total', 'admin@shoppingplus.cm', 'Admin@2026'],
                ['Gestionnaire réseau', 'gestion@shoppingplus.cm', 'Gest@2026'],
                ['Responsable boutique Akwa (crée ses comptes)', 'chef.akwa@shoppingplus.cm', 'Chef@2026'],
                ['Caissière Bastos — ventes journalières', 'caisse1@shoppingplus.cm', 'Caisse@2026'],
                ['Agent de stock Bafoussam — entrées/sorties', 'stock@shoppingplus.cm', 'Stock@2026'],
                ['Agent de réception Mvog-Mbi — entrées uniquement', 'reception.mvogmbi@shoppingplus.cm', 'Reception@2026'],
              ].map(([lib, e, m]) => `
                <button type="button" class="compte" data-email="${e}" data-mdp="${m}">
                  <b>${lib}</b><code>${m}</code>
                </button>`).join('')}
            </div>
          </div>
        </div>
      </div>`;

    const bInscription = document.getElementById('btn-inscription');
    if (bInscription) bInscription.onclick = () => this.afficherInscription();
    const bAide = document.getElementById('btn-aide-connexion');
    if (bAide) bAide.href = this.lienAide();

    document.querySelectorAll('.compte').forEach((b) => {
      b.onclick = () => {
        document.querySelector('[name=email]').value = b.dataset.email;
        document.querySelector('[name=mot_de_passe]').value = b.dataset.mdp;
        document.getElementById('form-connexion').requestSubmit();
      };
    });

    document.getElementById('form-connexion').onsubmit = async (e) => {
      e.preventDefault();
      const zone = document.getElementById('erreur-connexion');
      zone.textContent = '';
      const donnees = lireFormulaire(e.target);
      try {
        const r = await Api.post('/auth/login', donnees);
        Api.definirToken(r.token);
        this.etat.utilisateur = r.utilisateur;
        await this.chargerContexte();
        this.rendreCoquille();
        this.monter(this.premiereVue());
        this.demarrerTempsReel();
        notifier('Bienvenue ' + r.utilisateur.nom + ' !');
      } catch (err) {
        zone.textContent = err.message;
      }
    };
  },

  async deconnecter(silencieux = false) {
    this.arreterTempsReel();
    Api.definirToken(null);
    this.etat.utilisateur = null;
    document.getElementById('racine').innerHTML = '';
    if (!silencieux) notifier('Vous avez été déconnecté.', 'attente');
    this.afficherConnexion();
  },

  /* ----------------------------- Coquille ----------------------------- */
  /** Logo de l'entreprise (photo déposée à l'inscription), s'il existe. */
  logoEntreprise() {
    const u = this.etat.utilisateur || {};
    if (u.entreprise && u.entreprise.logo) return u.entreprise.logo;
    const p = this.etat.parametres || {};
    return p.logo || null;
  },

  rendreCoquille() {
    const u = this.etat.utilisateur;
    const p = this.etat.parametres || {};
    const groupes = {};
    /* Le propriétaire de la plateforme ne monitore que les entreprises clientes :
       il ne doit pas hériter des écrans de gestion d'une entreprise (caisse, stock…).
       Seuls la console plateforme et l'espace Aide lui sont ouverts. */
    const estPlateforme = !!(u && u.plateforme);
    Object.entries(this.vues).forEach(([nom, v]) => {
      if (estPlateforme && !nom.startsWith('plateforme') && !['aide','messages'].includes(nom)) return;
      if (!this.peutLune(v.permissions)) return;
      /* L'écran de vérification d'email ne sert que pendant le blocage :
         il n'a pas sa place dans le menu une fois l'adresse confirmée. */
      if (v.menu === false) return;
      (groupes[v.groupe] = groupes[v.groupe] || []).push([nom, v]);
    });
    const nav = Object.entries(groupes).map(([groupe, items]) => `
      <div class="groupe">${Fmt.echapper(groupe)}</div>
      ${items.map(([nom, v]) => `
        <a href="#/${nom}" data-vue="${nom}" class="${this.etat.vue === nom ? 'actif' : ''}">
          <span class="ic">${v.icone}</span><span>${Fmt.echapper(v.titre)}</span>
          ${nom === 'stocks' && this.etat.alertes ? `<span class="pastille">${this.etat.alertes}</span>` : ''}
          ${nom === 'plateforme-paiements' && (this.etat.plateforme || {}).attente_nb
            ? `<span class="pastille">${this.etat.plateforme.attente_nb}</span>` : ''}
          ${nom === 'messages' && this.etat.messages_nb ? `<span class="pastille">${this.etat.messages_nb}</span>` : ''}
        </a>`).join('')}`).join('');

    const selecteur = this.global()
      ? `<div class="selecteur-magasin"><span>🏬</span>
           <select id="sel-magasin">${options(this.etat.magasins, 'id', (m) => `${m.nom} — ${m.ville || ''}`, this.magasinCourant())}</select>
         </div>`
      : `<div class="selecteur-magasin"><span>🏬</span><b>${Fmt.echapper(u.magasin ? u.magasin.nom : 'Tous les magasins')}</b></div>`;

    document.getElementById('racine').innerHTML = `
      <div class="app">
        <aside class="barre-laterale" id="barre-laterale">
          <div class="bs-haut">
            <div class="bs-marque">
              <img class="logo-app-img" src="img/logo-app.jpeg" alt="Inventa GestyPro">
              <div><small>${u.plateforme ? 'Console propriétaire' : 'Manager v1.0'}</small></div>
            </div>
          </div>
          <div class="bs-entreprise">
            ${!u.plateforme && this.logoEntreprise() ? `<img class="logo-ent" src="${Fmt.echapper(this.logoEntreprise())}" alt="logo entreprise">` : ''}
            <b>${Fmt.echapper(u.plateforme ? 'Toutes les entreprises' : (p.nom_entreprise || 'Votre entreprise'))}</b>
            ${Fmt.echapper(u.plateforme
              ? `${Fmt.nombre((this.etat.plateforme || {}).nb_entreprises || 0)} entreprise(s) cliente(s)`
              : (p.telephone || ''))}
          </div>
          <nav>${nav}</nav>
          <div class="bs-bas">
            <div class="avatar">${Fmt.initiales(u.nom)}</div>
            <div class="qui"><b>${Fmt.echapper(u.nom)}</b><small>${Fmt.echapper(u.libelle_role || u.role)}</small></div>
            <button class="btn petit" id="btn-deconnexion" title="Se déconnecter">⏻</button>
          </div>
        </aside>

        <div class="zone-principale">
          <header class="barre-haut">
            <button class="btn menu-mobile" id="menu-mobile">☰</button>
            <div>
              <h1 id="titre-page">Tableau de bord</h1>
              <div class="chemin" id="chemin-page">${Fmt.echapper(p.nom_entreprise || '')}</div>
            </div>
            <div class="outils">
              <button class="btn petit" id="btn-theme" title="Thème clair / sombre">🌓</button>
              <select id="btn-langue" title="Langue" style="padding:5px 8px;border-radius:8px">
                ${Object.values(window.LANGUES || {}).map((l) =>
                  `<option value="${l.code}" ${window.I18n && I18n.langue === l.code ? 'selected' : ''}>${l.drapeau || ''}</option>`).join('')}
              </select>
              ${this.peutLune('abonnement.consulter', 'abonnement.gerer')
                ? '<a class="badge-abonnement" id="badge-abonnement" href="#/abonnement"></a>' : ''}
              ${selecteur}
              <div class="selecteur-magasin"><span>📅</span>${Fmt.echapper(Fmt.jourLong(Fmt.iso()))}</div>
              <button class="btn petit" id="btn-profil">👤 Mon profil</button>
            </div>
          </header>
          <div id="bandeau-abonnement"></div>
          <main class="contenu" id="contenu"></main>
        </div>
      </div>`;

    document.getElementById('btn-deconnexion').onclick = () => this.deconnecter();
    document.getElementById('menu-mobile').onclick = () =>
      document.getElementById('barre-laterale').classList.toggle('ouvert');
    document.getElementById('btn-profil').onclick = () => this.modaleProfil();

    /* --- Apparence : bascule de thème et choix de la langue depuis l'en-tête --- */
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
      btnTheme.onclick = () => {
        const suivant = window.I18n.theme === 'sombre' ? 'clair' : 'sombre';
        window.I18n.changerTheme(suivant);
        notifier(suivant === 'sombre' ? '🌙 Thème sombre' : '☀️ Thème clair');
      };
    }
    const btnLangue = document.getElementById('btn-langue');
    if (btnLangue) btnLangue.onchange = (ev) => window.I18n.changerLangue(ev.target.value);
    this.majBadgeAbonnement();
    const sel = document.getElementById('sel-magasin');
    if (sel) sel.onchange = (e) => this.changerMagasin(e.target.value);
    window.onhashchange = () => {
      const [vue, param] = (location.hash || '').replace('#/', '').split('/');
      // monter() met lui-même le hash à jour : on ignore le retour de flamme pour
      // la vue déjà affichée (sinon chaque écran est chargé deux fois).
      if (vue && this.vues[vue] && (vue !== this.etat.vue || (param || null) !== this.etat.paramVue)) {
        this.monter(vue, param || null);
      }
    };
  },

  /* --------------- Abonnement : badge d'en-tête + bandeau d'alerte --------------- */
  /** Libellé court du badge : « Essai gratuit · 8 j », « Actif · 23 j », « Expiré ». */
  infoAbonnement() {
    const a = this.etat.abonnement;
    if (!a) return null;
    if (a.expire) return { classe: 'ko', texte: '⛔ Abonnement expiré', titre: "Abonnement expiré — cliquez pour régler" };
    const jours = Fmt.nombre(a.jours_restants) + ' j';
    if (a.en_essai) return { classe: a.alerte_bientot ? 'attente' : 'ok', texte: '🎁 Essai gratuit · ' + jours,
      titre: `Essai gratuit — expire le ${Fmt.date(a.date_fin)}` };
    return { classe: a.alerte_bientot ? 'attente' : 'ok', texte: '💳 Abonnement · ' + jours,
      titre: `Abonnement actif jusqu'au ${Fmt.date(a.date_fin)}` };
  },

  majBadgeAbonnement() {
    const info = this.infoAbonnement();
    const badge = document.getElementById('badge-abonnement');
    if (badge && info) {
      badge.className = 'badge-abonnement ' + info.classe;
      badge.innerHTML = Fmt.echapper(info.texte);
      badge.title = info.titre;
    }
    const bandeau = document.getElementById('bandeau-abonnement');
    if (!bandeau || !info) return;
    const a = this.etat.abonnement;
    if (a.expire) {
      bandeau.innerHTML = `<div class="bandeau abonnement ko">
        <b>⛔ Abonnement expiré :</b> les ventes et les mouvements de stock sont suspendus.
        <a href="#/abonnement" style="color:inherit;text-decoration:underline">Régler maintenant</a></div>`;
    } else if (a.alerte_bientot) {
      bandeau.innerHTML = `<div class="bandeau abonnement attente">
        <b>⏳ Plus que ${Fmt.nombre(a.jours_restants)} jour(s)</b> avant l'échéance du ${Fmt.date(a.date_fin)}.
        <a href="#/abonnement" style="color:inherit;text-decoration:underline">Payer l'abonnement</a></div>`;
    } else {
      bandeau.innerHTML = '';
    }
  },

  /** Appelé par api.js quand le serveur répond 402 (abonnement expiré). */
  surAbonnementExpire(donnees) {
    if (donnees && donnees.abonnement) {
      this.etat.abonnement = Object.assign({}, this.etat.abonnement, donnees.abonnement, {
        statut: 'expire', statut_libelle: 'Abonnement expiré',
        expire: true, en_essai: false, jours_restants: 0, alerte_bientot: false,
      });
    }
    this.majBadgeAbonnement();
    if (document.querySelector('[data-alerte-abonnement]')) return;   // une seule fenêtre à la fois
    const m = ouvrirModale({
      titre: 'Abonnement expiré',
      largeur: 'etroite',
      contenu: `
        <div data-alerte-abonnement>
          <p style="margin:0 0 10px">${Fmt.echapper((donnees && donnees.erreur) || 'Votre abonnement a expiré : les opérations sont suspendues.')}</p>
          <div class="bloc-paiement">
            <div class="panier-total"><span>Formule mensuelle</span><b>${Fmt.fcfa((this.etat.abonnement || {}).tarifs ? this.etat.abonnement.tarifs.mensuel : 11500)}</b></div>
            <div class="panier-total"><span>Formule annuelle</span><b>${Fmt.fcfa((this.etat.abonnement || {}).tarifs ? this.etat.abonnement.tarifs.annuel : 132000)}</b></div>
          </div>
          <p class="aide" style="margin-top:10px">Réglez par Orange Money ou MTN Mobile Money : le montant, le numéro et le lien vous sont donnés sur la page Abonnement.</p>
        </div>`,
      pied: `<button class="btn" data-fermer>Fermer</button>
             <button class="btn primaire" data-payer>💳 Voir les moyens de paiement</button>`,
      surOuverture(mod, fermer) {
        mod.querySelector('[data-fermer]').onclick = fermer;
        mod.querySelector('[data-payer]').onclick = () => { fermer(); App.allerA('abonnement'); };
      },
    });
    return m;
  },

  /** Navigue vers une vue par programme. */
  allerA(nom) { if (location.hash === '#/' + nom) this.monter(nom, null); else location.hash = '#/' + nom; },

  /* --------------------------- Montage des vues --------------------------- */
  async monter(nom, param = null) {
    const def = this.vues[nom];
    if (!def) return notifier('Module introuvable', 'erreur');
    /* Tant que l'email n'est pas vérifié, seul l'écran de vérification est ouvert. */
    if (this.etat.emailBloque && nom !== 'verification') {
      notifier('Vérifiez votre adresse email pour continuer', 'erreur');
      return this.monter('verification');
    }
    if (!this.peutLune(def.permissions)) {
      return notifier(`Votre rôle ne permet pas d'accéder à « ${def.titre} »`, 'erreur');
    }
    this.etat.vue = nom;
    this.etat.paramVue = param;
    if (location.hash !== '#/' + nom) location.hash = '#/' + nom;
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('actif', a.dataset.vue === nom));
    document.getElementById('titre-page').textContent = def.titre;
    document.getElementById('chemin-page').innerHTML = this.etat.utilisateur && this.etat.utilisateur.plateforme
      ? `${Fmt.echapper(def.groupe)} · Console propriétaire`
      : `${Fmt.echapper(def.groupe)} · ${Fmt.echapper(this.etat.parametres.nom_entreprise || '')}`;
    // On remplace le conteneur par un élément neuf : une vue précédente dont le
    // chargement se termine après coup écrit alors dans un nœud détaché et ne peut
    // plus écraser la vue courante (ses tests `document.body.contains(zone)` échouent).
    const ancien = document.getElementById('contenu');
    const zone = ancien.cloneNode(false);
    zone.innerHTML = '<div class="vide">Chargement…</div>';
    ancien.replaceWith(zone);
    document.getElementById('barre-laterale').classList.remove('ouvert');
    try {
      await def.rendre(zone, param);
    } catch (e) {
      zone.innerHTML = `<div class="carte"><div class="carte-corps"><b>Une erreur est survenue :</b><br>${Fmt.echapper(e.message)}</div></div>`;
      notifier(e.message, 'erreur');
    }
  },

  /** Démarre l'actualisation automatique des écrans (si le module est chargé). */
  demarrerTempsReel() {
    if (window.TempsReel) window.TempsReel.demarrer();
  },

  /** Arrête l'actualisation automatique (déconnexion, écran d'inscription). */
  arreterTempsReel() {
    if (window.TempsReel) window.TempsReel.arreter();
  },

  /** Recharge les compteurs globaux (alertes) sans tout redessiner. */
  async rafraichirAlertes() {
    if (!this.peut('stock.consulter')) return;
    const a = await Api.get('/stocks/alertes').catch(() => []);
    this.etat.alertes = a.length;
    const lien = document.querySelector('nav a[data-vue="stocks"]');
    if (!lien) return;
    let pastille = lien.querySelector('.pastille');
    if (this.etat.alertes && !pastille) { pastille = document.createElement('span'); pastille.className = 'pastille'; lien.appendChild(pastille); }
    if (pastille) pastille.textContent = this.etat.alertes;
    if (!this.etat.alertes && pastille) pastille.remove();
  },

  /* ------------------------------- Profil ------------------------------- */
  modaleProfil() {
    const u = this.etat.utilisateur;
    ouvrirModale({
      titre: 'Mon profil',
      contenu: `
        <div class="grille-form">
          <div class="champ"><label>Nom</label><input value="${Fmt.echapper(u.nom)}" disabled></div>
          <div class="champ"><label>Email</label><input value="${Fmt.echapper(u.email)}" disabled></div>
          <div class="champ"><label>Profil</label><input value="${Fmt.echapper(u.libelle_role || u.role)}" disabled></div>
          <div class="champ"><label>Boutique d'affectation</label><input value="${Fmt.echapper(u.magasin ? u.magasin.nom : 'Toutes les boutiques (réseau)')}" disabled></div>
          <div class="champ plein"><label>Portée</label><input value="${u.portee === 'reseau' ? 'Réseau complet' : 'Boutique uniquement'}" disabled></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--line);margin:6px 0 16px">
        <h4 style="margin-bottom:10px">Changer mon mot de passe</h4>
        <div class="champ"><label>Ancien mot de passe</label><input type="password" name="ancien"></div>
        <div class="champ"><label>Nouveau mot de passe (6 caractères min.)</label><input type="password" name="nouveau"></div>
        <div class="champ"><label>Confirmer le nouveau mot de passe</label><input type="password" name="confirme"></div>`,
      pied: `<button class="btn" data-annuler>Fermer</button><button class="btn primaire" data-valider>Mettre à jour</button>`,
      surOuverture(m, fermer) {
        m.querySelector('[data-annuler]').onclick = fermer;
        m.querySelector('[data-valider]').onclick = async () => {
          const d = lireFormulaire(m);
          if (!d.nouveau || d.nouveau.length < 6) return notifier('Nouveau mot de passe trop court', 'erreur');
          if (d.nouveau !== d.confirme) return notifier('Les mots de passe ne correspondent pas', 'erreur');
          try {
            await Api.post('/auth/mot-de-passe', { ancien: d.ancien, nouveau: d.nouveau });
            notifier('Mot de passe mis à jour');
            fermer();
          } catch (e) { notifier(e.message, 'erreur'); }
        };
      },
    });
  },

  /* ---------------------- Application après vente ---------------------- */
  /** Ticket imprimable d'une vente. */
  async afficherTicket(venteId, { apresFermeture } = {}) {
    const v = await Api.get('/ventes/' + venteId);
    const p = v.parametres || {};
    const lignes = v.lignes.map((l) => `<tr>
        <td>${Fmt.echapper(l.nom_produit)}<br><small>${Fmt.nombre(l.quantite)} × ${Fmt.fcfa(l.prix_unitaire)}</small></td>
        <td style="text-align:right">${Fmt.fcfa(l.total, false)}</td></tr>`).join('');
    const html = `
      <div class="ticket" id="zone-ticket">
        <h3>${Fmt.echapper(p.nom_entreprise || '')}</h3>
        <div style="text-align:center;font-size:11.5px">${Fmt.echapper(p.adresse || '')}<br>Tél : ${Fmt.echapper(p.telephone || '')}<br>NIU : ${Fmt.echapper(p.contribuable || '')}</div>
        <hr>
        <div class="ligne"><span>Ticket</span><b>${Fmt.echapper(v.reference)}</b></div>
        <div class="ligne"><span>Date</span><span>${Fmt.dateH(v.created_at)}</span></div>
        <div class="ligne"><span>Magasin</span><span>${Fmt.echapper(v.magasin)}</span></div>
        <div class="ligne"><span>Caissier</span><span>${Fmt.echapper(v.caissier || '—')}</span></div>
        <div class="ligne"><span>Client</span><span>${Fmt.echapper(v.client || 'Client de passage')}</span></div>
        <hr>
        <table>${lignes}</table>
        <hr>
        <div class="ligne"><span>Sous-total</span><span>${Fmt.fcfa(v.sous_total, false)}</span></div>
        ${v.remise ? `<div class="ligne"><span>Remise</span><span>-${Fmt.fcfa(v.remise, false)}</span></div>` : ''}
        <div class="ligne" style="font-size:15px"><b>TOTAL</b><b>${Fmt.fcfa(v.total)}</b></div>
        <div class="ligne"><span>Paiement (${LIBELLE_MODE[v.mode_paiement] || v.mode_paiement})</span><span>${Fmt.fcfa(v.montant_paye, false)}</span></div>
        ${v.monnaie ? `<div class="ligne"><span>Monnaie rendue</span><span>${Fmt.fcfa(v.monnaie, false)}</span></div>` : ''}
        <hr>
        <div style="text-align:center;font-size:11px">${Fmt.echapper(p.message_ticket || 'Merci de votre visite !')}<br>Articles : ${Fmt.nombre(v.lignes.reduce((s, l) => s + l.quantite, 0))}</div>
      </div>`;
    const m = ouvrirModale({
      titre: 'Ticket ' + v.reference,
      largeur: 'etroite',
      contenu: html,
      pied: `<button class="btn" data-fermer>Fermer</button>
             <button class="btn ambre" data-imprimer>🖨️ Imprimer</button>`,
      surOuverture(modale, fermer) {
        modale.querySelector('[data-fermer]').onclick = () => { fermer(); if (apresFermeture) apresFermeture(); };
        modale.querySelector('[data-imprimer]').onclick = () => {
          const w = window.open('', '_blank', 'width=420,height=680');
          if (!w) return notifier("Autorisez les fenêtres pop-up pour imprimer", 'erreur');
          w.document.write(`<html><head><title>${Fmt.echapper(v.reference)}</title>
            <style>body{font-family:"Courier New",monospace;font-size:12.5px;margin:0;padding:10px}
            .ticket{width:300px;margin:0 auto}h3{text-align:center;font-size:15px;margin:0 0 4px}
            .ligne{display:flex;justify-content:space-between;gap:8px}
            hr{border:none;border-top:1px dashed #999;margin:8px 0}
            table{width:100%;border-collapse:collapse;font-size:12px}td{padding:2px 0;vertical-align:top}
            </style></head><body>${document.getElementById('zone-ticket').outerHTML}</body></html>`);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 250);
        };
      },
    });
    return m;
  },
};

window.App = App;
window.addEventListener('DOMContentLoaded', () => App.demarrer());
