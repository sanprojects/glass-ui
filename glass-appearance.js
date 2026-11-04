/*! Glass UI: Appearance panel (optional, separate from the kit).
 * Wires up the settings popover of the demo: background (built-in scenes and your own images, remembered between visits),
 * accent colour, background colour (the liquid, or the gradient), and the plain two-colour gradient (from the same colour) and liquid speed, glass blur and opacity, Reset. Needs glass-ui.js (+ glass-ui-liquid.js for the liquid controls),
 * glass-appearance.css and the panel markup (#ctl with #bgChips, #accentRow, #liquidRow, #speedTabs, #blurRange, #fillRange)
 * plus a fixed background element #scene. Nothing in the kit depends on it. */
(function () {
  function init() {
  var scene = document.getElementById('scene');
  var $ = function(id){ return document.getElementById(id); }, root = document.documentElement.style;
  var chips=$('bgChips'), customs=[];
  /* the default background is the host's: the chip its markup marks pressed */
  var dflt=chips.querySelector('.sw-btn[aria-pressed="true"]'), DEF_SCENE=dflt?dflt.getAttribute('data-scene'):'gradient';
  function store(k,v){ try{ localStorage.setItem(k,v); return true; }catch(_){ return false; } }
  function load(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  try{ customs=JSON.parse(load('g-bg-custom')||'[]')||[]; }catch(_){ customs=[]; }
  function keyOf(b){ return b.getAttribute('data-scene')+(b.hasAttribute('data-id')?':'+b.getAttribute('data-id'):''); }
  function setScene(k, c, quiet){ var key=c?'custom:'+c.id:k;
    scene.setAttribute('data-scene', k); scene.style.backgroundImage=c?'url("'+c.src+'")':'';
    Array.prototype.forEach.call(chips.querySelectorAll('.sw-btn'), function(b){ b.setAttribute('aria-pressed', keyOf(b)===key ? 'true':'false'); });
    if(!quiet) store('g-bg-scene', key); }
  function pick(row, btn){ Array.prototype.forEach.call(row.querySelectorAll('.sw-btn'), function(b){ b.setAttribute('aria-pressed','false'); b.classList.remove('is-active'); }); if (btn.tagName==='BUTTON') btn.setAttribute('aria-pressed','true'); else btn.classList.add('is-active'); }
  /* background */
  chips.addEventListener('click', function(e){ var b=e.target.closest('.sw-btn'); if(!b) return;
    var id=b.getAttribute('data-id'), c=id&&customs.filter(function(x){ return x.id===id; })[0]; setScene(b.getAttribute('data-scene'), c); });
  /* custom image: a local file (works on pages that block outside images). It becomes one more round button and is kept between visits */
  function addBtn(c){ var b=document.createElement('button'); b.className='sw-btn'; b.setAttribute('data-scene','custom'); b.setAttribute('data-id',c.id); b.setAttribute('aria-label','Your image'); b.title='Your image'; b.setAttribute('aria-pressed','false'); b.style.setProperty('--sw','center/cover url("'+c.src+'")'); chips.appendChild(b); }
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
  function hslOf(hex){ var c=hexToRgb(hex).map(function(v){return v/255;}), mx=Math.max.apply(null,c), mn=Math.min.apply(null,c), l=(mx+mn)/2, d=mx-mn; return [hueOf(hex), d?d/(1-Math.abs(2*l-1))*100:0, l*100]; }
  /* OKLCH: hue steps on this wheel look even (in HSL a +35 turn from red lands on orange but from blue on violet), so the blobs are picked here */
  var lin=function(v){ v/=255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); }, gam=function(v){ v=v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055; return Math.max(0,Math.min(1,v))*255; };
  function hexToOk(hex){ var c=hexToRgb(hex).map(lin), l=Math.cbrt(.4122214708*c[0]+.5363325363*c[1]+.0514459929*c[2]), m=Math.cbrt(.2119034982*c[0]+.6806995451*c[1]+.1073969566*c[2]), q=Math.cbrt(.0883024619*c[0]+.2817188376*c[1]+.6299787005*c[2]),
    L=.2104542553*l+.793617785*m-.0040720468*q, a=1.9779984951*l-2.428592205*m+.4505937099*q, b=.0259040371*l+.7827717662*m-.808675766*q; return [L,Math.hypot(a,b),(Math.atan2(b,a)*180/Math.PI+360)%360]; }
  function okToHex(L,C,h){ for (var i=0;i<12;i++,C*=.9){ var a=C*Math.cos(h*Math.PI/180), b=C*Math.sin(h*Math.PI/180), l=Math.pow(L+.3963377774*a+.2158037573*b,3), m=Math.pow(L-.1055613458*a-.0638541728*b,3), q=Math.pow(L-.0894841775*a-1.291485548*b,3),
      r=4.0767416621*l-3.3077115913*m+.2309699292*q, g=-1.2684380046*l+2.6097574011*m-.3413193965*q, bl=-.0041960863*l-.7034186147*m+1.707614701*q;
      if (r>=-.001&&r<=1.001&&g>=-.001&&g<=1.001&&bl>=-.001&&bl<=1.001) return rgbToHex(gam(r),gam(g),gam(bl)); }
    return rgbToHex(gam(L),gam(L),gam(L)); }
  /* the blobs of a picked colour (the fifth is for the gradient): a dark (or pale) ground, the colour itself and its two analogous neighbours 28 degrees either side; the picked lightness sets how light the whole field is */
  function liquidPalette(hex){ var o=hexToOk(hex), L=o[0], C=Math.min(o[1],.2)*TONE.c, H=o[2], k=function(v,a,b){ return Math.max(a,Math.min(b,v)); }, u=function(v){ return Math.min(.95,v+TONE.l); };
    return [okToHex(Math.min(.6,k(L*.38,.13,.3)+TONE.g),C*.6,H), okToHex(u(k(L,.46,.74)),C,H), okToHex(u(k(L+.1,.56,.86)),C*.9,H+28), okToHex(u(k(L+.03,.5,.78)),C*.85,H-28), okToHex(u(k(L+.07,.52,.82)),C*.9,H+14)]; }
  /* accent */
  function setAccent(hex,keep){ if(!keep) store('g-accent',hex); var rgb=hexToRgb(hex), lift=rgb.map(function(v){ return v+(255-v)*0.2; });
    root.setProperty('--g-accent',hex); root.setProperty('--g-accent-hover',rgbToHex(lift[0],lift[1],lift[2])); }
  var accRow=$('accentRow');
  Array.prototype.forEach.call(accRow.querySelectorAll('button.sw-btn'), function(b){ b.addEventListener('click', function(){ pick(accRow,b); setAccent(b.getAttribute('data-accent')); }); });
  $('accentCustom').addEventListener('input', function(e){ pick(accRow, e.target.parentNode); setAccent(e.target.value); });
  /* background colour: the palette is worked out when a colour is picked and saved (g-palette), and the host page's first script puts it on the page,
     so the very first frame already has it. Its lists stay lists of one ([0]): a palette saved while the kit had a light theme ([1]) still reads */
  /* the tone of every background (liquid, gradient, duo, day cycle and the pictures): c scales the chroma, l lifts the colours, g lifts the dark ground; Glass.tone({...}) changes and saves it. Vivid (no change) is the default */
  var TONE={c:1,l:0,g:0}; try{ var tn=JSON.parse(load('g-tone')); if (tn) ['c','l','g'].forEach(function(n){ if (typeof tn[n]==='number') TONE[n]=tn[n]; }); }catch(_){}
  var DEFAULT='#33a7e1', liqHost=document.querySelector('.g-liquid[data-for="liquid"]'), liqApi=function(){ return Glass.liquid && Glass.liquid(liqHost); };
  var STOCK=[['#1d2b52','#5ea0ff','#ff9ec2','#46d1c1','#a78bfa']], GOLD=[['#2a1a0d','#b7721e','#f2c66d','#7b3d1b']];
  var GRAD=['--sc0','--sc1','--sc2','--sc3','--sc4'];
  /* the plain gradient (data-scene="duo"): light at the top right, where the glass catches the light, running down to a dark corner; both of the picked colour's hue (--sd1 light, --sd0 dark) */
  function duoOf(hex){ var o=hexToOk(hex), C=Math.min(o[1],.2)*TONE.c, k=function(v,a,b){ return Math.max(a,Math.min(b,v)); }; return [okToHex(Math.min(.6,.27+TONE.g),C*.14,o[2]), okToHex(Math.min(.95,k(o[0]*1.1,.6,.78)+TONE.l),C*.55,o[2])]; }
  function paletteOf(hex){ var c=liquidPalette(hex); return { g:[c], q:[c.slice(0,4)], lt:['#fff8f2'], d:duoOf(hex) }; }   /* gradient: five colours, liquid: four */
  function presetPalette(v){ var P;
    if (v==='day'){ P=paletteOf(DEFAULT); P.g=STOCK; P.day=1; return P; }
    if (v==='gold'){ P=paletteOf(hslToHex(38,75,55)); P.q=GOLD; P.lt=['#ffe3a3']; return P; }
    return paletteOf(/^#/.test(v)?v:hslToHex(+v,70,55)); }
  /* a colour [r,g,b] 0..1 of the day cycle in the tone of the panel: as liquidPalette does it (role 0 is the dark ground) */
  function dayTone(c,role,frame){ var o=hexToOk(rgbToHex(c[0]*255,c[1]*255,c[2]*255)), w=[.7,1,1,.7,0][frame], L=role?Math.min(.95,o[0]+TONE.l*w):Math.min(.6,o[0]+TONE.g*w);   /* the lift fades with the light of the hour: noon takes all of it, night none, so the night stays dark in every tone */
    return hexToRgb(okToHex(L,Math.min(o[1],.2)*TONE.c,o[2])).map(function(v){ return v/255; }); }
  /* a picture (a scene photo or your own image) takes the same tone as a muting filter on the scene: the chroma scales its colours, the lifts soften its contrast and lighten it.
     Vivid is no filter at all (css: .scene[data-scene] other than the colour ones read --g-scene-tone) */
  function toneImage(){ var c=TONE.c, l=TONE.l, g=TONE.g; scene.style.setProperty('--g-scene-tone', c>=.999&&!l&&!g ? 'none' : 'saturate('+c.toFixed(3)+') contrast('+(1-g*.5).toFixed(3)+') brightness('+(1+l*.4).toFixed(3)+')'); }
  toneImage();
  var curPal=paletteOf(DEFAULT);
  function applyColours(){ var P=curPal, api=liqApi();
    P.g[0].forEach(function(c,i){ scene.style.setProperty(GRAD[i],c); });
    if (P.d){ scene.style.setProperty('--sd0',P.d[0]); scene.style.setProperty('--sd1',P.d[1]); }
    if (P.day && Glass.dayKeys) Glass.dayKeys(dayTone);   /* the day cycle takes the same tone as every picked colour */
    if (P.day) scene.setAttribute('data-day',''); else scene.removeAttribute('data-day');   /* the gradient and the plain gradient follow the day cycle too */
    if (api){ if (P.day) api.setDay(true); else api.setColors(P.q[0],P.lt[0]); } }
  var curId=null;
  function setColour(P,id,keep){ curPal=P; curId=id; applyColours();
    if (keep) return;   /* restoring the saved colour: neither saved again nor does it switch the background */
    store('g-palette',JSON.stringify(P)); store('g-colour',id);
    var s=scene.getAttribute('data-scene'); if (s!=='liquid' && s!=='gradient' && s!=='duo') setScene('liquid'); }
  function paletteFor(id){ var v=id&&id.slice(2); return id&&id.indexOf('b:')===0?presetPalette(v):id&&id.indexOf('c:')===0?paletteOf(v):paletteOf(DEFAULT); }
  (window.Glass=window.Glass||{}).tone=function(t){ if (t){ ['c','l','g'].forEach(function(n){ if (typeof t[n]==='number') TONE[n]=t[n]; }); store('g-tone',JSON.stringify(TONE));
      curPal=paletteFor(curId); if (curId) store('g-palette',JSON.stringify(curPal)); applyColours(); toneImage(); } return {c:TONE.c,l:TONE.l,g:TONE.g}; };
  var liqRow=$('liquidRow'), presetOf=function(b){ return b.getAttribute('data-color')||b.getAttribute('data-hue'); };
  Array.prototype.forEach.call(liqRow.querySelectorAll('button.sw-btn'), function(b){ b.addEventListener('click', function(){ pick(liqRow,b); setColour(presetPalette(presetOf(b)),'b:'+presetOf(b)); }); });
  $('liquidCustom').addEventListener('input', function(e){ pick(liqRow, e.target.parentNode); setColour(paletteOf(e.target.value),'c:'+e.target.value); });
  applyColours();   /* the default colour until a saved one is restored below (the theme switch used to apply it) */
  /* tone of the colour backgrounds: the tabs of the optional #toneTabs set Glass.tone (Vivid is the saturated original and the default) */
  var TONES=[{c:1,l:0,g:0},{c:.85,l:.04,g:.06},{c:.75,l:.07,g:.12},{c:.5,l:.12,g:.22}], toneTabs=$('toneTabs');
  if (toneTabs){ toneTabs.addEventListener('g:tabchange', function(e){ Glass.tone(TONES[e.detail.index]); });
    (function(){ var t=Glass.tone(), i=-1; TONES.forEach(function(x,n){ if (Math.abs(x.c-t.c)<.005&&Math.abs(x.l-t.l)<.005&&Math.abs(x.g-t.g)<.005) i=n; });
      if (i!==0) { var b=toneTabs.children; if (i>=0) b[i].click(); else b[0].removeAttribute('aria-selected'); } })(); }
  /* liquid speed */
  var SPEEDS=[0,1,1,2.5,5.8], REAL=1, CALM=2, restoring=false;   /* one speed for the liquid and the gradient: 1 = calm; Real time (after Still, the slowest) is calm too, with the day of the day-cycle colours set by the local clock */
  $('speedTabs').addEventListener('g:tabchange', function(e){ var i=e.detail.index; Glass.scene.speed(SPEEDS[i]); store('g-speed2',i);
    if (Glass.realTime) Glass.realTime(i===REAL);
    if (i===REAL && !restoring && !curPal.day){ var b=liqRow.querySelector('[data-hue="day"]'); if (b){ pick(liqRow,b); setColour(presetPalette('day'),'b:day'); } } });   /* real time shows only in the day-cycle colours */
  (function(){ var v=load('g-speed2'), i=v===null?CALM:+v; if(i!==CALM&&i>=0&&i<SPEEDS.length){ restoring=true; document.querySelectorAll('#speedTabs > *')[i].click(); restoring=false; } })();   /* restore the saved speed */
  /* glass */
  var br=$('blurRange'), fr=$('fillRange');
  function setBlur(v){ root.setProperty('--g-blur','blur('+v+'px) saturate(180%)'); $('blurOut').textContent=v+' px'; }
  function setFill(v){ var a=v/100; root.setProperty('--g-fill','rgba(255,255,255,'+a+')'); root.setProperty('--g-fill-strong','rgba(255,255,255,'+(a*1.5).toFixed(3)+')'); root.setProperty('--g-fill-hover','rgba(255,255,255,'+(a*1.4).toFixed(3)+')'); root.setProperty('--g-fill-selected','rgba(255,255,255,'+(a*2).toFixed(3)+')'); $('fillOut').textContent=v+'%'; }
  br.addEventListener('input', function(){ setBlur(br.value); store('g-blur',br.value); }); fr.addEventListener('input', function(){ setFill(fr.value); store('g-fill',fr.value); });
  var savedBlur=load('g-blur'), savedFill=load('g-fill');
  if(savedBlur){ br.value=savedBlur; setBlur(savedBlur); } if(savedFill){ fr.value=savedFill; setFill(savedFill); }
  /* reset */
  $('ctlReset').addEventListener('click', function(){
    bgIn.value=''; bgIn.dispatchEvent(new Event('change')); bgIn.removeAttribute('aria-invalid'); customs=[]; Array.prototype.forEach.call(chips.querySelectorAll('[data-id]'), function(b){ b.remove(); }); store('g-bg-custom','[]'); setScene(DEF_SCENE); setAccent('#0071E3'); pick(accRow, accRow.querySelector('button')); pick(liqRow, liqRow.querySelector('button'));
    ['--g-accent','--g-accent-hover','--g-accent-fg','--g-blur','--g-fill','--g-fill-strong','--g-fill-hover','--g-fill-selected'].forEach(function(p){ root.removeProperty(p); });
    br.value=30; fr.value=10; br.dispatchEvent(new Event('input')); fr.dispatchEvent(new Event('input')); root.removeProperty('--g-blur'); root.removeProperty('--g-fill');
    TONE.c=1; TONE.l=0; TONE.g=0; toneImage(); if (toneTabs) toneTabs.children[0].click(); curPal=paletteOf(DEFAULT); curId=null; pick(liqRow,liqRow.firstElementChild); applyColours(); try{ ['g-palette','g-colour','g-accent','g-blur','g-fill','g-tone'].forEach(function(k){ localStorage.removeItem(k); }); }catch(_){}
    var tabs=document.querySelectorAll('#speedTabs > *'); tabs[CALM].click();
    /* as on a first visit: nothing of the panel stays saved (the default scene and speed are what a visitor with no storage gets), the old g-scene key and the gradient carried across pages included */
    try{ ['g-bg-scene','g-bg-custom','g-scene','g-speed','g-speed2'].forEach(function(k){ localStorage.removeItem(k); }); sessionStorage.removeItem('g-gradient'); }catch(_){}
  });
  /* restore the saved background */
  customs.forEach(addBtn);
  (function(){ var s=load('g-bg-scene')||scene.getAttribute('data-scene')||DEF_SCENE, c=s.indexOf('custom:')===0&&customs.filter(function(x){ return 'custom:'+x.id===s; })[0];
    if(c) setScene('custom', c, true); else setScene(chips.querySelector('[data-scene="'+s+'"]:not([data-id])')?s:DEF_SCENE, null, true); })();
  /* the name of a button on hover: its aria-label */
  [chips,accRow,liqRow].forEach(function(row){ Array.prototype.forEach.call(row.querySelectorAll('[aria-label]'), function(b){ if(!b.title) b.title=b.getAttribute('aria-label'); }); });
  /* restore the saved colours: the accent and the colour of the liquid and gradient backgrounds */
  (function(){ var a=load('g-accent'); if(/^#[0-9a-f]{6}$/i.test(a||'')){ setAccent(a,true); var b=accRow.querySelector('button[data-accent="'+a+'" i]'); if(b) pick(accRow,b); else { $('accentCustom').value=a; pick(accRow,$('accentCustom').parentNode); } }
    var P=null, id=load('g-colour'); try{ P=JSON.parse(load('g-palette')); }catch(_){}
    if (id&&/^[bc]:/.test(id)){ P=paletteFor(id); store('g-palette',JSON.stringify(P)); }   /* worked out again: the tone may have changed since it was saved */
    if (!(P&&P.g&&P.g[0]&&P.q&&P.q[0]&&P.lt)){ applyColours(); window.addEventListener('load', applyColours); return; }   /* nothing saved: the default colour, the one Reset puts back */
    setColour(P,id,true); window.addEventListener('load', applyColours);   /* the liquid may mount after this script */
    var b=null; if (id&&id.indexOf('b:')===0) b=liqRow.querySelector('button[data-color="'+id.slice(2)+'"],button[data-hue="'+id.slice(2)+'"]');
    if (b) pick(liqRow,b); else if (id&&id.indexOf('c:')===0){ $('liquidCustom').value=id.slice(2); pick(liqRow,$('liquidCustom').parentNode); } })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
