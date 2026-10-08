/**
 * mails.js — Envoi des e-mails de l'application.
 *
 * Deux messages sont envoyés automatiquement :
 *   1. à l'inscription d'une entreprise  → vérification de l'email de l'administrateur ;
 *   2. à la création d'un compte (quel que soit le rôle) → identifiants de connexion.
 *
 * Fonctionnement :
 *   - si un serveur SMTP est configuré (Paramètres du propriétaire ou variables
 *     d'environnement), les messages partent réellement ;
 *   - sinon ils sont consignés dans la table `mails_envoyes` et restent lisibles
 *     dans la console du propriétaire (onglet « E-mails ») : rien n'est perdu.
 *
 * Configuration (au choix) :
 *   Variables d'environnement : SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
 *                               SMTP_PASS, MAIL_FROM
 *   Ou Paramètres de la plateforme : smtp_host, smtp_port, smtp_secure,
 *                               smtp_user, smtp_pass, mail_from
 * Les modèles de message existent en français, anglais et chinois.
 */
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { db } = require('./db');
const { param } = require('./utils');

/* ------------------------------------------------------------------ Schéma */
function installer() {
  db.exec(`CREATE TABLE IF NOT EXISTS mails_envoyes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id INTEGER,
    destinataire TEXT NOT NULL,
    destinataire_nom TEXT,
    sujet TEXT NOT NULL,
    corps_html TEXT,
    corps_texte TEXT,
    langue TEXT DEFAULT 'fr',
    type TEXT,                       -- verification | identifiants | paiement | autre
    statut TEXT NOT NULL DEFAULT 'en_attente',   -- en_attente | envoye | erreur | simule
    erreur TEXT,
    smtp_utilise INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    envoye_at TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mails_statut ON mails_envoyes(statut, id)');

  db.exec(`CREATE TABLE IF NOT EXISTS codes_verification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    jeton TEXT NOT NULL,
    expire_at TEXT NOT NULL,
    utilise_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_codes_user ON codes_verification(user_id)');
}

/* ------------------------------------------------------- Configuration SMTP */
function configSmtp() {
  const hote = process.env.SMTP_HOST || param('smtp_host', '', 0) || '';
  const port = Number(process.env.SMTP_PORT || param('smtp_port', '587', 0) || 587);
  const secure = String(process.env.SMTP_SECURE || param('smtp_secure', 'false', 0)).toLowerCase() === 'true' || port === 465;
  const user = process.env.SMTP_USER || param('smtp_user', '', 0) || '';
  const pass = process.env.SMTP_PASS || param('smtp_pass', '', 0) || '';
  const from = process.env.MAIL_FROM || param('mail_from', '', 0) || 'Inventa GestyPro <no-reply@shoppingplus.cm>';
  return { hote, port, secure, user, pass, from, configure: !!(hote && user && pass) };
}

let transporteur = null;
let transporteurCle = '';

function obtenirTransporteur() {
  const c = configSmtp();
  if (!c.configure) return null;
  const cle = [c.hote, c.port, c.secure, c.user, c.from].join('|');
  if (!transporteur || transporteurCle !== cle) {
    transporteur = nodemailer.createTransport({
      host: c.hote,
      port: c.port,
      secure: c.secure,
      auth: { user: c.user, pass: c.pass },
    });
    transporteurCle = cle;
  }
  return transporteur;
}

/** Vérifie la connexion SMTP (bouton « Tester » des paramètres). */
async function testerSmtp() {
  const t = obtenirTransporteur();
  if (!t) return { ok: false, erreur: 'Aucun serveur SMTP configuré' };
  try {
    await t.verify();
    return { ok: true, message: 'Connexion au serveur SMTP établie' };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

/* ------------------------------------------------------------------ Modèles */
const MODELES = {
  verification: {
    fr: (d) => ({
      sujet: `Vérifiez votre adresse email — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>Bonjour <b>${d.prenom} ${d.nom}</b>,</p>
            <p>Votre entreprise <b>${d.entreprise}</b> vient d'être créée sur Inventa GestyPro.
               Pour activer définitivement votre espace, confirmez votre adresse email.</p>
            <div style="text-align:center;margin:22px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">✅ Vérifier mon email</a>
            </div>
            <p style="background:#f8fafc;border:1px dashed #cbd5e1;padding:12px;border-radius:8px">
              Code de vérification : <b style="font-size:20px;letter-spacing:3px">${d.code}</b><br>
              <span style="color:#64748b;font-size:13px">Valable ${d.validite} minutes. Vous pouvez aussi le saisir
              directement dans l'application.</span>
            </p>
            <p style="color:#64748b;font-size:13px">Si vous n'êtes pas à l'origine de cette inscription,
               ignorez simplement ce message.</p>
          </div>
        </div>`,
      texte: `Bonjour ${d.prenom} ${d.nom},\n\nConfirmez votre adresse email pour activer l'espace de ${d.entreprise}.\nLien : ${d.lien}\nCode : ${d.code} (valable ${d.validite} minutes).`,
    }),
    en: (d) => ({
      sujet: `Verify your email address — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>Hello <b>${d.prenom} ${d.nom}</b>,</p>
            <p>Your company <b>${d.entreprise}</b> has just been created on Inventa GestyPro.
               Please confirm your email address to fully activate your workspace.</p>
            <div style="text-align:center;margin:22px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">✅ Verify my email</a>
            </div>
            <p style="background:#f8fafc;border:1px dashed #cbd5e1;padding:12px;border-radius:8px">
              Verification code: <b style="font-size:20px;letter-spacing:3px">${d.code}</b><br>
              <span style="color:#64748b;font-size:13px">Valid for ${d.validite} minutes. You can also enter it
              directly in the application.</span>
            </p>
            <p style="color:#64748b;font-size:13px">If you did not create this account, simply ignore this message.</p>
          </div>
        </div>`,
      texte: `Hello ${d.prenom} ${d.nom},\n\nConfirm your email address to activate the workspace of ${d.entreprise}.\nLink: ${d.lien}\nCode: ${d.code} (valid ${d.validite} minutes).`,
    }),
    zh: (d) => ({
      sujet: `请验证您的电子邮箱 — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>您好，<b>${d.prenom} ${d.nom}</b>：</p>
            <p>您的企业 <b>${d.entreprise}</b> 已在 Inventa GestyPro 创建成功。
               请验证您的电子邮箱以正式启用您的工作空间。</p>
            <div style="text-align:center;margin:22px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">✅ 验证我的邮箱</a>
            </div>
            <p style="background:#f8fafc;border:1px dashed #cbd5e1;padding:12px;border-radius:8px">
              验证码：<b style="font-size:20px;letter-spacing:3px">${d.code}</b><br>
              <span style="color:#64748b;font-size:13px">有效期 ${d.validite} 分钟，您也可以在应用中直接输入。</span>
            </p>
            <p style="color:#64748b;font-size:13px">如果这不是您本人的操作，请忽略此邮件。</p>
          </div>
        </div>`,
      texte: `您好，${d.prenom} ${d.nom}：\n\n请验证邮箱以启用 ${d.entreprise} 的工作空间。\n链接：${d.lien}\n验证码：${d.code}（有效期 ${d.validite} 分钟）。`,
    }),
  },

  identifiants: {
    fr: (d) => ({
      sujet: `Vos identifiants de connexion — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>Bonjour <b>${d.nom}</b>,</p>
            <p>Un compte vient d'être créé pour vous dans l'entreprise <b>${d.entreprise}</b>
               par ${d.createur}.</p>
            <table style="width:100%;border-collapse:collapse;margin:18px 0">
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc;width:42%"><b>Rôle</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.role}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Boutique</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.magasin}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Identifiant (email)</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b>${d.email}</b></td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Mot de passe</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b style="font-size:16px">${d.mot_de_passe}</b></td></tr>
            </table>
            <div style="text-align:center;margin:18px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">🔐 Se connecter</a>
            </div>
            <p style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:8px;color:#9a3412">
              🔒 Pour votre sécurité, changez ce mot de passe dès votre première connexion
              (bouton <b>Mon profil</b> en haut à droite).
            </p>
          </div>
        </div>`,
      texte: `Bonjour ${d.nom},\n\nUn compte a été créé pour vous chez ${d.entreprise}.\nRôle : ${d.role}\nBoutique : ${d.magasin}\nIdentifiant : ${d.email}\nMot de passe : ${d.mot_de_passe}\nConnexion : ${d.lien}\n\nChangez ce mot de passe dès votre première connexion.`,
    }),
    en: (d) => ({
      sujet: `Your login credentials — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>Hello <b>${d.nom}</b>,</p>
            <p>An account has just been created for you in <b>${d.entreprise}</b> by ${d.createur}.</p>
            <table style="width:100%;border-collapse:collapse;margin:18px 0">
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc;width:42%"><b>Role</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.role}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Store</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.magasin}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Login (email)</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b>${d.email}</b></td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>Password</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b style="font-size:16px">${d.mot_de_passe}</b></td></tr>
            </table>
            <div style="text-align:center;margin:18px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">🔐 Sign in</a>
            </div>
            <p style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:8px;color:#9a3412">
              🔒 For your security, change this password as soon as you sign in
              (button <b>My profile</b>, top right).
            </p>
          </div>
        </div>`,
      texte: `Hello ${d.nom},\n\nAn account has been created for you at ${d.entreprise}.\nRole: ${d.role}\nStore: ${d.magasin}\nLogin: ${d.email}\nPassword: ${d.mot_de_passe}\nSign in: ${d.lien}\n\nPlease change this password on first sign-in.`,
    }),
    zh: (d) => ({
      sujet: `您的登录凭据 — ${d.entreprise}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>您好，<b>${d.nom}</b>：</p>
            <p>${d.createur} 刚在 <b>${d.entreprise}</b> 为您创建了一个账户。</p>
            <table style="width:100%;border-collapse:collapse;margin:18px 0">
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc;width:42%"><b>角色</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.role}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>门店</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0">${d.magasin}</td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>登录账号（邮箱）</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b>${d.email}</b></td></tr>
              <tr><td style="padding:9px;border:1px solid #e2e8f0;background:#f8fafc"><b>密码</b></td>
                  <td style="padding:9px;border:1px solid #e2e8f0"><b style="font-size:16px">${d.mot_de_passe}</b></td></tr>
            </table>
            <div style="text-align:center;margin:18px 0">
              <a href="${d.lien}" style="background:#0b7a75;color:#fff;padding:13px 26px;border-radius:10px;
                 text-decoration:none;font-weight:bold;display:inline-block">🔐 登录</a>
            </div>
            <p style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:8px;color:#9a3412">
              🔒 为了安全，请在首次登录后立即修改此密码（右上角「我的资料」）。
            </p>
          </div>
        </div>`,
      texte: `您好，${d.nom}：\n\n${d.createur} 已在 ${d.entreprise} 为您创建账户。\n角色：${d.role}\n门店：${d.magasin}\n账号：${d.email}\n密码：${d.mot_de_passe}\n登录：${d.lien}\n\n请在首次登录后立即修改密码。`,
    }),
  },

  /* Test de connexion au serveur d'envoi, déclenché depuis la console. */
  test: {
    fr: (d) => ({
      sujet: 'Test du serveur d’envoi — Inventa GestyPro',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <div style="background:#0b7a75;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
            <b style="font-size:18px">🛍️ Inventa GestyPro</b>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 12px 12px">
            <p>Bonjour,</p>
            <p>Ce message confirme que votre serveur d'envoi est correctement configuré :
               les e-mails de vérification et d'identifiants partiront désormais.</p>
            <p style="background:#f8fafc;border:1px dashed #cbd5e1;padding:12px;border-radius:8px">
              Expéditeur : <b>${d.expediteur}</b><br>Serveur : <b>${d.serveur}</b>
            </p>
          </div>
        </div>`,
      texte: `Bonjour,\n\nCe message confirme que votre serveur d'envoi est correctement configuré.\n\nExpéditeur : ${d.expediteur}\nServeur : ${d.serveur}\n\nInventa GestyPro.`,
    }),
    en: (d) => ({
      sujet: 'Mail server test — Inventa GestyPro',
      html: `<p>Hello,</p><p>This message confirms that your mail server is correctly configured.</p>
             <p>From: <b>${d.expediteur}</b><br>Server: <b>${d.serveur}</b></p>`,
      texte: `Hello,\n\nThis message confirms that your mail server is correctly configured.\n\nFrom: ${d.expediteur}\nServer: ${d.serveur}`,
    }),
    zh: (d) => ({
      sujet: '邮件服务器测试 — Inventa GestyPro',
      html: `<p>您好，</p><p>此邮件确认您的邮件服务器已正确配置。</p>
             <p>发件人：<b>${d.expediteur}</b><br>服务器：<b>${d.serveur}</b></p>`,
      texte: `您好，\n\n此邮件确认您的邮件服务器已正确配置。\n\n发件人：${d.expediteur}\n服务器：${d.serveur}`,
    }),
  },
};

/* ------------------------------------------------------------- Envoi réel */
function modele(type, langue, donnees) {
  const parLangue = MODELES[type];
  if (!parLangue) return null;
  const fn = parLangue[langue] || parLangue.fr;
  return fn(donnees);
}

/**
 * Enregistre puis tente d'envoyer un e-mail.
 * @returns {Promise<{id:number, statut:string, smtp:boolean, erreur?:string}>}
 */
async function envoyer({ destinataire, destinataire_nom, type, langue = 'fr', donnees, entreprise_id = null }) {
  const m = modele(type, langue, donnees || {});
  if (!m || !destinataire) return { id: null, statut: 'ignore', smtp: false };

  const info = db.prepare(`
    INSERT INTO mails_envoyes (entreprise_id, destinataire, destinataire_nom, sujet, corps_html, corps_texte, langue, type)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(entreprise_id, destinataire, destinataire_nom || null, m.sujet, m.html, m.texte, langue, type);
  const id = Number(info.lastInsertRowid);

  const t = obtenirTransporteur();
  if (!t) {
    // Pas de SMTP configuré : le message reste consultable dans la console.
    db.prepare(`UPDATE mails_envoyes SET statut='simule', smtp_utilise=0, envoye_at=datetime('now','localtime') WHERE id=?`).run(id);
    return { id, statut: 'simule', smtp: false };
  }
  try {
    await t.sendMail({
      from: configSmtp().from,
      to: destinataire,
      subject: m.sujet,
      text: m.texte,
      html: m.html,
    });
    db.prepare(`UPDATE mails_envoyes SET statut='envoye', smtp_utilise=1, envoye_at=datetime('now','localtime') WHERE id=?`).run(id);
    return { id, statut: 'envoye', smtp: true };
  } catch (e) {
    db.prepare(`UPDATE mails_envoyes SET statut='erreur', erreur=?, envoye_at=datetime('now','localtime') WHERE id=?`)
      .run(String(e.message || e).slice(0, 400), id);
    return { id, statut: 'erreur', smtp: true, erreur: e.message };
  }
}

/** Réessaie l'envoi d'un message consigné. */
async function renvoyer(id) {
  const m = db.prepare('SELECT * FROM mails_envoyes WHERE id=?').get(Number(id));
  if (!m) throw Object.assign(new Error('Message introuvable'), { statut: 404 });
  const t = obtenirTransporteur();
  if (!t) return { ok: false, erreur: 'Aucun serveur SMTP configuré — renseignez SMTP_HOST, SMTP_USER et SMTP_PASS' };
  try {
    await t.sendMail({
      from: configSmtp().from, to: m.destinataire, subject: m.sujet, text: m.corps_texte, html: m.corps_html,
    });
    db.prepare(`UPDATE mails_envoyes SET statut='envoye', smtp_utilise=1, erreur=NULL, envoye_at=datetime('now','localtime') WHERE id=?`).run(m.id);
    return { ok: true };
  } catch (e) {
    db.prepare(`UPDATE mails_envoyes SET statut='erreur', erreur=? WHERE id=?`).run(String(e.message).slice(0, 400), m.id);
    return { ok: false, erreur: e.message };
  }
}

/* ------------------------------------------------- Codes de vérification */
const VALIDITE_CODES_MINUTES = 60;

function creerCodeVerification(userId) {
  const code = String(crypto.randomInt(100000, 999999));
  const jeton = crypto.randomBytes(24).toString('hex');
  const expire = new Date(Date.now() + VALIDITE_CODES_MINUTES * 60000);
  db.prepare('UPDATE codes_verification SET utilise_at=datetime(\'now\',\'localtime\') WHERE user_id=? AND utilise_at IS NULL').run(userId);
  db.prepare(`INSERT INTO codes_verification (user_id, code, jeton, expire_at) VALUES (?,?,?,?)`)
    .run(userId, code, jeton, expire.toISOString().slice(0, 19).replace('T', ' '));
  return { code, jeton, validite: VALIDITE_CODES_MINUTES };
}

function verifierCode(userId, codeOuJeton) {
  const valeur = String(codeOuJeton || '').trim();
  if (!valeur) return { ok: false, erreur: 'Code manquant' };
  const row = db.prepare(`SELECT * FROM codes_verification
    WHERE user_id=? AND utilise_at IS NULL AND (code=? OR jeton=?) ORDER BY id DESC LIMIT 1`)
    .get(userId, valeur, valeur);
  if (!row) return { ok: false, erreur: 'Code invalide ou déjà utilisé' };
  if (new Date(row.expire_at.replace(' ', 'T')) < new Date()) {
    return { ok: false, erreur: 'Code expiré — demandez un nouveau code' };
  }
  db.prepare(`UPDATE codes_verification SET utilise_at=datetime('now','localtime') WHERE id=?`).run(row.id);
  db.prepare(`UPDATE users SET email_verifie=1, email_verifie_at=datetime('now','localtime') WHERE id=?`).run(userId);
  return { ok: true };
}

/** Adresse publique de l'application (liens présents dans les e-mails). */
function urlApplication() {
  return process.env.APP_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
}

/** Envoie la vérification d'email à l'administrateur qui vient de s'inscrire. */
async function envoyerVerification({ user, entreprise, langue = 'fr' }) {
  const { code, jeton, validite } = creerCodeVerification(user.id);
  const lien = `${urlApplication()}/#/verification?jeton=${jeton}`;
  return envoyer({
    destinataire: user.email,
    destinataire_nom: `${user.nom || ''}`.trim(),
    type: 'verification',
    langue,
    entreprise_id: user.entreprise_id || null,
    donnees: {
      prenom: entreprise.prenom_contact || user.nom || '',
      nom: entreprise.nom_contact || '',
      entreprise: entreprise.nom,
      code, lien, validite,
    },
  });
}

/** Envoie les identifiants d'un compte qui vient d'être créé. */
async function envoyerIdentifiants({ user, entreprise, mot_de_passe, role, magasin, createur, langue = 'fr' }) {
  return envoyer({
    destinataire: user.email,
    destinataire_nom: user.nom,
    type: 'identifiants',
    langue,
    entreprise_id: user.entreprise_id || null,
    donnees: {
      nom: user.nom,
      entreprise: entreprise ? entreprise.nom : '',
      role: role || '—',
      magasin: magasin || 'Toutes les boutiques',
      email: user.email,
      mot_de_passe,
      createur: createur || 'votre administrateur',
      lien: urlApplication(),
    },
  });
}

/** Liste des messages (console du propriétaire). */
function liste({ limite = 100, statut = null, entreprise_id = null } = {}) {
  const p = [];
  let sql = `SELECT m.*, e.nom AS entreprise_nom FROM mails_envoyes m
             LEFT JOIN entreprises e ON e.id = m.entreprise_id WHERE 1=1`;
  if (statut) { sql += ' AND m.statut=?'; p.push(statut); }
  if (entreprise_id) { sql += ' AND m.entreprise_id=?'; p.push(Number(entreprise_id)); }
  sql += ' ORDER BY m.id DESC LIMIT ?';
  p.push(Math.min(Number(limite) || 100, 500));
  return db.prepare(sql).all(...p);
}

/** Envoie un message libre (messagerie interne) : consigné et expédié si SMTP configuré. */
async function envoyerMessageLibre({ destinataire, destinataire_nom, sujet, corps, entreprise_id = null }) {
  if (!destinataire) return { id: null, statut: 'ignore', smtp: false };
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#12263f">
    <p style="white-space:pre-wrap">${String(corps || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
    <p style="color:#5b6b82;font-size:12px">Message interne Inventa GestyPro — ne pas transférer.</p></div>`;
  const info = db.prepare(`
    INSERT INTO mails_envoyes (entreprise_id, destinataire, destinataire_nom, sujet, corps_html, corps_texte, langue, type)
    VALUES (?,?,?,?,?,?,?, 'message')`)
    .run(entreprise_id, destinataire, destinataire_nom || null, sujet, html, String(corps || ''), 'fr');
  const id = Number(info.lastInsertRowid);
  const t = obtenirTransporteur();
  if (!t) {
    db.prepare(`UPDATE mails_envoyes SET statut='simule', smtp_utilise=0, envoye_at=datetime('now','localtime') WHERE id=?`).run(id);
    return { id, statut: 'simule', smtp: false };
  }
  try {
    await t.sendMail({ from: configSmtp().from, to: destinataire, subject: sujet, text: String(corps || ''), html });
    db.prepare(`UPDATE mails_envoyes SET statut='envoye', smtp_utilise=1, envoye_at=datetime('now','localtime') WHERE id=?`).run(id);
    return { id, statut: 'envoye', smtp: true };
  } catch (e) {
    db.prepare(`UPDATE mails_envoyes SET statut='erreur', erreur=?, envoye_at=datetime('now','localtime') WHERE id=?`)
      .run(String(e.message || e).slice(0, 400), id);
    return { id, statut: 'erreur', smtp: true, erreur: e.message };
  }
}

module.exports = {
  installer, configSmtp, testerSmtp, envoyer, renvoyer, liste, modele, envoyerMessageLibre,
  creerCodeVerification, verifierCode, envoyerVerification, envoyerIdentifiants,
  urlApplication, VALIDITE_CODES_MINUTES,
};
