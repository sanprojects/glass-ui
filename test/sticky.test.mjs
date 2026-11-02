// The head of a table pins to the page while its rows scroll, and leaves with the end of the table: node --test test/sticky.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
let browser, base;
before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/test/sticky.html';
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser.close(); server.close(); });

test('the head pins to the top of the page, then leaves with the table; data-no-sticky keeps it in place', async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(base); await page.waitForFunction(() => window.Glass);
  const top = (id, y) => page.evaluate(async ([id, y]) => { scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('#' + id + ' thead').getBoundingClientRect().top; }, [id, y]);
  const figBottom = await page.evaluate(() => document.getElementById('t').getBoundingClientRect().bottom + scrollY);
  assert.ok(await top('t', 0) > 100, 'at rest it sits where the table starts');
  assert.equal(await top('t', 500), 0, 'scrolled into the table the head is at the top of the page');
  assert.ok(await top('t', figBottom - 20) < 0, 'at the end of the table it goes up with it');
  const offTop = await page.evaluate(() => document.getElementById('off').getBoundingClientRect().top + scrollY);
  assert.ok(await top('off', offTop + 200) < 0, 'a table with data-no-sticky scrolls away');
  await page.close();
});

test('inside a glass panel the head does not pin (a nested blur does not work there)', async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(base); await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => { const s = document.createElement('section'); s.className = 'g-glass'; const f = document.getElementById('t'); f.before(s); s.append(f); });
  const top = await page.evaluate(async () => { scrollTo({ top: 500, behavior: 'instant' }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('#t thead').getBoundingClientRect().top; });
  assert.ok(top < 0, 'the head scrolls away with the rows');
  await page.close();
});

test('at rest the table looks exactly as with the stylesheet of the last commit; the glass comes only while the head is pinned', async () => {
  const before = execFileSync('git', ['show', 'HEAD:glass-ui.css'], { cwd: root, maxBuffer: 1 << 26 }).toString();
  const shot = async (css, theme) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' });
    if (css) await page.route('**/glass-ui.css', r => r.fulfill({ body: css, contentType: 'text/css' }));
    await page.goto(base); await page.waitForFunction(() => window.Glass);
    if (theme) await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const png = await page.locator('#t').screenshot();
    await page.close(); return png;
  };
  for (const theme of ['dark', 'light']) {
    const [a, b] = [await shot(before, theme), await shot(null, theme)], cmp = await browser.newPage();
    // compared in the browser (canvas); a sticky head is a layer of its own, which moves the antialiasing of its text by one level of 255 at a few pixels: that is no change an eye sees
    const worst = await cmp.evaluate(async ([a, b]) => {
      const px = async u => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const [x, y] = [await px(a), await px(b)]; if (x.length !== y.length) return 255;
      // the surface is a layer under the rows now: the arcs of the four corners are antialiased a little differently (a few hundred pixels at most, counted by channel); everywhere else the difference is one level
      let m = 0, off = 0; for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); if (d > 2) { off++; if (d > 64) return 255; } m = Math.max(m, Math.min(d, 2)); }
      return off > 1200 ? 255 : m;
    }, ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]);
    await cmp.close();
    assert.ok(worst <= 2, 'the table at rest looks the same as before (' + theme + '): largest difference of a channel ' + worst);
  }
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(base); await page.waitForFunction(() => window.Glass);
  const stuck = y => page.evaluate(async y => { scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const t = document.querySelector('#t table'); return [t.hasAttribute('data-g-stuck'), getComputedStyle(t.parentElement, '::before').backdropFilter]; }, y);
  const [restOn, restBlur] = await stuck(0), [pinOn, pinBlur] = await stuck(500);
  assert.equal(restOn, false); assert.equal(restBlur, 'none');
  assert.equal(pinOn, true); assert.match(pinBlur, /blur/);
  await page.close();
});
