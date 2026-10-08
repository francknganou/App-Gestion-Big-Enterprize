/**
 * Tests des deux écrans demandés à l'administrateur :
 *   1. « Employés & Salaires » — dossier du personnel + suivi mensuel des versements ;
 *   2. « Recrutements » — vivier de candidatures + dossiers et documents PDF.
 *
 * Couvre l'API (contrats, cloisonnement, sécurité des fichiers) puis le rendu
 * réel des vues dans jsdom.
 *
 *   node tests/rh.js          (serveur démarré : npm start)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TS = Date.now();

const erreurs = [];
const resultats = [];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreCondition(fn, { essais = 60, intervalle = 120, message = 'condition non remplie' } = {}) {
  for (let i = 0; i < essais; i++) { const v = fn(); if (v) return v; await attendre(intervalle); }
  throw new Error(message);
}
function verif(libelle, ok, detail) { resultats.push([libelle, !!ok, detail]); }

/* PDF minimal mais valide : signature %PDF puis %%EOF. */
function pdfMinimal(octets = 200) {
  const corps = 'x'.repeat(Math.max(0, octets - 16));
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n' + corps + '\n%%EOF\n');
}

async function req(chemin, { methode = 'GET', corps, jeton, brut = false } = {}) {
  const options = { method: methode, headers: {} };
  if (jeton) options.headers.Authorization = 'Bearer ' + jeton;
  if (corps !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(corps); }
  const reponse = await fetch(BASE + chemin, options);
  if (brut) return reponse;
  let donnees = null;
  const texte = await reponse.text();
  try { donnees = texte ? JSON.parse(texte) : null; } catch (e) { donnees = { brut: texte }; }
  return { statut: reponse.status, donnees, entetes: reponse.headers };
}

async function ouvrirFenetre() {
  const consoleVirtuelle = new VirtualConsole();
  consoleVirtuelle.on('jsdomError', (e) => erreurs.push('jsdomError: ' + e.message));
  consoleVirtuelle.on('error', (m) => erreurs.push('console.error: ' + m));
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: consoleVirtuelle,
  });
  dom.window.fetch = (url, options) => fetch(new URL(url, BASE), options);
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  /* jsdom ne sait pas créer de liens de téléchargement ni d'objets blob. */
  dom.window.URL.createObjectURL = () => 'blob:stub';
  dom.window.URL.revokeObjectURL = () => {};
  return dom.window;
}

async function principal() {
  /* ---------------- Connexion de l'administrateur ---------------- */
  const connexion = await req('/api/auth/login', {
    methode: 'POST',
    corps: { email: 'admin@shoppingplus.cm', mot_de_passe: 'Admin@2026' },
  });
  verif('Connexion de l’administrateur', connexion.statut === 200, 'HTTP ' + connexion.statut);
  const jeton = connexion.donnees.token;
  const A = (c, o) => req(c, Object.assign({}, o, { jeton }));

  /* ================================================================
     1. PAGE « EMPLOYÉS & SALAIRES » — API
     ================================================================ */
  const liste = await A('/api/rh/employes');
  verif('Liste du personnel accessible', liste.statut === 200, 'HTTP ' + liste.statut);
  const employes = liste.donnees.employes || [];
  verif('La démo contient du personnel', employes.length >= 12, employes.length + ' employés');
  verif('Masse salariale calculée', (liste.donnees.masse_salariale || 0) > 0, String(liste.donnees.masse_salariale) + ' FCFA');
  verif('Compteur de dossiers incomplets présent',
    typeof liste.donnees.nb_dossiers_incomplets === 'number', String(liste.donnees.nb_dossiers_incomplets));

  /* Le dossier du personnel doit porter l'état civil et les pièces administratives. */
  const avecCni = employes.filter((e) => e.numero_cni).length;
  verif('Des CNI sont renseignées dans la démo', avecCni > 0, avecCni + '/' + employes.length);
  const champsDossier = ['code', 'nom', 'poste', 'magasin', 'numero_cni', 'date_embauche',
    'type_contrat', 'salaire', 'actif', 'statut_dossier', 'nb_documents'];
  const manque = champsDossier.filter((c) => !(c in (employes[0] || {})));
  verif('Tous les champs du dossier sont renvoyés', manque.length === 0, manque.join(','));

  /* Création d'un employé avec un dossier à compléter. */
  const nouveau = await A('/api/rh/employes', {
    methode: 'POST',
    corps: {
      nom: 'Test RH ' + TS, poste: 'Vendeur', magasin_id: employes[0].magasin_id,
      telephone: '+237 699 00 11 22', date_embauche: '2026-01-05', type_contrat: 'CDD',
      salaire: 150000, numero_cni: '987654321', statut_dossier: 'a_completer',
    },
  });
  const idEmp = nouveau.donnees && nouveau.donnees.id;
  verif('Création d’un employé', nouveau.statut === 201 && !!idEmp, 'HTTP ' + nouveau.statut);
  verif('Le statut de dossier transmis est respecté (non forcé à « complet »)',
    nouveau.donnees.statut_dossier === 'a_completer', String(nouveau.donnees.statut_dossier));

  /* Lecture puis mise à jour du dossier. */
  const lu = await A('/api/rh/employes/' + idEmp);
  const fiche = lu.donnees.employe || lu.donnees;
  verif('Lecture d’une fiche employé', lu.statut === 200 && fiche.numero_cni === '987654321', String(fiche.numero_cni));
  const maj = await A('/api/rh/employes/' + idEmp, {
    methode: 'PUT',
    corps: { nom: 'Test RH ' + TS, salaire: 165000, numero_cnps: '555666777', ville: 'Douala' },
  });
  const majFiche = maj.donnees.employe || maj.donnees;
  verif('Mise à jour du dossier (salaire + CNPS)',
    maj.statut === 200 && majFiche.salaire === 165000 && majFiche.numero_cnps === '555666777',
    JSON.stringify({ s: majFiche.salaire, c: majFiche.numero_cnps }));

  /* ---------------- Suivi mensuel des salaires ---------------- */
  const periode = await A('/api/rh/salaires');
  verif('Grille de paie du mois courant', periode.statut === 200, 'HTTP ' + periode.statut);
  verif('Période au format AAAA-MM', /^\d{4}-\d{2}$/.test(periode.donnees.periode || ''), periode.donnees.periode);
  verif('Totaux de la masse salariale fournis',
    periode.donnees.totaux && typeof periode.donnees.totaux.masse_salariale === 'number',
    JSON.stringify(periode.donnees.totaux));

  /* Versement d'une paie : primes et retenues recalculent le net. */
  const versement = await A('/api/rh/salaires', {
    methode: 'POST',
    corps: { employe_id: idEmp, periode: periode.donnees.periode, montant: 165000, primes: 20000, retenues: 15000, statut: 'paye' },
  });
  const lignePaie = versement.donnees.ligne || versement.donnees;
  const net = lignePaie.net !== undefined ? lignePaie.net : lignePaie.montant_net;
  verif('Enregistrement d’un versement (net = base + primes − retenues)',
    versement.statut === 201 && net === 170000, 'net=' + net);

  /* Un second envoi sur la même période met à jour au lieu de dupliquer. */
  const doublon = await A('/api/rh/salaires', {
    methode: 'POST',
    corps: { employe_id: idEmp, periode: periode.donnees.periode, montant: 165000, primes: 30000, retenues: 15000, statut: 'paye' },
  });
  const relecture = await A('/api/rh/salaires?periode=' + periode.donnees.periode);
  const lignes = (relecture.donnees.lignes || []).filter((l) => l.employe_id === idEmp);
  verif('Un seul versement par employé et par mois (upsert)',
    doublon.statut === 201 && lignes.length === 1, lignes.length + ' ligne(s)');
  const netRelu = lignes[0] && (lignes[0].net !== undefined ? lignes[0].net : lignes[0].montant_net);
  verif('Le net suit la dernière saisie', netRelu === 180000, String(netRelu));

  /* « Tout marquer payé » crée les lignes manquantes de la période puis les règle :
     c'est le comportement attendu pour solder un mois d'un seul geste. */
  const periodePaie = '2029-03';
  const masse = await A('/api/rh/salaires/payer-periode', { methode: 'POST', corps: { periode: periodePaie } });
  verif('Marquage en masse d’une période : chaque employé réglé',
    masse.statut === 200 && masse.donnees.nb_marques > 0, JSON.stringify(masse.donnees));
  const relue = await A('/api/rh/salaires?periode=' + periodePaie);
  verif('Aucun versement ne reste à payer après le marquage en masse',
    relue.donnees.totaux.nb_a_payer === 0 && relue.donnees.totaux.nb_payes > 0,
    JSON.stringify(relue.donnees.totaux));
  /* Un second passage ne doit rien re-marquer. */
  const second = await A('/api/rh/salaires/payer-periode', { methode: 'POST', corps: { periode: periodePaie } });
  verif('Second marquage de la même période : rien à faire',
    second.donnees.nb_marques === 0, String(second.donnees.nb_marques));

  /* ================================================================
     2. DOCUMENTS PDF DES EMPLOYÉS
     ================================================================ */
  const categories = await A('/api/rh/documents-categories');
  verif('Catégories de pièces disponibles', categories.statut === 200
    && Object.keys(categories.donnees.categories || {}).length >= 5,
    Object.keys(categories.donnees.categories || {}).join(','));

  const pdf = pdfMinimal();
  const envoi = await A('/api/rh/employes/' + idEmp + '/documents', {
    methode: 'POST',
    corps: { categorie: 'cni', nom: 'CNI Test.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
  });
  const docCree = envoi.donnees.document || envoi.donnees;
  const idDoc = docCree && docCree.id;
  verif('Téléversement d’un PDF', envoi.statut === 201 && docCree.taille === pdf.length,
    'HTTP ' + envoi.statut + ' taille=' + (docCree && docCree.taille));
  verif('Le PDF est stocké sous un nom opaque (pas le nom d’origine)',
    /^emp-\d+-.+\.pdf$/.test(docCree.nom_stocke || ''), String(docCree.nom_stocke));

  const telechargement = await req('/api/rh/documents/' + idDoc, { jeton, brut: true });
  const recu = Buffer.from(await telechargement.arrayBuffer());
  verif('Téléchargement du PDF : mêmes octets',
    telechargement.status === 200 && recu.equals(pdf), recu.length + '/' + pdf.length + ' octets');
  verif('En-têtes de sécurité du fichier',
    (telechargement.headers.get('Content-Type') || '').includes('application/pdf')
    && /attachment/i.test(telechargement.headers.get('Content-Disposition') || '')
    && telechargement.headers.get('X-Content-Type-Options') === 'nosniff',
    telechargement.headers.get('Content-Disposition'));

  /* Refus des fichiers non conformes. */
  const nonPdf = await A('/api/rh/employes/' + idEmp + '/documents', {
    methode: 'POST',
    corps: { categorie: 'cv', nom: 'virus.exe', type: 'application/octet-stream', contenu: Buffer.from('MZ stub').toString('base64') },
  });
  verif('Extension non PDF refusée (400, pas 500)', nonPdf.statut === 400,
    'HTTP ' + nonPdf.statut + ' ' + (nonPdf.donnees && nonPdf.donnees.erreur));
  const fauxPdf = await A('/api/rh/employes/' + idEmp + '/documents', {
    methode: 'POST',
    corps: { categorie: 'cv', nom: 'faux.pdf', type: 'application/pdf', contenu: Buffer.from('pas un pdf').toString('base64') },
  });
  verif('Contenu non PDF refusé (400, pas 500)', fauxPdf.statut === 400,
    'HTTP ' + fauxPdf.statut + ' ' + (fauxPdf.donnees && fauxPdf.donnees.erreur));
  const sansEmploye = await A('/api/rh/employes/999999/documents', {
    methode: 'POST',
    corps: { categorie: 'cv', nom: 'x.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
  });
  verif('Employé inexistant : 404', sansEmploye.statut === 404, 'HTTP ' + sansEmploye.statut);

  /* Le compteur de documents de la fiche doit suivre. */
  const apresDoc = await A('/api/rh/employes/' + idEmp);
  const docsApres = apresDoc.donnees.documents || [];
  verif('Le détail expose les pièces téléversées', docsApres.length === 1,
    docsApres.length + ' pièce(s)');
  /* La liste, elle, porte le compteur affiché dans le tableau du personnel. */
  const reliste = await A('/api/rh/employes?q=' + encodeURIComponent('Test RH'));
  const ligneListe = (reliste.donnees.employes || []).find((x) => x.id === idEmp);
  verif('Le compteur de pièces figure dans la liste du personnel',
    !!ligneListe && ligneListe.nb_documents === 1,
    'nb=' + (ligneListe && ligneListe.nb_documents));

  /* ================================================================
     3. PAGE « RECRUTEMENTS » — CANDIDATURES
     ================================================================ */
  const candidat = await A('/api/rh/candidats', {
    methode: 'POST',
    corps: {
      nom: 'Candidat Test ' + TS, poste_vise: 'Caissier', telephone: '+237 677 12 34 56',
      email: 'candidat.' + TS + '@test.cm', ville: 'Douala', source: 'Annonce',
    },
  });
  const candCree = candidat.donnees.candidat || candidat.donnees;
  const idCandidat = candCree.id;
  verif('Enregistrement d’une candidature', candidat.statut === 201 && !!idCandidat, 'HTTP ' + candidat.statut);
  verif('Le poste visé est enregistré', candCree.poste_vise === 'Caissier', String(candCree.poste_vise));
  verif('Statut initial « reçu »', candCree.statut === 'recu', String(candCree.statut));

  const entretien = await A('/api/rh/candidats/' + idCandidat + '/statut', {
    methode: 'POST', corps: { statut: 'entretien', date_entretien: '2026-11-10' },
  });
  const candEntretien = entretien.donnees.candidat || entretien.donnees;
  verif('Passage en entretien', entretien.statut === 200
    && candEntretien.statut === 'entretien'
    && (candEntretien.date_entretien || '').slice(0, 10) === '2026-11-10',
    JSON.stringify({ s: candEntretien.statut, d: candEntretien.date_entretien }));

  const embauche = await A('/api/rh/candidats/' + idCandidat + '/embaucher', {
    methode: 'POST',
    corps: { magasin_id: employes[0].magasin_id, salaire: 135000, type_contrat: 'CDD', date_embauche: '2026-11-15' },
  });
  const empEmbauche = (embauche.donnees && embauche.donnees.employe) || null;
  const candEmbauche = (embauche.donnees && embauche.donnees.candidat) || null;
  const idEmbauche = empEmbauche && empEmbauche.id;
  verif('Embauche d’une candidature retenue', embauche.statut === 201 || embauche.statut === 200,
    'HTTP ' + embauche.statut);
  verif('Un employé est créé avec un code',
    !!empEmbauche && /^EM-\d+$/.test(empEmbauche.code || ''), String(empEmbauche && empEmbauche.code));
  verif('La candidature est liée à l’employé créé',
    !!candEmbauche && candEmbauche.employe_id === idEmbauche && candEmbauche.statut === 'embauche',
    JSON.stringify(candEmbauche && { e: candEmbauche.employe_id, s: candEmbauche.statut }));
  verif('Un employé issu d’une candidature n’est pas marqué « dossier complet » sans pièce',
    !!empEmbauche && (empEmbauche.statut_dossier !== 'complet' || (empEmbauche.nb_documents || 0) > 0),
    String(empEmbauche && empEmbauche.statut_dossier));

  /* Une candidature ne peut pas être embauchée deux fois. */
  const seconde = await A('/api/rh/candidats/' + idCandidat + '/embaucher', {
    methode: 'POST', corps: { magasin_id: employes[0].magasin_id, salaire: 100000 },
  });
  verif('Double embauche d’une même candidature refusée', seconde.statut === 400,
    'HTTP ' + seconde.statut);

  /* Refus d'une candidature. */
  const autre = await A('/api/rh/candidats', { methode: 'POST', corps: { nom: 'Refusé ' + TS, poste_vise: 'Vigile' } });
  const idRefuse = (autre.donnees.candidat || autre.donnees).id;
  const refuse = await A('/api/rh/candidats/' + idRefuse + '/statut', {
    methode: 'POST', corps: { statut: 'refuse', commentaire: 'Poste pourvu' },
  });
  const candRefuse = refuse.donnees.candidat || refuse.donnees;
  verif('Refus d’une candidature', refuse.statut === 200 && candRefuse.statut === 'refuse', String(candRefuse.statut));
  const statutInvalide = await A('/api/rh/candidats/' + idRefuse + '/statut', {
    methode: 'POST', corps: { statut: 'inconnu' },
  });
  verif('Statut de candidature inconnu refusé', statutInvalide.statut === 400, 'HTTP ' + statutInvalide.statut);

  /* ================================================================
     4. DROITS D'ACCÈS
     ================================================================ */
  const caisse = await req('/api/auth/login', {
    methode: 'POST', corps: { email: 'caisse1@shoppingplus.cm', mot_de_passe: 'Caisse@2026' },
  });
  const jetonCaisse = caisse.donnees.token;
  const sansDroit = await req('/api/rh/employes', { jeton: jetonCaisse });
  verif('Une caissière ne voit pas le personnel (403)', sansDroit.statut === 403, 'HTTP ' + sansDroit.statut);
  const sansDroitPaie = await req('/api/rh/salaires', { jeton: jetonCaisse });
  verif('Une caissière ne voit pas les salaires (403)', sansDroitPaie.statut === 403, 'HTTP ' + sansDroitPaie.statut);
  const sansDroitUpload = await req('/api/rh/employes/' + idEmp + '/documents', {
    methode: 'POST', jeton: jetonCaisse,
    corps: { categorie: 'cni', nom: 'x.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
  });
  verif('Une caissière ne peut pas téléverser de document (403)', sansDroitUpload.statut === 403,
    'HTTP ' + sansDroitUpload.statut);
  const anonyme = await req('/api/rh/employes');
  verif('Accès anonyme refusé (401)', anonyme.statut === 401, 'HTTP ' + anonyme.statut);
  const fichierAnonyme = await req('/api/rh/documents/' + idDoc, { brut: true });
  verif('Téléchargement anonyme d’un document refusé (401)', fichierAnonyme.status === 401,
    'HTTP ' + fichierAnonyme.status);

  /* ================================================================
     5. CLOISONNEMENT ENTRE ENTREPRISES
     ================================================================ */
  /* Le test crée sa propre seconde entreprise : il ne dépend d'aucune donnée
     préexistante et reste valable sur une base fraîchement initialisée. */
  const Database = require('better-sqlite3');
  const emailB = 'rh.autre.' + TS + '@entreprise.cm';
  const inscB = await req('/api/entreprises/inscription', {
    methode: 'POST',
    corps: {
      email: emailB, mot_de_passe: 'Demo@2026', nom: 'AUTRE', prenom: 'Alain',
      entreprise: 'ENTREPRISE RH ' + TS, date_creation: '2024-03-15', niu: 'U' + TS,
      logo: 'data:image/png;base64,iVBORw0KGgo=', ville: 'Douala',
    },
  });
  verif('Seconde entreprise créée pour le test de cloisonnement',
    inscB.statut === 201 && inscB.donnees.ok === true, 'HTTP ' + inscB.statut);
  /* L'accès est bloquant tant que l'adresse n'est pas vérifiée : on lit le code
     dans le journal, exactement comme l'utilisateur le lit dans sa boîte mail. */
  const dbVerif = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
  const userB = dbVerif.prepare('SELECT id FROM users WHERE email=?').get(emailB);
  const codeB = userB && dbVerif.prepare(
    'SELECT code FROM codes_verification WHERE user_id=? AND utilise_at IS NULL ORDER BY id DESC LIMIT 1'
  ).get(userB.id);
  dbVerif.close();
  const jetonB0 = inscB.donnees.token;
  await req('/api/entreprises/verification/valider', {
    methode: 'POST', jeton: jetonB0, corps: { code: codeB ? codeB.code : '000000' },
  });
  const autreEnt = await req('/api/auth/login', { methode: 'POST', corps: { email: emailB, mot_de_passe: 'Demo@2026' } });
  if (autreEnt.statut === 200) {
    const jetonB = autreEnt.donnees.token;
    const B = (c, o) => req(c, Object.assign({}, o, { jeton: jetonB }));
    const listeB = await B('/api/rh/employes');
    const idsB = (listeB.donnees.employes || []).map((e) => e.id);
    verif('Une autre entreprise ne voit pas le personnel de la première',
      !idsB.includes(idEmp), idsB.length + ' employé(s) chez B');
    const ficheB = await B('/api/rh/employes/' + idEmp);
    verif('Lecture de la fiche d’une autre entreprise : 404', ficheB.statut === 404, 'HTTP ' + ficheB.statut);
    const modifB = await B('/api/rh/employes/' + idEmp, { methode: 'PUT', corps: { salaire: 1 } });
    verif('Modification de la fiche d’une autre entreprise : 404', modifB.statut === 404, 'HTTP ' + modifB.statut);
    const uploadB = await B('/api/rh/employes/' + idEmp + '/documents', {
      methode: 'POST',
      corps: { categorie: 'cni', nom: 'x.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
    });
    verif('Téléversement chez une autre entreprise : 404', uploadB.statut === 404, 'HTTP ' + uploadB.statut);
    const paieB = await B('/api/rh/salaires', {
      methode: 'POST',
      corps: { employe_id: idEmp, periode: periode.donnees.periode, statut: 'paye' },
    });
    verif('Paiement du personnel d’une autre entreprise : 404', paieB.statut === 404, 'HTTP ' + paieB.statut);
    const docB = await req('/api/rh/documents/' + idDoc, { jeton: jetonB, brut: true });
    verif('Téléchargement du PDF d’une autre entreprise : 404', docB.status === 404, 'HTTP ' + docB.status);
  } else {
    verif('Connexion à la seconde entreprise', false, 'HTTP ' + autreEnt.statut);
  }

  /* Supprimer une entreprise doit emporter ses fiches, ses paies, ses
     candidatures et les PDF de son personnel. */
  {
    const emailPurge = 'rh.purge.' + TS + '@entreprise.cm';
    const inscPurge = await req('/api/entreprises/inscription', {
      methode: 'POST',
      corps: {
        email: emailPurge, mot_de_passe: 'Demo@2026', nom: 'PURGE', prenom: 'Test',
        entreprise: 'ENTREPRISE PURGE ' + TS, date_creation: '2024-01-01', niu: 'UP' + TS,
        logo: 'data:image/png;base64,iVBORw0KGgo=', ville: 'Douala',
      },
    });
    const idEntPurge = inscPurge.donnees.entreprise && inscPurge.donnees.entreprise.id;
    const dbP = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'));
    const uP = dbP.prepare('SELECT id FROM users WHERE email=?').get(emailPurge);
    const codeP = dbP.prepare('SELECT code FROM codes_verification WHERE user_id=? AND utilise_at IS NULL ORDER BY id DESC LIMIT 1').get(uP.id);
    dbP.close();
    await req('/api/entreprises/verification/valider', {
      methode: 'POST', jeton: inscPurge.donnees.token, corps: { code: codeP.code },
    });
    const loginP = await req('/api/auth/login', { methode: 'POST', corps: { email: emailPurge, mot_de_passe: 'Demo@2026' } });
    const jetonP = loginP.donnees.token;
    const magP = await req('/api/magasins', { jeton: jetonP });
    const listeMagP = Array.isArray(magP.donnees) ? magP.donnees : (magP.donnees.magasins || []);
    const empP = await req('/api/rh/employes', {
      methode: 'POST', jeton: jetonP,
      corps: { nom: 'Employé Purge ' + TS, poste: 'Vendeur', magasin_id: listeMagP[0].id, salaire: 100000 },
    });
    const docP = await req('/api/rh/employes/' + empP.donnees.id + '/documents', {
      methode: 'POST', jeton: jetonP,
      corps: { categorie: 'cni', nom: 'CNI purge.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
    });
    const nomStockeP = (docP.donnees.document || docP.donnees).nom_stocke;
    await req('/api/rh/salaires', { methode: 'POST', jeton: jetonP, corps: { employe_id: empP.donnees.id, periode: '2026-10', statut: 'paye' } });
    await req('/api/rh/candidats', { methode: 'POST', jeton: jetonP, corps: { nom: 'Candidat Purge ' + TS, poste_vise: 'Vendeur' } });

    const prop = await req('/api/auth/login', {
      methode: 'POST', corps: { email: 'franck06.nganou02oumbe2004@gmail.com', mot_de_passe: 'Aspirine46@!' },
    });
    const supEnt = await req('/api/plateforme/entreprises/' + idEntPurge, { methode: 'DELETE', jeton: prop.donnees.token });
    verif('Le propriétaire peut supprimer une entreprise cliente', supEnt.statut === 200, 'HTTP ' + supEnt.statut);
    await attendre(800);
    const dbQ = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
    const resteEmpP = dbQ.prepare('SELECT COUNT(*) n FROM employes WHERE entreprise_id=?').get(idEntPurge).n;
    const resteSalP = dbQ.prepare('SELECT COUNT(*) n FROM salaires WHERE entreprise_id=?').get(idEntPurge).n;
    const resteCandP = dbQ.prepare('SELECT COUNT(*) n FROM candidats WHERE entreprise_id=?').get(idEntPurge).n;
    dbQ.close();
    verif('La suppression emporte le personnel, les paies et les candidatures',
      resteEmpP === 0 && resteSalP === 0 && resteCandP === 0,
      `emp=${resteEmpP} paie=${resteSalP} cand=${resteCandP}`);
    const cheminP = path.join(__dirname, '..', 'data', 'documents', nomStockeP);
    let resteFichier = true;
    for (let i = 0; i < 25 && resteFichier; i += 1) { resteFichier = fs.existsSync(cheminP); if (resteFichier) await attendre(80); }
    verif('… et efface les PDF du personnel du disque', !resteFichier, nomStockeP);

    /* La seconde entreprise du test de cloisonnement est supprimée elle aussi :
       sans cela chaque exécution laisse une entreprise fantôme dans la console
       du propriétaire (pages Entreprises, Ventes et Classement). */
    const dbR = new Database(path.join(__dirname, '..', 'data', 'shopmanager.db'), { readonly: true });
    const userR = dbR.prepare('SELECT entreprise_id FROM users WHERE email=?').get(emailB);
    dbR.close();
    if (userR && userR.entreprise_id) {
      await req('/api/plateforme/entreprises/' + userR.entreprise_id, {
        methode: 'DELETE', jeton: prop.donnees.token,
      });
    }
  }

  /* ================================================================
     6. RENDU DES ÉCRANS (jsdom)
     ================================================================ */
  const w = await ouvrirFenetre();
  await attendreCondition(() => w.App && w.document.querySelector('#form-connexion'), { message: 'écran de connexion absent' });
  const fc = w.document.querySelector('#form-connexion');
  fc.querySelector('[name=email]').value = 'admin@shoppingplus.cm';
  fc.querySelector('[name=mot_de_passe]').value = 'Admin@2026';
  fc.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  /* App pose etat.utilisateur avant de rendre la coquille : attendre l'utilisateur
     ne suffit pas, il faut attendre que le menu soit effectivement dans le DOM. */
  const nav = await attendreCondition(() => w.App.etat.utilisateur && w.document.querySelector('nav'),
    { essais: 120, message: 'menu non rendu après connexion' });

  verif('Le menu affiche « Ressources humaines »',
    /Ressources humaines/.test(nav.innerHTML), nav.innerHTML.slice(0, 60));
  const liens = [...nav.querySelectorAll('a')].map((a) => a.textContent.trim());
  verif('Entrée « Employés » dans le menu', liens.some((t) => /Employés/.test(t)), liens.join(' | '));
  verif('Entrée « Salaires » dans le menu', liens.some((t) => /Salaires/.test(t)), liens.join(' | '));
  verif('Entrée « Recrutements » dans le menu', liens.some((t) => /Recrutements/.test(t)), liens.join(' | '));

  /* --- Écran Salaires --- */
  w.App.allerA('salaires');
  await attendreCondition(() => w.document.getElementById('s-liste')
    && w.document.getElementById('s-liste').innerHTML.length > 100, { message: 'grille de paie vide' });
  verif('Grille de paie affichée', w.document.getElementById('s-liste').innerHTML.includes('Test RH')
    || w.document.getElementById('s-liste').textContent.length > 200,
    w.document.getElementById('s-liste').textContent.slice(0, 80));
  const kpi = (w.document.getElementById('s-kpi').textContent || '').replace(/\s+/g, ' ');
  verif('KPI de la masse salariale en FCFA', /Masse salariale[\s\S]{0,40}FCFA/.test(kpi), kpi.slice(0, 90));
  verif('KPI du reste à payer affiché', /Reste à payer/.test(kpi), kpi.slice(0, 90));
  verif('Sélecteur de mois présent', !!w.document.getElementById('s-periode'));
  verif('Bouton « tout marquer payé » présent', !!w.document.getElementById('s-tout-payer'));
  verif('Courbe d’évolution de la masse salariale', !!w.document.getElementById('s-evolution')
    && w.document.getElementById('s-evolution').innerHTML.length > 0);

  /* --- Écran Recrutements --- */
  w.App.allerA('recrutement');
  await attendreCondition(() => w.document.querySelectorAll('[data-onglet]').length >= 2,
    { message: 'onglets de recrutement absents' });
  await attendreCondition(() => w.document.getElementById('r-corps')
    && w.document.getElementById('r-corps').innerHTML.length > 100, { message: 'vivier vide' });
  verif('Vivier de candidatures affiché',
    w.document.getElementById('r-corps').textContent.includes('Candidat Test')
    || w.document.querySelectorAll('[data-candidat]').length > 0,
    String(w.document.querySelectorAll('[data-candidat]').length) + ' candidature(s)');
  verif('Bouton « nouvelle candidature »', !!w.document.getElementById('c-nouveau'));
  verif('Filtre par statut de candidature', !!w.document.getElementById('c-statut'));

  /* Onglet dossiers : la fiche du personnel et ses pièces. */
  const ongletDossiers = [...w.document.querySelectorAll('[data-onglet]')].find((b) => /dossier/i.test(b.dataset.onglet));
  verif('Onglet « dossiers » présent', !!ongletDossiers);
  ongletDossiers.click();
  await attendreCondition(() => w.document.getElementById('r-corps')
    && /Test RH|Employé/i.test(w.document.getElementById('r-corps').textContent), { message: 'dossiers non chargés' });
  verif('Liste des dossiers du personnel', w.document.querySelectorAll('[data-dossier]').length > 0,
    String(w.document.querySelectorAll('[data-dossier]').length) + ' dossier(s)');

  /* Ouverture du dossier d'un employé : pièces + formulaire d'ajout.
     Le bouton [data-dossier] est dans la liste, pas dans la modale. */
  const boutonsDossier = w.document.querySelectorAll('#r-corps [data-dossier]');
  verif('Chaque ligne du personnel ouvre son dossier', boutonsDossier.length > 0,
    String(boutonsDossier.length) + ' bouton(s)');
  boutonsDossier[0].click();
  await attendreCondition(() => w.document.querySelector('.voile .modale'),
    { message: 'dossier non ouvert' });
  /* Le dossier s'ouvre sur « Informations » ; les pièces sont derrière l'onglet dédié. */
  const ongletPieces = w.document.querySelector('.modale [data-pieces]');
  verif('Onglet « Documents » du dossier', !!ongletPieces, ongletPieces ? ongletPieces.textContent : 'absent');
  ongletPieces.click();
  await attendreCondition(() => w.document.getElementById('doc-fichier')
    || /Aucun document|aucune pièce/i.test(w.document.body.textContent),
    { message: 'volet documents non chargé' });
  verif('Champ de téléversement PDF dans le dossier', !!w.document.getElementById('doc-fichier'));
  verif('Sélecteur de catégorie de pièce', !!w.document.getElementById('doc-categorie')
    && w.document.getElementById('doc-categorie').options.length >= 5,
    String(w.document.getElementById('doc-categorie') && w.document.getElementById('doc-categorie').options.length) + ' catégorie(s)');
  const zoneModale = w.document.querySelector('.modale') || w.document.body;
  verif('Le dossier affiche l’état civil (CNI, contrat, salaire)',
    /CNI|Contrat|Salaire/.test(zoneModale.textContent), zoneModale.textContent.slice(0, 80));
  verif('Le dossier liste les pièces ou signale leur absence',
    /Pièce|Aucun document|aucune pièce|Téléverser/i.test(zoneModale.textContent), zoneModale.textContent.slice(0, 80));
  const fermer = w.document.querySelector('[data-fermer], .modale-fermer');
  if (fermer) fermer.click();

  /* --- Écran Employés (dossier complet) --- */
  w.App.allerA('employes');
  await attendreCondition(() => w.document.getElementById('e-liste')
    && w.document.getElementById('e-liste').innerHTML.length > 100, { message: 'liste des employés vide' });
  verif('Colonne CNI dans la liste du personnel',
    /CNI/i.test(w.document.getElementById('e-liste').textContent));
  verif('Accès au dossier depuis la liste', w.document.querySelectorAll('[data-dossier]').length > 0);

  const formulaire = w.document.getElementById('e-nouveau');
  verif('Bouton « nouvel employé »', !!formulaire);
  formulaire.click();
  await attendreCondition(() => w.document.querySelector('.modale input[name="numero_cni"]'),
    { message: 'formulaire sans champ CNI' });
  verif('Le formulaire couvre l’état civil (date de naissance)',
    !!w.document.querySelector('.modale input[name="date_naissance"]'));
  verif('Le formulaire couvre les pièces administratives (CNPS)',
    !!w.document.querySelector('.modale input[name="numero_cnps"]'));
  verif('Le formulaire couvre la formation', !!w.document.querySelector('.modale input[name="formation"]'));
  verif('Le formulaire couvre le contact d’urgence',
    !!w.document.querySelector('.modale input[name="contact_urgence_tel"]'));

  /* Supprimer une candidature embauchée doit emporter la fiche créée et ses PDF,
     sinon il reste un employé orphelin de sa candidature. */
  const candCascade = await A('/api/rh/candidats', { methode: 'POST', corps: { nom: 'Cascade ' + TS, poste_vise: 'Vendeur' } });
  const idCandCascade = (candCascade.donnees.candidat || candCascade.donnees).id;
  const empCascade = await A('/api/rh/candidats/' + idCandCascade + '/embaucher', {
    methode: 'POST', corps: { magasin_id: employes[0].magasin_id, salaire: 120000 },
  });
  const idEmpCascade = (empCascade.donnees.employe || {}).id;
  /* Le nom stocké n'est renvoyé qu'à la création : le détail ne l'expose pas,
     car c'est un chemin interne. On le note ici pour vérifier le disque. */
  const docCreeCascade = await A('/api/rh/employes/' + idEmpCascade + '/documents', {
    methode: 'POST',
    corps: { categorie: 'contrat', nom: 'Contrat cascade.pdf', type: 'application/pdf', contenu: pdf.toString('base64') },
  });
  const nomStockeCascade = (docCreeCascade.donnees.document || docCreeCascade.donnees).nom_stocke;
  const docsCascade = ((await A('/api/rh/employes/' + idEmpCascade)).donnees.documents || []);
  verif('Préparation : une pièce est attachée à l’employé issu d’une candidature',
    docsCascade.length === 1 && !!nomStockeCascade, String(nomStockeCascade));
  const supprCascade = await A('/api/rh/candidats/' + idCandCascade, { methode: 'DELETE' });
  const employeRestant = await A('/api/rh/employes/' + idEmpCascade);
  verif('Supprimer la candidature embauchée supprime aussi la fiche créée',
    supprCascade.statut === 200 && employeRestant.statut === 404, 'HTTP ' + employeRestant.statut);
  /* L'effacement du fichier est asynchrone côté serveur : on laisse le temps
     à fs.unlink de se terminer avant de regarder le disque. */
  const dossierDocuments2 = path.join(__dirname, '..', 'data', 'documents');
  const cheminCascade = path.join(dossierDocuments2, nomStockeCascade);
  let encoreLa = true;
  for (let i = 0; i < 25 && encoreLa; i += 1) { encoreLa = fs.existsSync(cheminCascade); if (encoreLa) await attendre(80); }
  verif('… et efface le PDF du disque', !encoreLa, nomStockeCascade);

  /* ---------------- Nettoyage ---------------- */
  await A('/api/rh/candidats/' + idRefuse, { methode: 'DELETE' });
  await A('/api/rh/candidats/' + idCandidat, { methode: 'DELETE' });
  if (idEmbauche) await A('/api/rh/employes/' + idEmbauche, { methode: 'DELETE' });
  if (idEmp) await A('/api/rh/employes/' + idEmp, { methode: 'DELETE' });
  const apresSuppr = await A('/api/rh/employes/' + idEmp);
  verif('Suppression d’une fiche employé', apresSuppr.statut === 404, 'HTTP ' + apresSuppr.statut);
  /* Le fichier doit disparaître avec la fiche. */
  const dossierDocuments = path.join(__dirname, '..', 'data', 'documents');
  const reste = fs.existsSync(dossierDocuments)
    ? fs.readdirSync(dossierDocuments).filter((f) => f.startsWith('emp-' + idEmp + '-')).length : -1;
  verif('Le PDF est effacé avec la fiche', reste === 0, reste + ' fichier(s) restant(s)');

  w.close();
}

principal().then(() => {
  const ok = resultats.filter(([, v]) => v).length;
  console.log('\n────────── TESTS RH (employés, salaires, recrutements) ──────────');
  resultats.forEach(([libelle, v, detail]) => console.log(`  ${v ? '✓' : '✗'} ${libelle}${v ? '' : '   → ' + (detail || '')}`));
  if (erreurs.length) { console.log('\nErreurs console :'); erreurs.forEach((e) => console.log('  ! ' + e)); }
  console.log(`\n  ${ok}/${resultats.length} vérifications réussies`);
  process.exit(ok === resultats.length && erreurs.length === 0 ? 0 : 1);
}).catch((e) => {
  console.error('\nERREUR FATALE :', e.message);
  const ok = resultats.filter(([, v]) => v).length;
  resultats.forEach(([libelle, v, detail]) => console.log(`  ${v ? '✓' : '✗'} ${libelle}${v ? '' : '   → ' + (detail || '')}`));
  process.exit(1);
});
