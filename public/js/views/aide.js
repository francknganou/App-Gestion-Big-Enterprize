/* ==========================================================================
   Vue : Aide & contact — assistance WhatsApp au 654 32 42 82
   ========================================================================== */
App.enregistrerVue('aide', {
  titre: 'Aide & contact', icone: '💬',
  permissions: ['dashboard.consulter'], groupe: 'Général',

  async rendre(zone) {
    const support = (App.etat.utilisateur && App.etat.utilisateur.support) || {};
    const u = App.etat.utilisateur;
    const e = u.entreprise || {};
    const num = support.numero || '654324282';
    const affiche = support.affiche || numeroJoliAide(num);
    const message = `${support.message || 'Bonjour, j’ai besoin d’aide.'}
— Entreprise : ${e.nom || ''} (${e.niu || 'NIU non renseigné'})
— Compte : ${u.email}`;
    const lienWhatsapp = (support.lien || 'https://wa.me/237' + num) + '?text=' + encodeURIComponent(message);
    const ab = App.etat.abonnement || {};

    zone.innerHTML = `
      <div class="carte" style="border-color:#25D366;background:linear-gradient(135deg,#f0fdf4,#ffffff)">
        <div class="carte-entete">
          <h3>💬 Besoin d'aide ? Écrivez-nous sur WhatsApp</h3>
          <div class="droite"><span class="badge ok">Assistance directe</span></div>
        </div>
        <div class="carte-corps">
          <div class="grille g-2">
            <div>
              <p style="margin:0 0 10px">
                Une question sur la caisse, les stocks, les comptes ou l'abonnement ?
                Notre équipe vous répond sur WhatsApp au <b class="mono" style="font-size:16px">${Fmt.echapper(affiche)}</b>.
              </p>
              <div class="barre-outils">
                <a class="btn primaire" href="${Fmt.echapper(lienWhatsapp)}" target="_blank" rel="noopener">💬 Ouvrir WhatsApp</a>
                <a class="btn" href="tel:+237${Fmt.echapper(num)}">📞 Appeler le ${Fmt.echapper(affiche)}</a>
              </div>
              <div class="aide" style="margin-top:10px">Votre message part avec le nom de votre entreprise et votre email :
                nous retrouvons votre compte tout de suite.</div>
            </div>
            <div class="bloc-paiement">
              <div class="panier-total"><span>Entreprise</span><b>${Fmt.echapper(e.nom || '—')}</b></div>
              <div class="panier-total"><span>NIU</span><b class="mono">${Fmt.echapper(e.niu || '—')}</b></div>
              <div class="panier-total"><span>Boutiques</span><b>${Fmt.nombre(App.etat.magasins.length)}</b></div>
              <div class="panier-total"><span>Abonnement</span><b>${Fmt.echapper(ab.statut_libelle || '—')}${ab.jours_restants ? ' — ' + Fmt.nombre(ab.jours_restants) + ' j' : ''}</b></div>
            </div>
          </div>
        </div>
      </div>

      <div class="grille g-2">
        <div class="carte">
          <div class="carte-entete"><h3>❓ Questions fréquentes</h3></div>
          <div class="carte-corps">
            ${[
              ['Comment ajouter une boutique ?', 'Module <b>Magasins</b> → <b>＋ Nouvelle boutique</b>. Vous pouvez en créer autant que nécessaire, chacune avec sa caisse et son stock.'],
              ['Comment affecter un(e) caissier(ère) ?', 'Module <b>Comptes &amp; rôles</b> → <b>＋ Nouveau compte</b> : choisissez la boutique, le rôle « Caissier / Vendeur », puis cochez finement ses habilitations.'],
              ['Comment enregistrer une entrée de stock sans prix ?', 'Module <b>Stocks</b> → onglet <b>Réception rapide</b> : vous ne saisissez que les quantités.'],
              ['Comment payer l\'abonnement ?', `Orange Money <b>${Fmt.echapper((App.etat.abonnement && App.etat.abonnement.paiement && numeroJoliAide(App.etat.abonnement.paiement.services.orange_money.numero)) || '693 00 73 97')}</b> ou MTN MoMo <b>654 32 42 82</b> — voir le module <b>Abonnement</b>.`],
              ['Mes données sont-elles isolées ?', 'Oui : votre entreprise ne voit que ses boutiques, ses produits, ses clients et ses ventes. Personne d\'autre n\'y a accès.'],
            ].map(([q, r]) => `
              <details style="border-bottom:1px solid var(--line);padding:9px 0">
                <summary style="cursor:pointer;font-weight:600">${q}</summary>
                <div class="petit texte-muted" style="margin-top:6px">${r}</div>
              </details>`).join('')}
          </div>
        </div>

        <div class="carte">
          <div class="carte-entete"><h3>ℹ️ Fiche de votre entreprise</h3>
            <div class="droite petit texte-muted">Ces informations apparaissent sur vos tickets</div></div>
          <div class="carte-corps">
            <div class="grille-form">
              <div class="champ"><label>Nom de l'entreprise</label><input name="nom" value="${Fmt.echapper(e.nom || '')}"></div>
              <div class="champ"><label>NIU</label><input name="niu" value="${Fmt.echapper(e.niu || '')}"></div>
              <div class="champ"><label>Email professionnel</label><input name="email" value="${Fmt.echapper(e.email || '')}"></div>
              <div class="champ"><label>Téléphone</label><input name="telephone" value="${Fmt.echapper(e.telephone || '')}"></div>
              <div class="champ"><label>Date de création</label><input type="date" name="date_creation" value="${Fmt.echapper(e.date_creation || '')}"></div>
              <div class="champ"><label>Ville</label><input name="ville" value="${Fmt.echapper(e.ville || '')}"></div>
              <div class="champ plein"><label>Logo</label>
                <div class="zone-logo">
                  <div class="logo-apercu">${e.logo ? `<img src="${Fmt.echapper(e.logo)}" style="width:100%;height:100%;object-fit:contain">` : '🏬'}</div>
                  <input type="file" id="aide-logo" accept="image/*" style="font-size:12.5px">
                </div></div>
            </div>
            ${App.peut('parametres.gerer')
              ? '<button class="btn primaire" id="aide-enregistrer">💾 Enregistrer les informations</button>'
              : '<div class="aide">Seul un administrateur peut modifier ces informations.</div>'}
          </div>
        </div>
      </div>`;

    const bouton = document.getElementById('aide-enregistrer');
    if (!bouton) return;
    let logo = null;
    document.getElementById('aide-logo').onchange = async (ev) => {
      try {
        logo = await Inscription.lireLogo(ev.target.files[0]);
        bouton.dataset.logo = '1';
        notifier('Nouveau logo prêt à être enregistré');
      } catch (err) { notifier(err.message, 'erreur'); }
    };
    bouton.onclick = async () => {
      const d = lireFormulaire(zone);
      if (logo) d.logo = logo;
      try {
        const r = await Api.put('/entreprises/moi', d);
        App.etat.utilisateur.entreprise = r.entreprise;
        notifier('Informations de l’entreprise mises à jour');
        App.rendreCoquille();
        App.monter('aide');
      } catch (e) { notifier(e.message, 'erreur'); }
    };
  },
});

/** 654324282 → 654 32 42 82 */
function numeroJoliAide(n) {
  const c = String(n || '').replace(/\D/g, '');
  if (c.length === 9) return `${c.slice(0, 3)} ${c.slice(3, 5)} ${c.slice(5, 7)} ${c.slice(7, 9)}`;
  return String(n || '—');
}
