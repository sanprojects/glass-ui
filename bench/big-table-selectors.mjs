// Which selectors cost the style recalc of a big table written anew (see big-table.mjs): Chrome's selector stats from a trace.
//   node bench/big-table-selectors.mjs [rows]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), rows = +(process.argv[2] || 3000);
const html = fs.readFileSync(path.join(root, 'bench/big-table.mjs'), 'utf8');   /* the same page: taken from big-table.mjs */
const page_html = eval('`' + html.split('const page_html = `')[1].split('`;\nconst types')[0].replace(/\$\{rows\}/g, rows).replace(/\$\{watched \? ' data-g-morph' : ''\}/g, ' data-g-morph') + '`');
const types = { '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page_html); } fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000);
await browser.startTracing(page, { categories: ['disabled-by-default-blink.debug', 'devtools.timeline', 'disabled-by-default-devtools.timeline'] });
await page.evaluate(() => window.refresh(1)); await page.waitForTimeout(2500);
const trace = JSON.parse((await browser.stopTracing()).toString());
const stats = new Map();
for (const e of trace.traceEvents) {
  const s = e.args && e.args.selector_stats; if (!s) continue;
  for (const x of s.selector_timings || []) { const v = stats.get(x.selector) || { us: 0, attempts: 0, matches: 0 }; v.us += x['elapsed (us)'] || 0; v.attempts += x.match_attempts || 0; v.matches += x.match_count || 0; stats.set(x.selector, v); }
}
const total = [...stats.values()].reduce((a, v) => a + v.us, 0);
console.log('selectors', stats.size, 'total', Math.round(total / 1000), 'ms');
[...stats].sort((a, b) => b[1].us - a[1].us).slice(0, 15).forEach(([sel, v]) => console.log(String(Math.round(v.us / 1000)).padStart(6), 'ms', String(v.attempts).padStart(8), 'tries', String(v.matches).padStart(7), 'hits ', sel.slice(0, 200)));
await browser.close(); server.close();
