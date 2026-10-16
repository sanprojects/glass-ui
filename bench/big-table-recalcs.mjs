// The style recalcs and layouts of one refresh of a big table on a watched page (see big-table.mjs), with what forced each (a trace).
//   node bench/big-table-recalcs.mjs [rows]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), rows = +(process.argv[2] || 3000);
const src = fs.readFileSync(path.join(root, 'bench/big-table.mjs'), 'utf8');
const page_html = eval('`' + src.split('const page_html = `')[1].split('`;\nconst types')[0].replace(/\$\{rows\}/g, rows).replace(/\$\{watched \? ' data-g-morph' : ''\}/g, process.env.WATCH === '0' ? '' : ' data-g-morph') + '`');
const types = { '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page_html); } fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000);
await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack'] });
await page.evaluate(() => window.refresh(1)); await page.waitForTimeout(2500);
const ev = JSON.parse((await browser.stopTracing()).toString()).traceEvents.filter(e => (e.name === 'UpdateLayoutTree' || e.name === 'Layout') && e.ph === 'X' && e.dur > 2000);
const by = new Map();
ev.forEach(e => { const st = (e.args && (e.args.beginData || e.args.data) && (e.args.beginData || e.args.data).stackTrace) || []; const top = st.slice(0, 3).map(f => (f.functionName || '?') + ':' + f.lineNumber).join(' < ') || '(frame)'; const k = e.name + ' ' + top; const v = by.get(k) || [0, 0]; v[0]++; v[1] += e.dur / 1000; by.set(k, v); });
[...by].sort((a, b) => b[1][1] - a[1][1]).slice(0, 14).forEach(([k, [n, ms]]) => console.log(String(Math.round(ms)).padStart(6), 'ms', String(n).padStart(4), 'x ', k.slice(0, 170)));
await browser.close(); server.close();
