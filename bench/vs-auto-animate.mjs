// glass-morph against auto-animate on one list (bench/list.html), in Chrome:  node bench/vs-auto-animate.mjs [n,n,...] [runs]
// (needs: npm i; CHROMIUM_PATH=/path/to/chrome for a system Chrome)
// Per mode (none = no animation, aa = auto-animate on the list, box = the list in a box glass-morph watches, page = <body data-g-morph>),
// list size and operation, the median of `runs` operations:
//   sync    ms from the write until the observers are done (the page's write + the library's reaction, before anything is drawn)
//   work    ms the main thread was busy in the 700 ms after the write (scripts, styles, layout, paint; CDP Performance TaskDuration)
//   frame   the longest gap between two frames in those 700 ms (16.7 = smooth)
//   anims   animations running 30 ms after the write
// and, once per list: idle = ms of main-thread work per second while nothing changes.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => fs.readFile(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)), (e, b) => {
  if (e) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(b);
}));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/bench/list.html';
const sizes = (process.argv[2] || '50,300,1000').split(',').map(Number), runs = +(process.argv[3] || 6);
const modes = ['none', 'aa', 'box', 'page'], ops = ['shuffle', 'churn', 'top', 'html'];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r1 = x => Math.round(x * 10) / 10;
const rows = [];
for (const n of sizes) for (const mode of modes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value * 1000;
  await page.goto(base + '?mode=' + mode + '&n=' + n);
  await page.waitForFunction(() => window.bench && window.bench.ready);
  await page.waitForTimeout(1500);
  for (const op of ops) {
    const got = { sync: [], work: [], frame: [], anims: [] };
    for (let i = 0; i < runs; i++) {
      const b0 = await busy();
      const r = await page.evaluate(async op => {
        const stamps = [];
        const t0 = performance.now();
        window.bench.ops[op]();
        await null;   /* after the observers: they were queued by the write */
        const sync = performance.now() - t0;
        let anims = 0;
        setTimeout(() => { anims = document.getAnimations().length; }, 30);
        await new Promise(done => { const f = t => { stamps.push(t); if (t - t0 < 700) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
        const gaps = stamps.slice(1).map((t, k) => t - stamps[k]);
        return { sync, frame: Math.max(stamps[0] - t0, ...gaps), anims };
      }, op);
      got.work.push((await busy()) - b0);
      got.sync.push(r.sync); got.frame.push(r.frame); got.anims.push(r.anims);
      await page.waitForTimeout(400);
    }
    const row = { n, mode, op, sync: r1(med(got.sync)), work: r1(med(got.work)), frame: r1(med(got.frame)), anims: med(got.anims) };
    rows.push(row); console.log(JSON.stringify(row));
  }
  await page.waitForTimeout(1500);
  const i0 = await busy(); await page.waitForTimeout(4000); const idle = r1(((await busy()) - i0) / 4);
  rows.push({ n, mode, op: 'idle', idle }); console.log(JSON.stringify({ n, mode, idle, errors }));
  await page.close();
}
console.log('\n n     op       ' + modes.map(m => (m + ': sync/work/frame/anims').padEnd(30)).join(''));
for (const n of sizes) for (const op of ops) console.log(String(n).padEnd(6), op.padEnd(8), modes.map(m => { const r = rows.find(x => x.n === n && x.mode === m && x.op === op); return `${r.sync} / ${r.work} / ${r.frame} / ${r.anims}`.padEnd(30); }).join(''));
for (const n of sizes) console.log(String(n).padEnd(6), 'idle ms/s', modes.map(m => (m + ' ' + rows.find(x => x.n === n && x.mode === m && x.op === 'idle').idle).padEnd(14)).join(''));
await browser.close(); server.close();
