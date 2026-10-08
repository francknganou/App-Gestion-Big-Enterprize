/* ==========================================================================
   i18n.js — Multilingue : Français, English, 中文

   Principe : l'application est écrite en français (langue source). Ce module
   traduit à la volée tout ce qui est affiché — menus, titres, boutons,
   tableaux, messages — y compris le contenu rendu dynamiquement et la console
   du propriétaire de la plateforme.

   La langue choisie est mémorisée sur le poste (localStorage) et appliquée
   dès l'écran de connexion, avant même d'être connecté.
   ========================================================================== */

const LANGUES = {
  fr: { code: 'fr', nom: 'Français', drapeau: '🇫🇷', html: 'fr' },
  en: { code: 'en', nom: 'English', drapeau: '🇬🇧', html: 'en' },
  zh: { code: 'zh', nom: '中文', drapeau: '🇨🇳', html: 'zh-CN' },
};

/** Dictionnaires : clé française → traduction. Absent = on garde le français. */
const TRADUCTIONS = {
  en: {
    /* --- Navigation & modules --- */
    'Pilotage': 'Overview',
    'Tableau de bord': 'Dashboard',
    'Ventes': 'Sales',
    'Caisse': 'Cash register',
    'Produits': 'Products',
    'Catalogue & stock': 'Catalogue & stock',
    'Stocks': 'Stock',
    'Transferts': 'Transfers',
    'Achats': 'Purchases',
    'Clients': 'Customers',
    'Fournisseurs': 'Suppliers',
    'Employés': 'Employees',
    'Salaires': 'Payroll',
    'Recrutements': 'Recruitment',
    'Ressources humaines': 'Human resources',
    'Masse salariale': 'Payroll total',
    'Reste à payer': 'Outstanding',
    'Déjà réglé': 'Already paid',
    'Tout marquer payé': 'Mark all as paid',
    'Candidatures': 'Applications',
    'Dossiers & documents': 'Files & documents',
    'Pièces manquantes': 'Missing documents',
    'Téléverser': 'Upload',
    'Embaucher': 'Hire',
    'Entretien planifié': 'Interview scheduled',
    'Candidature reçue': 'Application received',
    'Rapports': 'Reports',
    'Administration': 'Administration',
    'Magasins': 'Stores',
    'Comptes & rôles': 'Accounts & roles',
    'Paramètres': 'Settings',
    'Abonnement': 'Subscription',
    'Aide': 'Help',
    'Aide & contact': 'Help & contact',
    'Plateforme': 'Platform',
    'Console propriétaire': 'Owner console',
    'Entreprises': 'Companies',
    'Paiements': 'Payments',
    'Réglages': 'Preferences',

    /* --- Interface générale --- */
    'Mon profil': 'My profile',
    'Déconnexion': 'Sign out',
    'Se connecter': 'Sign in',
    'Se déconnecter': 'Sign out',
    'Adresse email': 'Email address',
    'Mot de passe': 'Password',
    'Chargement…': 'Loading…',
    'Enregistrer': 'Save',
    'Enregistrer les paramètres': 'Save settings',
    'Annuler': 'Cancel',
    'Fermer': 'Close',
    'Ajouter': 'Add',
    'Modifier': 'Edit',
    'Supprimer': 'Delete',
    'Rechercher': 'Search',
    'Appliquer': 'Apply',
    'Réinitialiser': 'Reset',
    'Exporter': 'Export',
    'Imprimer': 'Print',
    'Actualiser': 'Refresh',
    'Oui': 'Yes',
    'Non': 'No',
    'Tous': 'All',
    'Toutes': 'All',
    'Aucun': 'None',
    'Aucune': 'None',
    'Total': 'Total',
    'Détails': 'Details',
    'Actions': 'Actions',
    'Statut': 'Status',
    'Date': 'Date',
    'Référence': 'Reference',
    'Montant': 'Amount',
    'Quantité': 'Quantity',
    'Article': 'Item',
    'Articles': 'Items',
    'Nom': 'Name',
    'Téléphone': 'Phone',
    'Adresse': 'Address',
    'Ville': 'City',
    'Pays': 'Country',
    'Actif': 'Active',
    'Inactif': 'Inactive',
    'Actifs': 'Active',
    'Actives': 'Active',
    'Ouvert': 'Open',
    'Fermé': 'Closed',
    'Valider': 'Validate',
    'Rejeter': 'Reject',
    'Validé': 'Validated',
    'Rejeté': 'Rejected',
    'En attente': 'Pending',
    'Annulé': 'Cancelled',
    'Annulée': 'Cancelled',
    'Payé': 'Paid',
    'Payée': 'Paid',
    'Gratuit': 'Free',
    'Optionnel': 'Optional',
    'Obligatoire': 'Required',
    'Aujourd’hui': 'Today',
    'Hier': 'Yesterday',
    'Ce mois': 'This month',
    'Ce mois-ci': 'This month',
    '7 derniers jours': 'Last 7 days',
    '30 derniers jours': 'Last 30 days',
    '90 derniers jours': 'Last 90 days',
    'vendredi': 'Friday',

    /* --- Tableau de bord --- */
    "Chiffre d'affaires du jour": "Today's revenue",
    "Chiffre d'affaires du mois": "Monthly revenue",
    "Chiffre d'affaires": 'Revenue',
    'Ventes du jour': "Today's sales",
    'Ventes du mois': 'Monthly sales',
    'Marge du jour (estimée)': 'Margin today (estimated)',
    'Valeur du stock': 'Stock value',
    'Alertes de stock': 'Stock alerts',
    'Panier moyen :': 'Average basket:',
    'Objectif du mois': 'Monthly target',
    'Top produits (30 jours)': 'Top products (30 days)',
    'Performance par magasin (30 jours)': 'Performance by store (30 days)',
    'Alertes et ruptures de stock': 'Stock alerts and shortages',
    'Encaissements par mode de paiement': 'Revenue by payment method',
    'Meilleurs vendeurs (30 jours)': 'Best sellers (30 days)',
    'Meilleurs clients (90 jours)': 'Best customers (90 days)',
    'Fichier clients': 'Customer file',

    /* --- Caisse & ventes --- */
    'Nouvelle vente': 'New sale',
    'Panier': 'Basket',
    'Encaisser': 'Cash in',
    'Remise': 'Discount',
    'Mode de paiement': 'Payment method',
    'Espèces': 'Cash',
    'Mobile Money': 'Mobile Money',
    'Carte bancaire': 'Bank card',
    'Crédit': 'Credit',
    'Montant reçu': 'Amount received',
    'Monnaie à rendre': 'Change due',
    'Ventes encaissées aujourd\'hui': "Sales cashed today",
    'Aucune vente aujourd’hui': 'No sales today',
    'Annuler la vente': 'Cancel sale',
    'Historique des ventes': 'Sales history',
    'Stock insuffisant': 'Insufficient stock',
    'Le panier est vide': 'The basket is empty',

    /* --- Stock --- */
    'Entrée de stock': 'Stock entry',
    'Sortie de stock': 'Stock exit',
    'Réception': 'Receiving',
    'Réception rapide': 'Quick receiving',
    'Ajustement d’inventaire': 'Inventory adjustment',
    'Mouvements de stock': 'Stock movements',
    'Journal des mouvements': 'Movement log',
    'Rupture': 'Out of stock',
    'Alerte': 'Alert',
    'Seuil d’alerte': 'Alert threshold',
    'Aucun prix n’est demandé pour une entrée ou une sortie de stock.':
      'No price is required for a stock entry or exit.',

    /* --- Paramètres --- */
    "Informations de l'entreprise": 'Company information',
    "Nom de l'entreprise": 'Company name',
    'Slogan': 'Slogan',
    'Numéro contribuable (NIU)': 'Taxpayer number (NIU)',
    'TVA par défaut (%)': 'Default VAT (%)',
    'Préfixe des tickets': 'Receipt prefix',
    'Objectif de CA mensuel (FCFA)': 'Monthly revenue target (FCFA)',
    'Message bas de ticket': 'Receipt footer message',
    'Ma sécurité': 'My security',
    'Sauvegarde des données': 'Data backup',
    'Langue de l’application': 'Application language',
    'Thème de l’application': 'Application theme',
    'Langue': 'Language',
    'Thème': 'Theme',
    'Clair': 'Light',
    'Sombre': 'Dark',
    'Thème sombre': 'Dark theme',
    'Thème clair': 'Light theme',
    'Apparence': 'Appearance',
    'Appliqué immédiatement sur tous les écrans, y compris la console du propriétaire.':
      'Applied immediately on every screen, including the owner console.',

    /* --- Abonnement & paiement --- */
    'Abonnement expiré': 'Subscription expired',
    'Essai gratuit': 'Free trial',
    'Abonnement actif': 'Active subscription',
    'Mensuel': 'Monthly',
    'Annuel': 'Yearly',
    'J\'ai payé': 'I have paid',
    'Moyens de paiement': 'Payment methods',
    'par mois': 'per month',
    'par an': 'per year',
    'jours d\'essai gratuit': 'free trial days',
    'Carte bancaire (MasterCard)': 'Bank card (MasterCard)',
    'Cliquer sur le logo de votre opérateur pour lancer le paiement. Les numéros ne sont plus affichés.': 'Click your operator logo to start the payment. The numbers are no longer shown.',
    'Payer par carte bancaire': 'Pay by bank card',
    'Payer par Orange Money': 'Pay with Orange Money',
    'Payer par MTN MoMo': 'Pay with MTN MoMo',
    'Payer par carte': 'Pay by card',
    'MasterCard / Visa': 'MasterCard / Visa',
    'Carte bancaire — paiement sécurisé': 'Bank card — secure payment',
    'Titulaire de la carte': 'Cardholder',
    'Numéro de carte': 'Card number',
    'Expiration': 'Expiry',
    'Débiter et transmettre au propriétaire': 'Charge and forward to the owner',
    'Les cartes bancaires enregistrent la demande ; le propriétaire de la plateforme valide et encaisse.': 'Bank cards record the request; the platform owner validates and collects.',
    'Les codes de paiement sont masqués : cliquez sur un logo pour payer directement.': 'Payment codes are hidden: click a logo to pay directly.',
    'Aide : cliquer sur un logo lance le paiement. Seule la carte ouvre un formulaire.': 'Tip: clicking a logo starts the payment. Only the card opens a form.',
    'Aucune pièce de candidature téléversée': 'No application document uploaded',
    'Téléverser une pièce de candidature': 'Upload an application document',
    'Motif du renvoi': 'Reason for dismissal',
    'Employé renvoyé': 'Dismissed employee',
    'Employé renvoyé et archivé': 'Employee dismissed and archived',
    'Renvoyer': 'Dismiss',
    'Archives': 'Archives',
    'Ventes d’abonnements': 'Subscription sales',
    'Classement des entreprises': 'Company ranking',
    'Abonnements & tarifs': 'Subscriptions & pricing',
    'Déjà encaissé': 'Already collected',
    'En attente de validation': 'Awaiting validation',
    'Rejeté': 'Rejected',
    'Remises accordées': 'Discounts granted',
    'Exporter en CSV': 'Export as CSV',
    'Actualiser': 'Refresh',
    'Filtres': 'Filters',
    'Réinitialiser': 'Reset',
    'Filtrer': 'Filter',
    'Podium': 'Top three',
    'Classement complet': 'Full ranking',
    'Score d’utilisation': 'Usage score',
    'Formules proposées aux clients': 'Plans offered to customers',
    'Codes de réduction': 'Discount codes',
    'Nouvelle formule': 'New plan',
    'Augmenter les tarifs': 'Raise prices',
    'Prestataire de paiement': 'Payment provider',
    'Prestataires de paiement': 'Payment providers',
    'Prestataire actif': 'Active provider',
    'Nom de la boutique affiché au client': 'Store name shown to the customer',
    'URL de callback (IPN)': 'Callback URL (IPN)',
    'URL de retour après paiement': 'Return URL after payment',
    'URL de notification (IPN)': 'Notification URL (IPN)',
    'Identifiant du site': 'Site identifier',
    'Environnement': 'Environment',
    'Canaux acceptés': 'Accepted channels',
    'Enregistrer la configuration': 'Save the configuration',
    'Configuré': 'Configured',
    'Sans clés': 'No keys',
    'Code de réduction (facultatif)': 'Discount code (optional)',
    'Vérifier le code': 'Check the code',
    'Durée (jours)': 'Duration (days)',
    'Montant (FCFA)': 'Amount (FCFA)',
    'Libellé affiché au client': 'Label shown to the customer',
    'Nouveau code de réduction': 'New discount code',
    'Utilisations maximales': 'Maximum uses',
    'Toutes les formules': 'All plans',
    'Activer': 'Enable',
    'Désactiver': 'Disable',
    'Pièces': 'Documents',
    'employé renvoyé': 'dismissed employee',
    'pièce de candidature': 'application document',
    'Compte bancaire à créditer': 'Bank account to credit',
    'Banque': 'Bank',
    'Rib / compte': 'Account number',
    'Titulaire du compte': 'Account holder',

    /* --- Inscription & aide --- */
    'Créer mon entreprise': 'Create my company',
    'Créer mon entreprise et mon compte': 'Create my company and my account',
    'Email professionnel': 'Business email',
    'Date de création': 'Creation date',
    "Logo de l'entreprise (photo)": 'Company logo (photo)',
    "J'ai déjà un compte — Se connecter": 'I already have an account — Sign in',
    'Aide WhatsApp': 'WhatsApp help',
    'Assistance directe': 'Direct support',
    'Nous contacter': 'Contact us',
    'Vérifiez votre email': 'Verify your email',
    'Renvoyer le code': 'Resend the code',
    'Compte créé': 'Account created',
    'Nouveau compte': 'New account',
    'Rôle': 'Role',
    'Identifiants envoyés par email': 'Credentials sent by email',
  },

  zh: {
    /* --- Navigation & modules --- */
    'Pilotage': '概览',
    'Tableau de bord': '仪表板',
    'Ventes': '销售',
    'Caisse': '收银台',
    'Produits': '产品',
    'Catalogue & stock': '目录与库存',
    'Stocks': '库存',
    'Transferts': '调拨',
    'Achats': '采购',
    'Clients': '客户',
    'Fournisseurs': '供应商',
    'Employés': '员工',
    'Salaires': '工资',
    'Recrutements': '招聘',
    'Ressources humaines': '人力资源',
    'Masse salariale': '工资总额',
    'Reste à payer': '待支付',
    'Déjà réglé': '已支付',
    'Tout marquer payé': '全部标记为已付',
    'Candidatures': '应聘申请',
    'Dossiers & documents': '档案与文件',
    'Pièces manquantes': '缺少的文件',
    'Téléverser': '上传',
    'Embaucher': '录用',
    'Entretien planifié': '已安排面试',
    'Candidature reçue': '已收到申请',
    'Rapports': '报表',
    'Administration': '管理',
    'Magasins': '门店',
    'Comptes & rôles': '账户与角色',
    'Paramètres': '设置',
    'Abonnement': '订阅',
    'Aide': '帮助',
    'Aide & contact': '帮助与联系',
    'Plateforme': '平台',
    'Console propriétaire': '所有者控制台',
    'Entreprises': '企业',
    'Paiements': '付款',
    'Réglages': '偏好设置',

    /* --- Interface générale --- */
    'Mon profil': '我的资料',
    'Déconnexion': '退出登录',
    'Se connecter': '登录',
    'Se déconnecter': '退出登录',
    'Adresse email': '电子邮箱',
    'Mot de passe': '密码',
    'Chargement…': '加载中…',
    'Enregistrer': '保存',
    'Enregistrer les paramètres': '保存设置',
    'Annuler': '取消',
    'Fermer': '关闭',
    'Ajouter': '添加',
    'Modifier': '修改',
    'Supprimer': '删除',
    'Rechercher': '搜索',
    'Appliquer': '应用',
    'Réinitialiser': '重置',
    'Exporter': '导出',
    'Imprimer': '打印',
    'Actualiser': '刷新',
    'Oui': '是',
    'Non': '否',
    'Tous': '全部',
    'Toutes': '全部',
    'Aucun': '无',
    'Aucune': '无',
    'Total': '合计',
    'Détails': '详情',
    'Actions': '操作',
    'Statut': '状态',
    'Date': '日期',
    'Référence': '编号',
    'Montant': '金额',
    'Quantité': '数量',
    'Article': '商品',
    'Articles': '商品',
    'Nom': '名称',
    'Téléphone': '电话',
    'Adresse': '地址',
    'Ville': '城市',
    'Pays': '国家',
    'Actif': '启用',
    'Inactif': '停用',
    'Actifs': '启用',
    'Actives': '启用',
    'Ouvert': '营业',
    'Fermé': '关闭',
    'Valider': '确认',
    'Rejeter': '拒绝',
    'Validé': '已确认',
    'Rejeté': '已拒绝',
    'En attente': '待处理',
    'Annulé': '已取消',
    'Annulée': '已取消',
    'Payé': '已支付',
    'Payée': '已支付',
    'Gratuit': '免费',
    'Optionnel': '可选',
    'Obligatoire': '必填',
    'Aujourd’hui': '今天',
    'Hier': '昨天',
    'Ce mois': '本月',
    'Ce mois-ci': '本月',
    '7 derniers jours': '最近 7 天',
    '30 derniers jours': '最近 30 天',
    '90 derniers jours': '最近 90 天',

    /* --- Tableau de bord --- */
    "Chiffre d'affaires du jour": '今日营业额',
    "Chiffre d'affaires du mois": '本月营业额',
    "Chiffre d'affaires": '营业额',
    'Ventes du jour': '今日销售',
    'Ventes du mois': '本月销售',
    'Marge du jour (estimée)': '今日毛利（估算）',
    'Valeur du stock': '库存价值',
    'Alertes de stock': '库存预警',
    'Panier moyen :': '客单价：',
    'Objectif du mois': '本月目标',
    'Top produits (30 jours)': '热销产品（30 天）',
    'Performance par magasin (30 jours)': '门店业绩（30 天）',
    'Alertes et ruptures de stock': '库存预警与缺货',
    'Encaissements par mode de paiement': '按支付方式收款',
    'Meilleurs vendeurs (30 jours)': '最佳销售员（30 天）',
    'Meilleurs clients (90 jours)': '最佳客户（90 天）',
    'Fichier clients': '客户档案',

    /* --- Caisse & ventes --- */
    'Nouvelle vente': '新建销售',
    'Panier': '购物车',
    'Encaisser': '收款',
    'Remise': '折扣',
    'Mode de paiement': '支付方式',
    'Espèces': '现金',
    'Mobile Money': '移动支付',
    'Carte bancaire': '银行卡',
    'Crédit': '赊账',
    'Montant reçu': '已收金额',
    'Monnaie à rendre': '应找零',
    'Ventes encaissées aujourd\'hui': '今日已收款销售',
    'Aucune vente aujourd’hui': '今天暂无销售',
    'Annuler la vente': '取消销售',
    'Historique des ventes': '销售记录',
    'Stock insuffisant': '库存不足',
    'Le panier est vide': '购物车为空',

    /* --- Stock --- */
    'Entrée de stock': '入库',
    'Sortie de stock': '出库',
    'Réception': '收货',
    'Réception rapide': '快速收货',
    'Ajustement d’inventaire': '库存盘点调整',
    'Mouvements de stock': '库存变动',
    'Journal des mouvements': '变动日志',
    'Rupture': '缺货',
    'Alerte': '预警',
    'Seuil d’alerte': '预警阈值',
    'Aucun prix n’est demandé pour une entrée ou une sortie de stock.':
      '出入库均无需填写价格。',

    /* --- Paramètres --- */
    "Informations de l'entreprise": '企业信息',
    "Nom de l'entreprise": '企业名称',
    'Slogan': '标语',
    'Numéro contribuable (NIU)': '纳税人识别号（NIU）',
    'TVA par défaut (%)': '默认增值税（%）',
    'Préfixe des tickets': '小票前缀',
    'Objectif de CA mensuel (FCFA)': '月度营业额目标（FCFA）',
    'Message bas de ticket': '小票底部留言',
    'Ma sécurité': '我的安全',
    'Sauvegarde des données': '数据备份',
    'Langue de l’application': '应用语言',
    'Thème de l’application': '应用主题',
    'Langue': '语言',
    'Thème': '主题',
    'Clair': '浅色',
    'Sombre': '深色',
    'Thème sombre': '深色主题',
    'Thème clair': '浅色主题',
    'Apparence': '外观',
    'Appliqué immédiatement sur tous les écrans, y compris la console du propriétaire.':
      '立即应用于所有界面，包括所有者控制台。',

    /* --- Abonnement & paiement --- */
    'Abonnement expiré': '订阅已到期',
    'Essai gratuit': '免费试用',
    'Abonnement actif': '订阅生效中',
    'Mensuel': '按月',
    'Annuel': '按年',
    'J\'ai payé': '我已付款',
    'Moyens de paiement': '支付方式',
    'par mois': '每月',
    'par an': '每年',
    'jours d\'essai gratuit': '天免费试用',
    'Carte bancaire (MasterCard)': '银行卡（MasterCard）',
    'Cliquer sur le logo de votre opérateur pour lancer le paiement. Les numéros ne sont plus affichés.': '点击运营商标志即可发起付款，号码不再显示。',
    'Payer par carte bancaire': '银行卡支付',
    'Payer par Orange Money': '用 Orange Money 支付',
    'Payer par MTN MoMo': '用 MTN MoMo 支付',
    'Payer par carte': '刷卡支付',
    'MasterCard / Visa': '万事达 / Visa',
    'Carte bancaire — paiement sécurisé': '银行卡 — 安全支付',
    'Titulaire de la carte': '持卡人',
    'Numéro de carte': '卡号',
    'Expiration': '有效期',
    'Débiter et transmettre au propriétaire': '扣款并转交所有者',
    'Les cartes bancaires enregistrent la demande ; le propriétaire de la plateforme valide et encaisse.': '银行卡记录请求；平台所有者验证并收款。',
    'Les codes de paiement sont masqués : cliquez sur un logo pour payer directement.': '支付代码已隐藏：点击标志即可直接支付。',
    'Aide : cliquer sur un logo lance le paiement. Seule la carte ouvre un formulaire.': '提示：点击标志即可支付，只有银行卡会打开表单。',
    'Aucune pièce de candidature téléversée': '未上传任何应聘文件',
    'Téléverser une pièce de candidature': '上传应聘文件',
    'Motif du renvoi': '解雇原因',
    'Employé renvoyé': '被解雇员工',
    'Employé renvoyé et archivé': '员工已解雇并归档',
    'Renvoyer': '解雇',
    'Archives': '档案',
    'Ventes d’abonnements': '订阅销售',
    'Classement des entreprises': '企业排名',
    'Abonnements & tarifs': '订阅与资费',
    'Déjà encaissé': '已收款',
    'En attente de validation': '待审核',
    'Rejeté': '已拒绝',
    'Remises accordées': '已给予的折扣',
    'Exporter en CSV': '导出 CSV',
    'Actualiser': '刷新',
    'Filtres': '筛选',
    'Réinitialiser': '重置',
    'Filtrer': '筛选',
    'Podium': '前三名',
    'Classement complet': '完整排名',
    'Score d’utilisation': '使用评分',
    'Formules proposées aux clients': '向客户提供的套餐',
    'Codes de réduction': '优惠码',
    'Nouvelle formule': '新建套餐',
    'Augmenter les tarifs': '提高资费',
    'Prestataire de paiement': '支付服务商',
    'Prestataires de paiement': '支付服务商',
    'Prestataire actif': '当前启用的服务商',
    'Nom de la boutique affiché au client': '向客户显示的店铺名称',
    'URL de callback (IPN)': '回调地址（IPN）',
    'URL de retour après paiement': '支付后返回地址',
    'URL de notification (IPN)': '通知地址（IPN）',
    'Identifiant du site': '站点标识',
    'Environnement': '环境',
    'Canaux acceptés': '接受的渠道',
    'Enregistrer la configuration': '保存配置',
    'Configuré': '已配置',
    'Sans clés': '未配置密钥',
    'Code de réduction (facultatif)': '优惠码（可选）',
    'Vérifier le code': '校验优惠码',
    'Durée (jours)': '时长（天）',
    'Montant (FCFA)': '金额（中非法郎）',
    'Libellé affiché au client': '显示给客户的名称',
    'Nouveau code de réduction': '新建优惠码',
    'Utilisations maximales': '最大使用次数',
    'Toutes les formules': '所有套餐',
    'Activer': '启用',
    'Désactiver': '停用',
    'Pièces': '文件',
    'employé renvoyé': '被解雇员工',
    'pièce de candidature': '应聘文件',
    'Compte bancaire à créditer': '收款银行账户',
    'Banque': '银行',
    'Rib / compte': '账号',
    'Titulaire du compte': '账户持有人',

    /* --- Inscription & aide --- */
    'Créer mon entreprise': '创建我的企业',
    'Créer mon entreprise et mon compte': '创建我的企业和账户',
    'Email professionnel': '企业邮箱',
    'Date de création': '成立日期',
    "Logo de l'entreprise (photo)": '企业标志（图片）',
    "J'ai déjà un compte — Se connecter": '我已有账户 — 登录',
    'Aide WhatsApp': 'WhatsApp 帮助',
    'Assistance directe': '直接支持',
    'Nous contacter': '联系我们',
    'Vérifiez votre email': '请验证您的邮箱',
    'Renvoyer le code': '重新发送验证码',
    'Compte créé': '账户已创建',
    'Nouveau compte': '新建账户',
    'Rôle': '角色',
    'Identifiants envoyés par email': '登录信息已通过邮件发送',
  },
};

const I18n = {
  langue: 'fr',
  theme: 'clair',
  observateur: null,

  /** Lit les préférences mémorisées sur le poste. */
  charger() {
    try {
      this.langue = localStorage.getItem('sp_langue') || 'fr';
      this.theme = localStorage.getItem('sp_theme') || 'clair';
    } catch (e) { this.langue = 'fr'; this.theme = 'clair'; }
    if (!LANGUES[this.langue]) this.langue = 'fr';
    if (!['clair', 'sombre'].includes(this.theme)) this.theme = 'clair';
  },

  memoriser(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ }
  },

  /** Traduit une chaîne (retourne le français si aucune traduction). */
  t(texte) {
    if (this.langue === 'fr' || texte === null || texte === undefined) return texte;
    const dico = TRADUCTIONS[this.langue];
    if (!dico) return texte;
    const cle = String(texte).trim();
    if (dico[cle]) return dico[cle];
    // Traduction partielle : on remplace les segments connus (phrases composées).
    let sorti = String(texte);
    let change = false;
    Object.keys(dico).forEach((k) => {
      if (k.length > 5 && sorti.includes(k)) { sorti = sorti.split(k).join(dico[k]); change = true; }
    });
    return change ? sorti : texte;
  },

  /** Traduit un arbre DOM (textes, placeholders, titres, options). */
  traduireDom(racine) {
    if (this.langue === 'fr' || !racine) return;
    if (racine.dataset && racine.dataset.traduit === this.langue) return;

    const traiterTexte = (noeud) => {
      const brut = noeud.nodeValue;
      if (!brut || !brut.trim()) return;
      const traduit = this.t(brut.trim());
      if (traduit !== undefined && traduit !== brut.trim()) {
        // On conserve les espaces d'origine en début/fin.
        const debut = brut.match(/^\s*/)[0];
        const fin = brut.match(/\s*$/)[0];
        noeud.nodeValue = debut + traduit + fin;
      }
    };

    const parcourir = (el) => {
      if (!el || el.nodeType !== 1) return;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      ['placeholder', 'title', 'alt', 'aria-label'].forEach((attr) => {
        const v = el.getAttribute && el.getAttribute(attr);
        if (v && v.trim()) {
          const tr = this.t(v.trim());
          if (tr !== v.trim()) el.setAttribute(attr, tr);
        }
      });
      for (const n of el.childNodes) {
        if (n.nodeType === 3) traiterTexte(n);
        else if (n.nodeType === 1) parcourir(n);
      }
    };

    parcourir(racine);
    if (racine.dataset) racine.dataset.traduit = this.langue;
  },

  /** Traduit toute la page et mémorise l'état. */
  appliquer() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = (LANGUES[this.langue] || LANGUES.fr).html;
    document.documentElement.setAttribute('data-theme', this.theme);
    document.body.classList.toggle('theme-sombre', this.theme === 'sombre');
    if (this.langue === 'fr') {
      // Retour au français : on recharge l'interface pour retrouver les libellés d'origine.
      return;
    }
    delete document.body.dataset.traduit;
    this.traduireDom(document.body);
    this.surveiller();
  },

  /** Traduit aussi le contenu ajouté plus tard (vues chargées en asynchrone). */
  surveiller() {
    if (this.langue === 'fr' || typeof MutationObserver === 'undefined') return;
    if (this.observateur) this.observateur.disconnect();
    this.observateur = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) this.traduireDom(n); });
      });
    });
    this.observateur.observe(document.body, { childList: true, subtree: true });
  },

  /** Change la langue et recharge l'interface (libellés d'origine = français). */
  changerLangue(code) {
    if (!LANGUES[code]) return;
    this.langue = code;
    this.memoriser('sp_langue', code);
    if (typeof location !== 'undefined') location.reload();
  },

  /** Change le thème immédiatement, sans rechargement. */
  changerTheme(theme) {
    this.theme = theme === 'sombre' ? 'sombre' : 'clair';
    this.memoriser('sp_theme', this.theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.theme);
      document.body.classList.toggle('theme-sombre', this.theme === 'sombre');
      // Les sélecteurs de thème doivent refléter le nouvel état.
      document.querySelectorAll('[data-theme-choix]').forEach((b) => {
        b.classList.toggle('actif', b.dataset.themeChoix === this.theme);
      });
    }
  },
};

I18n.charger();

/* Application immédiate : le thème vaut dès l'écran de connexion. */
if (typeof document !== 'undefined') {
  const appliquerTot = () => {
    document.documentElement.lang = (LANGUES[I18n.langue] || LANGUES.fr).html;
    document.documentElement.setAttribute('data-theme', I18n.theme);
    document.body.classList.toggle('theme-sombre', I18n.theme === 'sombre');
    I18n.appliquer();
  };
  if (document.body) appliquerTot();
  else document.addEventListener('DOMContentLoaded', appliquerTot);
}

window.I18n = I18n;
window.LANGUES = LANGUES;
/** Raccourci de traduction utilisable partout. */
window.t = (s) => I18n.t(s);
