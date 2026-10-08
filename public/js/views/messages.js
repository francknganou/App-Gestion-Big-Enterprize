/* ==========================================================================
   Vue : Messages — messagerie interne « chacun avec l'autre, par email ».
   Le propriétaire écrit aux administrateurs de toutes les entreprises ;
   l'administrateur écrit aux profils de son entreprise ; un compte écrit à
   son administrateur. Chaque envoi est aussi consigné/expédié par email.
   ========================================================================== */
App.enregistrerVue('messages', {
  titre: 'Messages', icone: '✉️', permissions: ['dashboard.consulter'], groupe: 'Général',

  async rendre(zone) {
    let donnees = null;
    let onglet = 'recus';

    async function charger() {
      donnees = await Api.get('/messages');
      peindre();
    }

    function peindre() {
      const liste = onglet === 'recus' ? donnees.recus : donnees.envoyes;
      zone.innerHTML = entetePage({
        titre: '✉️ Messages',
        sous: 'Communiquez avec les autres comptes de la plateforme — chaque message part aussi par email.',
        actions: '<button class="btn primaire" id="msg-ecrire">✍️ Écrire</button>',
      }) + `
        <div class="onglets">
          <button data-ong="recus" class="${onglet === 'recus' ? 'actif' : ''}">📥 Reçus${donnees.non_lus ? ` <span class="pastille">${donnees.non_lus}</span>` : ''}</button>
          <button data-ong="envoyes" class="${onglet === 'envoyes' ? 'actif' : ''}">📤 Envoyés</button>
        </div>
        <div class="carte" style="margin-bottom:14px">
          <div class="carte-entete"><h3>Qui peut écrire à qui ?</h3></div>
          <div class="carte-corps" style="line-height:1.8">
            🛰️ <strong>Propriétaire de la plateforme</strong> → les administrateurs de toutes les entreprises clientes.<br>
            🔐 <strong>Administrateur d'entreprise</strong> → tous les profils de son entreprise (caisse, stock, responsables…).<br>
            👤 <strong>Compte de boutique</strong> → l'administrateur de son entreprise.<br>
            <span class="sous">Chaque message est conservé ici et part aussi par email (consigné dans le journal « E-mails »,
            expédié réellement si un serveur SMTP est configuré).</span>
          </div>
        </div>
        <div class="carte">
          ${tableau([
            { titre: onglet === 'recus' ? 'Expéditeur' : 'Destinataire',
              rendre: (m) => onglet === 'recus'
                ? `<strong>${Fmt.echapper(m.de_nom || m.de_email)}</strong><div class="sous">${Fmt.echapper(m.de_email || '')}</div>`
                : `<strong>${Fmt.echapper(m.a_nom || m.a_email)}</strong><div class="sous">${Fmt.echapper(m.a_email || '')}</div>` },
            { titre: 'Objet', rendre: (m) => `${m.lu ? '' : '<span class="badge attente">nouveau</span> '}${Fmt.echapper(m.objet)}` },
            { titre: 'Message', rendre: (m) => `<span class="sous">${Fmt.echapper(String(m.corps).slice(0, 90))}${String(m.corps).length > 90 ? '…' : ''}</span>` },
            { titre: 'Date', num: true, rendre: (m) => Fmt.dateH(m.created_at) },
            { titre: '', rendre: () => '<button class="btn petit">Ouvrir</button>' },
          ], liste, { vide: onglet === 'recus' ? 'Aucun message reçu.' : 'Aucun message envoyé.' })}
        </div>`;

      zone.querySelectorAll('[data-ong]').forEach((b) => b.onclick = () => { onglet = b.dataset.ong; peindre(); });
      zone.querySelector('#msg-ecrire').onclick = composer;
      zone.querySelectorAll('tbody tr').forEach((tr) => {
        const m = liste.find((x) => x.id === Number(tr.dataset.id));
        const b = tr.querySelector('button');
        if (b && m) b.onclick = () => ouvrir(m);
      });
    }

    function ouvrir(m) {
      if (!m) return;
      const estRecu = onglet === 'recus';
      ouvrirModale({
        titre: m.objet,
        contenu: `
          <div class="sous" style="margin-bottom:10px">
            ${estRecu ? `De <strong>${Fmt.echapper(m.de_nom || m.de_email)}</strong>` : `À <strong>${Fmt.echapper(m.a_nom || m.a_email)}</strong>`}
            · ${Fmt.dateH(m.created_at)}
          </div>
          <div style="white-space:pre-wrap;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:12px">${Fmt.echapper(m.corps)}</div>`,
        pied: `<button class="btn" data-fermer>Fermer</button>
               ${estRecu ? `<button class="btn primaire" data-repondre>↩️ Répondre</button>` : ''}`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-fermer]').onclick = () => { fermer(); if (estRecu && !m.lu) charger(); App.chargerContexte().then(() => App.rendreCoquille()); };
          const bRep = mod.querySelector('[data-repondre]');
          if (bRep) bRep.onclick = () => {
            fermer();
            if (!m.lu) { Api.post('/messages/' + m.id + '/lire').then(() => { charger(); App.chargerContexte().then(() => App.rendreCoquille()); }); }
            composer(m.de_user_id, 'Re: ' + m.objet);
          };
          if (estRecu && !m.lu) Api.post('/messages/' + m.id + '/lire').catch(() => {});
        },
      });
    }

    function composer(destId, objetDefaut) {
      if (!(donnees.destinataires || []).length) {
        return notifier('Aucun destinataire disponible pour votre compte', 'attente');
      }
      ouvrirModale({
        titre: '✍️ Nouveau message',
        contenu: `
          <div class="champ"><label>Destinataire</label>
            <select name="a_user_id">${options(donnees.destinataires, 'id', (d) => `${d.nom} — ${d.email}${d.role === 'admin' ? ' (admin)' : ''}`, destId || '')}</select></div>
          <div class="champ"><label>Objet</label><input name="objet" value="${Fmt.echapper(objetDefaut || '')}"></div>
          <div class="champ"><label>Message</label><textarea name="corps" rows="6" style="width:100%"></textarea></div>
          <p class="sous">Le message est enregistré ici et envoyé par email au destinataire.</p>`,
        pied: `<button class="btn" data-annuler>Annuler</button><button class="btn primaire" data-envoyer>Envoyer</button>`,
        surOuverture(mod, fermer) {
          mod.querySelector('[data-annuler]').onclick = fermer;
          mod.querySelector('[data-envoyer]').onclick = async () => {
            const d = lireFormulaire(mod);
            if (!d.objet || !d.corps) return notifier('Objet et message obligatoires', 'erreur');
            try {
              await Api.post('/messages', d);
              notifier('Message envoyé');
              fermer();
              await charger();
              App.chargerContexte().then(() => App.rendreCoquille());
            } catch (e) { notifier(e.message, 'erreur'); }
          };
        },
      });
    }

    try {
      await charger();
    } catch (e) {
      zone.innerHTML = entetePage({ titre: '✉️ Messages' }) + `<div class="bandeau ko">${Fmt.echapper(e.message)}</div>`;
    }
  },
});
