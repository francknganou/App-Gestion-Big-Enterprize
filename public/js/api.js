/* ==========================================================================
   api.js — Client HTTP de l'application
   ========================================================================== */

/**
 * Stockage du jeton : localStorage quand il est disponible, sinon mémoire
 * (certains aperçus / iframes restreintes bloquent l'accès au stockage).
 */
const Stockage = (() => {
  try {
    const t = '__sp_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch (e) {
    const memoire = {};
    return {
      getItem: (k) => (k in memoire ? memoire[k] : null),
      setItem: (k, v) => { memoire[k] = String(v); },
      removeItem: (k) => { delete memoire[k]; },
    };
  }
})();

const Api = {
  base: '/api',
  token: Stockage.getItem('sp_token') || null,

  definirToken(t) {
    this.token = t;
    if (t) Stockage.setItem('sp_token', t); else Stockage.removeItem('sp_token');
  },

  async requete(methode, chemin, corps) {
    const options = { method: methode, headers: { 'Content-Type': 'application/json' } };
    if (this.token) options.headers.Authorization = 'Bearer ' + this.token;
    if (corps !== undefined) options.body = JSON.stringify(corps);
    let reponse;
    try {
      reponse = await fetch(this.base + chemin, options);
    } catch (e) {
      throw new Error('Serveur injoignable. Vérifiez que le service est démarré.');
    }
    if (reponse.status === 401) {
      Api.definirToken(null);
      if (window.App) App.deconnecter(true);
      throw new Error('Session expirée, veuillez vous reconnecter.');
    }
    const texte = await reponse.text();
    let donnees = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { donnees = { erreur: texte }; }
    if (reponse.status === 402) {
      // Abonnement expiré : le serveur suspend les opérations et renvoie la marche à suivre.
      if (window.App && App.surAbonnementExpire) App.surAbonnementExpire(donnees);
    }
    if (!reponse.ok) throw new Error((donnees && donnees.erreur) || 'Erreur inattendue (' + reponse.status + ')');
    return donnees;
  },

  get(c, q) { return this.requete('GET', c + (q ? '?' + new URLSearchParams(q) : '')); },
  post(c, b) { return this.requete('POST', c, b || {}); },
  put(c, b) { return this.requete('PUT', c, b || {}); },
  del(c) { return this.requete('DELETE', c); },

  /** Téléchargement d'un fichier protégé par jeton (export CSV). */
  async telecharger(chemin, nomFichier) {
    const reponse = await fetch(this.base + chemin, { headers: { Authorization: 'Bearer ' + this.token } });
    if (!reponse.ok) throw new Error('Export impossible');
    const blob = await reponse.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
};
