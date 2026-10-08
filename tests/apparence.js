const { JSDOM, VirtualConsole } = require('jsdom');
const BASE='http://localhost:3000';
const attendre=(ms)=>new Promise(r=>setTimeout(r,ms));
async function cond(fn,n=100,ms=150){for(let i=0;i<n;i++){const v=fn();if(v)return v;await attendre(ms);}return null;}
const res=[]; const v=(l,ok,d)=>res.push([l,!!ok,d]);
(async()=>{
  const vc=new VirtualConsole(); const errs=[];
  vc.on('jsdomError',e=>errs.push('jsdomError: '+e.message));
  vc.on('error',m=>errs.push('console.error: '+m));
  const dom=await JSDOM.fromURL(BASE+'/',{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window; w.fetch=(u,o)=>fetch(new URL(u,BASE),o); w.alert=()=>{}; w.confirm=()=>true;
  await cond(()=>w.App&&w.document.querySelector('#form-connexion'));
  v('I18n chargé', !!w.I18n);
  v('3 langues disponibles', Object.keys(w.LANGUES||{}).join(',')==='fr,en,zh', Object.keys(w.LANGUES||{}).join(','));
  // Thème sombre
  w.I18n.changerTheme('sombre');
  v('Thème sombre appliqué sur <html>', w.document.documentElement.getAttribute('data-theme')==='sombre');
  v('Classe theme-sombre sur <body>', w.document.body.classList.contains('theme-sombre'));
  w.I18n.changerTheme('clair');
  v('Retour au thème clair', w.document.documentElement.getAttribute('data-theme')==='clair');
  // Traduction EN
  w.I18n.langue='en'; w.I18n.appliquer();
  const f=w.document.getElementById('form-connexion');
  const txt=f?f.textContent:'';
  v('Écran de connexion traduit en anglais', /Sign in|Create my company/i.test(txt), txt.replace(/\s+/g,' ').slice(0,90));
  // Connexion puis vérification des menus
  w.I18n.langue='fr';
  f.querySelector('[name=email]').value='admin@shoppingplus.cm';
  f.querySelector('[name=mot_de_passe]').value='Admin@2026';
  f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await cond(()=>w.document.querySelector('nav a'));
  w.I18n.langue='en'; w.I18n.appliquer();
  await attendre(400);
  const menu=[...w.document.querySelectorAll('nav a')].map(a=>a.textContent.trim());
  v('Menus traduits en anglais', menu.some(m=>/Dashboard/i.test(m))&&menu.some(m=>/Settings|Cash/i.test(m)), menu.slice(0,6).join(' | '));
  const kpi=[...w.document.querySelectorAll('.kpi .libelle')].map(e=>e.textContent.trim());
  v('KPI du tableau de bord traduits', /Today's revenue/i.test(kpi.join(' ')), kpi.slice(0,3).join(' | '));
  // Paramètres : bloc apparence
  await w.App.allerA('parametres');
  await cond(()=>w.document.getElementById('choix-langue'));
  v('Paramètres : sélecteur de langue présent', !!w.document.getElementById('choix-langue'));
  v('Paramètres : 2 thèmes proposés', w.document.querySelectorAll('[data-theme-choix]').length===2);
  v('Paramètres : libellé « Apparence » traduit', /Appearance/i.test(w.document.body.textContent));
  // Chinois : dans une fenêtre neuve (un changement de langue recharge la page,
  // les libellés repartent donc du français avant d'être traduits).
  w.I18n.changerLangue = (c) => { w.I18n.langue = c; };   // on simule sans recharger
  const dom2=await JSDOM.fromURL(BASE+'/',{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  const w2=dom2.window; w2.fetch=(u,o)=>fetch(new URL(u,BASE),o); w2.alert=()=>{}; w2.confirm=()=>true;
  await cond(()=>w2.App&&w2.document.querySelector('#form-connexion'));
  w2.I18n.langue='zh'; w2.I18n.appliquer();
  await attendre(300);
  const f2=w2.document.getElementById('form-connexion');
  f2.querySelector('[name=email]').value='admin@shoppingplus.cm';
  f2.querySelector('[name=mot_de_passe]').value='Admin@2026';
  f2.dispatchEvent(new w2.Event('submit',{bubbles:true,cancelable:true}));
  await cond(()=>w2.document.querySelector('nav a'));
  w2.I18n.langue='zh'; w2.I18n.appliquer();
  await attendre(400);
  const menuZh=[...w2.document.querySelectorAll('nav a')].map(a=>a.textContent.trim()).join(' ');
  v('Menus traduits en chinois', /仪表板|设置|销售|库存/.test(menuZh), menuZh.slice(0,70));
  const kpiZh=[...w2.document.querySelectorAll('.kpi .libelle')].map(e=>e.textContent.trim()).join(' ');
  v('KPI traduits en chinois', /今日营业额|库存/.test(kpiZh), kpiZh.slice(0,60));
  w2.I18n.changerTheme('sombre');
  v('Thème sombre conservé avec la langue chinoise', w2.document.documentElement.getAttribute('data-theme')==='sombre');
  console.log('erreurs navigateur :', errs.slice(0,3));
  let ok=0; res.forEach(([l,r,d])=>{if(r)ok++;console.log((r?' ✅ ':' ❌ ')+l+(d&&!r?' → '+d:''))});
  console.log('\n'+ok+'/'+res.length);
  process.exit(ok===res.length?0:1);
})().catch(e=>{console.error('ERREUR',e);process.exit(1);});
