/**
 * seed-paiements-demo.js — Remet en place les trois demandes de paiement de la
 * démonstration (page « Ventes » du propriétaire).
 *
 * Ces trois lignes sont volontairement EN ATTENTE : l'entreprise de démonstration
 * doit rester en période d'essai, seule la validation par le propriétaire peut
 * activer un abonnement.
 *
 *   AB-2026-0001  Orange Money  mensuel     11 500 FCFA
 *   AB-2026-0002  MTN MoMo      trimestre   32 000 FCFA
 *   AB-2026-0003  MasterCard    annuel     132 000 FCFA − 20 % (BIENVENUE20) = 105 600
 *                 ------------------------------------------------------------
 *                 Total en attente                        149 100 FCFA
 *
 *   node seed-paiements-demo.js      (serveur arrêté de préférence)
 */
const { db } = require('./server/db');

const ENTREPRISE = 1;

const COLONNES = `(reference, service, numero_paiement, telephone_payeur, nom_payeur, plan,
  montant, duree_jours, statut, message, user_id, created_at, entreprise_id,
  psp, psp_mode, psp_reference, psp_ticket, psp_statut, montant_brut, reduction_id, code_reduction)`;

const ins = db.prepare(`INSERT INTO paiements_abonnement ${COLONNES}
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);   // 21 colonnes -> 21 « ? »

const LIGNES = [
  {
    reference: 'AB-2026-0001', service: 'orange_money', numero_paiement: 'OM-991122',
    telephone_payeur: '677112233', nom_payeur: 'Marie Ngo Bell', plan: 'mensuel',
    montant: 11500, duree_jours: 30, montant_brut: 11500,
    message: 'Transfert d’argent Orange Money (#150#) vers le 693 00 73 97, puis « J’ai payé ».',
    created_at: '2026-10-04 09:12:00',
  },
  {
    reference: 'AB-2026-0002', service: 'mtn_momo', numero_paiement: 'MOMO-447710',
    telephone_payeur: '655998877', nom_payeur: 'Paul Tchoumi', plan: 'trimestre',
    montant: 32000, duree_jours: 90, montant_brut: 32000,
    message: 'Transfert MTN MoMo (*126*3#) vers le 654 32 42 82, puis « J’ai payé ».',
    created_at: '2026-10-05 15:40:00',
  },
  {
    reference: 'AB-2026-0003', service: 'mastercard', numero_paiement: 'pd_test_demo_0003',
    telephone_payeur: null, nom_payeur: 'Sarl Douala Distribution', plan: 'annuel',
    montant: 105600, duree_jours: 365, montant_brut: 132000,
    message: 'Paiement par carte sur la page hébergée du prestataire (code BIENVENUE20 appliqué).',
    created_at: '2026-10-06 08:05:00',
    psp: 'paydunya', psp_mode: 'test', psp_reference: 'pd_test_demo_0003',
    psp_ticket: 'test_demo_ticket_0003', psp_statut: 'pending',
    code_reduction: 'BIENVENUE20',
  },
];

const deja = db.prepare('SELECT reference FROM paiements_abonnement WHERE entreprise_id=?').all(ENTREPRISE)
  .map((r) => r.reference);
const reduction = db.prepare('SELECT id FROM reductions WHERE code=?').get('BIENVENUE20');

const tx = db.transaction(() => {
  let creees = 0;
  LIGNES.forEach((l) => {
    if (deja.includes(l.reference)) return;
    ins.run(
      l.reference, l.service, l.numero_paiement, l.telephone_payeur, l.nom_payeur, l.plan,
      l.montant, l.duree_jours, 'en_attente', l.message, 1, l.created_at, ENTREPRISE,
      l.psp || null, l.psp_mode || null, l.psp_reference || null, l.psp_ticket || null,
      l.psp_statut || null, l.montant_brut,
      l.code_reduction && reduction ? reduction.id : null, l.code_reduction || null);
    creees += 1;
  });
  return creees;
});

const creees = tx();
const etat = db.prepare(`SELECT IFNULL(SUM(montant),0) AS total, COUNT(*) AS n
  FROM paiements_abonnement WHERE entreprise_id=? AND statut='en_attente'`).get(ENTREPRISE);
console.log(`${creees} paiement(s) de démonstration ajouté(s).`);
console.log(`En attente : ${etat.n} paiement(s) pour ${etat.total.toLocaleString('fr-FR')} FCFA.`);
