/**
 * Connexion SQLite + schéma de la base de données.
 * Base : data/shopmanager.db (fichier local, portable).
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* SP_DB permet de pointer vers un autre fichier : pratique pour rejouer les
   migrations sur une copie de la base sans toucher aux données réelles. */
const FICHIER_DB = process.env.SP_DB || path.join(DATA_DIR, 'shopmanager.db');
const db = new Database(FICHIER_DB);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',   -- tableau JSON de permissions
  portee TEXT NOT NULL DEFAULT 'magasin',   -- reseau | magasin
  systeme INTEGER NOT NULL DEFAULT 0,       -- 1 = rôle livré avec l'application
  attribuable_boutique INTEGER NOT NULL DEFAULT 0, -- 1 = un responsable de boutique peut l'attribuer
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Entreprises clientes (multi-entreprises) : chaque entreprise possede ses
-- magasins, ses produits, ses clients, ses comptes et son abonnement.
CREATE TABLE IF NOT EXISTS entreprises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  email TEXT NOT NULL,                        -- email professionnel du responsable
  nom_contact TEXT,
  prenom_contact TEXT,
  telephone TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'Cameroun',
  date_creation TEXT,                         -- date de creation de l entreprise
  niu TEXT,                                   -- numero contribuable
  logo TEXT,                                  -- image du logo (data URL)
  statut TEXT NOT NULL DEFAULT 'actif',       -- actif | suspendu
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS magasins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  ville TEXT,
  adresse TEXT,
  telephone TEXT,
  responsable TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'caissier',     -- référence roles.code
  magasin_id INTEGER REFERENCES magasins(id) ON DELETE SET NULL,  -- boutique d'affectation
  actif INTEGER NOT NULL DEFAULT 1,
  dernier_login TEXT,
  cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS produits (
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  code_barres TEXT,
  nom TEXT NOT NULL,
  categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unite TEXT DEFAULT 'pièce',
  prix_achat REAL NOT NULL DEFAULT 0,
  prix_vente REAL NOT NULL DEFAULT 0,
  tva REAL NOT NULL DEFAULT 19.25,          -- taux TVA Cameroun
  seuil_alerte INTEGER NOT NULL DEFAULT 5,
  actif INTEGER NOT NULL DEFAULT 1,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  magasin_id INTEGER NOT NULL REFERENCES magasins(id) ON DELETE CASCADE,
  quantite REAL NOT NULL DEFAULT 0,
  maj_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (produit_id, magasin_id)
);

CREATE TABLE IF NOT EXISTS mouvements_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  magasin_id INTEGER NOT NULL REFERENCES magasins(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                        -- entree | sortie | vente | ajustement | transfert_entree | transfert_sortie | retour
  quantite REAL NOT NULL,
  quantite_avant REAL DEFAULT 0,
  quantite_apres REAL DEFAULT 0,
  motif TEXT,
  reference TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Inventaires physiques : une session = un comptage, à une date donnée,
-- pour un magasin (ou tous les magasins si magasin_id est NULL).
CREATE TABLE IF NOT EXISTS inventaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  magasin_id INTEGER REFERENCES magasins(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon',      -- brouillon | cloture
  commentaire TEXT,
  cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cloture_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cloture_at TEXT
);

-- Lignes de comptage : stock théorique (ce que le système annonce), stock
-- recalculé depuis les mouvements, et stock réellement compté.
CREATE TABLE IF NOT EXISTS inventaires_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventaire_id INTEGER NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  magasin_id INTEGER REFERENCES magasins(id) ON DELETE CASCADE,
  quantite_theorique REAL NOT NULL DEFAULT 0,
  quantite_calculee REAL NOT NULL DEFAULT 0,
  quantite_comptee REAL,
  prix_achat REAL NOT NULL DEFAULT 0,
  prix_vente REAL NOT NULL DEFAULT 0,
  compte_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  maj_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (inventaire_id, produit_id, magasin_id)
);

-- Messagerie interne : messages entre comptes (propriétaire <-> admins, admin <-> ses comptes).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  de_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  de_nom TEXT, de_email TEXT,
  a_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  a_nom TEXT, a_email TEXT,
  entreprise_id INTEGER,           -- entreprise de l'expéditeur (0 pour le propriétaire)
  objet TEXT NOT NULL,
  corps TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  lu_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS clients (
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  nom TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  type TEXT DEFAULT 'particulier',           -- particulier | entreprise
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fournisseurs (
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  nom TEXT NOT NULL,
  contact TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  categorie TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ventes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  magasin_id INTEGER NOT NULL REFERENCES magasins(id) ON DELETE RESTRICT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sous_total REAL NOT NULL DEFAULT 0,
  remise REAL NOT NULL DEFAULT 0,
  tva REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  mode_paiement TEXT NOT NULL DEFAULT 'especes',  -- especes | mobile_money | carte | credit
  montant_paye REAL NOT NULL DEFAULT 0,
  monnaie REAL NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'payee',           -- payee | annulee
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ventes_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  produit_id INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  nom_produit TEXT NOT NULL,
  quantite REAL NOT NULL,
  prix_unitaire REAL NOT NULL,
  remise REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS transferts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  magasin_source_id INTEGER NOT NULL REFERENCES magasins(id),
  magasin_dest_id INTEGER NOT NULL REFERENCES magasins(id),
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  quantite REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente | valide | annule
  note TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  valide_at TEXT
);

CREATE TABLE IF NOT EXISTS commandes_achat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  fournisseur_id INTEGER NOT NULL REFERENCES fournisseurs(id),
  magasin_id INTEGER NOT NULL REFERENCES magasins(id),
  statut TEXT NOT NULL DEFAULT 'brouillon',   -- brouillon | commandee | recue | annulee
  total REAL NOT NULL DEFAULT 0,
  note TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  reception_at TEXT
);

CREATE TABLE IF NOT EXISTS commandes_achat_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commande_id INTEGER NOT NULL REFERENCES commandes_achat(id) ON DELETE CASCADE,
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  quantite REAL NOT NULL,
  prix_unitaire REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS employes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  nom TEXT NOT NULL,
  poste TEXT,
  magasin_id INTEGER REFERENCES magasins(id) ON DELETE SET NULL,
  telephone TEXT,
  email TEXT,
  date_embauche TEXT,
  type_contrat TEXT DEFAULT 'CDI',
  salaire REAL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

/* Suivi mensuel des versements de salaire (un employé, un mois = une ligne). */
CREATE TABLE IF NOT EXISTS salaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  employe_id INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,                      -- 'AAAA-MM'
  montant REAL NOT NULL DEFAULT 0,            -- montant versé ce mois-là
  primes REAL NOT NULL DEFAULT 0,
  retenues REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  date_paiement TEXT,
  statut TEXT NOT NULL DEFAULT 'a_payer',     -- a_payer | paye
  mode_paiement TEXT,                         -- especes | mobile_money | virement
  reference TEXT,
  notes TEXT,
  saisi_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (employe_id, periode)
);

/* Documents (PDF) téléversés pour un employé : CNI, diplôme, CV, contrat… */
CREATE TABLE IF NOT EXISTS documents_employe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  employe_id INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL DEFAULT 'autre',    -- cni | diplome | cv | contrat | attestation | autre
  nom_original TEXT NOT NULL,
  nom_stocke TEXT NOT NULL,                   -- fichier sur disque (data/documents/…)
  type_mime TEXT NOT NULL DEFAULT 'application/pdf',
  taille INTEGER NOT NULL DEFAULT 0,
  date_document TEXT,
  televerse_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

/* Pièces PDF jointes à une candidature (CV, lettre, diplôme…). À l'embauche,
   elles sont transférées automatiquement dans le dossier de l'employé créé. */
CREATE TABLE IF NOT EXISTS documents_candidat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  candidat_id INTEGER NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL DEFAULT 'autre',
  nom_original TEXT NOT NULL,
  nom_stocke TEXT NOT NULL,
  type_mime TEXT NOT NULL DEFAULT 'application/pdf',
  taille INTEGER NOT NULL DEFAULT 0,
  televerse_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

/* Vivier de recrutement : candidatures reçues, entretiens, décision. */
CREATE TABLE IF NOT EXISTS candidats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  poste_vise TEXT,
  magasin_id INTEGER REFERENCES magasins(id) ON DELETE SET NULL,
  telephone TEXT,
  email TEXT,
  ville TEXT,
  date_naissance TEXT,
  date_candidature TEXT NOT NULL DEFAULT (date('now','localtime')),
  source TEXT,                                -- annonce | spontanee | recommendation | agence
  experience_annees INTEGER DEFAULT 0,
  formation TEXT,
  statut TEXT NOT NULL DEFAULT 'recu',        -- recu | entretien | retenu | embauche | refuse
  date_entretien TEXT,
  salaire_propose REAL DEFAULT 0,
  motif TEXT,                                 -- motif de refus ou note de décision
  employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL,  -- rempli à l'embauche
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS abonnements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'essai',      -- essai | actif
  plan TEXT,                                 -- mensuel | annuel
  montant REAL NOT NULL DEFAULT 0,
  date_debut TEXT NOT NULL DEFAULT (date('now','localtime')),
  date_fin TEXT NOT NULL,
  reference TEXT,
  maj_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS paiements_abonnement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  reference TEXT UNIQUE NOT NULL,
  service TEXT NOT NULL,                     -- orange_money | mtn_momo
  numero_paiement TEXT NOT NULL,             -- numéro marchand à créditer
  telephone_payeur TEXT,
  nom_payeur TEXT,
  plan TEXT NOT NULL,                        -- mensuel | annuel
  montant REAL NOT NULL,
  duree_jours INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | valide | rejete
  message TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  valide_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  traite_at TEXT
);

-- Formules d'abonnement configurables par le propriétaire de la plateforme :
-- il définit librement la durée (en jours) et le montant de chaque formule.
CREATE TABLE IF NOT EXISTS formules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                 -- mensuel | annuel | trimestre…
  libelle TEXT NOT NULL,
  duree_jours INTEGER NOT NULL,
  montant REAL NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  ordre INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  maj_le TEXT
);

-- Réductions et augmentations décidées par le propriétaire de la plateforme.
-- type = 'pourcentage' | 'montant' ; signe négatif = augmentation de prix.
CREATE TABLE IF NOT EXISTS reductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  libelle TEXT,
  type TEXT NOT NULL DEFAULT 'pourcentage',   -- pourcentage | montant
  valeur REAL NOT NULL,                       -- 10 => 10 % ; 2000 => 2 000 FCFA
  formule_code TEXT,                          -- NULL = toutes les formules
  max_utilisations INTEGER,
  utilisations INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  debut TEXT,
  fin TEXT,
  note TEXT,
  cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Paramètres : entreprise_id = 0 pour les réglages de la plateforme,
-- sinon les réglages de l'entreprise (marque, TVA, préfixe des tickets…).
CREATE TABLE IF NOT EXISTS parametres (
  entreprise_id INTEGER NOT NULL DEFAULT 0,
  cle TEXT NOT NULL,
  valeur TEXT,
  PRIMARY KEY (entreprise_id, cle)
);

CREATE INDEX IF NOT EXISTS idx_ventes_date ON ventes(created_at);
CREATE INDEX IF NOT EXISTS idx_ventes_magasin ON ventes(magasin_id);
CREATE INDEX IF NOT EXISTS idx_lignes_vente ON ventes_lignes(vente_id);
CREATE INDEX IF NOT EXISTS idx_mvt_produit ON mouvements_stock(produit_id, magasin_id);
CREATE INDEX IF NOT EXISTS idx_stocks_magasin ON stocks(magasin_id);
`;

db.exec(SCHEMA);

/* ---------------- Migrations légères (bases déjà existantes) ---------------- */
function indexExiste(nom) {
  return !!db.prepare('SELECT name FROM sqlite_master WHERE type=\'index\' AND name=?').get(nom);
}
function colonneExiste(table, colonne) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === colonne);
}
function migrer() {
  if (!colonneExiste('users', 'cree_par')) {
    db.exec('ALTER TABLE users ADD COLUMN cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL');
    console.log('  ↳ Migration : colonne users.cree_par ajoutée.');
  }
  if (!colonneExiste('users', 'permissions_extra')) {
    db.exec("ALTER TABLE users ADD COLUMN permissions_extra TEXT NOT NULL DEFAULT '[]'");
    console.log('  ↳ Migration : colonne users.permissions_extra ajoutée (habilitations accordées).');
  }
  if (!colonneExiste('users', 'permissions_retirees')) {
    db.exec("ALTER TABLE users ADD COLUMN permissions_retirees TEXT NOT NULL DEFAULT '[]'");
    console.log('  ↳ Migration : colonne users.permissions_retirees ajoutée (habilitations retirées).');
  }

  /* ---- Vérification de l'email (inscription des entreprises) ---- */
  if (!colonneExiste('users', 'email_verifie')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verifie INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE users ADD COLUMN email_verifie_at TEXT');
    // Les comptes existants sont réputés vérifiés : ils précèdent cette fonctionnalité.
    db.exec('UPDATE users SET email_verifie=1 WHERE email_verifie=0');
    console.log('  ↳ Migration : colonne users.email_verifie ajoutée (vérification par email).');
  }
  if (!colonneExiste('users', 'langue')) {
    db.exec("ALTER TABLE users ADD COLUMN langue TEXT NOT NULL DEFAULT 'fr'");
    console.log('  ↳ Migration : colonne users.langue ajoutée (langue préférée du compte).');
  }
  if (!colonneExiste('magasins', 'type')) {
    db.exec("ALTER TABLE magasins ADD COLUMN type TEXT NOT NULL DEFAULT 'boutique'");
    db.exec("UPDATE magasins SET type='boutique' WHERE type IS NULL OR type=''");
    console.log('  ↳ Migration : colonne magasins.type ajoutée (magasin = stock seul, boutique = stock + ventes).');
  }

  /* ---- Dossier du personnel : état civil et suivi RH ---- */
  const colonnesEmployes = [
    ['civilite', "TEXT DEFAULT 'M.'"],
    ['date_naissance', 'TEXT'],
    ['lieu_naissance', 'TEXT'],
    ['sexe', 'TEXT'],
    ['situation_matrimoniale', 'TEXT'],
    ['adresse', 'TEXT'],
    ['ville', 'TEXT'],
    ['numero_cni', 'TEXT'],
    ['numero_cnps', 'TEXT'],
    ['numero_ifu', 'TEXT'],
    ['contact_urgence_nom', 'TEXT'],
    ['contact_urgence_tel', 'TEXT'],
    ['formation', 'TEXT'],
    ['date_fin_contrat', 'TEXT'],
    ['date_sortie', 'TEXT'],
    ['motif_sortie', 'TEXT'],
    ['notes', 'TEXT'],
  ];
  colonnesEmployes.forEach(([colonne, type]) => {
    if (!colonneExiste('employes', colonne)) {
      db.exec(`ALTER TABLE employes ADD COLUMN ${colonne} ${type}`);
    }
  });
  if (!colonneExiste('employes', 'statut_dossier')) {
    db.exec("ALTER TABLE employes ADD COLUMN statut_dossier TEXT NOT NULL DEFAULT 'complet'");
    // Un dossier sans CNI ni contrat enregistré est signalé « incomplet ».
    console.log('  ↳ Migration : dossier du personnel enrichi (état civil, CNI, CNPS, sortie).');
  }

  /* ---- Multi-entreprises : rattachement des tables à une entreprise ---- */
  // (les colonnes doivent exister avant de pouvoir les indexer)
  const aRattacher = [
    ['magasins', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['users', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['categories', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['produits', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['clients', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['fournisseurs', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['abonnements', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['paiements_abonnement', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
    ['employes', 'INTEGER REFERENCES entreprises(id) ON DELETE CASCADE'],
  ];
  aRattacher.forEach(([table, type]) => {
    if (!colonneExiste(table, 'entreprise_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN entreprise_id ${type}`);
      console.log(`  ↳ Migration : colonne ${table}.entreprise_id ajoutée.`);
    }
  });

  ['magasins', 'users', 'produits', 'employes', 'salaires', 'candidats', 'documents_employe'].forEach((t) => {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_entreprise ON ${t}(entreprise_id)`);
  });
  db.exec('CREATE INDEX IF NOT EXISTS idx_salaires_employe ON salaires(employe_id, periode)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_employe ON documents_employe(employe_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidats_statut ON candidats(entreprise_id, statut)');

  // « parametres » passe d'une clé globale à une clé par entreprise (0 = plateforme)
  if (!colonneExiste('parametres', 'entreprise_id')) {
    db.exec(`CREATE TABLE parametres_nouveau (
      entreprise_id INTEGER NOT NULL DEFAULT 0,
      cle TEXT NOT NULL,
      valeur TEXT,
      PRIMARY KEY (entreprise_id, cle)
    )`);
    db.exec('INSERT OR IGNORE INTO parametres_nouveau (entreprise_id, cle, valeur) SELECT 0, cle, valeur FROM parametres');
    db.exec('DROP TABLE parametres');
    db.exec('ALTER TABLE parametres_nouveau RENAME TO parametres');
    console.log('  ↳ Migration : paramètres désormais propres à chaque entreprise.');
  }

  /* ---- Codes uniques par entreprise ----
     Un code de boutique ne doit pas être réservé par une autre entreprise :
     l'unicité devient (entreprise_id, code) au lieu d'être globale.
     La table est reconstruite en conservant ses colonnes réelles. */
  const uniciteParEntreprise = [
    ['magasins', 'code'],
    ['categories', 'nom'],
    ['produits', 'code'],
    ['clients', 'code'],
    ['fournisseurs', 'code'],
    ['employes', 'code'],
  ];
  uniciteParEntreprise.forEach(([table, colonne]) => {
    // Déjà migrée ? Le DDL de la table porte alors la contrainte composée.
    const ddlActuel = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) || {}).sql || '';
    if (/UNIQUE\s*\(\s*entreprise_id\s*,/i.test(ddlActuel)) return;
    const colonnes = db.prepare(`PRAGMA table_info(${table})`).all();
    const noms = colonnes.map((c) => c.name);
    if (!noms.includes(colonne) || !noms.includes('entreprise_id')) return;
    const types = {
      INTEGER: 'INTEGER', TEXT: 'TEXT', REAL: 'REAL', NUMERIC: 'NUMERIC', BLOB: 'BLOB',
    };
    const defs = colonnes.map((c) => {
      if (c.name === 'id') return 'id INTEGER PRIMARY KEY AUTOINCREMENT';
      let d = `  ${c.name} ${types[String(c.type).toUpperCase()] || 'TEXT'}`;
      if (c.notnull) d += ' NOT NULL';
      // Les valeurs par défaut littérales doivent rester entre parenthèses en SQLite.
      if (c.dflt_value !== null) {
        const brut = String(c.dflt_value);
        const litteral = /^-?\d+(\.\d+)?$/.test(brut) || /^(CURRENT_TIME|CURRENT_DATE|CURRENT_TIMESTAMP)$/i.test(brut)
          || /^('.*'|\(.*\))$/s.test(brut);
        d += ` DEFAULT ${litteral ? brut : '(' + brut + ')'}`;
      }
      if (c.name === 'entreprise_id') d += ' REFERENCES entreprises(id) ON DELETE CASCADE';
      return d;
    }).join(',\n');
    const ddl = `CREATE TABLE ${table}_nouveau (\n${defs},\n  UNIQUE (entreprise_id, ${colonne})\n)`;
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec(ddl);
    db.exec(`INSERT OR IGNORE INTO ${table}_nouveau (${noms.join(',')}) SELECT ${noms.join(',')} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_nouveau RENAME TO ${table}`);
    db.exec('PRAGMA foreign_keys=ON');
    console.log(`  ↳ Migration : « ${table}.${colonne} » désormais unique par entreprise.`);
  });

  /* ---- Paiements d'abonnement : prestataire de paiement (PSP) + réductions ---- */
  [
    ['psp', "TEXT DEFAULT 'manuel'"],
    ['psp_mode', 'TEXT'],
    ['psp_reference', 'TEXT'],
    ['psp_ticket', 'TEXT'],
    ['psp_statut', 'TEXT'],
    ['psp_url', 'TEXT'],
    ['psp_brut', 'TEXT'],
    ['montant_brut', 'REAL'],
    ['reduction_id', 'INTEGER'],
    ['code_reduction', 'TEXT'],
    ['carte_titulaire', 'TEXT'],
    ['carte_numero_masque', 'TEXT'],
    ['carte_expiration', 'TEXT'],
  ].forEach(([colonne, type]) => {
    try { db.exec(`ALTER TABLE paiements_abonnement ADD COLUMN ${colonne} ${type}`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  });

  /* ---- Formules d'abonnement par défaut (créées une seule fois) ---- */
  if (db.prepare('SELECT COUNT(*) c FROM formules').get().c === 0) {
    const ins = db.prepare(`INSERT INTO formules (code, libelle, duree_jours, montant, ordre, note)
      VALUES (?,?,?,?,?,?)`);
    ins.run('mensuel', 'Abonnement mensuel', 30, 11500, 1, 'Formule par défaut : 30 jours.');
    ins.run('annuel', 'Abonnement annuel', 365, 132000, 2, 'Formule par défaut : 12 mois.');
    console.log('  ↳ Formules d\'abonnement par défaut créées (mensuel 11 500 FCFA / annuel 132 000 FCFA).');
  }

  /* ---- Reprise des données existantes : elles appartiennent à l'entreprise de démonstration ---- */
  /* Toutes les tables rattachables sont comptées : sans cela, une table ajoutée
     plus tard (ex. employes) ne serait jamais rattachée si les autres le sont déjà. */
  const orphelins = ['magasins', 'categories', 'produits', 'clients', 'fournisseurs',
    'abonnements', 'paiements_abonnement', 'employes']
    .reduce((n, t) => n + db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE entreprise_id IS NULL`).get().c, 0)
    + db.prepare("SELECT COUNT(*) c FROM users WHERE entreprise_id IS NULL AND role <> 'super_admin'").get().c;
  if (orphelins > 0) {
    let demo = db.prepare('SELECT * FROM entreprises WHERE id=1').get();
    if (!demo) {
      db.prepare(`INSERT INTO entreprises (id, nom, email, nom_contact, prenom_contact, telephone, ville,
                    date_creation, niu, statut, notes)
                  VALUES (1, 'INVENTA GESTYPRO SARL', 'contact@shoppingplus.cm', 'Nkolo', 'Awa',
                    '+237 6 99 12 34 56', 'Yaoundé', '2019-03-12', 'M071234567890H', 'actif',
                    'Entreprise de démonstration livrée avec l’application.')`).run();
      console.log('  ↳ Migration : entreprise de démonstration « INVENTA GESTYPRO SARL » créée.');
    }
    ['magasins', 'categories', 'produits', 'clients', 'fournisseurs', 'abonnements',
      'paiements_abonnement', 'employes']
      .forEach((t) => db.prepare(`UPDATE ${t} SET entreprise_id=1 WHERE entreprise_id IS NULL`).run());
    db.prepare("UPDATE users SET entreprise_id=1 WHERE entreprise_id IS NULL AND role <> 'super_admin'").run();

    // Les réglages de marque quittent la plateforme pour appartenir à l'entreprise
    const MARQUE = ['nom_entreprise', 'slogan', 'adresse', 'telephone', 'email', 'contribuable',
      'tva_defaut', 'prefixe_vente', 'objectif_mensuel', 'message_ticket'];
    const deplacer = db.prepare(`INSERT INTO parametres (entreprise_id, cle, valeur) VALUES (1, ?, ?)
      ON CONFLICT(entreprise_id, cle) DO UPDATE SET valeur=excluded.valeur`);
    MARQUE.forEach((cle) => {
      const row = db.prepare('SELECT valeur FROM parametres WHERE cle=? AND entreprise_id=0').get(cle);
      if (row) { deplacer.run(cle, row.valeur); db.prepare('DELETE FROM parametres WHERE cle=? AND entreprise_id=0').run(cle); }
    });
    console.log(`  ↳ Migration : ${orphelins} fiche(s) rattachée(s) à l'entreprise de démonstration.`);
  }
}
migrer();

/* ---------------- Paramètres par défaut ---------------- */

/** Réglages de la plateforme (communs à toutes les entreprises). */
const PARAMS_PLATEFORME = {
  devise: 'FCFA',
  tarif_mensuel: '11500',
  tarif_annuel: '132000',
  essai_jours: '7',
  om_numero: '693007397',
  mtn_numero: '654324282',
  om_ussd: '#150#',
  mtn_ussd: '*126#',
  paiement_marchand: 'INVENTA GESTYPRO',
  paiement_instructions: '',
  whatsapp_support: '654324282',
  whatsapp_message: 'Bonjour, j’ai besoin d’aide sur Inventa GestyPro.',
  support_email: 'support@shoppingplus.cm',
};

/** Réglages de marque par défaut d'une nouvelle entreprise. */
function parametresEntreprise(infos = {}) {
  return {
    nom_entreprise: infos.nom || 'Mon entreprise',
    slogan: infos.slogan || 'Gestion de mes magasins',
    adresse: infos.adresse || '',
    telephone: infos.telephone || '',
    email: infos.email || '',
    contribuable: infos.niu || '',
    ville: infos.ville || '',
    tva_defaut: '19.25',
    prefixe_vente: 'VTE',
    objectif_mensuel: '0',
    message_ticket: 'Merci de votre visite et à bientôt ! Aucun échange sans ticket.',
  };
}

/** Écrit (ou met à jour) un paramètre propre à une entreprise. 0 = plateforme. */
const setParam = db.prepare(
  'INSERT INTO parametres (entreprise_id, cle, valeur) VALUES (?, ?, ?) ON CONFLICT(entreprise_id, cle) DO UPDATE SET valeur=excluded.valeur'
);
for (const [k, v] of Object.entries(PARAMS_PLATEFORME)) setParam.run(0, k, v);

module.exports = { db, PARAMS_PLATEFORME, parametresEntreprise, setParam };
