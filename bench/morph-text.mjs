// The cost of the animation of a changed text (glass-morph), in Chrome:  node bench/morph-text.mjs [runs] [--kit=name=path.js:path.css ...]
// (needs: npm i; CHROMIUM_PATH=/path/to/chrome for a system Chrome)
// Kits compared: `now` = glass-morph.js/.css of this folder; add others as --kit=old=/path/glass-morph.js:/path/glass-morph.css (the Flash of an older
// commit: git show <commit>:glass-morph.js > /tmp/old.js). --kit=name=js:css:letters sets Glass.morphText = 'letters' (a build with a per-letter switch; the
// patch of one is in the notes of the session that measured it, it is not in the kit).
// Per kit, scenario and device, the median of `runs` changes of the text, each in a fresh page, in the 1000 ms after the write:
//   spans   nodes the animation added to the DOM (the marked words / letters), seen 80 ms after the write
//   anims   running animations at that time        layers  composited layers at that time (CDP LayerTree)
//   script  ms of scripts (CDP Performance ScriptDuration)       style+layout  ms of RecalcStyle + Layout
//   cpu     ms of all the browser's threads busy (trace: RunTask of every thread: main, compositor, raster) - the stand-in for energy
//   paint   ms of Paint + Raster tasks   long    tasks over 50 ms on the main thread   gap  the longest gap between two frames (16.7 = smooth)   frames  drawn
// scenarios: long (3000 characters, all new), mid (400 characters, every other word new), many (200 short texts at once; only those on the screen animate)
// devices: desktop (1280x900) and mobile (375x812, 3x, CPU slowed 4 times)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), runs = +(args.find(a => /^\d+$/.test(a)) || 5);
const kits = { now: { js: path.join(root, 'glass-morph.js'), css: path.join(root, 'glass-morph.css') } };
args.filter(a => a.startsWith('--kit=')).forEach(a => { const [name, rest] = a.slice(6).split(/=(.*)/s); const [js, css, flag] = rest.split(':'); kits[name] = { js, css, letters: flag === 'letters' }; });

const WORDS = 'вода река лес поле дом улица город море гора небо ветер дождь снег трава цветок птица рыба камень огонь свет тень звук слово книга песня дорога мост башня сад двор окно дверь стол стул лампа часы письмо картина зеркало ключ'.split(' ');
const WORDS2 = 'ёж яблоко юла шарф щука цапля эхо фонарь хлеб гриб орех мёд сыр чай кофе соль перец лук мак рожь овёс лён пух мех шёлк бархат лак воск смола'.split(' ');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (w, n) => Array.from({ length: n }, () => w[Math.floor(rnd() * w.length)]);
const cut = (t, n) => t.slice(0, n).replace(/\s\S*$/, '');
const scenarios = {
  long: () => { const a = cut(pick(WORDS, 700).join(' '), 3000), b = cut(pick(WORDS2, 700).join(' '), 3000); return { from: [a], to: [b] }; },
  mid: () => { const w = pick(WORDS, 60); const a = cut(w.join(" "), 400), b = cut(w.map((x, i) => i % 2 ? WORDS2[i % WORDS2.length] : x).join(" "), 400); return { from: [a], to: [b] }; },
  many: () => ({ from: Array.from({ length: 200 }, () => pick(WORDS, 6).join(' ')), to: Array.from({ length: 200 }, () => pick(WORDS2, 6).join(' ')) }),
};
const devices = { desktop: { viewport: { width: 1280, height: 900 }, scale: 1, cpu: 1 }, mobile: { viewport: { width: 375, height: 812 }, scale: 3, cpu: 4, mobile: true } };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), m = u.pathname.match(/^\/kit\/(\w+)\.(js|css)$/);
  if (m) { const f = kits[m[1]] && kits[m[1]][m[2]]; if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types['.' + m[2]] }); return res.end(fs.readFileSync(f)); }
  if (u.pathname === '/page') {
    const k = u.searchParams.get('kit'), dark = u.searchParams.get('dark') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="/kit/${k}.css">
<style>body{margin:0;padding:16px;font:16px/1.5 system-ui,sans-serif;color:${dark ? '#eee' : '#222'};background:${dark ? '#111' : '#fff'}}p{margin:0 0 4px}#box{width:100%}</style>
<div id=box></div><script src="/kit/${k}.js"></script>`);
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r1 = x => Math.round(x * 10) / 10;

async function once(kit, scn, dev, dark) {
  const d = devices[dev], ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.scale, isMobile: !!d.mobile, hasTouch: !!d.mobile });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/page?kit=${kit}&dark=${dark ? 1 : 0}`);
  const { from, to } = scenarios[scn]();
  await page.evaluate(({ from, letters }) => {
    if (letters) Glass.morphText = 'letters';
    document.getElementById('box').innerHTML = from.map((t, i) => '<p data-key="' + i + '">' + t + '</p>').join('');
  }, { from, letters: !!kits[kit].letters });
  await page.waitForTimeout(600);
  await cdp.send('Performance.enable'); await cdp.send('LayerTree.enable');
  let layers = 0; cdp.on('LayerTree.layerTreeDidChange', e => { layers = (e.layers || []).length; });
  await page.evaluate(() => { window.__f = []; window.__lt = 0; new PerformanceObserver(l => { window.__lt += l.getEntries().filter(e => e.duration > 50).length; }).observe({ type: 'longtask', buffered: false }); let last = performance.now(); const tick = t => { window.__f.push(t - last); last = t; if (window.__go) requestAnimationFrame(tick); }; window.__go = true; requestAnimationFrame(tick); });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: d.cpu });
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'gpu'] });
  const m0 = await get();
  await page.evaluate(html => { window.__t0 = performance.now(); Glass.morph(document.getElementById('box'), html); }, to.map((t, i) => '<p data-key="' + i + '">' + t + '</p>').join(''));
  await page.waitForTimeout(80);
  const mid = await page.evaluate(() => ({ spans: document.querySelectorAll('.g-morph-word, .g-morph-char').length, anims: document.getAnimations().length }));
  await page.waitForTimeout(950);
  const m1 = await get();
  const trace = JSON.parse((await browser.stopTracing()).toString());
  const frames = await page.evaluate(() => { window.__go = false; return { f: window.__f.slice(), lt: window.__lt }; });
  await ctx.close();
  const ev = trace.traceEvents || trace;
  let cpu = 0, paint = 0;
  for (const e of ev) { if (e.ph !== 'X' || !e.dur) continue; if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') cpu += e.dur; if (/^(Paint|RasterTask|Raster|ImageDecodeTask)$/.test(e.name)) paint += e.dur; }
  const f = frames.f.slice(1);
  return { ...mid, layers, script: (m1.ScriptDuration - m0.ScriptDuration) * 1000, sl: (m1.RecalcStyleDuration - m0.RecalcStyleDuration + m1.LayoutDuration - m0.LayoutDuration) * 1000, cpu: cpu / 1000, paint: paint / 1000, long: frames.lt, gap: Math.max(0, ...f), frames: f.length, errors };
}

const rows = [];
for (const dev of (process.env.DEV || "desktop,mobile").split(",")) for (const scn of (process.env.SCN || "long,mid,many").split(",")) for (const kit of Object.keys(kits)) {
  const rs = []; for (let i = 0; i < runs; i++) rs.push(await once(kit, scn, dev, true));
  const k = key => med(rs.map(r => r[key]));
  rows.push({ device: dev, scenario: scn, kit, spans: k('spans'), anims: k('anims'), layers: k('layers'), script: r1(k('script')), 'style+layout': r1(k('sl')), cpu: r1(k('cpu')), paint: r1(k('paint')), long: k('long'), gap: r1(k('gap')), frames: k('frames'), errors: rs.flatMap(r => r.errors).length });
}
console.table(rows);
await browser.close(); server.close();
