/*! Glass UI: Appearance panel (optional, separate from the kit).
 * Wires up the settings popover of the demo: theme, background (built-in scenes and your own images, remembered between visits),
 * accent colour, liquid colour and speed, glass blur and opacity, Reset. Needs glass-ui.js (+ glass-ui-liquid.js for the liquid controls),
 * glass-appearance.css and the panel markup (#ctl with #themeTabs, #bgChips, #accentRow, #liquidRow, #speedTabs, #blurRange, #fillRange)
 * plus a fixed background element #scene. Nothing in the kit depends on it. */
(function () {
  function init() {
  var scene = document.getElementById('scene');
  var $ = function(id){ return document.getElementById(id); }, root = document.documentElement.style;
  var chips=$('bgChips'), customs=[];
  function store(k,v){ try{ localStorage.setItem(k,v); return true; }catch(_){ return false; } }
  function load(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  try{ customs=JSON.parse(load('g-bg-custom')||'[]')||[]; }catch(_){ customs=[]; }
  function keyOf(b){ return b.getAttribute('data-scene')+(b.hasAttribute('data-id')?':'+b.getAttribute('data-id'):''); }
  function setScene(k, c){ var key=c?'custom:'+c.id:k;
    scene.setAttribute('data-scene', k); scene.style.backgroundImage=c?'url("'+c.src+'")':'';
    Array.prototype.forEach.call(chips.querySelectorAll('.sw-btn'), function(b){ b.setAttribute('aria-pressed', keyOf(b)===key ? 'true':'false'); });
    store('g-scene', key); }
  function pick(row, btn){ Array.prototype.forEach.call(row.querySelectorAll('.sw-btn'), function(b){ b.setAttribute('aria-pressed','false'); b.classList.remove('is-active'); }); if (btn.tagName==='BUTTON') btn.setAttribute('aria-pressed','true'); else btn.classList.add('is-active'); }
  /* background */
  chips.addEventListener('click', function(e){ var b=e.target.closest('.sw-btn'); if(!b) return;
    var id=b.getAttribute('data-id'), c=id&&customs.filter(function(x){ return x.id===id; })[0]; setScene(b.getAttribute('data-scene'), c); });
  /* custom image: a local file (works on pages that block outside images). It becomes one more round button and is kept between visits */
  function addBtn(c){ var b=document.createElement('button'); b.className='sw-btn'; b.setAttribute('data-scene','custom'); b.setAttribute('data-id',c.id); b.setAttribute('aria-label','Your image'); b.setAttribute('aria-pressed','false'); b.style.setProperty('--sw','center/cover url("'+c.src+'")'); chips.appendChild(b); }
  function dropOldest(){ var o=customs.shift(), b=o&&chips.querySelector('[data-id="'+o.id+'"]'); if(b) b.remove(); }
  function persist(){ while(!store('g-bg-custom', JSON.stringify(customs)) && customs.length>1) dropOldest(); }   /* out of space: forget the oldest */
  var bgIn=$('bgFile');
  bgIn.addEventListener('change', function(){ var f=bgIn.files[0];
    if(!f){ bgIn.removeAttribute('aria-invalid'); return; }
    var im=new Image(), u=URL.createObjectURL(f);
    im.onload=function(){ var k=Math.min(1,1920/Math.max(im.width,im.height)), cv=document.createElement('canvas'); cv.width=Math.round(im.width*k); cv.height=Math.round(im.height*k); cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height); URL.revokeObjectURL(u);
      var c={ id:Date.now().toString(36), src:cv.toDataURL('image/jpeg',.82) }; customs.push(c); if(customs.length>3) dropOldest(); addBtn(c); persist(); setScene('custom', c);
      bgIn.value=''; bgIn.dispatchEvent(new Event('change')); };
    im.onerror=function(){ URL.revokeObjectURL(u); bgIn.value=''; bgIn.dispatchEvent(new Event('change')); bgIn.setAttribute('aria-invalid','true'); }; im.src=u; });
  /* helpers */
  function hexToRgb(h){ h=h.replace('#',''); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(function(v){ v=Math.max(0,Math.min(255,Math.round(v))); return (v<16?'0':'')+v.toString(16); }).join(''); }
  function hslToHex(h,s,l){ h=((h%360)+360)%360; s/=100; l/=100; var k=function(n){ return (n+h/30)%12; }, a=s*Math.min(l,1-l), f=function(n){ return l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))); }; return rgbToHex(f(0)*255,f(8)*255,f(4)*255); }
  function hueOf(hex){ var c=hexToRgb(hex).map(function(v){return v/255;}), mx=Math.max.apply(null,c), mn=Math.min.apply(null,c), d=mx-mn, h=0; if(d){ if(mx===c[0]) h=((c[1]-c[2])/d)%6; else if(mx===c[1]) h=(c[2]-c[0])/d+2; else h=(c[0]-c[1])/d+4; } return (h*60+360)%360; }
  /* accent */
  function setAccent(hex){ var rgb=hexToRgb(hex), lum=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255, lift=rgb.map(function(v){ return v+(255-v)*0.2; });
    root.setProperty('--g-accent',hex); root.setProperty('--g-accent-hover',rgbToHex(lift[0],lift[1],lift[2])); root.setProperty('--g-accent-fg', lum>0.6 ? '#1C1C1E' : '#fff'); }
  var accRow=$('accentRow');
  Array.prototype.forEach.call(accRow.querySelectorAll('button.sw-btn'), function(b){ b.addEventListener('click', function(){ pick(accRow,b); setAccent(b.getAttribute('data-accent')); }); });
  $('accentCustom').addEventListener('input', function(e){ pick(accRow, e.target.parentNode); setAccent(e.target.value); });
  /* liquid colour */
  var BLUE=['#14224a','#3f78e0','#58c4c0','#8a6ee6'], liqHost=document.querySelector('.g-liquid[data-for="liquid"]'), liqApi=function(){ return Glass.liquid && Glass.liquid(liqHost); };
  var GOLD=['#2a1a0d','#b7721e','#f2c66d','#7b3d1b'], curHue='blue';
  var isLight=function(){ return document.documentElement.getAttribute('data-theme')==='light'; };
  function applyLiquidColour(){ var h=curHue, api=liqApi(), L=isLight(); if(!api) return; api.setLift(L?.55:0);
    if (h==='day'){ api.setDay(true); return; }
    if (h==='blue') api.setColors(L?['#a9c4f2','#7fa6ee','#d7ecf2','#c9bdf3']:BLUE, L?'#ffffff':'#fff8f2');
    else if (h==='gold') api.setColors(L?['#f3d9a8','#e3b062','#fbeac0','#e9c08a']:GOLD, L?'#ffffff':'#ffe3a3');
    else if (L) api.setColors([hslToHex(h,70,78),hslToHex(h,75,68),hslToHex(h+35,80,86),hslToHex(h-45,70,80)],'#ffffff');
    else api.setColors([hslToHex(h,55,15),hslToHex(h,68,50),hslToHex(h+35,65,62),hslToHex(h-45,60,58)],'#fff8f2'); }
  function setLiquid(h){ curHue=h; applyLiquidColour();
    if (scene.getAttribute('data-scene')!=='liquid') setScene('liquid'); }
  var liqRow=$('liquidRow');
  Array.prototype.forEach.call(liqRow.querySelectorAll('button.sw-btn'), function(b){ b.addEventListener('click', function(){ pick(liqRow,b); var v=b.getAttribute('data-hue'); setLiquid(isNaN(+v)?v:+v); }); });
  $('liquidCustom').addEventListener('input', function(e){ pick(liqRow, e.target.parentNode); setLiquid(hueOf(e.target.value)); });
  /* theme */
  var THEMES=['dark','light','auto'];
  $('themeTabs').addEventListener('g:tabchange', function(e){ Glass.setTheme(THEMES[e.detail.index]); try{ localStorage.setItem('g-theme', THEMES[e.detail.index]); }catch(_){} });
  var savedTheme='dark'; try{ savedTheme=localStorage.getItem('g-theme')||'dark'; }catch(_){}
  if (THEMES.indexOf(savedTheme)<0) savedTheme='dark';
  Glass.setTheme(savedTheme); document.querySelectorAll('#themeTabs > *')[THEMES.indexOf(savedTheme)].click();
  /* the page host may set data-theme itself (from the system theme): keep our own choice */
  (function(){ var html=document.documentElement, mode=savedTheme, busy=false;
    $('themeTabs').addEventListener('g:tabchange', function(e){ mode=THEMES[e.detail.index]; });
    function want(){ return mode==='auto' ? (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : mode; }
    new MutationObserver(function(){ if(busy||html.getAttribute('data-theme')===want()) return; busy=true; Glass.setTheme(mode); busy=false; }).observe(html,{attributes:true,attributeFilter:['data-theme']}); })();
  document.addEventListener('g:themechange', function(){ var a=liqApi(); if(a) applyLiquidColour(); });
  /* liquid speed */
  var SPEEDS=[0,0.012,0.03,0.07];
  $('speedTabs').addEventListener('g:tabchange', function(e){ var a=liqApi(); if(a) a.setSpeed(SPEEDS[e.detail.index]); });
  /* glass */
  var br=$('blurRange'), fr=$('fillRange');
  function setBlur(v){ root.setProperty('--g-blur','blur('+v+'px) saturate(180%)'); $('blurOut').textContent=v+' px'; }
  function setFill(v){ var a=v/100; root.setProperty('--g-fill','rgba(255,255,255,'+a+')'); root.setProperty('--g-fill-strong','rgba(255,255,255,'+(a*1.5).toFixed(3)+')'); root.setProperty('--g-fill-hover','rgba(255,255,255,'+(a*1.4).toFixed(3)+')'); root.setProperty('--g-fill-selected','rgba(255,255,255,'+(a*2).toFixed(3)+')'); $('fillOut').textContent=v+'%'; }
  br.addEventListener('input', function(){ setBlur(br.value); }); fr.addEventListener('input', function(){ setFill(fr.value); });
  /* reset */
  $('ctlReset').addEventListener('click', function(){
    bgIn.value=''; bgIn.dispatchEvent(new Event('change')); bgIn.removeAttribute('aria-invalid'); customs=[]; Array.prototype.forEach.call(chips.querySelectorAll('[data-id]'), function(b){ b.remove(); }); store('g-bg-custom','[]'); setScene('aerial'); setAccent('#0071E3'); pick(accRow, accRow.querySelector('button')); curHue='blue'; applyLiquidColour(); pick(liqRow, liqRow.querySelector('button'));
    ['--g-accent','--g-accent-hover','--g-accent-fg','--g-blur','--g-fill','--g-fill-strong','--g-fill-hover','--g-fill-selected'].forEach(function(p){ root.removeProperty(p); });
    br.value=30; fr.value=10; br.dispatchEvent(new Event('input')); fr.dispatchEvent(new Event('input')); root.removeProperty('--g-blur'); root.removeProperty('--g-fill');
    var tabs=document.querySelectorAll('#speedTabs > *'); tabs[1].click(); document.querySelectorAll('#themeTabs > *')[0].click();
  });
  /* restore the saved background */
  customs.forEach(addBtn);
  (function(){ var s=load('g-scene')||'aerial', c=s.indexOf('custom:')===0&&customs.filter(function(x){ return 'custom:'+x.id===s; })[0];
    if(c) setScene('custom', c); else if(chips.querySelector('[data-scene="'+s+'"]:not([data-id])')) setScene(s); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
