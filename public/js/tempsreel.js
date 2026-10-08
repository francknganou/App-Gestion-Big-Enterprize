/* ==========================================================================
   tempsreel.js — Actualisation automatique des écrans ouverts

   Toutes les 15 secondes, l'application demande au serveur les opérations
   enregistrées depuis sa dernière lecture (GET /api/evenements?depuis=<id>).
   Si une boutique a encaissé une vente, reçu du stock, validé un transfert…
   les écrans concernés se rechargent d'eux-mêmes, sans recharger la page et
   sans interrompre ce que fait l'utilisateur.

   Principe : chaque vue annonce ce qui l'intéresse via App.suivre({ … }),
   le superviseur déclenche sa fonction de rafraîchissement quand un
   événement du bon type arrive. Le rafraîchissement est silencieux.
   ========================================================================== */

const TempsReel = {
  intervalle: 15000,          // 15 secondes : léger pour le serveur et la connexion
  minuteur: null,
  dernierId: 0,
  abonnements: [],            // { types:[…], vue, rafraichir, actif }
  enCours: false,
  derniereMaj: null,
  ecouteurs: [],              // fonctions appelées à chaque lot d'événements

  /** Démarre la surveillance (après connexion). */
  demarrer() {
    // On relance la boucle sans toucher aux abonnements des vues affichées.
    this.arreter(false);
    if (!Api.token) return;
    this.minuteur = setInterval(() => this.sonner(), this.intervalle);
    // Première lecture immédiate : on se cale sur l'état courant sans rien recharger.
    this.sonner(true);
  },

  /** Stoppe la surveillance (déconnexion, écran d'inscription). */
  arreter(viderAbonnements = true) {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
    if (viderAbonnements) this.abonnements = [];
  },

  /**
   * Inscrit un rafraîchissement. Retourne une fonction de désinscription.
   * @param {object} a { types:['vente','stock'], vue:'dashboard', rafraichir:fn }
   */
  suivre(a) {
    const types = Array.isArray(a.types) ? a.types : [a.types];
    // Une vue remontée (rechargement de page, double montage) remplace son
    // abonnement précédent : on évite les rafraîchissements en doublon.
    this.abonnements.forEach((x) => { if (x.vue && x.vue === (a.vue || null)) x.actif = false; });
    const ab = { types, vue: a.vue || null, rafraichir: a.rafraichir, actif: true };
    this.abonnements.push(ab);
    this.abonnements = this.abonnements.filter((x) => x.actif);
    return () => { ab.actif = false; };
  },

  /** Ignore les abonnements d'une vue qui n'est plus à l'écran. */
  nettoyer() {
    const vue = App.etat && App.etat.vue;
    this.abonnements = this.abonnements.filter((a) => a.actif && (!a.vue || a.vue === vue));
  },

  /** Interroge le serveur et déclenche les rafraîchissements utiles. */
  async sonner(silencieux = false) {
    if (!Api.token || this.enCours) return;
    if (typeof document !== 'undefined' && document.hidden) return;   // onglet fermé : on attend
    this.enCours = true;
    try {
      const r = await Api.get('/evenements', { depuis: this.dernierId, limite: 50 });
      if (!r) return;
      const nouveaux = r.evenements || [];
      this.dernierId = r.dernier_id || this.dernierId;
      this.derniereMaj = new Date();

      if (nouveaux.length && !silencieux) {
        this.nettoyer();
        const types = [...new Set(nouveaux.map((e) => e.type))];
        let declenches = 0;
        this.abonnements.forEach((ab) => {
          if (!ab.actif || typeof ab.rafraichir !== 'function') return;
          if (!ab.types.some((t) => types.includes(t) || t === '*')) return;
          try {
            const res = ab.rafraichir(nouveaux);
            if (res && typeof res.catch === 'function') res.catch(() => {});
            declenches++;
          } catch (e) { /* un écran en cours de démontage : on ignore */ }
        });
        this.ecouteurs.forEach((f) => { try { f(nouveaux, types); } catch (e) { /* ignore */ } });
        // Badge d'alertes de stock : toujours d'actualité après un mouvement.
        if (types.includes('stock') || types.includes('vente') || types.includes('transfert')) {
          App.rafraichirAlertes().catch(() => {});
        }
        App.majIndicateurTempsReel(declenches, nouveaux.length);
      } else if (silencieux) {
        App.majIndicateurTempsReel(0, 0);
      }
    } catch (e) {
      /* Réseau momentanément indisponible : on réessaiera au prochain tour. */
    } finally {
      this.enCours = false;
    }
  },

  /** Force une lecture immédiate (après une écriture locale, par exemple). */
  forcer() { this.sonner(); },
};

/* --------------------- Intégration à l'application --------------------- */

/** Indicateur discret « actualisé à l'instant » dans l'en-tête. */
App.majIndicateurTempsReel = function (declenches, nbEvenements) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('indicateur-temps-reel');
  if (!el) {
    const barre = document.querySelector('.barre-haut .droite') || document.querySelector('.barre-haut');
    if (!barre) return;
    el = document.createElement('span');
    el.id = 'indicateur-temps-reel';
    el.className = 'petit texte-muted';
    el.title = 'Les écrans se rafraîchissent automatiquement toutes les 15 secondes';
    barre.appendChild(el);
  }
  const heure = TempsReel.derniereMaj
    ? TempsReel.derniereMaj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';
  el.textContent = nbEvenements
    ? `🔄 ${nbEvenements} opération(s) intégrée(s) · ${heure}`
    : `🔄 à jour · ${heure}`;
  el.classList.remove('clignote');
  if (nbEvenements) {
    // Léger fondu pour signaler le changement sans interrompre l'utilisateur.
    void el.offsetWidth;
    el.classList.add('clignote');
  }
};

/** La vue courante annonce ce qu'elle veut suivre. */
App.suivre = function (a) { return TempsReel.suivre(a); };

/* Au rechargement de la page, la session est rétablie par App.demarrer() :
   on surveille ce moment pour (re)démarrer la boucle. */
if (App.etat && App.etat.utilisateur) TempsReel.demarrer();
const _demarrerApp = App.demarrer.bind(App);
App.demarrer = async function () {
  const r = await _demarrerApp();
  if (App.etat && App.etat.utilisateur) TempsReel.demarrer();
  return r;
};

/* Quand un écran en remplace un autre, on retire les abonnements de l'écran
   quitté — après le montage, pour ne pas effacer ceux que la nouvelle vue vient
   de prendre. Les abonnements sans vue (globaux) sont conservés. */
const _monterApp = App.monter.bind(App);
App.monter = async function (nom, param) {
  const precedent = App.etat ? App.etat.vue : null;
  const r = await _monterApp(nom, param);
  if (precedent && precedent !== nom) {
    TempsReel.abonnements = TempsReel.abonnements.filter((a) => a.actif && a.vue !== precedent);
  }
  return r;
};

window.TempsReel = TempsReel;
