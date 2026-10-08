# 🛍️ Inventa GestyPro

Application web complète de **gestion d'une entreprise de shopping multi-magasins** :
caisse, stocks, transferts inter-magasins, achats fournisseurs, clients, employés,
tableaux de bord et rapports exportables.

Interface **en français**, montants en **FCFA**, adaptée au contexte camerounais
(TVA 19,25 %, NIU sur les tickets, Mobile Money comme mode de paiement).

---

## 1. Démarrage rapide

```bash
cd shopmanager
npm install     # une seule fois (télécharge les dépendances)
npm start       # démarre le serveur
```

Puis ouvrez **http://localhost:3000** dans un navigateur.

> Scripts prêts à l'emploi : `./demarrer.sh` (Linux / macOS) ou `demarrer.bat` (Windows)
> vérifient les dépendances, les installent si besoin, puis lancent l'application.

### Comptes de démonstration

| Profil | Email | Mot de passe | Accès |
|---|---|---|---|
| **Propriétaire de la plateforme (vous)** | `franck06.nganou02oumbe2004@gmail.com` | `Aspirine46@!` | **Toutes les entreprises**, leurs paiements, leurs boutiques, réglages des tarifs |
| Administrateur général | `admin@shoppingplus.cm` | `Admin@2026` | Tout, y compris comptes, rôles et boutiques |
| Gestionnaire réseau | `gestion@shoppingplus.cm` | `Gest@2026` | Toute l'exploitation + comptes de boutique |
| Responsable boutique Akwa | `chef.akwa@shoppingplus.cm` | `Chef@2026` | Sa boutique **et la création de ses comptes** |
| Caissière Bastos | `caisse1@shoppingplus.cm` | `Caisse@2026` | Ventes journalières — **Bastos uniquement** |
| Agent de stock Bafoussam | `stock@shoppingplus.cm` | `Stock@2026` | Entrées/sorties de stock — **Bafoussam uniquement**, sans prix |
| Agent de réception Mvog-Mbi | `reception.mvogmbi@shoppingplus.cm` | `Reception@2026` | Réceptions fournisseurs (**entrées**) — **Mvog-Mbi** |

Autres comptes : `caisse2@` (Mvog-Mbi), `caisse3@` (Kribi), `stock2@` (Akwa),
`chef.kribi@` (responsable Kribi) — même mots de passe que leurs collègues.

---

## 1 bis. Créer son entreprise, puis l'exploiter

### Étape 1 — La page d'inscription (obligatoire, avant tout accès)

Un administrateur d'entreprise n'entre dans l'application qu'**après avoir créé son
entreprise**. L'écran d'accueil propose **« 🏬 Créer mon entreprise »**, qui demande :

| Information demandée | Détail |
|---|---|
| **Email professionnel** | sert d'identifiant de connexion (unicité vérifiée en direct) |
| **Nom** et **Prénom** | ceux du responsable / de l'administrateur du compte |
| **Nom de l'entreprise** | apparaît dans l'interface, sur les tickets et les rapports |
| **Date de création** | de l'entreprise |
| **NIU** | numéro de contribuable, imprimé sur les tickets |
| **Logo (photo)** | JPG/PNG, affiché en haut de l'application et sur les tickets |
| Mot de passe (+ confirmation) | 6 caractères minimum |

À la validation, l'application crée d'un coup : l'**entreprise**, sa **première boutique**,
le **compte administrateur** de cette entreprise, et **7 jours d'essai gratuit**
(aucun paiement demandé). L'administrateur arrive directement sur son tableau de bord.
Chaque entreprise est **totalement isolée** : ses boutiques, produits, stocks, ventes,
clients, comptes et rapports ne sont visibles que par elle.

### Étape 2 — L'espace « Aide » (WhatsApp)

Le module **💬 Aide**, accessible depuis le menu de chaque utilisateur, permet de nous
contacter sur **WhatsApp au 654 32 42 82** (bouton qui ouvre directement la conversation,
numéro cliquable `tel:`, message pré-rempli), et rappelle les numéros de paiement ainsi
que les coordonnées d'assistance.

### Étape 2 bis — Vérification de l'adresse email (bloquante)

Dès l'inscription, un **email de vérification** part à l'adresse de l'administrateur.
Tant qu'elle n'est pas confirmée, le compte est **limité à l'écran de vérification** :
les modules renvoient `403 EMAIL_NON_VERIFIE`.

L'email contient un bouton cliquable **et** un code à 6 chiffres (valable 60 minutes),
saisissable directement dans l'application. Un bouton **« Renvoyer le code »** est
disponible à tout moment. Après confirmation, l'espace devient pleinement actif.

> Sans serveur d'envoi configuré, l'email n'est pas perdu : il est **consigné** dans
> la console du propriétaire (onglet **E-mails**) avec son code, et peut être renvoyé
> une fois le SMTP renseigné.

### Étape 2 ter — Création d'un compte : identifiants envoyés par email

Quand un administrateur crée un compte — **quel que soit son rôle** (caissier, agent de
stock, responsable de boutique…) — le titulaire reçoit **immédiatement par email** :

- son **identifiant** (adresse email) ;
- son **mot de passe** provisoire ;
- son **rôle** et sa **boutique** d'affectation ;
- l'**adresse de connexion** de l'application.

Le message est rédigé dans la **langue choisie pour ce compte** (français, anglais ou
chinois). Ces comptes ne sont **pas** soumis à la vérification d'email : ils peuvent se
connecter aussitôt.

### Étape 3 — L'abonnement (Orange Money / MTN MoMo / MasterCard)

| Formule | Prix | Durée |
|---|---|---|
| Essai gratuit | **0 FCFA** | **7 jours** |
| Mensuel | **11 500 FCFA** | 30 jours |
| Annuel | **132 000 FCFA** (soit 11 000 FCFA/mois) | 365 jours |

Le paiement est volontairement **ultra-simple** : l'entreprise clique sur « J'ai payé »,
choisit l'un des trois moyens ci-dessous, envoie le montant, puis transmet la référence
`AB-…` affichée. **Aucune donnée de carte n'est saisie dans l'application, aucune
passerelle** : le paiement est **validé par le propriétaire de la plateforme**, ce qui
active immédiatement l'abonnement.

| Moyen | Coordonnées affichées |
|---|---|
| 🟠 **Orange Money** | 693 00 73 97 — menu `#150#` |
| 🟡 **MTN Mobile Money** | 654 32 42 82 — menu `*126#` |
| 💳 **MasterCard (carte bancaire)** | Compte **Afriland First Bank 10005-00002-10360711051-43** |

Pour le paiement par carte, l'écran affiche le **compte bancaire destinataire**
(Afriland First Bank), son titulaire et le montant exact ; la référence `AB-…` sert de
motif au virement. Ces coordonnées se règlent dans la console du propriétaire.

Quand l'abonnement expire, l'application **se bloque en écriture** pour les utilisateurs
de l'entreprise (vente, stock, création…) avec une fenêtre qui rappelle les moyens de
paiement ; l'administrateur conserve la lecture et l'accès à la page de paiement.

---

## 1 ter. Console du propriétaire de la plateforme

Le compte `franck06.nganou02oumbe2004@gmail.com` ouvre une **console de monitoring**
(menu **🛰️ Plateforme**) qui couvre **toutes les entreprises** de l'application :

| Écran | Ce qu'il montre |
|---|---|
| **Tableau de bord** | nombre d'entreprises (actives, en essai, expirées, suspendues), total des boutiques, comptes, produits, ventes, CA cumulé du réseau, abonnements encaissés et en attente |
| **Entreprises** | chaque entreprise créée avec **toutes ses informations** : nom, email, responsable, NIU, date de création, ville, logo, statut, abonnement et jours restants, boutiques, comptes, ventes, CA, total payé — avec sa **fiche complète** (boutiques, comptes, paiements) et la **suspension / réactivation** de son accès |
| **Paiements** | **tous les paiements d'abonnement** de toutes les entreprises : référence, service (Orange Money / MTN MoMo / MasterCard), compte destinataire, montant, statut, date — avec **validation**, **rejet** et **suppression** |
| **E-mails** | **journal de tous les emails** de la plateforme (vérifications d'inscription, identifiants des comptes créés, tests) avec destinataire, type, statut, date et **contenu intégral** consultable — plus la **configuration du serveur d'envoi** (hôte, port, TLS, utilisateur, mot de passe, expéditeur), un **test d'envoi** et le **renvoi** d'un message consigné |
| **Ventes** | **tous les paiements d'abonnement** de la plateforme, validés **et** en attente, avec filtres (statut, service, entreprise, période, recherche), totaux encaissés / en attente / rejetés et export CSV |
| **Classement** | Classement des entreprises les plus actives (paliers Platine / Or / Argent / Bronze) à partir du chiffre encaissé, du nombre de paiements, de l'ancienneté, des ventes et des comptes |
| **Abonnements & tarifs** | **formules à durée et montant libres** (création, désactivation, suppression), **codes de réduction** (pourcentage ou montant), **augmentation ou baisse globale des tarifs**, configuration du prestataire de paiement (PayDunya par défaut, CinetPay en secours) et **activation / désactivation de chaque moyen de paiement** (Orange Money, MTN MoMo, MasterCard) — il doit toujours en rester au moins un actif |
| **Réglages** | tarifs (mensuel, annuel, jours d'essai), numéros Orange Money et MTN MoMo, menus USSD, **compte bancaire MasterCard (Afriland First Bank)**, numéro WhatsApp d'assistance, message d'aide |

Ce compte est créé automatiquement au premier démarrage (`server/entreprises.js`),
avec le rôle `super_admin` : il n'est rattaché à aucune entreprise et n'apparaît jamais
dans les écrans d'une entreprise cliente.

### Configurer l'envoi des emails

L'envoi réel passe par **nodemailer**. Deux façons de renseigner le serveur :

**1. Depuis l'application** — console du propriétaire, onglet **✉️ E-mails** :

| Champ | Exemple |
|---|---|
| Serveur (hôte) | `smtp.gmail.com` |
| Port | `587` (STARTTLS) ou `465` (SSL) |
| Connexion sécurisée | Non pour 587, Oui pour 465 |
| Utilisateur | `compte@exemple.com` |
| Mot de passe | mot de passe applicatif |
| Adresse expéditeur | `Inventa GestyPro <noreply@exemple.com>` |

**2. Par variables d'environnement** (prioritaires sur les réglages de l'application) :

```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_SECURE=false \
SMTP_USER=compte@exemple.com SMTP_PASS=xxxx \
MAIL_FROM="Inventa GestyPro <noreply@exemple.com>" npm start
```

**Sans configuration, l'application fonctionne quand même** : chaque email est
**consigné** en base (statut `simule`) et reste **lisible dans la console**, avec le
code de vérification et les identifiants des comptes créés. Le bouton **« Renvoyer »**
permet de les faire partir dès que le serveur est renseigné.

`APP_URL` (ou `PUBLIC_URL`) définit l'adresse de connexion insérée dans les emails
(`http://localhost:3000` par défaut).

---

## 1 quater. Langue et thème (toute l'application)

Deux réglages d'apparence, accessibles **à tous les rôles** depuis l'en-tête
(🌓 pour le thème, drapeaux pour la langue) **et** depuis **Paramètres → 🎨 Apparence** :

| Réglage | Valeurs |
|---|---|
| **Langue** | 🇫🇷 **Français** · 🇬🇧 **English** · 🇨🇳 **中文** |
| **Thème** | ☀️ **Clair (blanc)** · 🌙 **Sombre (noir)** |

- La traduction couvre **toute l'interface** : menus, tableaux de bord, tableaux,
  formulaires, messages, **y compris la console du propriétaire**.
- Le thème s'applique à **toutes les pages** via `data-theme` sur `<html>`
  (57 règles dédiées au thème sombre).
- Les deux choix sont **mémorisés sur le poste** (`sp_langue`, `sp_theme` en
  `localStorage`) et rechargés à chaque visite.
- Les **emails** suivent la langue du compte concerné (français, anglais ou chinois).

---

## 2. Modules de l'application

| Module | Ce qu'il permet |
|---|---|
| 📊 **Tableau de bord** | KPI du jour / du mois, évolution du CA sur 30 jours, objectif mensuel, top produits, performance par magasin, alertes de stock, encaissements par mode, meilleurs vendeurs et clients |
| 🧾 **Caisse** | Écran de vente tactile : recherche et grille produits, panier, remises, sélection du client (points de fidélité), 4 modes de paiement, calcul automatique de la monnaie, **ticket imprimable** |
| 📑 **Ventes** | Historique filtrable (période, magasin, paiement, statut, recherche), détail d'une vente, **annulation avec remise en stock**, export CSV |
| 🏷️ **Produits** | Catalogue complet (code-barres, unité, prix d'achat/vente, TVA, seuil d'alerte), fiche produit avec stock par magasin et historique des mouvements, gestion des catégories |
| 📦 **Stocks** | État du stock valorisé par magasin, entrées/sorties manuelles, **ajustement d'inventaire**, journal complet des mouvements, onglet alertes et ruptures |
| 📋 **Inventaires** | **Comptage physique** du stock produit par produit, **valorisation** du stock compté (prix d'achat et prix de vente, marge potentielle), **stock attendu** recalculé depuis le journal des mouvements, **comparaison** compté / attendu (manquants, excédents, écarts en FCFA), application des écarts, clôture et export CSV |
| 🔄 **Transferts** | Déplacement de marchandise d'un magasin à un autre, avec validation (les stocks ne bougent qu'à la validation) et traçabilité |
| 🚚 **Achats** | Commandes fournisseurs (brouillon → commandée → reçue), **réception qui entre automatiquement en stock** et met à jour le prix d'achat |
| 👥 **Clients** | Fichier clients (particuliers / entreprises), historique d'achats, points de fidélité, export CSV |
| 🏭 **Fournisseurs** | Répertoire des partenaires, volume d'achats et nombre de commandes |
| 🧑‍💼 **Employés** | Dossier complet du personnel : état civil, CNI / CNPS / IFU, formation, contrat, salaire, contact d'urgence, masse salariale par magasin |
| 💵 **Salaires** | Suivi **mensuel** des versements : salaire de base + primes − retenues = net, statut payé / à payer, date, mode et référence, « tout marquer payé », courbe d'évolution de la masse salariale |
| 📋 **Recrutements** | **Vivier de candidatures** (reçue → entretien → retenu / refusé → **embauche**) et **dossiers du personnel** avec leurs **documents PDF téléchargeables** |
| 📈 **Rapports** | Analyse par jour / mois / magasin / produit / catégorie / vendeur / client / mode de paiement, rentabilité par produit, produits dormants, valorisation du stock, **exports CSV** |
| 🏬 **Magasins** | Vision réseau : CA, ventes du jour, valeur du stock et alertes de chaque point de vente |
| 🔐 **Comptes & rôles** | Création des comptes **boutique par boutique**, attribution des rôles, éditeur de rôles et permissions personnalisés |
| ⚙️ **Paramètres** | Identité de l'entreprise sur les tickets (nom, adresse, NIU, message), TVA par défaut, préfixe de ticket, objectif mensuel |
| 💳 **Abonnement** | Formule en cours, jours restants, paiement Orange Money / MTN MoMo avec référence `AB-…`, historique des paiements |
| 💬 **Aide** | Contact **WhatsApp 654 32 42 82**, numéros de paiement, procédures et questions fréquentes |
| 🛰️ **Plateforme** *(propriétaire uniquement)* | Monitoring de toutes les entreprises, de leurs paiements et de leurs boutiques, réglages des tarifs |
| 🔄 **Actualisation automatique** | Les écrans ouverts se rafraîchissent **tout seuls** quand une boutique enregistre une opération |

### Ressources humaines : employés, salaires et recrutements

Trois écrans, regroupés sous **« Ressources humaines »** dans le menu :

**🧑‍💼 Employés** — le dossier du personnel, par boutique :

- état civil (civilité, date et lieu de naissance, situation matrimoniale, adresse) ;
- pièces administratives (**CNI**, **CNPS**, IFU) et formation ;
- contrat (type, date d'embauche, date de fin pour un CDD) et salaire mensuel ;
- contact d'urgence, notes, statut actif / inactif / **sorti** (avec motif et date) ;
- la liste affiche la CNI manquante, le nombre de pièces jointes et la dernière paie.

**💵 Salaires** — le suivi des versements, **mois par mois** :

- une ligne par employé actif : salaire de base **+ primes − retenues = net** ;
- statut **payé** / **à payer**, avec date, mode de paiement (espèces, virement,
  Orange Money, MTN MoMo…) et référence ;
- un seul versement par employé et par mois : ressaisir le mois le met à jour ;
- **« Tout marquer payé »** solde la période en un geste ;
- masse salariale, montants réglés et restants, et courbe d'évolution sur 12 mois.

> L'application ne calcule **aucune retenue** légale (CNPS, impôt) : les primes et
> retenues sont saisies librement, conformément au fonctionnement retenu.

**📋 Recrutements** — deux volets :

- **Candidatures** : réception, entretien planifié (date), décision
  (**retenu** / **refusé** avec motif), puis **embauche** en un clic. L'embauche
  crée la fiche du personnel (code `EM-…`, salaire proposé, contrat) et lie la
  candidature à l'employé créé ; une candidature ne peut pas être embauchée deux fois.
- **Dossiers & documents** : toutes les informations de chaque employé et ses
  **pièces PDF** — CNI, diplôme, CV, contrat, attestation, document CNPS, photo.
  L'administrateur **téléverse** les PDF (10 Mo maximum) et les **télécharge** ensuite.

Les documents sont **uniquement des PDF fournis par l'administrateur** : l'application
n'en génère aucun. Ils sont stockés hors de portée du web, sous un nom opaque, et
servis avec les en-têtes `Content-Disposition: attachment` et `X-Content-Type-Options: nosniff`.

**Droits** : `employes.*`, `salaires.*` et `recrutement.*`. L'administrateur, le
gestionnaire et le chef de boutique y ont accès ; une caissière ou un agent de
stock n'y a **pas** accès (403). Les données sont strictement cloisonnées par
entreprise : supprimer une entreprise efface aussi ses fiches, ses paies, ses
candidatures et les PDF de son personnel.

### Comptes créés par boutique

Chaque **boutique** peut recevoir ses propres comptes, avec le rôle que vous voulez :

| Rôle livré d'origine | Portée | Ce qu'il peut faire | Créable par un responsable de boutique |
|---|---|---|---|
| **Administrateur général** | réseau | Tout, y compris les comptes, les rôles et les boutiques | — |
| **Gestionnaire réseau** | réseau | Toute l'exploitation, + création des comptes de boutique | — |
| **Responsable de boutique** | boutique | Gère sa boutique de A à Z **et crée les comptes de son magasin** | — |
| **Caissier / Vendeur** | boutique | **Enregistrer les ventes journalières**, gérer les clients au comptoir | ✅ |
| **Agent de stock (entrées + sorties)** | boutique | Enregistrer les **entrées**, les **sorties**, les inventaires, les transferts et les réceptions | ✅ |
| **Agent de réception (entrées uniquement)** | boutique | Réceptionner les livraisons fournisseurs (**entrées seulement**) | ✅ |

Les rôles sont **entièrement paramétrables** : un administrateur peut créer ses propres
rôles (« Vendeur caisse du soir », « Agent dépôt », …) en cochant les permissions
souhaitées parmi ~30 droits (ventes, stocks, achats, tiers, rapports, administration).

**Comment créer un compte de boutique :** menu **Comptes & rôles** → « Nouveau compte » →
choisir la **boutique d'affectation**, le **rôle**, le mot de passe. Un responsable de
boutique ne voit et ne crée que les comptes de son magasin, et uniquement avec les rôles
marqués « créable en boutique » : impossible pour lui de s'attribuer un rôle réseau.

### Prix et valorisation : totalement optionnels pour le personnel de stock

- Toute **entrée / sortie de stock** se saisit avec **produit + quantité uniquement** :
  **aucun prix n'est jamais demandé** à l'agent.
- L'écran **📥 Réception rapide** permet même de réceptionner plusieurs lignes d'un coup
  (produit, quantité, origine, observation) — toujours sans prix.
- La permission **« Voir les prix d'achat, marges et valeurs de stock »** (`prix.consulter`)
  masque automatiquement les colonnes de prix d'achat, de marge et les KPI de valorisation
  pour les rôles qui ne l'ont pas (caissiers, agents de stock, agents de réception).

### Actualisation en temps réel des écrans

Quand une boutique encaisse une vente, réceptionne du stock, valide un transfert ou
qu'un compte est créé, **les écrans ouverts ailleurs se mettent à jour d'eux-mêmes** —
sans recharger la page et sans interrompre l'utilisateur.

| Élément | Comportement |
|---|---|
| Fréquence | Interrogation du serveur **toutes les 15 secondes** (léger pour le serveur et la connexion 3G/4G) |
| Écrans concernés | **Tableau de bord** (KPI, CA du jour, ventes, marges, alertes), **Ventes**, **Stocks**, **Caisse** (produits, stocks disponibles, dernières ventes), **Transferts**, **Rapports**, **console du propriétaire** (nouvelles entreprises et paiements) |
| Affichage | Mise à jour **silencieuse** : les chiffres changent, un petit indicateur « 🔄 n opération(s) intégrée(s) » apparaît en haut à droite |
| Événements suivis | ventes, annulations, entrées/sorties de stock, réceptions, transferts, commandes fournisseurs, nouveaux comptes, nouvelles boutiques, nouveaux clients, paiements d'abonnement |
| Cloisonnement | Chaque compte ne reçoit que les événements de **son entreprise**, et un utilisateur rattaché à une boutique ne reçoit que ceux de **sa boutique** |
| Onglet fermé | Aucune requête n'est envoyée tant que l'onglet n'est pas visible |

Technique : chaque écriture métier ajoute une ligne au journal `journal_evenements`
(2 000 dernières opérations conservées) ; les écrans lisent `GET /api/evenements?depuis=<id>`
et ne rechargent que si un événement du bon type est arrivé. Aucune dépendance
supplémentaire (pas de WebSocket), aucune library externe.

### Portée des données

Un rôle de **portée boutique** ne voit que son magasin : ventes, stocks, transferts,
achats et son journal sont filtrés **côté serveur** d'après le jeton d'authentification.

---

## 3. Architecture technique

```
shopmanager/
├── server/
│   ├── index.js            # Serveur Express, montage des routes, gestion des erreurs
│   ├── db.js               # Connexion SQLite + schéma (16 tables, dont `roles`) + paramètres
│   ├── seed.js             # Jeu de démonstration reproductible (produits, ventes…)
│   ├── auth.js             # JWT, catalogue de permissions, rôles en base, portée boutique/réseau
│   ├── utils.js            # Références auto (VTE-000123), mouvements de stock
│   └── routes/
│       ├── auth.js         # Connexion, profil, changement de mot de passe
│       ├── admin.js        # Magasins, comptes (scopés par boutique), rôles, paramètres, journal
│       ├── catalogue.js    # Catégories, produits, stocks, réception rapide, transferts
│       ├── ventes.js       # Caisse et ventes (+ annulation)
│       ├── tiers.js        # Clients, fournisseurs, employés
│       ├── achats.js       # Commandes fournisseurs et réceptions
│       └── rapports.js     # Tableau de bord, rapports, exports CSV
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── ui.js           # Formatage FCFA/dates, tableaux, modales, graphiques SVG
│       ├── api.js          # Client HTTP (jeton JWT, gestion de session)
│       ├── app.js          # Coquille, navigation, routage, ticket imprimable
│       └── views/          # Une vue par module
├── tests/smoke.js          # Test d'intégration de bout en bout (jsdom)
└── data/shopmanager.db     # Base de données (créée automatiquement)
```

- **Backend** : Node.js 18+, Express 4, better-sqlite3 (base SQLite locale, aucun serveur
  de base de données à installer), bcrypt, JWT.
- **Frontend** : HTML/CSS/JavaScript natifs, **sans aucune dépendance externe ni CDN** —
  l'application fonctionne donc entièrement hors ligne sur le réseau local du magasin.
- **Graphiques** dessinés en SVG à la volée, aucune librairie de graphes requise.
- Toutes les écritures sensibles (vente, annulation, transfert, réception) s'exécutent
  dans des **transactions SQLite** : soit tout passe, soit rien ne passe.

---

## 4. Jeu de données de démonstration

Généré automatiquement au premier démarrage :

- **5 magasins** — Yaoundé (Bastos, Mvog-Mbi), Douala (Akwa), Bafoussam, Kribi
- **54 produits** répartis en 9 catégories (alimentation, boissons, cosmétiques, électronique…)
- **12 clients**, **6 fournisseurs**, **12 employés**, **10 comptes utilisateurs** couvrant les 6 rôles
  (2 responsables de boutique, 3 caissiers, 2 agents de stock, 1 agent de réception…)
- **Le personnel est doté d'un dossier complet** : état civil, CNI, CNPS, formation et
  contact d'urgence (2 fiches restent volontairement sans CNI, pour illustrer le suivi
  des dossiers incomplets)
- **~3 800 ventes** réparties sur **120 jours** avec un rythme réaliste (plus d'activité
  le week-end, croissance progressive du réseau), **13 000+ mouvements de stock**,
  transferts, commandes d'achat et ajustements d'inventaire

---

## 5. Exploitation

### Sauvegarde & restauration
Toutes les données vivent dans le dossier **`data/`** (`shopmanager.db`, accompagné de
`-wal` et `-shm` lorsque le serveur tourne). Pour une sauvegarde fiable :

```bash
# 1) arrêter le serveur (Ctrl+C) : la base est alors consolidée dans le seul fichier .db
# 2) copier l'ensemble du dossier data/
cp -r data/ sauvegardes/data_$(date +%F)/
```

Pour restaurer : arrêtez le serveur, remplacez le dossier `data/`, redémarrez.

### Réinitialiser la démonstration
```bash
npm run seed     # efface la base et régénère les données de démonstration
```

### Ajouter une boutique et son équipe
1. **Magasins** → « Nouvelle boutique » (nom, ville, responsable).
2. **Comptes & rôles** → « Nouveau compte » : choisissez cette boutique, un rôle, un mot de passe.
3. Ou déléguez : affectez un **Responsable de boutique** sur ce magasin, il créera lui-même
   ses vendeurs et agents de stock — sans jamais pouvoir s'attribuer un rôle réseau.

### Changer le port ou ouvrir le service au réseau local
```bash
PORT=3001 npm start
```
Le serveur écoute par défaut sur `0.0.0.0:3000` : les autres postes du magasin y
accèdent via `http://IP-du-serveur:3000`.

### Tests d'intégration
```bash
npm install --no-save jsdom
npm start                    # dans un premier terminal
npm test                     # dans un second : lance les 14 suites (553 vérifications)
node tests/smoke.js          # ou une seule suite à la fois
```

| Suite | Ce qu'elle vérifie |
|---|---|
| `node tests/smoke.js` | Parcourt les modules, enregistre une vente complète depuis la caisse, vérifie les habilitations par compte, le blocage à l'expiration de l'abonnement et les restrictions du profil caissière |
| `node tests/multi-entreprises.js` | Isolation des données entre entreprises, console propriétaire, validation des paiements |
| `node tests/parcours-proprietaire.js` | Parcours complet côté **API** : inscription d'entreprise (7 informations), essai gratuit, aide WhatsApp, monitoring propriétaire, paiements |
| `node tests/interface-parcours.js` | Même parcours côté **interface** (jsdom) : page d'inscription, accès après inscription, espace Aide, console du propriétaire |
| `node tests/temps-reel.js` | Deux fenêtres ouvertes : une boutique encaisse et entre du stock, on vérifie que les écrans de l'administrateur se mettent à jour **sans rechargement** |
| `node tests/apparence.js` | **Langues** (français, anglais, chinois) et **thème** clair/sombre : traduction des menus et des indicateurs, persistance du choix, application en console propriétaire |
| `node tests/nouvelles-options.js` | **Les 4 options demandées** : sélecteurs de langue et de thème (paramètres + en-tête + console), **email de vérification bloquant** à l'inscription (blocage 403, code erroné refusé, renvoi, déblocage), **identifiants envoyés par email** à la création d'un compte (tout rôle, dans sa langue), **paiement MasterCard** versé sur le compte **Afriland First Bank 10005-00002-10360711051-43** et validé par le propriétaire, **journal des emails** de la console |

| `node tests/rh.js` | Ressources humaines : dossiers employés, cycle de vie (embauche → départ → **archives**), salaires payés / à payer, documents PDF et vivier de candidatures |
| `node tests/psp-paydunya.js` | Adaptateur **PayDunya** testé contre un faux serveur (sans clés réelles) : création de la page de paiement hébergée, vérification du `hash` SHA-512, **idempotence** du webhook reçu deux fois, rejet d'un montant falsifié |
| `node tests/abonnements-tarifs.js` | Formules à durée/montant libres, codes de réduction, augmentations de tarif, page Ventes, classement, prestataire de paiement |
| `node tests/console-proprietaire.js` | Écrans du propriétaire (Ventes, Classement, Abonnements & tarifs) et code de réduction côté client, en interface (jsdom) |
| `node tests/inventaires.js` | **Inventaires côté API** : droits d'accès par rôle, photographie du stock, calcul des écarts en quantité et en FCFA, valorisation, application des écarts, clôture, export CSV, masquage des prix |
| `node tests/inventaires-ui.js` | **Inventaires côté interface** (jsdom) : les quatre sous-pages (comptage, montant généré, stock attendu, comparaison), la saisie en direct et l'absence d'erreur JavaScript |
| `node tests/moyens-paiement.js` | **Activation / désactivation des moyens de paiement** par le propriétaire et **retour navigateur qui n'active jamais l'abonnement** (seul le webhook vérifié fait foi) |

Les quatorze suites (**553 vérifications**) se terminent en remettant la base dans son état
de départ (suppression des entreprises, paiements et inventaires de test). Les trois
demandes de paiement de la démonstration sont **conservées** ; si elles venaient à manquer,
`node seed-paiements-demo.js` les remet en place (149 100 FCFA en attente).

---

## 6. Principales routes de l'API

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Authentification, renvoie un jeton JWT (12 h) |
| GET | `/api/dashboard` | KPI et séries du tableau de bord |
| GET/POST | `/api/ventes` | Historique / enregistrement d'une vente (caisse) |
| POST | `/api/ventes/:id/annuler` | Annulation + remise en stock |
| GET/POST/PUT/DELETE | `/api/produits`, `/api/categories` | Catalogue |
| GET | `/api/stocks`, `/api/stocks/alertes`, `/api/journal` | Stock, alertes, mouvements |
| POST | `/api/stocks/mouvement`, `/api/stocks/ajustement` | Entrée/sortie (sans prix), inventaire |
| POST | `/api/stocks/reception` | Réception rapide multi-lignes — **aucun prix demandé** |
| GET/POST/PUT/DELETE | `/api/utilisateurs` | Comptes, filtrés sur la boutique du demandeur |
| GET | `/api/roles-attribuables` | Rôles que le demandeur peut attribuer |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/permissions` | Rôles personnalisés et catalogue des droits |
| GET/POST | `/api/transferts`, `/api/transferts/:id/valider` | Transferts inter-magasins |
| GET/POST | `/api/achats`, `/api/achats/:id/statut` | Commandes et réceptions |
| GET/POST/PUT | `/api/clients`, `/api/fournisseurs`, `/api/employes` | Tiers |
| GET | `/api/rapports/ventes?group=…`, `/api/rapports/produits`, `/api/rapports/stocks` | Rapports analytiques |
| GET | `/api/export.csv?type=ventes\|stocks\|produits\|clients\|journal` | Exports CSV (Excel) |
| GET | `/api/sante` | État du service et volumétrie de la base (dont l'état du serveur d'envoi) |
| GET | `/api/entreprises/etat` | Informations publiques : tarifs, moyens de paiement (OM, MTN, **MasterCard**), compte bancaire |
| POST | `/api/entreprises/inscription` | Inscription d'entreprise → **déclenche l'email de vérification** |
| GET | `/api/entreprises/verification` | État de vérification de l'email du compte connecté |
| POST | `/api/entreprises/verification/valider` | Valide l'email avec le code reçu (400 si code erroné) |
| POST | `/api/entreprises/verification/renvoyer` | Renvoie un nouveau code de vérification |
| GET | `/api/plateforme/mails` | **Journal des emails** + état du serveur d'envoi (propriétaire) |
| POST | `/api/plateforme/mails/:id/renvoyer` | Renvoie un email consigné (propriétaire) |
| POST | `/api/plateforme/mails/tester` | Teste la connexion au serveur d'envoi (propriétaire) |
| GET/PUT | `/api/plateforme/parametres` | Tarifs, moyens de paiement, **compte MasterCard**, **SMTP** (propriétaire) |
| GET/PUT | `/api/plateforme/moyens-paiement` | Liste et **activation / désactivation** de chaque moyen de paiement (propriétaire) |
| GET | `/api/plateforme/ventes`, `/api/plateforme/classement`, `/api/plateforme/formules` | Paiements d'abonnement, classement des entreprises, formules et réductions (propriétaire) |
| GET/POST | `/api/inventaires` | Sessions d'inventaire : liste / création (photographie du stock) |
| GET | `/api/inventaires/:id` | Détail : lignes, comptes (théorique, compté, valorisation, écarts) |
| PUT | `/api/inventaires/:id/lignes/:ligneId` | Enregistrement d'une quantité comptée |
| POST | `/api/inventaires/:id/cloturer`, `/api/inventaires/:id/appliquer` | Clôture de la session / application des écarts au stock |
| GET | `/api/inventaires/:id/export.csv` | Export comptable de l'inventaire |
| GET | `/api/psp/etat` | Prestataire de paiement actif et état de configuration (public) |
| GET | `/api/psp/paydunya/retour`, `/api/psp/cinetpay/retour` | Retour navigateur après paiement — **n'active jamais l'abonnement** |
| POST | `/api/psp/paydunya/ipn`, `/api/psp/cinetpay/ipn` | **Webhook** vérifié et **idempotent** : seule source d'activation d'un abonnement |

---

## 7. Aller plus loin

Pistes d'évolution naturelles :

- **Impression de codes-barres** pour accélérer la caisse (le champ `code_barres` existe déjà).
- **Ventes à crédit / créances clients** : le mode de paiement `credit` est enregistré,
  il reste à ajouter l'écran de suivi des règlements.
- **Multi-utilisateurs en temps réel** : ajouter WebSocket pour rafraîchir les écrans.
- **Application mobile** : l'interface est responsive, elle s'utilise déjà sur téléphone
  et tablette sur le réseau du magasin.
- **Sauvegarde automatique planifiée** du fichier `data/shopmanager.db`.
- **Rôles par boutique sur mesure** : depuis Comptes & rôles, créez par exemple
  « Caissier week-end » (ventes seules) ou « Chef de rayon » (stock + réceptions).

---

## Mise à jour — Périmètres, paiement par logos et cycle de vie RH

### Propriétaire de la plateforme ≠ Administrateur d'entreprise
Le **propriétaire** ne monitore que la plateforme : son menu est limité à
*Tableau de bord, Entreprises, Paiements, Journaux e-mail* et *Aide* (aucune page
caisse/stocks/RH). Il est **le seul** à pouvoir **valider / rejeter / supprimer un
paiement** et relancer un essai (`requirePlateforme`). Le tableau de bord affiche toutes
les entreprises et le **total déjà encaissé** des abonnements ; la page *Entreprises*
permet de consulter et **supprimer** une entreprise (purge complète, PDF compris).

L'**administrateur d'entreprise** conserve l'exploitation (caisse, stocks, RH…) et
**règle l'abonnement** (permission `abonnement.gerer`) mais **ne valide pas** les
paiements. Le rôle *gestionnaire* n'a plus la gestion de l'abonnement.

### Abonnement : codes cachés derrière les logos
Sur la page Abonnement, les **numéros Orange Money / MTN ne sont plus affichés** :
trois **logos** (Orange Money, MTN MoMo, MasterCard/Visa) sont proposés.
- Clic sur **Orange Money / MTN** → l'assistant de paiement s'ouvre directement
  (numéro du marchand, montant, étapes USSD, bouton « J'ai payé »).
- Clic sur **MasterCard / Visa** → **formulaire de carte** (titulaire, numéro, expiration,
  CVC) qui enregistre le paiement.

> ⚠️ **Débit carte réel** : débiter une carte et virer sur le compte bancaire du
> propriétaire exige un **prestataire de paiement** (PSP) avec des **clés API marchand**
> — p. ex. Stripe, ou un agrégateur Afrique (CinetPay, PayDunya, Flutterwave…). Aucune
> clé n'étant fournie, la carte enregistre la demande **« en attente »** que le
> **propriétaire valide** (même flux que Mobile Money). Le branchement PSP se fait en
> branchant la clé dans la route `POST /api/abonnement/payer-carte`.

### Recrutement : pièces de candidature, renvoi et archives
- **Téléversement de PDF dès la candidature** : `POST /rh/candidats/:id/documents`
  (catégorie, nom, contenu base64) ; liste et téléchargement disponibles.
- **Embauche** : les pièces de la candidature sont **transférées** au dossier employé.
- **Renvoi** : `POST /rh/employes/:id/renvoyer` (motif + date) → l'employé passe en
  `statut_dossier = 'sorti'` et rejoint l'onglet **Archives** du recrutement, avec ses
  **documents téléchargeables**.
- **Suppression** d'un employé sorti : purge définitive (salaires, documents, pièces).

---

## Mise à jour — Paiement par carte (PSP), ventes, classement et tarifs libres

### Débit réel des cartes : PayDunya (actif) et CinetPay (secours)
Deux prestataires cohabitent ; celui qui est **actif** effectue le débit réel de la
carte et reverse les fonds sur votre compte. Vous basculez de l'un à l'autre à tout
moment, sans redéploiement.

| Prestataire | Rôle | Devise | Moyens |
| --- | --- | --- | --- |
| **PayDunya** | actif par défaut | FCFA (XAF) | cartes Visa/MasterCard + Mobile Money |
| **CinetPay** | secours | FCFA (XAF) | cartes + Mobile Money |

**Choix du prestataire actif** : variable `PSP_ACTIF` (`paydunya` | `cinetpay`),
ou paramètre `psp_actif` réglable par le propriétaire dans
*Abonnements & tarifs → 🔐 Prestataires de paiement*.

**Configuration PayDunya**

| Variable | Rôle |
| --- | --- |
| `PAYDUNYA_MASTER_KEY` | clé principale de l'application |
| `PAYDUNYA_PRIVATE_KEY` | clé privée (`test_private_…` ou `live_private_…`) |
| `PAYDUNYA_TOKEN` | token de l'application |
| `PAYDUNYA_MODE` | `test` (sandbox, défaut) ou `live` |
| `PAYDUNYA_CALLBACK_URL` | URL recevant les notifications |
| `PAYDUNYA_RETURN_URL` / `PAYDUNYA_CANCEL_URL` | URLs de retour |
| `PAYDUNYA_STORE` | nom de la boutique affiché au client |
| `PAYDUNYA_BASE` | (optionnel) hôte alternatif, pour tester |

**Configuration CinetPay** : `CINETPAY_APIKEY`, `CINETPAY_SITE_ID`,
`CINETPAY_ENV` (`SANDBOX`/`PRODUCTION`), `CINETPAY_NOTIFY_URL`,
`CINETPAY_RETURN_URL`, `CINETPAY_CANAUX`.

**Déroulé** : `POST /api/abonnement/payer-carte` crée la demande, appelle
`POST /checkout-invoice/create` chez PayDunya et renvoie l'**URL de la page de
paiement hébergée** — le numéro de carte complet et le cryptogramme ne transitent
jamais par nos serveurs. PayDunya notifie `POST /api/psp/paydunya/ipn` ;
l'application **re-vérifie** la transaction via `GET /checkout-invoice/confirm/{token}`,
contrôle la **signature SHA-512 de la MasterKey** et le **montant reçu**, puis valide
ou rejette le paiement et prolonge l'abonnement. `GET /api/psp/paydunya/retour`
ramène le client dans l'application.
**Sans clés**, le flux bascule proprement sur « en attente » de validation manuelle.

### Console du propriétaire : trois nouveaux écrans
- **Ventes d'abonnements** — tous les paiements reçus de toutes les entreprises
  (validés, en attente, rejetés), avec filtres (statut, service, entreprise, période,
  recherche), totaux par statut, remises accordées, validation/rejet en ligne,
  fiche détaillée (carte, PSP, reduction) et **export CSV**.
- **Classement des entreprises** — podium et classement complet des entreprises qui
  utilisent le plus l'application, mesuré **à travers leur abonnement** :
  score composite 0-100 (40 % montants encaissés, 20 % régularité des paiements,
  15 % ancienneté, 15 % ventes, 10 % comptes ouverts), paliers Platine/Or/Argent/Bronze,
  part du chiffre d'affaires abonnements, tri par six critères.
- **Abonnements & tarifs** — pilotage complet de l'offre.

### Formules, réductions et augmentations (propriétaire)
- **Durée et montant libres** : le propriétaire crée autant de formules qu'il veut
  (`code`, libellé, **durée en jours**, **montant**) — ex. 90 jours / 32 000 FCFA.
  La page Abonnement du client les affiche dynamiquement.
- **Réductions du montant voulu** : codes en **pourcentage** ou en **montant fixe**,
  limitables à une formule, à une période et à un nombre d'utilisations.
  Une **valeur négative** crée une majoration ciblée. Le client saisit le code avant de
  payer ; le montant est vérifié côté serveur (`POST /api/abonnement/reduction/verifier`)
  puis recalculé à la création du paiement — jamais côté client.
- **Augmentations de tarif** : `POST /api/plateforme/formules/augmenter` applique un
  pourcentage ou un montant fixe à une formule ou à toutes (valeur négative = baisse).
- Toute la configuration est réservée au propriétaire (`requirePlateforme`).

Ces fonctions sont couvertes par deux suites de tests supplémentaires
(`abonnements-tarifs` pour l'API, `console-proprietaire` pour l'interface).

---

© 2026 Inventa GestyPro — v1.0.0

---

## 7. Étape en cours : boutiques/magasins, logo et inventaires réservés à l'admin

- **Logo d'application** : l'image fournie (`public/img/logo-app.jpeg`) remplace l'emoji sur
  l'écran de connexion, la barre latérale et le **compte rendu d'inventaire**.
- **Magasins vs boutiques** : un point de vente porte désormais un `type`.
  `magasin` = stock seul (entrées/sorties, **pas de caisse**) ; `boutique` = stock **+ ventes**.
  À la création d'une boutique, l'administrateur **transfère une dotation de stock** et peut
  ensuite créer le compte caissier rattaché. L'aperçu réseau (`GET /api/magasins/apercu`)
  montre ventes du jour / stock restant par boutique et entrées / sorties par magasin.
- **Prix optionnel** : un produit peut être créé **sans prix de vente** ; le prix est donné
  **au moment de la vente** (champ dans le panier) puis mémorisé sur le produit.
- **Inventaires réservés à l'administrateur** : seul l'admin crée, saisit, clôture, applique
  et **supprime** (y compris un inventaire clôturé). Les autres rôles ne font que consulter.
  Un **compte rendu imprimable** (logo de l'entreprise + logo de l'application) est généré
  depuis l'écran Inventaires.

## 8. Messagerie interne et cycle d'abonnement

- **Messages** (`#/messages`, entrée ✉️ pour tous les comptes, badge « non lus ») :
  le **propriétaire** écrit aux administrateurs de toutes les entreprises ; un
  **administrateur** écrit aux profils de son entreprise ; un **compte de boutique**
  écrit à son administrateur. Chaque message est conservé en base **et** consigné dans
  le journal « E-mails » (expédié réellement si un SMTP est configuré). Accusé de lecture
  et réponse en un clic.
- **Expiration d'abonnement** : à l'expiration, toutes les écritures sont refusées (HTTP 402) ;
  un message « Abonnement expiré — mise à jour requise » arrive automatiquement à
  l'administrateur (email + messagerie, au plus une fois par 24 h). **Seul le propriétaire**
  peut réactiver (geste commercial, `POST /api/plateforme/entreprises/:id/abonnement`),
  après quoi l'entreprise refonctionne.
