/* ==========================================================================
   Vue : Abonnement — essai gratuit, formules, paiement Orange Money / MTN MoMo
   Le paiement est volontairement simple : on affiche le numéro, un lien vers le
   menu USSD, le montant exact, une référence, puis « J'ai payé ».
   ========================================================================== */

const LIBELLE_PLAN = { mensuel: 'Mensuel', annuel: 'Annuel', essai: 'Essai gratuit' };
const LIBELLE_SERVICE = { orange_money: 'Orange Money', mtn_momo: 'MTN Mobile Money', mastercard: 'Carte bancaire MasterCard' };
const COULEUR_SERVICE = { orange_money: '#ff7900', mtn_momo: '#ffcc00', mastercard: '#eb001b' };
const LIBELLE_PAIEMENT = {
  en_attente: '<span class="badge attente">En attente de validation</span>',
  valide: '<span class="badge ok">Validé</span>',
  rejete: '<span class="badge ko">Rejeté</span>',
};

/** 693007397 -> 693 00 73 97 */
function numeroJoli(n) {
  const c = String(n || '').replace(/\D/g, '');
  if (c.length === 9) return `${c.slice(0, 3)} ${c.slice(3, 5)} ${c.slice(5, 7)} ${c.slice(7, 9)}`;
  return String(n || '—');
}

App.enregistrerVue('abonnement', {
  titre: 'Abonnement', icone: '💳',
  permissions: ['abonnement.consulter', 'abonnement.gerer'],
  groupe: 'Administration',

  async rendre(zone) {
    let d = await Api.get('/abonnement');
    if (!document.body.contains(zone)) return;

    const dessiner = () => {
      const t = d.tarifs;
      /* Les formules (durée + montant) sont définies par le propriétaire de la
         plateforme ; on retombe sur mensuel/annuel si la liste n'est pas fournie. */
      const formules = (t.formules && t.formules.length) ? t.formules : [
        { code: 'mensuel', libelle: 'Mensuel', duree_jours: 30, montant: Number(t.mensuel), montant_par_mois: Number(t.mensuel) },
        { code: 'annuel', libelle: 'Annuel', duree_jours: 365, montant: Number(t.annuel),
          montant_par_mois: Number(t.mensuel_equivalent_annuel) },
      ];
      const expire = d.statut === 'expire';
      /* Seuls les moyens de paiement activés par le propriétaire sont proposés. */
      const servicesActifs = ['orange_money', 'mtn_momo', 'mastercard']
        .filter((code) => {
          const s = (d.paiement.services || {})[code];
          return s && s.actif !== false;
        });
      const classeStatut = expire ? 'rouge' : (d.en_essai ? 'ambre' : 'vert');
      const classeBadge = expire ? 'ko' : (d.en_essai ? 'attente' : 'ok');
      const attente = d.paiement_en_attente;
      const serviceAttente = attente ? (d.paiement.services[attente.service] || {}) : null;
      /* Retour de la page de paiement du prestataire : on n'active rien ici,
         c'est la notification vérifiée (webhook) qui prolonge l'abonnement. */
      const retourRef = ((location.hash || '').match(/retour=([^&]+)/) || [])[1] || '';

      zone.innerHTML = `
        ${retourRef ? `<div class="bandeau abonnement attente">
            <b>⏳ Paiement ${Fmt.echapper(decodeURIComponent(retourRef))} transmis</b> —
            nous attendons la confirmation du prestataire de paiement. Votre abonnement
            s'activera automatiquement dès sa réception (quelques secondes).
            Cette page se met à jour toute seule.
          </div>` : ''}
        ${expire ? `<div class="bandeau abonnement ko">
            <b>⛔ Abonnement expiré :</b> les ventes et les mouvements de stock sont suspendus.
            Réglez votre abonnement ci-dessous pour tout réactiver immédiatement.
          </div>` : ''}
        ${!expire && d.alerte_bientot ? `<div class="bandeau abonnement attente">
            <b>⏳ Il reste ${Fmt.nombre(d.jours_restants)} jour(s)</b> avant l'échéance du ${Fmt.date(d.date_fin)}.
            Pensez à régler votre abonnement dès maintenant.
          </div>` : ''}

        <div class="carte">
          <div class="carte-entete">
            <h3>${d.en_essai ? '🎁 Essai gratuit en cours' : (expire ? '⛔ Abonnement expiré' : '✅ Abonnement actif')}</h3>
            <div class="droite"><span class="badge ${classeBadge}">${Fmt.echapper(d.statut_libelle)}</span></div>
          </div>
          <div class="carte-corps">
            <div class="grille g-4">
              <div class="kpi ${classeStatut}"><div class="libelle">Statut</div>
                <div class="valeur" style="font-size:19px">${Fmt.echapper(d.statut_libelle)}</div>
                <div class="pied">${d.en_essai ? 'Aucun paiement requis pendant l’essai' : (expire ? 'Opérations suspendues' : 'Merci de votre confiance')}</div></div>
              <div class="kpi ${d.jours_restants <= 3 ? 'rouge' : 'ambre'}"><div class="libelle">Jours restants</div>
                <div class="valeur">${Fmt.nombre(d.jours_restants)}</div>
                <div class="pied">Échéance : ${Fmt.date(d.date_fin)}</div></div>
              <div class="kpi bleu"><div class="libelle">Formule en cours</div>
                <div class="valeur" style="font-size:19px">${Fmt.echapper(LIBELLE_PLAN[d.plan] || d.plan)}</div>
                <div class="pied">${d.en_essai ? `${Fmt.nombre(t.essai_jours)} jours offerts` : 'Payé ' + Fmt.fcfa(d.montant)}</div></div>
              <div class="kpi"><div class="libelle">Total réglé</div>
                <div class="valeur" style="font-size:19px">${Fmt.fcfa(d.totaux.encaisse)}</div>
                <div class="pied">${Fmt.nombre(d.totaux.nb_paiements)} paiement(s) validé(s)</div></div>
            </div>
            ${d.en_essai ? `<div class="aide" style="margin-top:10px">
              Votre période d'essai de <b>${Fmt.nombre(t.essai_jours)} jours gratuits</b> a débuté le ${Fmt.date(d.date_debut)}.
              À la fin de l'essai : <b>${Fmt.fcfa(t.mensuel)} par mois</b> ou <b>${Fmt.fcfa(t.annuel)} par an</b>.</div>` : ''}
          </div>
        </div>

        ${attente ? `<div class="carte" style="border-color:#fde68a;background:#fffbeb">
          <div class="carte-entete"><h3>⏳ Paiement en attente de validation</h3>
            <div class="droite">${LIBELLE_PAIEMENT.en_attente}</div></div>
          <div class="carte-corps">
            <div class="grille g-4">
              <div><div class="petit texte-muted">Référence</div><b class="mono">${Fmt.echapper(attente.reference)}</b></div>
              <div><div class="petit texte-muted">Montant</div><b>${Fmt.fcfa(attente.montant)}</b></div>
              <div><div class="petit texte-muted">Service</div><b>${Fmt.echapper(LIBELLE_SERVICE[attente.service] || attente.service)}</b></div>
              <div><div class="petit texte-muted">Demandé le</div><b>${Fmt.dateH(attente.created_at)}</b></div>
            </div>
            <div class="aide" style="margin-top:10px">${Fmt.echapper(attente.message || 'Validation en cours par l’administrateur.')}</div>
            ${d.peut_gerer ? `<div class="barre-outils" style="margin-top:10px">
              <button class="btn primaire petit" data-valider="${attente.id}">✅ Valider le paiement</button>
              <button class="btn danger petit" data-rejeter="${attente.id}">✖ Rejeter</button>
            </div>` : ''}
          </div>
        </div>` : ''}

        <div class="carte">
          <div class="carte-entete"><h3>📱 Régler par Mobile Money</h3>
            <div class="droite petit texte-muted">3 étapes : formule → service → validation du montant</div></div>
          <div class="carte-corps">
            <div class="grille g-2">
              <div>
                <b class="petit">1. Choisissez votre formule</b>
                <div class="choix-formules" style="margin-top:8px">
                  ${formules.map((f, i) => `<label class="choix-carte" data-plan="${Fmt.echapper(f.code)}">
                    <input type="radio" name="plan" value="${Fmt.echapper(f.code)}" ${i === 0 ? 'checked' : ''}>
                    <div><b>${Fmt.echapper(f.libelle)}</b>
                      <div class="petit texte-muted">${Fmt.nombre(f.duree_jours)} jours d'utilisation</div></div>
                    <div class="prix">${Fmt.fcfa(f.montant)}
                      ${f.montant_par_mois && f.duree_jours !== 30
                        ? `<div class="petit texte-muted" style="font-weight:400">soit ${Fmt.fcfa(f.montant_par_mois)}/mois</div>` : ''}</div>
                  </label>`).join('')}
                </div>
                ${t.economie_annuelle ? `<div class="aide" style="margin-top:8px">💡 La formule annuelle vous fait économiser <b>${Fmt.fcfa(t.economie_annuelle)}</b> sur l'année.</div>` : ''}
              </div>
              <div>
                <b class="petit">2. Choisissez le service de paiement</b>
                <div class="choix-services logos" style="margin-top:8px">
                  ${servicesActifs.length ? servicesActifs.map((code) => {
                    const s = d.paiement.services[code] || {};
                    return code === 'mastercard'
                      ? `<button type="button" class="logo-paiement" data-service="mastercard"
                           title="Payer par carte bancaire"
                           style="border-left:5px solid ${COULEUR_SERVICE.mastercard}">
                           <span class="carte-visuelle">💳</span>
                           <div class="petit texte-muted">Carte bancaire</div>
                         </button>`
                      : `<button type="button" class="logo-paiement" data-service="${code}"
                           title="Payer par ${Fmt.echapper(LIBELLE_SERVICE[code])}"
                           style="border-left:5px solid ${COULEUR_SERVICE[code] || '#94a3b8'}">
                           <img src="img/${code === 'orange_money' ? 'orange-money' : 'mtn-momo'}.png"
                                alt="${Fmt.echapper(LIBELLE_SERVICE[code])}">
                           <div class="petit texte-muted">${Fmt.echapper(LIBELLE_SERVICE[code])}</div>
                         </button>`;
                  }).join('') : `<div class="vide"><span>💤</span>Aucun moyen de paiement n'est
                    disponible pour le moment. Merci de réessayer plus tard ou de contacter l'assistance.</div>`}
                </div>
                ${servicesActifs.length ? `<div class="aide" style="margin-top:8px">Touchez un logo : le paiement
                  se lance directement (le code de transfert est intégré, vous n'avez rien à composer
                  manuellement).</div>` : ''}
              </div>
            </div>
            <div class="panier-total" style="margin-top:14px;border-top:1px dashed var(--line);padding-top:12px">
              <span>Montant du paiement<div id="recap-detail" class="petit texte-muted" style="font-weight:400"></div></span>
              <b id="recap-montant" style="font-size:16px">${Fmt.fcfa(formules[0] ? formules[0].montant : 0)}</b>
            </div>
            <div class="grille g-2" style="margin-top:12px;align-items:end">
              <label class="champ"><span>Code de réduction (facultatif)</span>
                <input id="code-reduction" placeholder="Ex. BIENVENUE20" autocomplete="off"
                  style="text-transform:uppercase"></label>
              <button class="btn" id="verif-reduction" type="button">Vérifier le code</button>
            </div>
            <div id="reduction-retour" class="petit" style="margin-top:6px"></div>
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>🧾 Historique des paiements</h3>
            <div class="droite petit texte-muted">${Fmt.nombre(d.historique.length)} ligne(s)</div></div>
          <div class="carte-corps serre">
            ${tableau([
              { titre: 'Référence', rendre: (l) => `<b class="mono">${Fmt.echapper(l.reference)}</b>` },
              { titre: 'Date', rendre: (l) => Fmt.dateH(l.created_at) },
              { titre: 'Service', rendre: (l) => `${Fmt.echapper(LIBELLE_SERVICE[l.service] || l.service)}<div class="petit texte-muted mono">${Fmt.echapper(l.telephone_payeur || '—')}</div>` },
              { titre: 'Formule', rendre: (l) => `${Fmt.echapper(LIBELLE_PLAN[l.plan] || l.plan)}<div class="petit texte-muted">${Fmt.nombre(l.duree_jours)} j</div>` },
              { titre: 'Montant', num: true, rendre: (l) => Fmt.fcfa(l.montant) },
              { titre: 'Statut', rendre: (l) => (LIBELLE_PAIEMENT[l.statut] || Fmt.echapper(l.statut))
                  + (l.valide_par_nom ? `<div class="petit texte-muted">par ${Fmt.echapper(l.valide_par_nom)}</div>` : '') },
              { titre: 'Demandé par', rendre: (l) => Fmt.echapper(l.utilisateur || '—') },
              { titre: '', rendre: (l) => d.peut_gerer ? `<div class="actions">
                  ${l.statut === 'en_attente' ? `<button class="btn petit primaire" data-valider="${l.id}">Valider</button>
                  <button class="btn petit danger" data-rejeter="${l.id}">Rejeter</button>` : ''}
                  <button class="btn petit" data-suppr="${l.id}" title="Supprimer cette ligne (saisie erronée)">🗑</button></div>` : '' },
            ], d.historique, { vide: 'Aucun paiement enregistré pour le moment' })}
          </div>
        </div>

        ${App.peut('plateforme.gerer') ? `
        <div class="carte">
          <div class="carte-entete"><h3>⚙️ Réglages de la plateforme</h3>
            <div class="droite petit texte-muted">Réservé au propriétaire de l'application</div></div>
          <div class="carte-corps">
            <form id="form-ab">
              <div class="grille-form">
                <div class="champ"><label>Tarif mensuel (FCFA)</label><input type="number" step="500" name="tarif_mensuel" value="${Fmt.echapper(t.mensuel)}"></div>
                <div class="champ"><label>Tarif annuel (FCFA)</label><input type="number" step="1000" name="tarif_annuel" value="${Fmt.echapper(t.annuel)}"></div>
                <div class="champ"><label>Jours d'essai gratuit</label><input type="number" name="essai_jours" value="${Fmt.echapper(t.essai_jours)}"></div>
                <div class="champ"><label>Nom du marchand</label><input name="paiement_marchand" value="${Fmt.echapper(d.paiement.marchand)}"></div>
                <div class="champ"><label>Numéro Orange Money</label><input name="om_numero" value="${Fmt.echapper(d.paiement.services.orange_money.numero)}"></div>
                <div class="champ"><label>Code USSD Orange Money</label><input name="om_ussd" value="${Fmt.echapper(d.paiement.services.orange_money.ussd)}"></div>
                <div class="champ"><label>Numéro MTN Mobile Money</label><input name="mtn_numero" value="${Fmt.echapper(d.paiement.services.mtn_momo.numero)}"></div>
                <div class="champ"><label>Code USSD MTN MoMo</label><input name="mtn_ussd" value="${Fmt.echapper(d.paiement.services.mtn_momo.ussd)}"></div>
              </div>
              <div class="barre-outils">
                <button class="btn primaire" type="submit">💾 Enregistrer les réglages</button>
                <button class="btn" type="button" id="ab-essai">🎁 Offrir ${Fmt.nombre(t.essai_jours)} jours à une entreprise (console propriétaire)</button>
                <button class="btn danger" type="button" id="ab-expirer" title="Utile pour tester le blocage">⏳ Simuler l'expiration</button>
              </div>
              <div class="aide" style="margin-top:8px">La validation d'un paiement prolonge l'abonnement en <b>cumulant</b> les jours restants (aucun jour payé n'est perdu).</div>
            </form>
          </div>
        </div>` : `
        <div class="carte">
          <div class="carte-entete"><h3>⚙️ Tarifs et moyens de paiement</h3>
            <div class="droite"><span class="badge neutre">Fixés par l'éditeur</span></div></div>
          <div class="carte-corps">
            <div class="grille g-3">
              <div><div class="petit texte-muted">Formule mensuelle</div><b>${Fmt.fcfa(t.mensuel)}</b></div>
              <div><div class="petit texte-muted">Formule annuelle</div><b>${Fmt.fcfa(t.annuel)}</b></div>
              <div><div class="petit texte-muted">Essai gratuit</div><b>${Fmt.nombre(t.essai_jours)} jours</b></div>
            </div>
            <div class="aide" style="margin-top:10px">
              Les tarifs et les codes de paiement sont fixés par l'éditeur de l'application.
              Besoin d'une facture ou d'un geste commercial ?
              <a href="${App.lienAide('Bonjour, j’ai une question sur mon abonnement Inventa GestyPro.')}" target="_blank" rel="noopener">💬 Contacter l'assistance WhatsApp</a>.
            </div>
          </div>
        </div>`}
      `;

      /* ------- interactions ------- */
      /* Le montant vient de la formule choisie (durée et prix définis par le
         propriétaire de la plateforme), moins l'éventuelle réduction appliquée. */
      let remiseAppliquee = 0;
      let codeValide = null;
      const formuleChoisie = () => {
        const el = zone.querySelector('input[name=plan]:checked');
        return formules.find((f) => f.code === (el ? el.value : null)) || formules[0] || { montant: 0, duree_jours: 0, code: '', libelle: '' };
      };
      const montant = () => Math.max(0, Number(formuleChoisie().montant) - remiseAppliquee);
      const majRecap = () => {
        const f = formuleChoisie();
        zone.querySelector('#recap-montant').textContent = Fmt.fcfa(montant());
        const det = zone.querySelector('#recap-detail');
        if (det) {
          det.innerHTML = remiseAppliquee
            ? `<s>${Fmt.fcfaCourt(f.montant)}</s> − ${Fmt.fcfaCourt(remiseAppliquee)}
               <span class="badge ok">${Fmt.echapper(codeValide || '')}</span>`
            : `${Fmt.nombre(f.duree_jours)} jours d'accès`;
        }
      };

      /** Vérifie le code de réduction saisi et recalcule le montant. */
      async function verifierReduction(silencieux) {
        const champ = zone.querySelector('#code-reduction');
        const retour = zone.querySelector('#reduction-retour');
        const code = (champ.value || '').trim().toUpperCase();
        if (!code) {
          remiseAppliquee = 0; codeValide = null;
          if (retour) retour.innerHTML = '';
          majRecap();
          return;
        }
        try {
          const r = await Api.post('/abonnement/reduction/verifier', { code, plan: formuleChoisie().code });
          remiseAppliquee = Number(r.remise) || 0;
          codeValide = r.code;
          if (retour) {
            const intitule = r.libelle ? `${r.code} — ${r.libelle}` : r.code;
            retour.innerHTML = remiseAppliquee >= 0
              ? `<span style="color:var(--good)">✅ ${Fmt.echapper(intitule)} :
                   − ${Fmt.fcfa(remiseAppliquee)} — vous payez <b>${Fmt.fcfa(r.montant)}</b></span>`
              : `<span style="color:var(--bad)">⚠️ ${Fmt.echapper(intitule)} :
                   + ${Fmt.fcfa(Math.abs(remiseAppliquee))} — montant <b>${Fmt.fcfa(r.montant)}</b></span>`;
          }
          if (!silencieux) notifier(`Code ${r.code} appliqué`);
        } catch (e) {
          remiseAppliquee = 0; codeValide = null;
          if (retour) retour.innerHTML = `<span style="color:var(--bad)">❌ ${Fmt.echapper(e.message)}</span>`;
          if (!silencieux) notifier(e.message, 'erreur');
        }
        majRecap();
      }

      zone.querySelectorAll('input[name=plan]').forEach((r) => r.onchange = () => {
        zone.querySelectorAll('.choix-carte[data-plan]').forEach((c) => c.classList.toggle('actif', c.querySelector('input').checked));
        majRecap();
        /* Le code peut être réservé à une formule : on le revérifie. */
        if ((zone.querySelector('#code-reduction').value || '').trim()) verifierReduction(true);
      });
      zone.querySelectorAll('.choix-carte[data-plan]').forEach((c) => c.classList.toggle('actif', c.querySelector('input').checked));
      zone.querySelector('#verif-reduction').onclick = () => verifierReduction(false);
      zone.querySelector('#code-reduction').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); verifierReduction(false); }
      });
      majRecap();

      /* Seuls l'administrateur (et le propriétaire) peuvent régler l'abonnement. */
      const peutPayer = App.peut('abonnement.gerer');
      zone.querySelectorAll('.logo-paiement').forEach((b) => {
        if (!peutPayer) { b.disabled = true; b.title = 'Réservé à l’administrateur'; }
        b.onclick = () => {
          const service = b.dataset.service;
          const f = formuleChoisie();
          const base = {
            plan: f.code, montant: montant(), montant_brut: Number(f.montant),
            duree_jours: f.duree_jours, formule_libelle: f.libelle,
            code_reduction: codeValide, d, recharger,
          };
          if (service === 'mastercard') payerParCarte(base);
          else assisterPaiement(Object.assign({ service }, base));
        };
      });

      zone.querySelectorAll('[data-valider]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Confirmer la réception de ce paiement et prolonger l\'abonnement ?', { valider: 'Valider le paiement' }))) return;
        try {
          const r = await Api.post('/abonnement/paiements/' + b.dataset.valider + '/valider');
          notifier(`Paiement validé — abonnement actif jusqu'au ${Fmt.date(r.etat.date_fin)}`);
          recharger();
        } catch (e) { notifier(e.message, 'erreur'); }
      });
      zone.querySelectorAll('[data-rejeter]').forEach((b) => b.onclick = async () => {
        const motif = prompt('Motif du rejet (facultatif) :') || '';
        try {
          await Api.post('/abonnement/paiements/' + b.dataset.rejeter + '/rejeter', { motif });
          notifier('Paiement rejeté', 'attente'); recharger();
        } catch (e) { notifier(e.message, 'erreur'); }
      });

      zone.querySelectorAll('[data-suppr]').forEach((b) => b.onclick = async () => {
        if (!(await confirmer('Supprimer cette ligne de l\'historique ? (à réserver aux saisies erronées)', { danger: true, valider: 'Supprimer' }))) return;
        try { await Api.del('/abonnement/paiements/' + b.dataset.suppr); notifier('Ligne supprimée', 'attente'); recharger(); }
        catch (e) { notifier(e.message, 'erreur'); }
      });

      const form = zone.querySelector('#form-ab');
      if (form) {
        form.onsubmit = async (ev) => {
          ev.preventDefault();
          try {
            await Api.put('/abonnement/parametres', lireFormulaire(form));
            notifier('Réglages enregistrés'); recharger();
          } catch (e) { notifier(e.message, 'erreur'); }
        };
        zone.querySelector('#ab-essai').onclick = async () => {
          try { const r = await Api.post('/abonnement/essai', { jours: t.essai_jours });
            notifier(`Essai de ${Fmt.nombre(t.essai_jours)} jours relancé`); d = r.etat; rafraichirContexte(); dessiner(); }
          catch (e) { notifier(e.message, 'erreur'); }
        };
        zone.querySelector('#ab-expirer').onclick = async () => {
          if (!(await confirmer('Simuler l\'expiration ? Les opérations seront suspendues jusqu\'à validation d\'un paiement (l\'administrateur garde l\'accès).', { danger: true, valider: 'Simuler' }))) return;
          try { const r = await Api.post('/abonnement/essai', { jours: -1 });
            d = r.etat; notifier('Abonnement expiré (simulation)', 'attente'); rafraichirContexte(); dessiner(); }
          catch (e) { notifier(e.message, 'erreur'); }
        };
      }
    };

    async function recharger() {
      d = await Api.get('/abonnement');
      rafraichirContexte();
      dessiner();
    }
    function rafraichirContexte() {
      App.etat.abonnement = App.etat.abonnement || {};
      App.etat.abonnement = Object.assign({}, App.etat.abonnement, {
        statut: d.statut, statut_libelle: d.statut_libelle, jours_restants: d.jours_restants,
        expire: d.expire, en_essai: d.en_essai, alerte_bientot: d.alerte_bientot, date_fin: d.date_fin,
      });
      App.majBadgeAbonnement();
    }

    dessiner();
  },
});

/* ==========================================================================
   Assistant de paiement : choix validé → numéro + lien USSD + montant
   ========================================================================== */
/* Formulaire de paiement par carte bancaire (MasterCard / Visa), calqué sur la
   page « Payer en ligne » : civilité, nom, numéro en 4 blocs, expiration, contrôle.
   Le débit est traité côté serveur (passerelle si configurée, sinon validation
   propriétaire) puis l'abonnement est prolongé. */
function payerParCarte({ plan, montant, montant_brut, duree_jours, formule_libelle,
                         code_reduction, d, recharger }) {
  const annees = [];
  const an = new Date().getFullYear();
  for (let a = an; a <= an + 8; a += 1) annees.push(a);
  ouvrirModale({
    titre: '💳 Payer en ligne par carte bancaire',
    largeur: 'etroite',
    contenu: `
      <div class="bloc-paiement">
        <div class="panier-total"><span>Formule</span>
          <b>${Fmt.echapper(formule_libelle || LIBELLE_PLAN[plan] || plan)}${duree_jours ? ` — ${Fmt.nombre(duree_jours)} jours` : ''}</b></div>
        ${code_reduction && montant_brut
          ? `<div class="panier-total"><span>Remise ${Fmt.echapper(code_reduction)}</span>
               <b style="color:var(--good)">− ${Fmt.fcfa(Math.max(0, montant_brut - montant))}</b></div>` : ''}
        <div class="panier-total"><span>Montant débité</span><b style="color:var(--bad)">${Fmt.fcfa(montant)}</b></div>
        <div class="aide">Le montant est débité de votre carte par notre prestataire de paiement
          sécurisé puis reversé sur le compte bancaire du propriétaire de la plateforme.
          Un email de confirmation vous sera envoyé.</div>
      </div>
      <div class="grille-form">
        <div class="champ plein"><label>Civilité</label>
          <div class="barre-outils">
            ${['Monsieur', 'Madame', 'Mademoiselle'].map((c, i) =>
              `<label class="petit" style="display:flex;align-items:center;gap:4px">
                <input type="radio" name="cb-civ" value="${c}" ${i === 0 ? 'checked' : ''} style="width:auto">${c}</label>`).join('')}
          </div></div>
        <div class="champ"><label>Nom</label><input name="cb-nom" autocomplete="cc-family-name"></div>
        <div class="champ"><label>Prénom</label><input name="cb-prenom" autocomplete="cc-given-name"></div>
        <div class="champ plein"><label>Numéro de carte</label>
          <div class="cb-numero">
            <input name="cb-n1" inputmode="numeric" maxlength="4" placeholder="0000">
            <input name="cb-n2" inputmode="numeric" maxlength="4" placeholder="0000">
            <input name="cb-n3" inputmode="numeric" maxlength="4" placeholder="0000">
            <input name="cb-n4" inputmode="numeric" maxlength="4" placeholder="0000">
          </div>
          <div class="petit texte-muted" style="margin-top:4px">MasterCard · Visa · CB</div></div>
        <div class="champ"><label>Date d'expiration</label>
          <div class="cb-numero">
            <select name="cb-mois">${['01','02','03','04','05','06','07','08','09','10','11','12']
              .map((m) => `<option>${m}</option>`).join('')}</select>
            <select name="cb-an">${annees.map((a) => `<option>${a}</option>`).join('')}</select>
          </div></div>
        <div class="champ"><label>Numéro de contrôle</label><input name="cb-cvv" inputmode="numeric" maxlength="4" placeholder="123"></div>
      </div>`,
    pied: `<button class="btn" data-annuler>Annuler</button>
           <button class="btn primaire" data-debiter>Valider — ${Fmt.fcfa(montant)}</button>`,
    surOuverture(mod, fermer) {
      mod.querySelector('[data-annuler]').onclick = fermer;
      mod.querySelector('[data-debiter]').onclick = async () => {
        const lire = (n) => (mod.querySelector(`[name=${n}]`) || {}).value || '';
        const numero = [lire('cb-n1'), lire('cb-n2'), lire('cb-n3'), lire('cb-n4')].join('');
        if (!lire('cb-nom') || !lire('cb-prenom')) return notifier('Nom et prénom obligatoires', 'erreur');
        if (!/^\d{16}$/.test(numero)) return notifier('Numéro de carte incomplet (16 chiffres)', 'erreur');
        if (!/^\d{3,4}$/.test(lire('cb-cvv'))) return notifier('Numéro de contrôle invalide', 'erreur');
        try {
          const r = await Api.post('/abonnement/payer-carte', {
            plan, montant, code_reduction: code_reduction || null,
            titulaire: `${lire('cb-civ')} ${lire('cb-prenom')} ${lire('cb-nom')}`.trim(),
            numero_masque: numero.slice(0, 4) + ' •••• •••• ' + numero.slice(-4),
            expiration: `${lire('cb-mois')}/${lire('cb-an')}`,
          });
          /* PSP configuré : le client termine sur la page de paiement sécurisée
             du prestataire, c'est elle qui effectue le débit réel de la carte. */
          if (r.url_paiement) {
            const f = window.open(r.url_paiement, '_blank', 'noopener');
            if (!f) window.location.href = r.url_paiement;
            notifier('Page de paiement ouverte : terminez le règlement pour activer l’abonnement');
            mod.querySelector('.bloc-paiement').insertAdjacentHTML('afterend', `
              <div class="bandeau abonnement ok" style="margin:14px 0">
                <b>🔐 Paiement sécurisé ${Fmt.echapper((r.psp && r.psp.prestataire) || 'PSP')} — référence ${Fmt.echapper(r.reference)}</b>
                <div style="margin-top:6px">Terminez le règlement dans l'onglet ouvert.
                  L'abonnement s'active automatiquement dès la confirmation du prestataire.</div>
                <a class="btn petit primaire" style="margin-top:8px" href="${Fmt.echapper(r.url_paiement)}"
                   target="_blank" rel="noopener">Rouvrir la page de paiement</a>
              </div>`);
            mod.querySelector('[data-debiter]').outerHTML = '<button class="btn" data-fermer>Fermer</button>';
            mod.querySelector('[data-fermer]').onclick = () => { fermer(); recharger(); };
            return;
          }
          notifier(r.message || 'Paiement carte enregistré', 'succes');
          fermer(); recharger();
        } catch (e) { notifier(e.message, 'erreur'); }
      };
    },
  });
}

function assisterPaiement({ plan, service, montant, montant_brut, duree_jours,
                            formule_libelle, code_reduction, d, recharger }) {
  const s = d.paiement.services[service] || {};
  const carte = service === 'mastercard';
  ouvrirModale({
    titre: 'Payer par ' + (s.nom || LIBELLE_SERVICE[service]),
    largeur: 'etroite',
    contenu: `
      <div class="bloc-paiement">
        <div class="panier-total"><span>Formule</span>
          <b>${Fmt.echapper(formule_libelle || LIBELLE_PLAN[plan] || plan)} — ${Fmt.nombre(duree_jours || (plan === 'annuel' ? 365 : 30))} jours</b></div>
        ${code_reduction && montant_brut
          ? `<div class="panier-total"><span>Remise ${Fmt.echapper(code_reduction)}</span>
               <b style="color:var(--good)">− ${Fmt.fcfa(Math.max(0, montant_brut - montant))}</b></div>` : ''}
        <div class="panier-total"><span>Service</span><b>${carte ? '💳 ' : ''}${Fmt.echapper(s.nom || '')}</b></div>
        ${carte ? `
        <div class="panier-total"><span>Banque</span><b>${Fmt.echapper(s.banque || '')}</b></div>
        <div class="panier-total"><span>Numéro de compte</span><b class="mono" style="letter-spacing:.5px">${Fmt.echapper(s.numero)}</b></div>
        <div class="panier-total"><span>Titulaire</span><b>${Fmt.echapper(s.titulaire || d.paiement.marchand)}</b></div>`
        : `<div class="panier-total"><span>Numéro du marchand</span><b class="mono" style="letter-spacing:.5px">${Fmt.echapper(numeroJoli(s.numero))}</b></div>
        <div class="panier-total"><span>Bénéficiaire</span><b>${Fmt.echapper(d.paiement.marchand)}</b></div>`}
        <div class="panier-total" style="font-size:16px"><span>MONTANT À ENVOYER</span><b>${Fmt.fcfa(montant)}</b></div>
      </div>
      ${carte ? `<div class="etapes-paiement">
        <div><span>1</span> Réglez <b>${Fmt.fcfa(montant)}</b> avec votre carte bancaire (MasterCard).</div>
        <div><span>2</span> Le versement doit arriver sur le compte <b class="mono">${Fmt.echapper(s.banque || '')} — ${Fmt.echapper(s.numero)}</b>.</div>
        <div><span>3</span> Revenez ici et appuyez sur « J'ai payé » : votre abonnement est activé après validation.</div>
      </div>
      <div class="champ" style="margin-top:12px"><label>Nom du titulaire de la carte (pour le suivi)</label>
        <input name="telephone_payeur" placeholder="Ex. Jean Dupont"></div>
      <div class="aide">Aucune donnée de carte n'est saisie dans l'application : le paiement est validé manuellement par notre équipe.</div>`
      : `<div class="etapes-paiement">
        <div><span>1</span> Touchez le bouton ci-dessous (ou composez <b class="mono">${Fmt.echapper(s.ussd || '')}</b>) puis choisissez « Transfert d'argent ».</div>
        <div><span>2</span> Envoyez le numéro du marchand <b class="mono">${Fmt.echapper(s.numero || '')}</b> puis exactement <b>${Fmt.fcfa(montant)}</b>.</div>
        <div><span>3</span> Validez avec votre code secret, puis revenez ici et appuyez sur « J'ai payé ».</div>
      </div>
      <div class="champ" style="margin-top:12px"><label>Votre numéro ${Fmt.echapper(s.nom || '')} (pour le suivi)</label>
        <input name="telephone_payeur" placeholder="Ex. 699 11 22 33"></div>
      <div class="aide">Aucun prélèvement automatique : vous validez vous-même le transfert depuis votre téléphone.</div>`}
      <div id="zone-confirmation"></div>`,
    pied: carte ? `<button class="btn primaire" data-paye>✅ J'ai payé</button>`
      : `<a class="btn ambre" href="${Fmt.echapper(s.lien || '#')}">📲 Ouvrir ${Fmt.echapper(s.ussd || '')}</a>
         <button class="btn primaire" data-paye>✅ J'ai payé</button>`,
    surOuverture(mod, fermer) {
      mod.querySelector('[data-paye]').onclick = async () => {
        const tel = (mod.querySelector('[name=telephone_payeur]').value || '').trim();
        try {
          const r = await Api.post('/abonnement/demande', {
            service, plan, telephone_payeur: tel || null, code_reduction: code_reduction || null,
          });
          mod.querySelector('.bloc-paiement').insertAdjacentHTML('afterend', `
            <div class="bandeau abonnement ok" style="margin:14px 0">
              <b>✅ Demande enregistrée — référence ${Fmt.echapper(r.reference)}</b>
              <div style="margin-top:6px">${Fmt.echapper(r.message_validation)}</div>
            </div>`);
          mod.querySelector('[data-paye]').outerHTML = '<button class="btn" data-fermer>Fermer</button>';
          mod.querySelector('[data-fermer]').onclick = () => { fermer(); recharger(); };
          notifier('Demande envoyée — vous serez prévenu après validation');
        } catch (e) { notifier(e.message, 'erreur'); }
      };
    },
  });
}
