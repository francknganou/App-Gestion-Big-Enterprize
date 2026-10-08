/**
 * Magasins, utilisateurs, paramètres de l'entreprise et journal d'activité.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const {
  auth, requireModule, requirePerm, peut, nomRole, tousLesRoles, porteeDe,
  CATALOGUE_PERMISSIONS, TOUTES_PERMISSIONS, invaliderCacheRoles, invaliderCacheDroits,
  permissionsEffectives, habilitations: habilitationsDe,
} = require('../auth');
const { wrap, param, appliquerMouvement } = require('../utils');
const { journaliser } = require('../evenements');
const Mails = require('../mails');
const { entrepriseId, estPlateforme, magasinAutorise } = require('../portee');

const router = express.Router();
router.use(auth);

/* ----------------------------- MAGASINS ----------------------------- */
router.get('/magasins', requireModule('magasins'), wrap((req, res) => {
  const rows = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM produits p WHERE p.actif=1 AND p.entreprise_id = m.entreprise_id) AS nb_produits,
      (SELECT IFNULL(SUM(s.quantite * pr.prix_vente),0) FROM stocks s
         JOIN produits pr ON pr.id = s.produit_id WHERE s.magasin_id = m.id) AS valeur_stock,
      (SELECT COUNT(*) FROM ventes v WHERE v.magasin_id = m.id AND v.statut='payee'
         AND date(v.created_at) = date('now','localtime')) AS ventes_jour,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.magasin_id = m.id AND v.statut='payee'
         AND date(v.created_at) = date('now','localtime')) AS ca_jour,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.magasin_id = m.id AND v.statut='payee'
         AND strftime('%Y-%m', v.created_at) = strftime('%Y-%m','now','localtime')) AS ca_mois
    FROM magasins m WHERE ${estPlateforme(req) ? '1=1' : 'm.entreprise_id = ?'} ORDER BY m.actif DESC, m.id
  `).all(...(estPlateforme(req) ? [] : [entrepriseId(req) || -1]));
  res.json(rows);
}));

router.post('/magasins', requirePerm('magasins.gerer'), wrap((req, res) => {
  const { code, nom, ville, adresse, telephone, responsable, stock } = req.body || {};
  if (!code || !nom) return res.status(400).json({ erreur: 'Code et nom obligatoires' });
  if (!req.user.entreprise_id) return res.status(400).json({ erreur: 'Aucune entreprise rattachée à ce compte' });
  /* « magasin » = stock seul ; « boutique » = stock + ventes. */
  const type = req.body && req.body.type === 'magasin' ? 'magasin' : 'boutique';
  const info = db.prepare(
    'INSERT INTO magasins (entreprise_id,code,nom,ville,adresse,telephone,responsable,type) VALUES (?,?,?,?,?,?,?,?)'
  ).run(req.user.entreprise_id, code, nom, ville || null, adresse || null, telephone || null, responsable || null, type);
  const id = Number(info.lastInsertRowid);
  /* Dotation initiale : l'administrateur transfère le stock que le point de vente pourra vendre. */
  const dotation = Array.isArray(stock) ? stock : [];
  const tx = db.transaction(() => {
    dotation.forEach((l) => {
      const q = Number(l.quantite);
      if (!l.produit_id || !isFinite(q) || q <= 0) return;
      appliquerMouvement({
        produit_id: Number(l.produit_id), magasin_id: id, type: 'entree', quantite: q,
        motif: 'Dotation initiale', reference: 'DOT-' + id, user_id: req.user.id,
      });
    });
  });
  tx();
  const cree = db.prepare('SELECT * FROM magasins WHERE id=?').get(id);
  cree.nb_lignes_dotation = dotation.length;
  res.status(201).json(cree);
}));

/**
 * Synthèse réseau pour l'administrateur : chaque point de vente avec son type,
 * ses ventes du jour et son stock restant ; pour les magasins de stock, les
 * entrées / sorties du jour.
 */
router.get('/magasins/apercu', requireModule('magasins'), wrap((req, res) => {
  const pe = entrepriseId(req) || -1;
  const auj = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT * FROM magasins WHERE entreprise_id=? ORDER BY nom`).all(pe);
  const out = rows.map((m) => {
    const ventes = db.prepare(`SELECT IFNULL(SUM(total),0) ca, COUNT(*) n FROM ventes
        WHERE magasin_id=? AND substr(created_at,1,10)=?`).get(m.id, auj);
    const stock = db.prepare(`SELECT IFNULL(SUM(s.quantite),0) q,
        IFNULL(SUM(s.quantite * IFNULL(p.prix_vente,0)),0) v
        FROM stocks s LEFT JOIN produits p ON p.id=s.produit_id WHERE s.magasin_id=?`).get(m.id);
    const entrees = db.prepare(`SELECT IFNULL(SUM(quantite),0) s FROM mouvements_stock
        WHERE magasin_id=? AND type IN ('entree','transfert_entree','retour') AND substr(created_at,1,10)=?`).get(m.id, auj);
    const sorties = db.prepare(`SELECT IFNULL(SUM(quantite),0) s FROM mouvements_stock
        WHERE magasin_id=? AND type IN ('sortie','vente','transfert_sortie') AND substr(created_at,1,10)=?`).get(m.id, auj);
    const comptes = db.prepare('SELECT COUNT(*) c FROM users WHERE magasin_id=?').get(m.id).c;
    return {
      id: m.id, code: m.code, nom: m.nom, ville: m.ville, type: m.type || 'boutique', actif: m.actif,
      ventes_jour_ca: ventes.ca, ventes_jour_nb: ventes.n,
      stock_quantite: stock.q, stock_valeur: Math.round(stock.v),
      entrees_jour: entrees.s, sorties_jour: sorties.s, nb_comptes: comptes,
    };
  });
  res.json({ points: out, date: auj });
}));

router.put('/magasins/:id', requirePerm('magasins.gerer'), wrap((req, res) => {
  if (!magasinAutorise(req, req.params.id)) return res.status(404).json({ erreur: 'Magasin introuvable' });
  const { code, nom, ville, adresse, telephone, responsable, actif, type } = req.body || {};
  const typeFinal = type === 'magasin' ? 'magasin' : 'boutique';
  db.prepare(`UPDATE magasins SET code=?, nom=?, ville=?, adresse=?, telephone=?, responsable=?, actif=?, type=? WHERE id=?`)
    .run(code, nom, ville || null, adresse || null, telephone || null, responsable || null, actif === undefined ? 1 : (actif ? 1 : 0), typeFinal, req.params.id);
  res.json(db.prepare('SELECT * FROM magasins WHERE id=?').get(req.params.id));
}));

router.delete('/magasins/:id', requirePerm('magasins.gerer'), wrap((req, res) => {
  if (!magasinAutorise(req, req.params.id)) return res.status(404).json({ erreur: 'Magasin introuvable' });
  const nb = db.prepare('SELECT COUNT(*) c FROM ventes WHERE magasin_id=?').get(req.params.id).c;
  if (nb > 0) {
    db.prepare('UPDATE magasins SET actif=0 WHERE id=?').run(req.params.id);
    return res.json({ ok: true, desactive: true, message: 'Magasin désactivé (il possède un historique de ventes)' });
  }
  db.prepare('DELETE FROM magasins WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ----------------------------- UTILISATEURS -----------------------------
   Un responsable de boutique peut créer et gérer les comptes de SA boutique.
   Un administrateur gère tous les comptes, toutes boutiques confondues.
   ------------------------------------------------------------------------ */

/**
 * Valide les habilitations transmises pour un compte :
 *  - on ne garde que des codes de permissions connus ;
 *  - celui qui modifie ne peut pas accorder un droit qu'il ne possède pas lui-même ;
 *  - seuls les administrateurs peuvent accorder/retirer les droits d'administration.
 */
const PERMISSIONS_RESERVEES_ADMIN = [
  'utilisateurs.gerer', 'utilisateurs.gerer_boutique', 'roles.gerer', 'magasins.gerer',
  'parametres.gerer', 'abonnement.gerer',
];

function validerHabilitations(req, accordees, retirees) {
  const estAdmin = peut(req.user, 'utilisateurs.gerer');
  const mesDroits = permissionsEffectives(req.user);
  const connus = new Set(TOUTES_PERMISSIONS);

  const nettoyer = (liste, genre) => [...new Set((Array.isArray(liste) ? liste : [])
    .filter((p) => typeof p === 'string' && connus.has(p))
    .filter((p) => {
      if (estAdmin) return true;
      if (PERMISSIONS_RESERVEES_ADMIN.includes(p)) return false;
      // on ne peut pas donner plus de droits que l'on en a, ni retirer un droit qu'on n'a pas
      return mesDroits.includes('*') || mesDroits.includes(p);
    }))];

  const grant = nettoyer(accordees);
  const revoke = nettoyer(retirees);
  // une permission ne peut pas être accordée ET retirée : le retrait l'emporte
  return { accordees: grant.filter((p) => !revoke.includes(p)), retirees: revoke };
}

/** Les droits de l'utilisateur connecté sur les comptes. */
function droitsComptes(req) {
  const tous = peut(req.user, 'utilisateurs.gerer');
  const boutique = peut(req.user, 'utilisateurs.gerer_boutique');
  return { tous, boutique, roles: peut(req.user, 'roles.gerer'), peut: tous || boutique };
}

router.get('/utilisateurs', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique'), wrap((req, res) => {
  const d = droitsComptes(req);
  let sql = `
    SELECT u.id,u.nom,u.email,u.role,u.magasin_id,u.actif,u.dernier_login,u.created_at,
           u.permissions_extra,u.permissions_retirees,
           m.nom AS magasin, m.ville AS magasin_ville, c.nom AS createur
    FROM users u
    LEFT JOIN magasins m ON m.id = u.magasin_id
    LEFT JOIN users c ON c.id = u.cree_par`;
  const p = [];
  if (estPlateforme(req)) {
    if (req.query.entreprise_id) { sql += ' WHERE u.entreprise_id = ?'; p.push(Number(req.query.entreprise_id)); }
  } else {
    sql += ' WHERE u.entreprise_id = ?';
    p.push(entrepriseId(req) || -1);
  }
  if (!d.tous) {
    if (!req.user.magasin_id) return res.status(403).json({ erreur: 'Votre compte n’est rattaché à aucune boutique' });
    sql += ' AND u.magasin_id = ?';
    p.push(req.user.magasin_id);
  } else if (req.query.magasin_id) {
    sql += ' AND u.magasin_id = ?';
    p.push(req.query.magasin_id);
  }
  if (req.query.q) {
    sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + " (u.nom LIKE ? OR u.email LIKE ?)";
    p.push('%' + req.query.q + '%', '%' + req.query.q + '%');
  }
  sql += ' ORDER BY m.nom, u.nom';
  const rows = db.prepare(sql).all(...p).map((u) => {
    const h = habilitationsDe(u);
    return {
      ...u,
      libelle_role: nomRole(u.role),
      portee: porteeDe(u),
      habilitations: {
        accordees: h.accordees, retirees: h.retirees,
        nb_effectives: h.effectives.length,
        nb_role: h.du_role.length,
      },
      modifiable: d.tous || Number(u.magasin_id) === Number(req.user.magasin_id),
    };
  });
  res.json(rows);
}));

/** Rôles proposables à la création d'un compte. */
router.get('/roles-attribuables', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique'), wrap((req, res) => {
  const d = droitsComptes(req);
  const roles = tousLesRoles()
    .filter((r) => r.code !== 'super_admin')
    .filter((r) => (d.tous ? true : r.attribuable_boutique === 1))
    .map((r) => ({
      code: r.code, nom: r.nom, description: r.description, portee: r.portee,
      permissions: r.permissions,
      systeme: !!r.systeme, attribuable_boutique: !!r.attribuable_boutique,
    }));
  res.json({
    roles,
    droits: { tous: d.tous, boutique: d.boutique, roles: d.roles },
    mon_magasin: req.user.magasin_id
      ? db.prepare('SELECT id,nom,ville FROM magasins WHERE id=?').get(req.user.magasin_id) : null,
  });
}));

router.post('/utilisateurs', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique'), wrap(async (req, res) => {
  const d = droitsComptes(req);
  const { nom, email, mot_de_passe, role, magasin_id, poste } = req.body || {};
  if (!nom || !email || !mot_de_passe) {
    return res.status(400).json({ erreur: 'Nom, email et mot de passe sont obligatoires' });
  }
  if (String(mot_de_passe).length < 6) {
    return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  const roleChoisi = tousLesRoles().find((r) => r.code === role);
  if (!roleChoisi) return res.status(400).json({ erreur: 'Rôle inconnu' });

  // Portée : un responsable de boutique ne crée que dans SA boutique, avec les rôles autorisés
  let magasinCible = magasin_id ? Number(magasin_id) : null;
  if (!d.tous) {
    if (!req.user.magasin_id) return res.status(403).json({ erreur: 'Votre compte n’est rattaché à aucune boutique' });
    magasinCible = Number(req.user.magasin_id);
    if (roleChoisi.attribuable_boutique !== 1) {
      return res.status(403).json({
        erreur: `Vous ne pouvez pas attribuer le rôle « ${roleChoisi.nom} ». Rôles autorisés : ${
          tousLesRoles().filter((r) => r.attribuable_boutique === 1).map((r) => r.nom).join(', ')}`,
      });
    }
    if (roleChoisi.portee === 'reseau') {
      return res.status(403).json({ erreur: 'Un rôle réseau ne peut être attribué que par un administrateur' });
    }
  }
  // Un rôle de portée « magasin » doit avoir une boutique
  if (roleChoisi.portee === 'magasin' && !magasinCible) {
    return res.status(400).json({ erreur: 'Choisissez la boutique d’affectation de ce compte' });
  }
  if (magasinCible && !magasinAutorise(req, magasinCible)) {
    return res.status(400).json({ erreur: 'Boutique introuvable pour votre entreprise' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(String(email).toLowerCase())) {
    return res.status(400).json({ erreur: 'Cet email est déjà utilisé par un autre compte' });
  }

  const { accordees, retirees } = validerHabilitations(req, req.body.permissions_extra, req.body.permissions_retirees);
  const info = db.prepare(`
    /* email_verifie=1 : la vérification ne concerne que l'inscription d'une
       entreprise, pas un compte créé par un administrateur déjà connecté. */
    INSERT INTO users (entreprise_id,nom,email,mot_de_passe,role,magasin_id,cree_par,permissions_extra,permissions_retirees,email_verifie,email_verifie_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,datetime('now','localtime'))`)
    .run(req.user.entreprise_id || null, nom, String(email).toLowerCase(), bcrypt.hashSync(mot_de_passe, 10),
      roleChoisi.code, magasinCible, req.user.id, JSON.stringify(accordees), JSON.stringify(retirees));
  invaliderCacheDroits();
  const cree = db.prepare(`
    SELECT u.id,u.nom,u.email,u.role,u.magasin_id,u.actif,m.nom AS magasin
    FROM users u LEFT JOIN magasins m ON m.id=u.magasin_id WHERE u.id=?`).get(info.lastInsertRowid);
  journaliser({
    entreprise_id: req.user.entreprise_id, magasin_id: cree.magasin_id, type: 'compte',
    user_id: req.user.id,
    libelle: `Nouveau compte « ${cree.nom} » (${nomRole(cree.role)})${cree.magasin ? ' · ' + cree.magasin : ''}`,
  });

  /* Les identifiants de connexion partent par email au titulaire du compte,
     quel que soit son rôle (caissier, agent de stock, responsable…). */
  const entreprise = db.prepare('SELECT nom FROM entreprises WHERE id=?').get(req.user.entreprise_id) || {};
  const envoi = await Mails.envoyerIdentifiants({
    user: { id: cree.id, email: cree.email, nom: cree.nom, entreprise_id: req.user.entreprise_id },
    entreprise,
    mot_de_passe,
    role: nomRole(cree.role),
    magasin: cree.magasin,
    createur: req.user.nom,
    langue: (req.body && req.body.langue) || 'fr',
  });

  res.status(201).json({
    ...cree, libelle_role: nomRole(cree.role), poste: poste || null,
    email_envoye: envoi.statut, email_smtp: envoi.smtp,
  });
}));

router.put('/utilisateurs/:id', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique'), wrap((req, res) => {
  const d = droitsComptes(req);
  const cible = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (cible && !estPlateforme(req) && Number(cible.entreprise_id) !== Number(req.user.entreprise_id)) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }
  if (!cible) return res.status(404).json({ erreur: 'Utilisateur introuvable' });
  if (!d.tous) {
    if (Number(cible.magasin_id) !== Number(req.user.magasin_id)) {
      return res.status(403).json({ erreur: 'Ce compte appartient à une autre boutique' });
    }
    const roleVise = req.body.role ? tousLesRoles().find((r) => r.code === req.body.role) : null;
    const roleActuel = tousLesRoles().find((r) => r.code === cible.role);
    const autorise = (r) => r && r.attribuable_boutique === 1 && r.portee === 'magasin';
    if (!autorise(roleActuel)) {
      return res.status(403).json({ erreur: 'Vous ne pouvez modifier que les comptes des rôles de boutique' });
    }
    if (roleVise && !autorise(roleVise)) {
      return res.status(403).json({ erreur: `Vous ne pouvez pas attribuer le rôle « ${roleVise.nom} »` });
    }
  }
  const { nom, email, role, magasin_id, actif, mot_de_passe } = req.body || {};
  const roleFinal = role && tousLesRoles().some((r) => r.code === role) ? role : cible.role;
  let magasinFinal = d.tous ? (magasin_id === undefined ? cible.magasin_id : (magasin_id || null)) : cible.magasin_id;
  if (porteeDe(roleFinal) === 'magasin' && !magasinFinal) {
    return res.status(400).json({ erreur: 'Ce rôle nécessite une boutique d’affectation' });
  }
  if (email && String(email).toLowerCase() !== cible.email) {
    if (db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(String(email).toLowerCase(), cible.id)) {
      return res.status(400).json({ erreur: 'Cet email est déjà utilisé' });
    }
  }
  const hab = validerHabilitations(req,
    req.body.permissions_extra !== undefined ? req.body.permissions_extra : JSON.parse(cible.permissions_extra || '[]'),
    req.body.permissions_retirees !== undefined ? req.body.permissions_retirees : JSON.parse(cible.permissions_retirees || '[]'));
  db.prepare('UPDATE users SET nom=?, email=?, role=?, magasin_id=?, actif=?, permissions_extra=?, permissions_retirees=? WHERE id=?')
    .run(nom || cible.nom, String(email || cible.email).toLowerCase(), roleFinal,
      magasinFinal, actif === undefined ? cible.actif : (actif ? 1 : 0),
      JSON.stringify(hab.accordees), JSON.stringify(hab.retirees), cible.id);
  invaliderCacheDroits();
  if (mot_de_passe) {
    if (String(mot_de_passe).length < 6) return res.status(400).json({ erreur: 'Mot de passe trop court (6 caractères minimum)' });
    db.prepare('UPDATE users SET mot_de_passe=? WHERE id=?').run(bcrypt.hashSync(mot_de_passe, 10), cible.id);
  }
  const maj = db.prepare(`
    SELECT u.id,u.nom,u.email,u.role,u.magasin_id,u.actif,u.permissions_extra,u.permissions_retirees,
           m.nom AS magasin
    FROM users u LEFT JOIN magasins m ON m.id=u.magasin_id WHERE u.id=?`).get(cible.id);
  const h = habilitationsDe(maj);
  res.json({
    ...maj, libelle_role: nomRole(maj.role),
    habilitations: { accordees: h.accordees, retirees: h.retirees, effectives: h.effectives },
  });
}));

router.delete('/utilisateurs/:id', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique'), wrap((req, res) => {
  const d = droitsComptes(req);
  const cible = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!cible) return res.status(404).json({ erreur: 'Utilisateur introuvable' });
  if (Number(cible.id) === Number(req.user.id)) {
    return res.status(400).json({ erreur: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  if (!d.tous) {
    const roleCible = tousLesRoles().find((r) => r.code === cible.role);
    if (Number(cible.magasin_id) !== Number(req.user.magasin_id) || !roleCible || roleCible.attribuable_boutique !== 1) {
      return res.status(403).json({ erreur: 'Vous ne pouvez supprimer que les comptes de boutique de votre magasin' });
    }
  }
  db.prepare('DELETE FROM users WHERE id=?').run(cible.id);
  invaliderCacheDroits();
  res.json({ ok: true });
}));

/* ------------------------------- RÔLES ------------------------------- */

/** Catalogue des permissions disponibles (pour l'éditeur de rôles). */
router.get('/permissions',
  requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique', 'roles.gerer'),
  wrap((req, res) => {
    const estAdmin = peut(req.user, 'utilisateurs.gerer');
    const mesDroits = permissionsEffectives(req.user);
    const groupes = {};
    Object.entries(CATALOGUE_PERMISSIONS).forEach(([groupe, liste]) => {
      const filtre = Object.entries(liste).filter(([code]) => {
        if (estAdmin || mesDroits.includes('*')) return true;
        if (PERMISSIONS_RESERVEES_ADMIN.includes(code)) return false;
        return mesDroits.includes(code);          // on ne propose que ce que l'on possède
      });
      if (filtre.length) groupes[groupe] = Object.fromEntries(filtre);
    });
    res.json({ groupes, portee: estAdmin ? 'reseau' : 'boutique', reservees_admin: PERMISSIONS_RESERVEES_ADMIN });
  }));

router.get('/roles', requirePerm('utilisateurs.gerer', 'utilisateurs.gerer_boutique', 'roles.gerer'), wrap((req, res) => {
  const d = droitsComptes(req);
  const avecEffectif = toutesLesRolesAvecEffectif();
  const roles = d.roles || d.tous ? avecEffectif : avecEffectif.filter((r) => r.attribuable_boutique);
  res.json({ roles, peut_modifier: d.roles });
}));

function toutesLesRolesAvecEffectif() {
  return db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role = r.code) AS nb_utilisateurs
    FROM roles r ORDER BY r.systeme DESC, r.portee, r.nom
  `).all().map((r) => ({
    id: r.id, code: r.code, nom: r.nom, description: r.description,
    permissions: JSON.parse(r.permissions || '[]'),
    portee: r.portee, systeme: !!r.systeme,
    attribuable_boutique: !!r.attribuable_boutique,
    nb_utilisateurs: r.nb_utilisateurs,
  }));
}

router.post('/roles', requirePerm('roles.gerer'), wrap((req, res) => {
  const { code, nom, description, permissions, portee, attribuable_boutique } = req.body || {};
  if (!nom) return res.status(400).json({ erreur: 'Le nom du rôle est obligatoire' });
  const codeFinal = (code || nom).toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!codeFinal) return res.status(400).json({ erreur: 'Code de rôle invalide' });
  if (db.prepare('SELECT 1 FROM roles WHERE code=?').get(codeFinal)) {
    return res.status(400).json({ erreur: 'Un rôle avec ce code existe déjà' });
  }
  const perms = Array.isArray(permissions) ? permissions.filter((p) => TOUTES_PERMISSIONS.includes(p)) : [];
  if (!perms.length) return res.status(400).json({ erreur: 'Cochez au moins une permission' });
  db.prepare(`INSERT INTO roles (code,nom,description,permissions,portee,systeme,attribuable_boutique)
              VALUES (?,?,?,?,?,0,?)`)
    .run(codeFinal, nom, description || null, JSON.stringify(perms),
      portee === 'reseau' ? 'reseau' : 'magasin', attribuable_boutique ? 1 : 0);
  invaliderCacheDroits();
  res.status(201).json({ ok: true, code: codeFinal });
}));

router.put('/roles/:code', requirePerm('roles.gerer'), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM roles WHERE code=?').get(req.params.code);
  if (!r) return res.status(404).json({ erreur: 'Rôle introuvable' });
  if (r.systeme) {
    return res.status(400).json({ erreur: 'Les rôles livrés avec l’application ne sont pas modifiables. Créez un rôle personnalisé.' });
  }
  const { nom, description, permissions, portee, attribuable_boutique } = req.body || {};
  const perms = Array.isArray(permissions) ? permissions.filter((p) => TOUTES_PERMISSIONS.includes(p)) : JSON.parse(r.permissions);
  if (!perms.length) return res.status(400).json({ erreur: 'Cochez au moins une permission' });
  db.prepare('UPDATE roles SET nom=?, description=?, permissions=?, portee=?, attribuable_boutique=? WHERE code=?')
    .run(nom || r.nom, description ?? r.description, JSON.stringify(perms),
      portee === 'reseau' ? 'reseau' : (portee === 'magasin' ? 'magasin' : r.portee),
      attribuable_boutique === undefined ? r.attribuable_boutique : (attribuable_boutique ? 1 : 0), r.code);
  invaliderCacheDroits();
  res.json({ ok: true });
}));

router.delete('/roles/:code', requirePerm('roles.gerer'), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM roles WHERE code=?').get(req.params.code);
  if (!r) return res.status(404).json({ erreur: 'Rôle introuvable' });
  if (r.systeme) return res.status(400).json({ erreur: 'Un rôle livré avec l’application ne peut pas être supprimé' });
  const n = db.prepare('SELECT COUNT(*) c FROM users WHERE role=?').get(r.code).c;
  if (n) return res.status(400).json({ erreur: `${n} compte(s) utilisent ce rôle. Réaffectez-les avant de supprimer.` });
  db.prepare('DELETE FROM roles WHERE code=?').run(r.code);
  invaliderCacheDroits();
  res.json({ ok: true });
}));

/* ----------------------------- PARAMÈTRES ----------------------------- */
const CLES_ENTREPRISE = ['nom_entreprise', 'slogan', 'adresse', 'telephone', 'email', 'contribuable',
  'ville', 'devise', 'tva_defaut', 'prefixe_vente', 'objectif_mensuel', 'message_ticket'];

router.get('/parametres', requireModule('dashboard'), wrap((req, res) => {
  const id = entrepriseId(req) || 0;
  const o = {};
  CLES_ENTREPRISE.forEach((c) => { o[c] = param(c, '', id); });
  res.json(o);
}));

router.put('/parametres', requirePerm('parametres.gerer'), wrap((req, res) => {
  const corps = req.body || {};
  const id = entrepriseId(req);
  if (!id) return res.status(400).json({ erreur: 'Aucune entreprise rattachée à ce compte' });
  const maj = db.prepare('INSERT INTO parametres (entreprise_id,cle,valeur) VALUES (?,?,?) ON CONFLICT(entreprise_id,cle) DO UPDATE SET valeur=excluded.valeur');
  Object.entries(corps).forEach(([k, v]) => { if (CLES_ENTREPRISE.includes(k)) maj.run(id, k, v === null || v === undefined ? '' : String(v)); });
  const o = {};
  CLES_ENTREPRISE.forEach((c) => { o[c] = param(c, '', id); });
  res.json(o);
}));

/* ----------------------------- JOURNAL D'ACTIVITÉ ----------------------------- */
router.get('/journal', requirePerm('journal.consulter'), wrap((req, res) => {
  const { magasin_id, produit_id, type, debut, fin, limite } = req.query;
  let sql = `
    SELECT ms.*, p.nom AS produit, p.code AS code_produit, m.nom AS magasin, u.nom AS utilisateur
    FROM mouvements_stock ms
    JOIN produits p ON p.id = ms.produit_id
    JOIN magasins m ON m.id = ms.magasin_id
    LEFT JOIN users u ON u.id = ms.user_id
    WHERE m.entreprise_id = ?`;
  const params = [entrepriseId(req) || -1];
  if (magasin_id) { sql += ' AND ms.magasin_id = ?'; params.push(magasin_id); }
  if (produit_id) { sql += ' AND ms.produit_id = ?'; params.push(produit_id); }
  if (type) { sql += ' AND ms.type = ?'; params.push(type); }
  if (debut) { sql += ' AND date(ms.created_at) >= date(?)'; params.push(debut); }
  if (fin) { sql += ' AND date(ms.created_at) <= date(?)'; params.push(fin); }
  sql += ' ORDER BY ms.id DESC LIMIT ?';
  params.push(Math.min(Number(limite) || 300, 1000));
  res.json(db.prepare(sql).all(...params));
}));

module.exports = router;
