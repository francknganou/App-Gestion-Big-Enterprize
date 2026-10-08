/**
 * Jeu de données de démonstration : magasins, produits, clients,
 * fournisseurs, employés, utilisateurs et 120 jours d'historique de ventes.
 * Le script ne s'exécute que si la base est vide.
 */
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { synchroniserRoles } = require('./auth');
const { parametresEntreprise, setParam } = require('./db');
const fs = require('fs');
const path = require('path');
/* Le dossier des pièces PDF est défini une seule fois, dans rh.js. */
const { DOSSIER_DOCUMENTS } = require('./rh');

/* PRNG déterministe -> données de démo reproductibles */
let seed = 20261004;
function rnd() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const dt = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

function seedDatabase() {
  synchroniserRoles();                       // les rôles doivent exister avant les comptes
  const already = db.prepare('SELECT COUNT(*) c FROM magasins').get().c;
  if (already > 0) return false;

  /* ---------------- Entreprise de démonstration ---------------- */
  const infoEntreprise = db.prepare(`INSERT INTO entreprises
    (nom,email,nom_contact,prenom_contact,telephone,ville,date_creation,niu,statut,notes)
    VALUES ('INVENTA GESTYPRO SARL','contact@shoppingplus.cm','Bilong','Angèle Ngo','+237 699 12 34 56',
            'Yaoundé','2019-03-12','M071234567890H','actif','Entreprise de démonstration livrée avec l’application.')`)
    .run();
  const ENT = Number(infoEntreprise.lastInsertRowid);

  // Réglages de marque de cette entreprise
  const reglages = parametresEntreprise({
    nom: 'INVENTA GESTYPRO SARL', slogan: 'Votre réseau de magasins au quotidien',
    adresse: 'Avenue Kennedy, Yaoundé', telephone: '+237 6 99 12 34 56',
    email: 'contact@shoppingplus.cm', niu: 'M071234567890H', ville: 'Yaoundé',
  });
  Object.entries(reglages).forEach(([cle, valeur]) => setParam.run(ENT, cle, String(valeur)));

  const run = db.transaction(() => {
    /* ---------------- Magasins ---------------- */
    const magasins = [
      ['MG-001', 'Inventa GestyPro Bastos', 'Yaoundé', 'Rue 1.735, Bastos', '+237 699 11 22 33', 'Mme Ngo Bilong'],
      ['MG-002', 'Inventa GestyPro Mvog-Mbi', 'Yaoundé', 'Carrefour Mvog-Mbi', '+237 699 44 55 66', 'M. Etoundi Paul'],
      ['MG-003', 'Inventa GestyPro Akwa', 'Douala', 'Boulevard de la Liberté, Akwa', '+237 677 77 88 99', 'Mme Fotso Léonie'],
      ['MG-004', 'Shopping Plus Bafoussam', 'Bafoussam', 'Marché A, Avenue de la Réunification', '+237 675 12 34 56', 'M. Kamga Serge'],
      ['MG-005', 'Shopping Plus Kribi', 'Kribi', 'Boulevard Maritime', '+237 671 98 76 54', 'Mme Mballa Chantal'],
    ];
    const insMagasin = db.prepare(
      'INSERT INTO magasins (entreprise_id,code,nom,ville,adresse,telephone,responsable) VALUES (?,?,?,?,?,?,?)'
    );
    magasins.forEach((m) => insMagasin.run(ENT, ...m));

    /* ---------------- Utilisateurs ---------------- */
    const hash = (p) => bcrypt.hashSync(p, 10);
    // [nom, email, mot de passe, rôle, boutique d'affectation]
    const users = [
      ['Administrateur Général', 'admin@shoppingplus.cm', hash('Admin@2026'), 'admin', null],
      ['Ngo Bilong Angèle (Direction réseau)', 'gestion@shoppingplus.cm', hash('Gest@2026'), 'gestionnaire', null],
      ['Awa Nkolo (Caissière Bastos)', 'caisse1@shoppingplus.cm', hash('Caisse@2026'), 'caissier', 1],
      ['Paul Etoundi (Caissier Mvog-Mbi)', 'caisse2@shoppingplus.cm', hash('Caisse@2026'), 'caissier', 2],
      ['Mballa Chantal (Caissière Kribi)', 'caisse3@shoppingplus.cm', hash('Caisse@2026'), 'caissier', 5],
      ['Serge Kamga (Agent de stock Bafoussam)', 'stock@shoppingplus.cm', hash('Stock@2026'), 'magasinier', 4],
      ['Tabi Junior (Agent de stock Akwa)', 'stock2@shoppingplus.cm', hash('Stock@2026'), 'magasinier', 3],
      ['Fotso Léonie (Responsable Akwa)', 'chef.akwa@shoppingplus.cm', hash('Chef@2026'), 'chef_boutique', 3],
      ['Mballa Céline (Responsable Kribi)', 'chef.kribi@shoppingplus.cm', hash('Chef@2026'), 'chef_boutique', 5],
      ['Ndoumbe Patrick (Réception Mvog-Mbi)', 'reception.mvogmbi@shoppingplus.cm', hash('Reception@2026'), 'receptionnaire', 2],
    ];
    /* Les comptes de démonstration sont prêts à l'emploi : leur adresse est
       réputée vérifiée, sinon le blocage EMAIL_NON_VERIFIE interdirait tout
       accès à une base fraîchement initialisée. */
    const insUser = db.prepare(
      `INSERT INTO users (entreprise_id,nom,email,mot_de_passe,role,magasin_id,cree_par,email_verifie,email_verifie_at)
       VALUES (?,?,?,?,?,?,1,1,datetime('now'))`
    );
    users.forEach((u) => insUser.run(ENT, ...u));

    /* ---------------- Catégories ---------------- */
    const categories = [
      ['Alimentation', 'Riz, huile, sucre, farine, conserves'],
      ['Boissons', 'Eaux, sodas, jus, bières'],
      ['Entretien & Hygiène', "Produits d'entretien et d'hygiène corporelle"],
      ['Cosmétiques', 'Soins de la peau, parfums, maquillage'],
      ['Électronique', 'Petit électroménager, accessoires téléphone'],
      ['Vêtements & Mode', 'Habillement homme, femme, enfant'],
      ['Papeterie & Scolaire', 'Fournitures scolaires et de bureau'],
      ['Bébé & Puériculture', 'Couches, laits, accessoires bébé'],
      ['Quincaillerie', 'Outillage et petit matériel de maison'],
    ];
    /* Le schéma est categories(id, entreprise_id, nom, couleur) : la description
       de la liste ci-dessus n'est pas stockée, elle ne sert qu'à documenter. */
    const insCat = db.prepare('INSERT INTO categories (entreprise_id,nom) VALUES (?,?)');
    categories.forEach((c) => insCat.run(ENT, c[0]));

    /* ---------------- Produits ---------------- */
    // [nom, categorie(1..9), unite, prix_achat, prix_vente, seuil]
    const produitsRaw = [
      ['Riz parfumé par sac de 25 kg', 1, 'sac', 13500, 16500, 8],
      ['Huile végétale 5 L', 1, 'bidon', 5200, 6500, 10],
      ['Sucre en morceaux 1 kg', 1, 'paquet', 650, 850, 24],
      ['Farine de blé 1 kg', 1, 'paquet', 550, 750, 20],
      ['Lait concentré sucré 397 g', 1, 'boîte', 900, 1200, 30],
      ['Sardines à l’huile 125 g', 1, 'boîte', 450, 650, 40],
      ['Spaghetti 500 g', 1, 'paquet', 350, 500, 50],
      ['Cube Maggi (boîte de 100)', 1, 'boîte', 1200, 1600, 15],
      ['Tomate concentrée 400 g', 1, 'boîte', 500, 700, 30],
      ['Eau minérale 1,5 L (pack 6)', 2, 'pack', 1800, 2400, 20],
      ['Coca-Cola 50 cl (casier 12)', 2, 'casier', 3600, 4800, 10],
      ['Jus d’orange 1 L', 2, 'bouteille', 900, 1300, 18],
      ['Bière 33 Export (casier 12)', 2, 'casier', 6500, 8500, 8],
      ['Boisson énergisante 25 cl', 2, 'bouteille', 750, 1100, 24],
      ['Eau de Javel 5 L', 3, 'bidon', 1500, 2100, 12],
      ['Savon de ménage 400 g', 3, 'pièce', 450, 650, 40],
      ['Détergent liquide 1 L', 3, 'bouteille', 1100, 1500, 20],
      ['Papier hygiénique (pack 10)', 3, 'pack', 1800, 2500, 15],
      ['Dentifrice 100 ml', 3, 'tube', 700, 1000, 30],
      ['Déodorant spray 150 ml', 3, 'pièce', 1200, 1800, 18],
      ['Lotion corporelle 400 ml', 4, 'flacon', 2500, 3500, 12],
      ['Parfum femme 50 ml', 4, 'flacon', 8500, 12500, 6],
      ['Rouge à lèvres', 4, 'pièce', 1500, 2500, 15],
      ['Fond de teint 30 ml', 4, 'pièce', 3500, 5500, 8],
      ['Casque audio Bluetooth', 5, 'pièce', 6500, 12000, 6],
      ['Écouteurs filaires', 5, 'pièce', 900, 2000, 20],
      ['Batterie externe 10 000 mAh', 5, 'pièce', 7000, 12500, 5],
      ['Chargeur de téléphone 2A', 5, 'pièce', 2000, 3500, 12],
      ['Ventilateur sur pied', 5, 'pièce', 18000, 26000, 3],
      ['Fer à repasser vapeur', 5, 'pièce', 12000, 18500, 4],
      ['Ampoule LED 9 W', 5, 'pièce', 900, 1500, 30],
      ['Rallonge électrique 3 m', 5, 'pièce', 2000, 3200, 10],
      ['Chemise homme coton', 6, 'pièce', 4500, 8000, 10],
      ['Jean slim femme', 6, 'pièce', 6500, 11000, 8],
      ['Robe pagne wax', 6, 'pièce', 9000, 15000, 6],
      ['T-shirt enfant (lot de 3)', 6, 'lot', 3500, 6000, 10],
      ['Baskets sport unisexe', 6, 'paire', 12000, 19000, 5],
      ['Chaussettes (lot de 5)', 6, 'lot', 1500, 2800, 15],
      ['Cahier 200 pages', 7, 'pièce', 400, 650, 40],
      ['Stylo bille bleu (boîte de 50)', 7, 'boîte', 2500, 4000, 8],
      ['Trousse scolaire complète', 7, 'kit', 3500, 6000, 10],
      ['Ramette papier A4', 7, 'ramette', 2800, 4000, 12],
      ['Sac à dos scolaire', 7, 'pièce', 5500, 9000, 8],
      ['Calculatrice scientifique', 7, 'pièce', 4000, 6500, 6],
      ['Couches bébé taille 3 (x50)', 8, 'paquet', 6500, 9000, 10],
      ['Lait infantile 400 g', 8, 'boîte', 4800, 6800, 12],
      ['Biberon 250 ml', 8, 'pièce', 1500, 2500, 10],
      ['Poussette pliable', 8, 'pièce', 32000, 45000, 2],
      ['Lingettes bébé (x80)', 8, 'paquet', 900, 1500, 20],
      ['Marteau 500 g', 9, 'pièce', 2500, 4000, 6],
      ['Perceuse électrique 500 W', 9, 'pièce', 25000, 36000, 3],
      ['Cadenas de sécurité', 9, 'pièce', 1800, 3000, 12],
      ['Balai + pelle', 9, 'kit', 1500, 2500, 10],
      ['Cuisinière à gaz 2 feux', 9, 'pièce', 28000, 39500, 3],
    ];
    const insProd = db.prepare(
      `INSERT INTO produits (entreprise_id,code,code_barres,nom,categorie_id,unite,prix_achat,prix_vente,seuil_alerte)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    produitsRaw.forEach((p, i) => {
      insProd.run(
        ENT,
        'P' + String(i + 1).padStart(4, '0'),
        '600' + String(1000000 + i * 137),
        p[0], p[1], p[2], p[3], p[4], p[5]
      );
    });
    const produits = db.prepare('SELECT * FROM produits').all();

    /* ---------------- Fournisseurs ---------------- */
    const fournisseurs = [
      ['FR-001', 'SABC Distribution', 'M. Tchoumi', '+237 233 42 10 10', 'ventes@sabc.cm', 'Douala', 'Boissons'],
      ['FR-002', 'CAMRAIL Import-Export', 'Mme Ateba', '+237 699 33 22 11', 'contact@camrail-ie.cm', 'Douala', 'Alimentation'],
      ['FR-003', 'Global Cosmetics Afrique', 'M. Owona', '+237 677 45 67 89', 'info@gcafrique.com', 'Yaoundé', 'Cosmétiques'],
      ['FR-004', 'TechnoStore Import', 'M. Bilal', '+237 675 11 44 77', 'technostore@gmail.com', 'Douala', 'Électronique'],
      ['FR-005', 'Pagne & Cie Textiles', 'Mme Ngoufack', '+237 671 22 88 99', 'pagnecie@yahoo.fr', 'Bafoussam', 'Vêtements'],
      ['FR-006', 'Fournitures Scolaires du Centre', 'M. Abanda', '+237 673 56 78 90', 'fsc@school.cm', 'Yaoundé', 'Papeterie'],
    ];
    const insFour = db.prepare(
      'INSERT INTO fournisseurs (entreprise_id,code,nom,contact,telephone,email,ville,categorie) VALUES (?,?,?,?,?,?,?,?)'
    );
    fournisseurs.forEach((f) => insFour.run(ENT, ...f));

    /* ---------------- Clients ---------------- */
    const clientsRaw = [
      ['CL-0001', 'Client de passage', '', '', '', '', 'particulier'],
      ['CL-0002', 'Mme Abena Rose', '+237 699 12 45 78', 'rose.abena@gmail.com', 'Mvog-Ada', 'Yaoundé', 'particulier'],
      ['CL-0003', 'Restaurant Le Wouri', '+237 233 43 55 66', 'contact@lewouri.cm', 'Bonanjo', 'Douala', 'entreprise'],
      ['CL-0004', 'M. Nkodo Jean', '+237 677 89 12 34', 'jnkodo@yahoo.fr', 'Bastos', 'Yaoundé', 'particulier'],
      ['CL-0005', 'Hôtel Beauséjour', '+237 671 33 77 22', 'achats@beausejour.cm', 'Centre', 'Bafoussam', 'entreprise'],
      ['CL-0006', 'Mme Tchouta Sylvie', '+237 675 44 11 22', '', 'Mvog-Mbi', 'Yaoundé', 'particulier'],
      ['CL-0007', 'École Les Palmiers', '+237 698 76 54 32', 'direction@palmiers.cm', 'Nkolbisson', 'Yaoundé', 'entreprise'],
      ['CL-0008', 'M. Fotso Bertrand', '+237 678 22 33 44', '', 'Akwa', 'Douala', 'particulier'],
      ['CL-0009', 'Mme Bikoi Estelle', '+237 696 55 66 77', 'estelle.bikoi@gmail.com', 'Kribi Centre', 'Kribi', 'particulier'],
      ['CL-0010', 'Supermarché du Port', '+237 233 46 88 99', 'achat@port-super.cm', 'Port', 'Kribi', 'entreprise'],
      ['CL-0011', 'M. Djoumessi Alain', '+237 674 10 20 30', '', 'Tsinga', 'Yaoundé', 'particulier'],
      ['CL-0012', 'Clinique La Grâce', '+237 222 21 43 65', 'stock@lagrace.cm', 'Bastos', 'Yaoundé', 'entreprise'],
    ];
    const insClient = db.prepare(
      'INSERT INTO clients (entreprise_id,code,nom,telephone,email,adresse,ville,type) VALUES (?,?,?,?,?,?,?,?)'
    );
    clientsRaw.forEach((c) => insClient.run(ENT, ...c));

    /* ---------------- Employés ---------------- */
    const employes = [
      ['EM-001', 'Ngo Bilong Angèle', 'Directrice réseau', 1, '+237 699 11 22 33', 'a.ngobilong@shoppingplus.cm', '2019-03-01', 'CDI', 450000],
      ['EM-002', 'Awa Nkolo', 'Caissière principale', 1, '+237 677 22 33 11', 'awa.nkolo@shoppingplus.cm', '2021-06-15', 'CDI', 150000],
      ['EM-003', 'Etoundi Paul', 'Chef de magasin', 2, '+237 699 44 55 66', 'p.etoundi@shoppingplus.cm', '2020-01-10', 'CDI', 220000],
      ['EM-004', 'Mballa Chantal', 'Caissière', 2, '+237 675 66 77 88', '', '2022-09-01', 'CDD', 130000],
      ['EM-005', 'Fotso Léonie', 'Chef de magasin', 3, '+237 677 77 88 99', 'l.fotso@shoppingplus.cm', '2018-11-05', 'CDI', 240000],
      ['EM-006', 'Tabi Junior', 'Magasinier', 3, '+237 671 12 34 56', '', '2023-02-20', 'CDD', 110000],
      ['EM-007', 'Kamga Serge', 'Chef de magasin', 4, '+237 675 12 34 56', 's.kamga@shoppingplus.cm', '2020-07-01', 'CDI', 215000],
      ['EM-008', 'Njoya Fatima', 'Vendeuse', 4, '+237 673 98 76 54', '', '2023-05-15', 'CDD', 105000],
      ['EM-009', 'Mballa Céline', 'Chef de magasin', 5, '+237 671 98 76 54', '', '2021-10-01', 'CDI', 200000],
      ['EM-010', 'Ekwalla Didier', 'Vigile', 1, '+237 696 32 14 78', '', '2022-04-12', 'CDD', 90000],
      ['EM-011', 'Ateba Bernadette', 'Comptable', 1, '+237 677 55 44 33', 'compta@shoppingplus.cm', '2019-08-20', 'CDI', 300000],
      ['EM-012', 'Ndoumbe Patrick', 'Magasinier', 2, '+237 690 11 22 33', '', '2023-11-02', 'CDD', 110000],
    ];
    const insEmp = db.prepare(
      `INSERT INTO employes (code,nom,poste,magasin_id,telephone,email,date_embauche,type_contrat,salaire)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    employes.forEach((e) => insEmp.run(...e));

    /* État civil et pièces administratives : la page « Employés » et le dossier
       RH doivent montrer des données réalistes, pas des champs vides.
       Un employé sur cinq reste volontairement sans CNI pour illustrer le suivi
       des dossiers incomplets (nb_dossiers_incomplets). */
    /* Prénoms féminins de la liste de démonstration : la civilité et le sexe
       doivent être cohérents avec le nom affiché. */
    const PRENOMS_FEMININS = new Set(['angèle', 'bernadette', 'chantal', 'céline', 'fatima', 'léonie', 'awa']);
    const VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Douala', 'Yaoundé', 'Douala'];
    const FORMATIONS = [
      'BAC G2 — Comptabilité', 'BTS Action commerciale', 'Licence Gestion',
      'CAP Vente', 'BAC D', 'BTS Logistique',
    ];
    const majEtatCivil = db.prepare(
      `UPDATE employes SET civilite=?, sexe=?, date_naissance=?, lieu_naissance=?, ville=?,
              adresse=?, numero_cni=?, numero_cnps=?, numero_ifu=?, formation=?,
              situation_matrimoniale=?, contact_urgence_nom=?, contact_urgence_tel=?
       WHERE code=?`
    );
    employes.forEach((e, i) => {
      const code = e[0];
      const annee = 1975 + ((i * 3) % 22);
      const sansCni = i % 5 === 4;
      const prenom = e[1].split(' ').pop().toLowerCase();
      const femme = PRENOMS_FEMININS.has(prenom);
      majEtatCivil.run(
        femme ? 'Mme' : 'M.',
        femme ? 'F' : 'M',
        `${annee}-${String((i % 12) + 1).padStart(2, '0')}-${String((i * 2 % 27) + 1).padStart(2, '0')}`,
        VILLES[i % VILLES.length],
        VILLES[i % VILLES.length],
        `Quartier ${['Akwa', 'Bastos', 'Bonapriso', 'Mvog-Mbi', 'Nkolndongo'][i % 5]}`,
        sansCni ? null : String(100000000 + i * 1234567).slice(0, 9),
        String(200000000 + i * 987654).slice(0, 9),
        sansCni ? null : 'IFU' + String(3000000 + i * 1111).slice(0, 7),
        FORMATIONS[i % FORMATIONS.length],
        i % 3 === 0 ? 'Marié(e)' : 'Célibataire',
        e[1].split(' ').pop() + ' (famille)',
        (() => { const n = String(690000000 + i * 1111111).slice(0, 9);
          return `+237 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`; })(),
        code
      );
    });

    /* ---------------- Stock initial + réceptions ---------------- */
    const magasinIds = db.prepare('SELECT id FROM magasins').all().map((m) => m.id);
    const insStock = db.prepare('INSERT INTO stocks (produit_id,magasin_id,quantite) VALUES (?,?,?)');
    const insMvt = db.prepare(
      `INSERT INTO mouvements_stock
       (produit_id,magasin_id,type,quantite,quantite_avant,quantite_apres,motif,reference,user_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const stock = new Map(); // "pid:mid" -> qte
    const startDate = new Date(Date.now() - 150 * 86400000);
    produits.forEach((p) => {
      magasinIds.forEach((m) => {
        const q = rint(12, 90) + p.seuil_alerte * 2;
        stock.set(`${p.id}:${m}`, q);
        insStock.run(p.id, m, q);
        insMvt.run(p.id, m, 'entree', q, 0, q, 'Stock initial', 'INIT-' + p.code, 1, dt(startDate));
      });
    });

    /* ---------------- Historique des ventes (120 jours) ---------------- */
    const insVente = db.prepare(
      `INSERT INTO ventes (reference,magasin_id,client_id,user_id,sous_total,remise,tva,total,
                           mode_paiement,montant_paye,monnaie,statut,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const insLigne = db.prepare(
      `INSERT INTO ventes_lignes (vente_id,produit_id,nom_produit,quantite,prix_unitaire,remise,total)
       VALUES (?,?,?,?,?,?,?)`
    );
    const updStock = db.prepare('UPDATE stocks SET quantite=?, maj_at=? WHERE produit_id=? AND magasin_id=?');
    const updPoints = db.prepare('UPDATE clients SET points = points + ? WHERE id = ?');

    const caissiers = db.prepare("SELECT id, magasin_id FROM users WHERE role IN ('caissier','gestionnaire','admin')").all();
    const clients = db.prepare('SELECT id FROM clients').all().map((c) => c.id);
    const modes = ['especes', 'especes', 'especes', 'especes', 'mobile_money', 'mobile_money', 'carte'];
    const commentaires = ['', '', '', 'Client pressé', 'Commande téléphone', 'Livraison à domicile', ''];

    let cpt = 1;
    const nbJours = 120;
    const ventesParJour = [];
    for (let d = nbJours; d >= 0; d--) {
      const jour = new Date(Date.now() - d * 86400000);
      const dow = jour.getDay();
      const weekend = dow === 6 || dow === 0;
      const base = weekend ? rint(26, 46) : rint(16, 32);
      // croissance progressive du réseau
      const facteur = 1 + (nbJours - d) / 400;
      const nb = Math.round(base * facteur);
      ventesParJour.push({ jour, nb });
    }

    for (const { jour, nb } of ventesParJour) {
      for (let v = 0; v < nb; v++) {
        const magasin_id = pick(magasinIds);
        const caissier = pick(caissiers.filter((c) => !c.magasin_id || c.magasin_id === magasin_id)) || caissiers[0];
        const heure = rint(8, 19);
        const minute = rint(0, 59);
        const seconde = rint(0, 59);
        const dateVente = new Date(jour);
        dateVente.setHours(heure, minute, seconde);
        const client_id = chance(0.45) ? pick(clients) : null;

        const nbLignes = rint(1, 6);
        const lignes = [];
        const utilises = new Set();
        for (let l = 0; l < nbLignes; l++) {
          const p = pick(produits);
          if (utilises.has(p.id)) continue;
          utilises.add(p.id);
          let qte = p.prix_vente > 15000 ? 1 : chance(0.75) ? rint(1, 3) : rint(1, 5);
          const dispo = stock.get(`${p.id}:${magasin_id}`);
          if (dispo <= 1) continue;
          qte = Math.min(qte, Math.max(1, Math.floor(dispo * 0.6)));
          if (qte <= 0) continue;
          const remise = chance(0.08) ? Math.round(p.prix_vente * qte * 0.05) : 0;
          lignes.push({
            produit_id: p.id, nom: p.nom, qte, pu: p.prix_vente,
            remise, total: p.prix_vente * qte - remise,
          });
        }
        if (!lignes.length) continue;

        const sous_total = lignes.reduce((s, l) => s + l.qte * l.pu, 0);
        const remise = lignes.reduce((s, l) => s + l.remise, 0);
        const total = sous_total - remise;
        const mode = pick(modes);
        const paye = mode === 'credit' ? 0 : Math.ceil(total / 500) * 500;
        const reference = 'VTE-' + String(cpt).padStart(6, '0');
        cpt++;

        const info = insVente.run(
          reference, magasin_id, client_id, caissier.id,
          sous_total, remise, 0, total, mode, paye, Math.max(0, paye - total),
          'payee', dt(dateVente)
        );
        const venteId = info.lastInsertRowid;
        for (const l of lignes) {
          insLigne.run(venteId, l.produit_id, l.nom, l.qte, l.pu, l.remise, l.total);
          const key = `${l.produit_id}:${magasin_id}`;
          const avant = stock.get(key);
          const apres = Math.max(0, avant - l.qte);
          stock.set(key, apres);
          updStock.run(apres, dt(dateVente), l.produit_id, magasin_id);
          insMvt.run(l.produit_id, magasin_id, 'vente', -l.qte, avant, apres,
            'Vente ' + reference, reference, caissier.id, dt(dateVente));

          // réapprovisionnement automatique si le stock passe sous le seuil
          if (apres <= 3) {
            const reappro = rint(30, 90);
            const a2 = apres + reappro;
            stock.set(key, a2);
            updStock.run(a2, dt(dateVente), l.produit_id, magasin_id);
            insMvt.run(l.produit_id, magasin_id, 'entree', reappro, apres, a2,
              'Réapprovisionnement fournisseur', 'IN-' + String(rint(10000, 99999)), 1,
              dt(new Date(dateVente.getTime() + 3600000)));
          }
        }
        if (client_id) updPoints.run(Math.floor(total / 5000), client_id);
      }
    }

    /* ---------------- Transferts inter-magasins ---------------- */
    const insTr = db.prepare(
      `INSERT INTO transferts (reference,magasin_source_id,magasin_dest_id,produit_id,quantite,statut,note,user_id,created_at,valide_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    for (let i = 0; i < 18; i++) {
      let src = pick(magasinIds);
      let dst = pick(magasinIds);
      while (dst === src) dst = pick(magasinIds);
      const p = pick(produits);
      const qte = rint(5, 25);
      const jour = dt(new Date(Date.now() - rint(1, 45) * 86400000));
      const statut = i < 15 ? 'valide' : 'en_attente';
      insTr.run('TRF-' + String(i + 1).padStart(4, '0'), src, dst, p.id, qte, statut,
        pick(['Rééquilibrage de stock', 'Demande du chef de magasin', 'Forte demande locale', '']),
        1, jour, statut === 'valide' ? jour : null);
    }

    /* ---------------- Commandes d'achat ---------------- */
    const insCmd = db.prepare(
      `INSERT INTO commandes_achat (reference,fournisseur_id,magasin_id,statut,total,note,user_id,created_at,reception_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const insCmdLigne = db.prepare(
      'INSERT INTO commandes_achat_lignes (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)'
    );
    const fournisseursDb = db.prepare('SELECT * FROM fournisseurs').all();
    for (let i = 0; i < 12; i++) {
      const f = pick(fournisseursDb);
      const magasin_id = pick(magasinIds);
      const jour = new Date(Date.now() - rint(2, 90) * 86400000);
      const statuts = ['recue', 'recue', 'recue', 'recue', 'commandee', 'commandee', 'brouillon'];
      const statut = i < 3 ? 'commandee' : i < 8 ? 'recue' : pick(statuts);
      const info = insCmd.run('CMD-' + String(i + 1).padStart(4, '0'), f.id, magasin_id, statut, 0,
        pick(['Réassort mensuel', 'Rupture de stock', 'Promotion de fin de mois', '']), 1, dt(jour),
        statut === 'recue' ? dt(new Date(jour.getTime() + 3 * 86400000)) : null);
      const id = info.lastInsertRowid;
      let total = 0;
      const nbL = rint(3, 7);
      const vus = new Set();
      for (let l = 0; l < nbL; l++) {
        const p = pick(produits);
        if (vus.has(p.id)) continue;
        vus.add(p.id);
        const q = rint(10, 60);
        insCmdLigne.run(id, p.id, q, p.prix_achat);
        total += q * p.prix_achat;
      }
      db.prepare('UPDATE commandes_achat SET total=? WHERE id=?').run(total, id);
    }

    /* ---------------- Mouvements d'ajustement (inventaire) ---------------- */
    for (let i = 0; i < 25; i++) {
      const p = pick(produits);
      const m = pick(magasinIds);
      const jour = new Date(Date.now() - rint(1, 60) * 86400000);
      const avant = stock.get(`${p.id}:${m}`);
      const ecart = pick([-2, -1, -1, 1, 2, 3]);
      const apres = Math.max(0, avant + ecart);
      stock.set(`${p.id}:${m}`, apres);
      updStock.run(apres, dt(jour), p.id, m);
      insMvt.run(p.id, m, 'ajustement', ecart, avant, apres, 'Ajustement après inventaire tournant',
        'AJU-' + String(i + 1).padStart(4, '0'), 5, dt(jour));
    }
  });

  run();
  return true;
}

module.exports = { seedDatabase, reinitialiser };

/**
 * Réinitialise la base de démonstration SANS supprimer le fichier.
 * Un `unlink` ferait perdre au serveur en cours le descripteur de sa base :
 * il continuerait d'écrire dans un inode effacé et les données disparaîtraient.
 * On vide donc les tables dans le fichier existant.
 */
function reinitialiser() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  // Les tables sans dépendance d'abord : ordre inverse des créations.
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    tables.forEach((t) => db.prepare('DELETE FROM ' + t).run());
    tables.forEach((t) => { try { db.prepare('DELETE FROM sqlite_sequence WHERE name=?').run(t); } catch (e) { /* pas d'autoincrement */ } });
  });
  tx();
  db.pragma('foreign_keys = ON');
  /* Les pièces PDF vivent sur disque, hors de la base : vider les tables sans
     vider le dossier laisserait des fichiers orphelins. */
  if (fs.existsSync(DOSSIER_DOCUMENTS)) {
    fs.readdirSync(DOSSIER_DOCUMENTS).forEach((f) => {
      try { fs.unlinkSync(path.join(DOSSIER_DOCUMENTS, f)); } catch (e) { /* fichier verrouillé */ }
    });
  }
  seedDatabase();
  console.log('Base réinitialisée avec les données de démonstration (fichier conservé).');
}
