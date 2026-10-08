/**
 * entreprises.js — Multi-entreprises.
 *
 *  • Une entreprise cliente possède ses magasins, ses produits, ses clients,
 *    ses comptes utilisateurs et son abonnement (7 jours d'essai puis mensuel
 *    ou annuel).
 *  • Le propriétaire de la plateforme (rôle « super_admin », sans entreprise)
 *    surveille toutes les entreprises depuis sa console.
 */
const bcrypt = require('bcryptjs');
const { db, parametresEntreprise, setParam } = require('./db');
const Abonnement = require('./abonnement');
const RH = require('./rh');

/* ------------------------------------------------------------------ */
/* Compte du propriétaire de la plateforme                             */
/* ------------------------------------------------------------------ */
const PROPRIETAIRE = {
  email: 'franck06.nganou02oumbe2004@gmail.com',
  mot_de_passe: 'Aspirine46@!',
  nom: 'Nganou Oumbe Franck',
  telephone: '654324282',
};

/** Crée (ou répare) le compte propriétaire : accès total à la plateforme. */
function assurerProprietaire() {
  const email = PROPRIETAIRE.email.toLowerCase();
  const existe = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (existe) {
    let change = false;
    if (existe.role !== 'super_admin' || existe.entreprise_id !== null || !existe.actif) {
      db.prepare("UPDATE users SET role='super_admin', entreprise_id=NULL, actif=1 WHERE id=?").run(existe.id);
      change = true;
    }
    if (!bcrypt.compareSync(PROPRIETAIRE.mot_de_passe, existe.mot_de_passe)) {
      db.prepare('UPDATE users SET mot_de_passe=? WHERE id=?')
        .run(bcrypt.hashSync(PROPRIETAIRE.mot_de_passe, 10), existe.id);
      change = true;
    }
    if (change) console.log('  ↳ Compte propriétaire vérifié : ' + email);
    return db.prepare('SELECT * FROM users WHERE id=?').get(existe.id);
  }
  const info = db.prepare(`INSERT INTO users (entreprise_id, nom, email, mot_de_passe, role, actif)
    VALUES (NULL, ?, ?, ?, 'super_admin', 1)`)
    .run(PROPRIETAIRE.nom, email, bcrypt.hashSync(PROPRIETAIRE.mot_de_passe, 10));
  console.log('  ↳ Compte propriétaire de la plateforme créé : ' + email);
  return db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
}

/* ------------------------------------------------------------------ */
/* Création d'une entreprise (inscription publique)                    */
/* ------------------------------------------------------------------ */

function emailDejaUtilise(email) {
  return !!db.prepare('SELECT id FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
}

function codeBoutique(nom) {
  const base = String(nom || 'BQ').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'BQ';
  let code = base + '-' + String(Math.floor(Math.random() * 900) + 100);
  while (db.prepare('SELECT id FROM magasins WHERE code=?').get(code)) {
    code = base + '-' + String(Math.floor(Math.random() * 900) + 100);
  }
  return code;
}

/**
 * Inscrit une entreprise : fiche entreprise + compte administrateur +
 * première boutique + 7 jours d'essai gratuit.
 */
function creerEntreprise(donnees = {}) {
  const nom = String(donnees.nom || '').trim();
  const email = String(donnees.email || '').trim().toLowerCase();
  const motDePasse = String(donnees.mot_de_passe || '');
  const erreurs = [];
  if (!nom) erreurs.push('Le nom de l’entreprise est obligatoire');
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) erreurs.push('Un email professionnel valide est obligatoire');
  if (motDePasse.length < 6) erreurs.push('Le mot de passe doit contenir au moins 6 caractères');
  if (email && emailDejaUtilise(email)) erreurs.push('Un compte existe déjà avec cet email');
  if (erreurs.length) throw Object.assign(new Error(erreurs.join(' — ')), { statut: 400, erreurs });

  const logo = typeof donnees.logo === 'string' && donnees.logo.startsWith('data:image/') ? donnees.logo : null;
  if (logo && logo.length > 900000) {
    throw Object.assign(new Error('Le logo est trop volumineux (700 Ko maximum)'), { statut: 400 });
  }

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO entreprises (nom, email, nom_contact, prenom_contact, telephone, ville, pays,
                              date_creation, niu, logo, statut, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'actif', ?)`).run(
      nom, email, donnees.nom_contact || null, donnees.prenom_contact || null,
      donnees.telephone || null, donnees.ville || null, donnees.pays || 'Cameroun',
      donnees.date_creation || null, donnees.niu || null, logo, donnees.notes || null,
    );
    const entrepriseId = Number(info.lastInsertRowid);

    // Réglages de marque de l'entreprise (tickets, TVA, objectif…)
    const reglages = parametresEntreprise({
      nom, email,
      slogan: donnees.slogan, adresse: donnees.adresse, telephone: donnees.telephone,
      niu: donnees.niu, ville: donnees.ville,
    });
    Object.entries(reglages).forEach(([cle, valeur]) => setParam.run(entrepriseId, cle, String(valeur)));

    // Compte administrateur de l'entreprise : créé non vérifié, il recevra un
    // email de vérification et devra le confirmer avant de pouvoir travailler.
    const admin = db.prepare(`INSERT INTO users (entreprise_id, nom, email, mot_de_passe, role, actif, email_verifie, langue)
      VALUES (?,?,?,?, 'admin', 1, 0, ?)`).run(
      entrepriseId,
      [donnees.prenom_contact, donnees.nom_contact].filter(Boolean).join(' ') || nom,
      email, bcrypt.hashSync(motDePasse, 10),
      ['fr', 'en', 'zh'].includes(donnees.langue) ? donnees.langue : 'fr',
    );

    // Première boutique (l'administrateur en créera d'autres librement)
    const nomBoutique = String(donnees.boutique || '').trim() || ('Boutique principale ' + nom);
    const magasin = db.prepare(`INSERT INTO magasins (entreprise_id, code, nom, ville, adresse, telephone, responsable)
      VALUES (?,?,?,?,?,?,?)`).run(
      entrepriseId, codeBoutique(nomBoutique), nomBoutique, donnees.ville || null,
      donnees.adresse || null, donnees.telephone || null,
      [donnees.prenom_contact, donnees.nom_contact].filter(Boolean).join(' ') || null,
    );

    return {
      entrepriseId,
      adminId: Number(admin.lastInsertRowid),
      magasinId: Number(magasin.lastInsertRowid),
    };
  });

  const r = tx();
  const abonnement = Abonnement.demarrerEssai(r.entrepriseId, Abonnement.tarifs().essai_jours);
  return {
    entreprise: db.prepare('SELECT * FROM entreprises WHERE id=?').get(r.entrepriseId),
    admin: db.prepare('SELECT * FROM users WHERE id=?').get(r.adminId),
    magasin: db.prepare('SELECT * FROM magasins WHERE id=?').get(r.magasinId),
    abonnement,
  };
}

/** Met à jour la fiche d'une entreprise (propriétaire ou administrateur). */
function majEntreprise(id, donnees = {}) {
  const e = db.prepare('SELECT * FROM entreprises WHERE id=?').get(id);
  if (!e) throw Object.assign(new Error('Entreprise introuvable'), { statut: 404 });
  const champs = ['nom', 'email', 'nom_contact', 'prenom_contact', 'telephone', 'ville', 'pays',
    'date_creation', 'niu', 'statut', 'notes'];
  const maj = {};
  champs.forEach((c) => { if (donnees[c] !== undefined && donnees[c] !== null) maj[c] = donnees[c]; });
  if (typeof donnees.logo === 'string' && donnees.logo.startsWith('data:image/')) maj.logo = donnees.logo;
  if (donnees.logo === null || donnees.logo === '') maj.logo = null;
  if (Object.keys(maj).length) {
    db.prepare(`UPDATE entreprises SET ${Object.keys(maj).map((c) => c + '=?').join(', ')} WHERE id=?`)
      .run(...Object.values(maj), id);
  }
  // Le nom de l'entreprise alimente aussi le paramètre utilisé sur les tickets
  if (maj.nom) setParam.run(Number(id), 'nom_entreprise', String(maj.nom));
  if (maj.niu !== undefined) setParam.run(Number(id), 'contribuable', String(maj.niu || ''));
  if (maj.telephone !== undefined) setParam.run(Number(id), 'telephone', String(maj.telephone || ''));
  if (maj.email !== undefined) setParam.run(Number(id), 'email', String(maj.email || ''));
  if (maj.ville !== undefined) setParam.run(Number(id), 'ville', String(maj.ville || ''));
  return db.prepare('SELECT * FROM entreprises WHERE id=?').get(id);
}

/** Supprime une entreprise et tout ce qui lui appartient. */
function supprimerEntreprise(id) {
  const e = db.prepare('SELECT * FROM entreprises WHERE id=?').get(id);
  if (!e) throw Object.assign(new Error('Entreprise introuvable'), { statut: 404 });
  const tx = db.transaction(() => {
    const magasins = db.prepare('SELECT id FROM magasins WHERE entreprise_id=?').all(id).map((m) => m.id);
    if (magasins.length) {
      const marques = magasins.map(() => '?').join(',');
      db.prepare(`DELETE FROM ventes_lignes WHERE vente_id IN (SELECT id FROM ventes WHERE magasin_id IN (${marques}))`).run(...magasins);
      db.prepare(`DELETE FROM ventes WHERE magasin_id IN (${marques})`).run(...magasins);
      db.prepare(`DELETE FROM mouvements_stock WHERE magasin_id IN (${marques})`).run(...magasins);
      db.prepare(`DELETE FROM stocks WHERE magasin_id IN (${marques})`).run(...magasins);
      // Deux listes de marqueurs : les mêmes identifiants sont passés deux fois.
      db.prepare(`DELETE FROM transferts WHERE magasin_source_id IN (${marques}) OR magasin_dest_id IN (${marques})`).run(...magasins, ...magasins);
      db.prepare(`DELETE FROM commandes_achat_lignes WHERE commande_id IN (SELECT id FROM commandes_achat WHERE magasin_id IN (${marques}))`).run(...magasins);
      db.prepare(`DELETE FROM commandes_achat WHERE magasin_id IN (${marques})`).run(...magasins);
      /* Les fiches du personnel portent des pièces PDF sur disque : elles doivent
         être effacées avec l'entreprise, sinon les fichiers restent orphelins. */
      db.prepare(`SELECT id FROM employes WHERE magasin_id IN (${marques})`).all(...magasins)
        .forEach((e) => RH.supprimerDocumentsDe(e.id));
      db.prepare(`DELETE FROM salaires WHERE employe_id IN (SELECT id FROM employes WHERE magasin_id IN (${marques}))`).run(...magasins);
      db.prepare(`DELETE FROM employes WHERE magasin_id IN (${marques})`).run(...magasins);
      db.prepare(`DELETE FROM magasins WHERE id IN (${marques})`).run(...magasins);
    }
    /* Ressources humaines : paies, candidatures et documents de l'entreprise. */
    db.prepare('DELETE FROM salaires WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM candidats WHERE entreprise_id=?').run(id);
    db.prepare('SELECT id FROM employes WHERE entreprise_id=?').all(id)
      .forEach((e) => RH.supprimerDocumentsDe(e.id));
    db.prepare('DELETE FROM produits WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM categories WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM clients WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM fournisseurs WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM paiements_abonnement WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM abonnements WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM parametres WHERE entreprise_id=?').run(id);
    /* Codes de vérification, emails consignés et journal : rattachés à
       l'entreprise, ils doivent partir avec elle (sinon orphelins en base). */
    db.prepare('DELETE FROM codes_verification WHERE user_id IN (SELECT id FROM users WHERE entreprise_id=?)').run(id);
    db.prepare('DELETE FROM mails_envoyes WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM journal_evenements WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM users WHERE entreprise_id=?').run(id);
    db.prepare('DELETE FROM entreprises WHERE id=?').run(id);
  });
  tx();
  return e;
}

/* ------------------------------------------------------------------ */
/* Console du propriétaire : toutes les entreprises                    */
/* ------------------------------------------------------------------ */

const REQUETE_STATS = `
  SELECT e.*,
    (SELECT COUNT(*) FROM magasins m WHERE m.entreprise_id=e.id) AS nb_magasins,
    (SELECT COUNT(*) FROM magasins m WHERE m.entreprise_id=e.id AND m.actif=1) AS nb_magasins_actifs,
    (SELECT COUNT(*) FROM users u WHERE u.entreprise_id=e.id) AS nb_comptes,
    (SELECT COUNT(*) FROM produits p WHERE p.entreprise_id=e.id) AS nb_produits,
    (SELECT COUNT(*) FROM clients c WHERE c.entreprise_id=e.id) AS nb_clients,
    (SELECT COUNT(*) FROM ventes v JOIN magasins m ON m.id=v.magasin_id
       WHERE m.entreprise_id=e.id AND v.statut='payee') AS nb_ventes,
    (SELECT IFNULL(SUM(v.total),0) FROM ventes v JOIN magasins m ON m.id=v.magasin_id
       WHERE m.entreprise_id=e.id AND v.statut='payee') AS ca_total,
    (SELECT IFNULL(SUM(v.total),0) FROM ventes v JOIN magasins m ON m.id=v.magasin_id
       WHERE m.entreprise_id=e.id AND v.statut='payee'
         AND strftime('%Y-%m', v.created_at)=strftime('%Y-%m','now','localtime')) AS ca_mois,
    (SELECT IFNULL(SUM(v.total),0) FROM ventes v JOIN magasins m ON m.id=v.magasin_id
       WHERE m.entreprise_id=e.id AND v.statut='payee' AND date(v.created_at)=date('now','localtime')) AS ca_jour,
    (SELECT MAX(v.created_at) FROM ventes v JOIN magasins m ON m.id=v.magasin_id
       WHERE m.entreprise_id=e.id) AS derniere_vente,
    (SELECT IFNULL(SUM(p.montant),0) FROM paiements_abonnement p
       WHERE p.entreprise_id=e.id AND p.statut='valide') AS total_paye,
    (SELECT COUNT(*) FROM paiements_abonnement p
       WHERE p.entreprise_id=e.id AND p.statut='en_attente') AS paiements_en_attente,
    (SELECT IFNULL(SUM(s.quantite * pr.prix_vente),0) FROM stocks s
       JOIN produits pr ON pr.id=s.produit_id
       WHERE pr.entreprise_id=e.id) AS valeur_stock
  FROM entreprises e`;

/** Liste des entreprises avec abonnement, activité et volumes. */
function listerEntreprises({ q = '', statut = null } = {}) {
  let sql = REQUETE_STATS;
  const p = [];
  if (q) { sql += ' WHERE e.nom LIKE ? OR e.email LIKE ? OR IFNULL(e.niu,\'\') LIKE ?'; p.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  if (statut) { sql += (sql.includes('WHERE') ? ' AND' : ' WHERE ') + ' e.statut = ?'; p.push(statut); }
  sql += ' ORDER BY e.id DESC';
  return db.prepare(sql).all(...p).map((e) => {
    const ab = Abonnement.etat(e.id);
    const magasins = db.prepare('SELECT id,nom,ville,actif FROM magasins WHERE entreprise_id=? ORDER BY actif DESC, id').all(e.id);
    const responsable = db.prepare("SELECT nom,email FROM users WHERE entreprise_id=? AND role='admin' ORDER BY id LIMIT 1").get(e.id);
    return {
      ...e,
      abonnement: {
        statut: ab.statut, statut_libelle: ab.statut_libelle, plan: ab.plan,
        jours_restants: ab.jours_restants, date_debut: ab.date_debut, date_fin: ab.date_fin,
        en_essai: ab.en_essai, expire: ab.expire, alerte_bientot: ab.alerte_bientot,
      },
      magasins,
      responsable: responsable || null,
    };
  });
}

/** Fiche complète d'une entreprise : infos, magasins, comptes, paiements. */
function detailEntreprise(id) {
  const e = db.prepare(REQUETE_STATS + ' WHERE e.id=?').get(id);
  if (!e) throw Object.assign(new Error('Entreprise introuvable'), { statut: 404 });
  const magasins = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM users u WHERE u.magasin_id=m.id) AS nb_comptes,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.magasin_id=m.id AND v.statut='payee') AS ca_total,
      (SELECT IFNULL(SUM(v.total),0) FROM ventes v WHERE v.magasin_id=m.id AND v.statut='payee'
         AND date(v.created_at)=date('now','localtime')) AS ca_jour,
      (SELECT COUNT(*) FROM ventes v WHERE v.magasin_id=m.id AND v.statut='payee') AS nb_ventes,
      (SELECT IFNULL(SUM(s.quantite * p.prix_vente),0) FROM stocks s JOIN produits p ON p.id=s.produit_id
         WHERE s.magasin_id=m.id) AS valeur_stock
    FROM magasins m WHERE m.entreprise_id=? ORDER BY m.actif DESC, m.id`).all(id);
  const utilisateurs = db.prepare(`
    SELECT u.id,u.nom,u.email,u.role,u.actif,u.dernier_login,u.created_at, m.nom AS magasin
    FROM users u LEFT JOIN magasins m ON m.id=u.magasin_id WHERE u.entreprise_id=? ORDER BY u.id`).all(id);
  const paiements = db.prepare(`
    SELECT p.*, v.nom AS valide_par_nom FROM paiements_abonnement p
    LEFT JOIN users v ON v.id = p.valide_par WHERE p.entreprise_id=? ORDER BY p.id DESC`).all(id);
  const abonnements = db.prepare('SELECT * FROM abonnements WHERE entreprise_id=? ORDER BY id DESC LIMIT 20').all(id);
  const topProduits = db.prepare(`
    SELECT vl.nom_produit AS nom, SUM(vl.quantite) AS quantite, SUM(vl.total) AS ca
    FROM ventes_lignes vl JOIN ventes v ON v.id=vl.vente_id
    JOIN magasins m ON m.id=v.magasin_id
    WHERE m.entreprise_id=? AND v.statut='payee'
    GROUP BY vl.nom_produit ORDER BY ca DESC LIMIT 8`).all(id);
  return {
    entreprise: e,
    abonnement: Abonnement.etat(id),
    magasins, utilisateurs, paiements, abonnements, top_produits: topProduits,
  };
}

/** Tous les paiements de toutes les entreprises (page « Paiements » du propriétaire). */
function tousLesPaiements({ statut = null, service = null, entreprise_id = null } = {}) {
  let sql = `
    SELECT p.*, e.nom AS entreprise, e.logo AS entreprise_logo, e.statut AS entreprise_statut,
           u.nom AS utilisateur, v.nom AS valide_par_nom
    FROM paiements_abonnement p
    LEFT JOIN entreprises e ON e.id = p.entreprise_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users v ON v.id = p.valide_par
    WHERE 1=1`;
  const params = [];
  if (statut) { sql += ' AND p.statut = ?'; params.push(statut); }
  if (service) { sql += ' AND p.service = ?'; params.push(service); }
  if (entreprise_id) { sql += ' AND p.entreprise_id = ?'; params.push(Number(entreprise_id)); }
  sql += ' ORDER BY p.id DESC LIMIT 400';
  return db.prepare(sql).all(...params);
}

/** Chiffres globaux de la plateforme. */
function statsPlateforme() {
  const entreprises = listerEntreprises();
  const valide = (s) => entreprises.filter((e) => e.abonnement.statut === s);
  const encaisse = db.prepare("SELECT IFNULL(SUM(montant),0) s, COUNT(*) n FROM paiements_abonnement WHERE statut='valide'").get();
  const enAttente = db.prepare("SELECT IFNULL(SUM(montant),0) s, COUNT(*) n FROM paiements_abonnement WHERE statut='en_attente'").get();
  const mrr = valide('actif').reduce((s, e) => s + (e.abonnement.plan === 'annuel'
    ? Math.round((e.abonnement ? Number(e.montant) : 0) / 12) || 11000
    : (e.abonnement.plan === 'mensuel' ? 11500 : 0)), 0);
  return {
    nb_entreprises: entreprises.length,
    nb_actives: entreprises.filter((e) => e.statut === 'actif').length,
    nb_suspendues: entreprises.filter((e) => e.statut === 'suspendu').length,
    nb_essai: valide('essai').length,
    nb_abonnes: valide('actif').length,
    nb_expirees: valide('expire').length,
    nb_magasins: entreprises.reduce((s, e) => s + e.nb_magasins, 0),
    nb_comptes: entreprises.reduce((s, e) => s + e.nb_comptes, 0),
    nb_produits: entreprises.reduce((s, e) => s + e.nb_produits, 0),
    nb_ventes: entreprises.reduce((s, e) => s + e.nb_ventes, 0),
    ca_reseau: entreprises.reduce((s, e) => s + e.ca_total, 0),
    ca_mois: entreprises.reduce((s, e) => s + e.ca_mois, 0),
    encaisse: encaisse.s,
    nb_paiements_valides: encaisse.n,
    attente_montant: enAttente.s,
    attente_nb: enAttente.n,
    mrr_estime: mrr,
    tarifs: Abonnement.tarifs(),
    entreprises,
  };
}

module.exports = {
  PROPRIETAIRE,
  assurerProprietaire,
  creerEntreprise,
  majEntreprise,
  supprimerEntreprise,
  listerEntreprises,
  detailEntreprise,
  tousLesPaiements,
  statsPlateforme,
  emailDejaUtilise,
};
