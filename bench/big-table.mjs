// A big table written anew on a watched page (<body data-g-morph>), as sanstv.ru/admin/online does every 5 s: how long the main thread
// is busy after one refresh, and where (CPU profile, the top functions by self time).   node bench/big-table.mjs [rows] [refreshes]
// The page is served from this folder (the kit's sources); the rows have the cells of /admin/online (a flag, links, a count).
// MODE=morph patches the table with Glass.morph, MODE=diff puts in only what changed, instead of writing it anew; WATCH=0 leaves the page unwatched.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = +(process.argv[2] || 14000), refreshes = +(process.argv[3] || 3), watched = process.env.WATCH !== '0';
const page_html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/glass-ui.css"><link rel="stylesheet" href="/glass-morph.css">
<script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script>
<style>#table { table-layout: fixed; width: 100%; } .table td { white-space: pre; }</style></head>
<body class="g-root"${watched ? ' data-g-morph' : ''}><main><div id="box"></div></main>
<script>
  const ROWS = ${rows};
  function table(seed) {
    let h = '<table id="table" class="table" data-no-fit><thead><tr><th colspan=7>Users ' + ROWS + '</th></tr></thead><tbody>';
    for (let i = 0; i < ROWS; i++) {
      const gone = (i + seed) % 50 === 0, ip = '10.' + (i >> 16 & 255) + '.' + (i >> 8 & 255) + '.' + (i & 255) + (gone ? '.' + seed : '');
      h += '<tr id="' + ip + '"><td><span class="flag ru" title="RU, Moscow"></span> <a target="_blank" title="Mozilla/5.0" href="/ip?ip=' + ip + '">' + ip + '</a></td>'
        + '<td>HTTP/2</td><td><e title="ru-RU">ru</e></td><td>Moscow</td><td><a title="history">' + ((i * 7 + seed) % 40) + '</a></td>'
        + '<td><a target="_blank" href="https://ya.ru/">ya.ru </a></td><td><a target="_blank" href="/find-words/word' + i + '">/find-words/word' + i + '</a> </td></tr>';
    }
    return h + '</tbody></table>';
  }
  document.getElementById('box').innerHTML = table(0);
  /* MODE=morph: the table is patched with Glass.morph; MODE=diff: the page puts in only what changed (as admin/online.php does now: the rows by id,
     a cell written only when it differs, a row moved only when it is not in its place, the gone ones taken out); else it is written anew (replaceWith) */
  /* the same shape: only the texts and the attributes that differ are written (a number that changed is a text that changed: it turns) */
  const sync = (a, b) => {
    if (a.nodeType === 3 && b.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return true; }
    if (a.nodeType !== 1 || a.nodeName !== b.nodeName || a.childNodes.length !== b.childNodes.length) return false;
    for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    for (let i = 0; i < b.childNodes.length; i++) if (!sync(a.childNodes[i], b.childNodes[i])) a.replaceChild(b.childNodes[i].cloneNode(true), a.childNodes[i]);
    return true;
  };
  window.patchRows = (live, next) => {
    const lb = live.tBodies[0], nb = next.tBodies[0], old = new Map([...lb.rows].filter(r => r.id).map(r => [r.id, r]));
    const kept = new Set([...nb.rows].map(r => r.id).filter(Boolean)), next_ = () => { while (cursor && cursor.id && !kept.has(cursor.id)) cursor = cursor.nextElementSibling; };   /* a row that goes is passed by: what follows is in its place */
    let cursor = lb.firstElementChild;
    for (const nr of [...nb.rows]) {
      next_();
      const r = nr.id && old.get(nr.id);
      if (r) { old.delete(nr.id); for (let i = 0; i < nr.cells.length; i++) if (r.cells[i] && r.cells[i].innerHTML !== nr.cells[i].innerHTML && !sync(r.cells[i], nr.cells[i])) r.cells[i].innerHTML = nr.cells[i].innerHTML; }
      const row = r || nr;
      if (row === cursor) cursor = cursor.nextElementSibling; else lb.insertBefore(row, cursor);
    }
    old.forEach(r => r.remove());
  };
  window.refresh = seed => { const t = document.createElement('template'); t.innerHTML = table(seed); const next = t.content.querySelector('table'), live = document.getElementById('table');
    if (${JSON.stringify(process.env.MODE === 'morph')}) Glass.morph(live, next.innerHTML); else if (${JSON.stringify(process.env.MODE === 'diff')}) window.patchRows(live, next); else live.replaceWith(next); };
</script></body></html>`;
const types = { '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page_html); }
  fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Performance.enable');
const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m => /^(TaskDuration|RecalcStyleDuration|LayoutDuration|ScriptDuration)$/.test(m.name)).map(m => [m.name, m.value * 1000]));
const busy = async () => (await metric()).TaskDuration;
for (let i = 1; i <= refreshes; i++) {
  const m0 = await metric(), b0 = m0.TaskDuration;
  if (i === refreshes) await cdp.send('Profiler.start');
  await page.evaluate(s => { window.__t0 = performance.now(); window.refresh(s); }, i);
  await page.waitForTimeout(4000);
  const prof = i === refreshes ? (await cdp.send('Profiler.stop')).profile : null;
  const m1 = await metric(), d = k => Math.round(m1[k] - m0[k]);
  console.log(`refresh ${i}: main thread busy ${d('TaskDuration')} ms in the 4 s after it (styles ${d('RecalcStyleDuration')}, layout ${d('LayoutDuration')}, script ${d('ScriptDuration')})` + (watched ? '' : ' (not watched)'));
  if (prof) {
    const self = new Map(), dt = prof.timeDeltas, byId = new Map(prof.nodes.map(n => [n.id, n]));
    prof.samples.forEach((id, k) => { const n = byId.get(id), f = n.callFrame, key = (f.functionName || '(anonymous)') + ' ' + f.url.split('/').pop() + ':' + (f.lineNumber + 1); self.set(key, (self.get(key) || 0) + (dt[k] || 0) / 1000); });
    [...self].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, ms]) => console.log('   ', String(Math.round(ms)).padStart(6), 'ms', k));
  }
}
await browser.close(); server.close();
