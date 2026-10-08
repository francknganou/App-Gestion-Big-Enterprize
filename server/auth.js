/**
 * auth.js — Authentification (JWT) et autorisations fines.
 *
 * Les droits ne sont plus figés dans le code : chaque rôle est un ensemble de
 * permissions stocké en base (table `roles`). On peut donc créer des rôles
 * personnalisés (ex. « Agent de réception », « Vendeur boutique ») et les
 * attribuer aux comptes, boutique par boutique.
 *
 * Portée d'un rôle :
 *   - reseau  : voit tous les magasins (administrateur, gestionnaire)
 *   - magasin : limité au magasin d'affectation de l'utilisateur
 */
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const SECRET = process.env.JWT_SECRET || 'inventa-gestypro-secret-dev-2026';
const DUREE = '12h';

/* --------------------------------------------------------------------------
   Catalogue des permissions proposées dans l'interface
   -------------------------------------------------------------------------- */
const CATALOGUE_PERMISSIONS = {
  'Tableau de bord': {
    'dashboard.consulter': 'Consulter le tableau de bord',
  },
  'Ventes & caisse': {
    'caisse.utiliser': 'Enregistrer des ventes (caisse)',
    'ventes.consulter': 'Consulter l’historique des ventes',
    'ventes.annuler': 'Annuler une vente',
  },
  'Produits': {
    'produits.consulter': 'Consulter le catalogue produits',
    'produits.gerer': 'Créer / modifier / supprimer des produits et catégories',
    'prix.consulter': 'Voir les prix d’achat, marges et valeurs de stock',
  },
  'Stocks': {
    'stock.consulter': 'Consulter l’état des stocks',
    'stock.entree': 'Enregistrer des ENTRÉES de stock (réceptions, approvisionnements)',
    'stock.sortie': 'Enregistrer des SORTIES de stock (pertes, casse, usage interne)',
    'stock.ajuster': 'Ajuster le stock après inventaire',
    'journal.consulter': 'Consulter le journal des mouvements',
    'inventaire.consulter': 'Consulter les inventaires et leurs écarts',
    'inventaire.gerer': 'Créer, saisir et clôturer un inventaire',
  },
  'Transferts': {
    'transferts.consulter': 'Consulter les transferts entre magasins',
    'transferts.creer': 'Créer un transfert entre magasins',
    'transferts.valider': 'Valider ou annuler un transfert',
  },
  'Achats fournisseurs': {
    'achats.consulter': 'Consulter les commandes fournisseurs',
    'achats.creer': 'Créer une commande fournisseur',
    'achats.receptionner': 'Réceptionner une commande (entrée en stock)',
  },
  'Tiers': {
    'clients.consulter': 'Consulter le fichier clients',
    'clients.gerer': 'Créer / modifier des clients',
    'fournisseurs.consulter': 'Consulter les fournisseurs',
    'fournisseurs.gerer': 'Créer / modifier des fournisseurs',
    'employes.consulter': 'Consulter le fichier du personnel',
    'employes.gerer': 'Gérer les employés',
    'salaires.consulter': 'Consulter les salaires et la masse salariale',
    'salaires.gerer': 'Enregistrer les versements de salaire',
    'recrutement.consulter': 'Consulter les candidatures et les dossiers',
    'recrutement.gerer': 'Gérer les candidatures et téléverser les documents',
  },
  'Pilotage': {
    'rapports.consulter': 'Consulter les rapports et exporter les données',
  },
  'Plateforme (propriétaire)': {
    'plateforme.consulter': 'Voir la console des entreprises clientes',
    'plateforme.gerer': 'Gérer les entreprises clientes (suspension, abonnement, suppression)',
  },
  'Abonnement & facturation': {
    'abonnement.consulter': 'Consulter l’état de l’abonnement et payer',
    'abonnement.gerer': 'Gérer l’abonnement : valider les paiements, tarifs, essai gratuit',
  },
  'Administration': {
    'magasins.consulter': 'Consulter les magasins',
    'magasins.gerer': 'Créer / modifier les magasins',
    'utilisateurs.gerer_boutique': 'Créer et gérer les comptes de sa boutique',
    'utilisateurs.gerer': 'Créer et gérer tous les comptes utilisateurs',
    'roles.gerer': 'Créer et modifier les rôles et permissions',
    'parametres.gerer': 'Modifier les paramètres de l’entreprise',
  },
};

const TOUTES_PERMISSIONS = Object.values(CATALOGUE_PERMISSIONS).flatMap((g) => Object.keys(g));

/* --------------------------------------------------------------------------
   Rôles livrés avec l'application (synchronisés au démarrage)
   -------------------------------------------------------------------------- */
const ROLES_SYSTEME = [
  {
    code: 'super_admin',
    nom: 'Propriétaire de la plateforme',
    description: 'Surveille toutes les entreprises clientes, leurs magasins, leurs comptes et leurs paiements.',
    portee: 'plateforme',
    attribuable_boutique: 0,
    permissions: ['*'],
  },
  {
    code: 'admin',
    nom: 'Administrateur général',
    description: 'Accès total : réseau, comptes utilisateurs, rôles et paramètres.',
    portee: 'reseau',
    attribuable_boutique: 0,
    permissions: ['*'],
  },
  {
    code: 'gestionnaire',
    nom: 'Gestionnaire réseau',
    description: 'Pilote tout le réseau (ventes, stocks, achats, tiers, rapports) et peut créer les comptes de boutique.',
    portee: 'reseau',
    attribuable_boutique: 0,
    permissions: TOUTES_PERMISSIONS.filter((p) => !['roles.gerer', 'utilisateurs.gerer', 'magasins.gerer', 'abonnement.gerer'].includes(p)),
  },
  {
    code: 'chef_boutique',
    nom: 'Responsable de boutique',
    description: 'Gère sa boutique de A à Z, y compris les comptes (vendeurs, agents de stock) de son magasin.',
    portee: 'magasin',
    attribuable_boutique: 0,
    permissions: [
      'dashboard.consulter', 'caisse.utiliser', 'ventes.consulter', 'ventes.annuler',
      'abonnement.consulter',
      'produits.consulter', 'prix.consulter',
      'stock.consulter', 'stock.entree', 'stock.sortie', 'stock.ajuster', 'journal.consulter',
      'inventaire.consulter',
      'transferts.consulter', 'transferts.creer', 'transferts.valider',
      'achats.consulter', 'achats.creer', 'achats.receptionner',
      'clients.consulter', 'clients.gerer', 'fournisseurs.consulter', 'fournisseurs.gerer',
      'employes.consulter', 'employes.gerer',
      'salaires.consulter', 'salaires.gerer',
      'recrutement.consulter', 'recrutement.gerer',
      'rapports.consulter', 'magasins.consulter',
      'utilisateurs.gerer_boutique',
    ],
  },
  {
    code: 'caissier',
    nom: 'Caissier / Vendeur',
    description: 'Enregistre les ventes journalières de sa boutique et gère les clients au comptoir.',
    portee: 'magasin',
    attribuable_boutique: 1,
    permissions: [
      'dashboard.consulter', 'caisse.utiliser', 'ventes.consulter', 'abonnement.consulter',
      'produits.consulter', 'prix.consulter', 'stock.consulter',
      'clients.consulter', 'clients.gerer',
    ],
  },
  {
    code: 'magasinier',
    nom: 'Agent de stock (entrées + sorties)',
    description: 'Enregistre les entrées, les sorties et les inventaires de sa boutique. Aucun prix ne lui est demandé.',
    portee: 'magasin',
    attribuable_boutique: 1,
    permissions: [
      'dashboard.consulter', 'abonnement.consulter', 'produits.consulter',
      'stock.consulter', 'stock.entree', 'stock.sortie', 'stock.ajuster', 'journal.consulter',
      'inventaire.consulter',
      'transferts.consulter', 'transferts.creer', 'transferts.valider',
      'achats.consulter', 'achats.receptionner', 'fournisseurs.consulter',
    ],
  },
  {
    code: 'receptionnaire',
    nom: 'Agent de réception (entrées uniquement)',
    description: 'Réceptionne les livraisons fournisseurs et enregistre uniquement les entrées de stock.',
    portee: 'magasin',
    attribuable_boutique: 1,
    permissions: [
      'dashboard.consulter', 'abonnement.consulter', 'produits.consulter',
      'stock.consulter', 'stock.entree', 'journal.consulter', 'inventaire.consulter',
      'achats.consulter', 'achats.receptionner', 'fournisseurs.consulter',
    ],
  },
];

/* --------------------------------------------------------------------------
   Synchronisation des rôles en base (au démarrage)
   -------------------------------------------------------------------------- */
function synchroniserRoles() {
  const upsert = db.prepare(`
    INSERT INTO roles (code,nom,description,permissions,portee,systeme,attribuable_boutique)
    VALUES (@code,@nom,@description,@permissions,@portee,1,@attribuable_boutique)
    ON CONFLICT(code) DO UPDATE SET
      nom=excluded.nom, description=excluded.description, permissions=excluded.permissions,
      portee=excluded.portee, systeme=1, attribuable_boutique=excluded.attribuable_boutique
  `);
  const tx = db.transaction(() => {
    ROLES_SYSTEME.forEach((r) => upsert.run({
      code: r.code, nom: r.nom, description: r.description,
      permissions: JSON.stringify(r.permissions), portee: r.portee,
      attribuable_boutique: r.attribuable_boutique,
    }));
    // Sécurité : un rôle présent sur un compte mais absent de la table est recréé (droits minimaux)
    db.prepare('SELECT DISTINCT role AS code FROM users').all().forEach(({ code }) => {
      const existe = db.prepare('SELECT 1 FROM roles WHERE code=?').get(code);
      if (!existe) {
        db.prepare(`INSERT INTO roles (code,nom,description,permissions,portee,systeme,attribuable_boutique)
                    VALUES (?,?,?,?,?,0,0)`)
          .run(code, code, 'Rôle récupéré automatiquement (droits minimaux)', JSON.stringify(['dashboard.consulter']), 'magasin');
      }
    });
  });
  tx();
  invaliderCacheDroits();
}

/* --------------------------------------------------------------------------
   Lecture des rôles (avec cache mémoire invalidé à chaque modification)
   -------------------------------------------------------------------------- */
let cacheRoles = null;

function invaliderCacheRoles() { cacheRoles = null; }

function tousLesRoles() {
  if (!cacheRoles) {
    cacheRoles = db.prepare('SELECT * FROM roles ORDER BY systeme DESC, nom').all().map((r) => ({
      ...r,
      permissions: JSON.parse(r.permissions || '[]'),
    }));
  }
  return cacheRoles;
}

function role(code) {
  return tousLesRoles().find((r) => r.code === code) || null;
}

/* --- Habilitations par utilisateur (permissions accordées / retirées) --- */
let cacheUtilisateurs = null;

function invaliderCacheUtilisateurs() { cacheUtilisateurs = null; }
function invaliderCacheDroits() { invaliderCacheRoles(); invaliderCacheUtilisateurs(); }

function lignesUtilisateurs() {
  if (!cacheUtilisateurs) {
    cacheUtilisateurs = new Map(
      db.prepare('SELECT id, role, permissions_extra, permissions_retirees FROM users').all()
        .map((u) => [u.id, {
          role: u.role,
          extra: JSON.parse(u.permissions_extra || '[]'),
          retirees: JSON.parse(u.permissions_retirees || '[]'),
        }])
    );
  }
  return cacheUtilisateurs;
}

function lireJson(valeur) {
  if (Array.isArray(valeur)) return valeur;
  try { return JSON.parse(valeur || '[]'); } catch (e) { return []; }
}

/**
 * Liste effective des permissions d'une cible :
 *  - une chaîne  = code de rôle → permissions du rôle
 *  - un objet    = utilisateur  → permissions du rôle + habilitations accordées − retirées
 */
function permissionsEffectives(cible) {
  if (!cible) return [];
  if (typeof cible === 'string') {
    const r = role(cible);
    return r ? r.permissions : [];
  }
  if (Array.isArray(cible.permissions)) return cible.permissions;   // déjà calculé (profil interne)
  const r = role(cible.role);
  const base = r ? r.permissions : [];
  if (base.includes('*')) return base;                              // administrateur : tout
  let extra = lireJson(cible.permissions_extra);
  let retirees = lireJson(cible.permissions_retirees);
  if (cible.id && !extra.length && !retirees.length) {
    const ligne = lignesUtilisateurs().get(cible.id);
    if (ligne) { extra = ligne.extra; retirees = ligne.retirees; }
  }
  return [...new Set([...base, ...extra])].filter((p) => !retirees.includes(p));
}

/** Habilitations détaillées (pour l'interface). */
function habilitations(cible) {
  const r = role(cible.role);
  const base = r ? r.permissions : [];
  const extra = lireJson(cible.permissions_extra);
  const retirees = lireJson(cible.permissions_retirees);
  return {
    role: cible.role,
    du_role: base,
    accordees: extra,
    retirees: retirees,
    effectives: permissionsEffectives(cible),
  };
}

function nomRole(code) {
  const r = role(code);
  return r ? r.nom : code;
}

/** L'utilisateur (ou le rôle) possède-t-il cette permission ? */
function peut(cible, permission) {
  const perms = permissionsEffectives(cible);
  return perms.includes('*') || perms.includes(permission);
}

function peutQuelqueChose(cible, permissions) {
  return permissions.some((p) => peut(cible, p));
}

/** Portée : 'reseau' (toutes les boutiques) ou 'magasin' (sa boutique). */
function porteeDe(cible) {
  if (!cible) return 'magasin';
  if (typeof cible !== 'string' && cible.entreprise_id === null && cible.role === 'super_admin') return 'plateforme';
  const code = typeof cible === 'string' ? cible : cible.role;
  const r = role(code);
  return r ? r.portee : 'magasin';
}

/* --------------------------------------------------------------------------
   Jeton & middlewares
   -------------------------------------------------------------------------- */
function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, magasin_id: user.magasin_id, nom: user.nom,
      entreprise_id: user.entreprise_id === undefined ? null : user.entreprise_id },
    SECRET,
    { expiresIn: DUREE }
  );
}

/** Seules ces routes restent accessibles avant la vérification de l'email. */
const CHEMINS_VERIFICATION = [
  '/auth/me', '/auth/mot-de-passe', '/auth/deconnexion',
  '/entreprises/verification', '/entreprises/verification/valider',
  '/entreprises/verification/renvoyer', '/entreprises/moi',
  '/abonnement/etat', '/parametres',
];

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erreur: 'Authentification requise' });
  try {
    req.user = jwt.verify(token, SECRET);
    if (!role(req.user.role)) {
      return res.status(403).json({ erreur: 'Votre rôle n’existe plus, contactez un administrateur' });
    }
    /* Vérification de l'email : obligatoire avant de pouvoir travailler.
       Le propriétaire de la plateforme et les comptes créés par un administrateur
       (donc déjà vérifiés) ne sont pas concernés. */
    if (req.user.role !== 'super_admin') {
      const u = db.prepare('SELECT email_verifie FROM users WHERE id=?').get(req.user.id);
      req.user.email_verifie = u ? !!u.email_verifie : true;
      /* req.path est relatif au routeur monté : on compare donc l'URL complète. */
      const chemin = String(req.originalUrl || req.path || '').split('?')[0].replace(/^\/api/, '');
      if (u && !u.email_verifie && !CHEMINS_VERIFICATION.some((c) => chemin === c || chemin.startsWith(c + '/'))) {
        return res.status(403).json({
          erreur: 'Vérifiez votre adresse email pour activer votre espace.',
          code: 'EMAIL_NON_VERIFIE',
          email: req.user.email,
        });
      }
    }
    next();
  } catch (e) {
    return res.status(401).json({ erreur: 'Session expirée, veuillez vous reconnecter' });
  }
}

/** Exige AU MOINS UNE des permissions indiquées. */
function requirePerm(...permissions) {
  const liste = permissions.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ erreur: 'Authentification requise' });
    if (!peutQuelqueChose(req.user, liste)) {
      return res.status(403).json({
        erreur: `Action non autorisée pour le rôle « ${nomRole(req.user.role)} »`,
        permission_requise: liste,
      });
    }
    next();
  };
}

/** Exige TOUTES les permissions indiquées. */
function requireToutes(...permissions) {
  const liste = permissions.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ erreur: 'Authentification requise' });
    const manquantes = liste.filter((p) => !peut(req.user, p));
    if (manquantes.length) {
      return res.status(403).json({
        erreur: `Action non autorisée pour le rôle « ${nomRole(req.user.role)} »`,
        permission_requise: manquantes,
      });
    }
    next();
  };
}

/** Accès en lecture à un module : une permission suffit parmi celles listées. */
const ACCES_MODULE = {
  dashboard: ['dashboard.consulter'],
  caisse: ['caisse.utiliser'],
  ventes: ['ventes.consulter'],
  produits: ['produits.consulter'],
  stocks: ['stock.consulter'],
  inventaires: ['inventaire.consulter'],
  transferts: ['transferts.consulter'],
  achats: ['achats.consulter'],
  clients: ['clients.consulter'],
  fournisseurs: ['fournisseurs.consulter'],
  employes: ['employes.consulter'],
  salaires: ['salaires.consulter'],
  recrutement: ['recrutement.consulter'],
  rapports: ['rapports.consulter'],
  magasins: ['magasins.consulter', 'magasins.gerer'],
  utilisateurs: ['utilisateurs.gerer', 'utilisateurs.gerer_boutique'],
  parametres: ['parametres.gerer'],
};

function requireModule(module) {
  return requirePerm(ACCES_MODULE[module] || [module]);
}

/**
 * Réservé au propriétaire de la plateforme (rôle super_admin).
 */
function requirePlateforme(req, res, next) {
  if (!req.user) return res.status(401).json({ erreur: 'Authentification requise' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ erreur: 'Cette console est réservée au propriétaire de l\'application' });
  }
  next();
}

/**
 * Magasin imposé à l'utilisateur (null s'il a une portée réseau ou plateforme).
 */
function magasinImpose(user) {
  if (!user) return null;
  if (porteeDe(user) !== 'magasin') return null;
  return user.magasin_id || null;
}

/** Peut-il gérer les comptes de cette portée ? */
function droitsComptes(user) {
  return {
    tous: peut(user, 'utilisateurs.gerer'),
    boutique: peut(user, 'utilisateurs.gerer_boutique'),
    roles: peut(user, 'roles.gerer'),
    portee: porteeDe(user),
  };
}

module.exports = {
  SECRET, CATALOGUE_PERMISSIONS, TOUTES_PERMISSIONS, ROLES_SYSTEME,
  synchroniserRoles, tousLesRoles, role, nomRole, peut, peutQuelqueChose, porteeDe,
  permissionsEffectives, habilitations, invaliderCacheDroits, invaliderCacheUtilisateurs,
  sign, auth, requirePerm, requireToutes, requireModule, requirePlateforme, magasinImpose, droitsComptes,
  invaliderCacheRoles, ACCES_MODULE,
};
