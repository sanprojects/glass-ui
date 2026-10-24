// The frame of a themed page (body.g-root): the footer sits at the bottom of the screen, a fixed shell scrolls inside itself: node --test test/frame.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
let browser, base;

before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/test/frame.html';
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser.close(); server.close(); });

/* a page of the given case on a screen of 1280 x 600 */
async function open(c) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
  await page.goto(base + '?case=' + c); await page.waitForLoadState('load');
  return page;
}
const measure = page => page.evaluate(() => {
  const gap = parseFloat(getComputedStyle(document.body).paddingBottom);
  const footer = document.getElementById('footer').getBoundingClientRect();
  const work = document.getElementById('work');
  return {
    gap, innerH: innerHeight,
    docScroll: document.documentElement.scrollHeight - innerHeight,
    footerBottom: footer.bottom,
    workScrolls: !!work && work.scrollHeight > work.clientHeight,
  };
});

test('a fixed shell: the document does not scroll, the footer stays at the bottom, the shell scrolls inside itself', async () => {
  const page = await open('fixed');
  const m = await measure(page);
  assert.ok(m.docScroll <= 1, 'no document scroll: ' + m.docScroll);
  assert.ok(Math.abs(m.footerBottom - (m.innerH - m.gap)) <= 1, 'footer bottom ' + m.footerBottom + ' is at innerHeight - gap ' + (m.innerH - m.gap));
  assert.equal(m.workScrolls, true, 'the shell content scrolls inside the shell');
  await page.close();
});

test('a short page: the footer sits at the bottom of the screen', async () => {
  const page = await open('short');
  const m = await measure(page);
  assert.ok(m.docScroll <= 1, 'no document scroll: ' + m.docScroll);
  assert.ok(Math.abs(m.footerBottom - (m.innerH - m.gap)) <= 1, 'footer bottom ' + m.footerBottom + ' is at innerHeight - gap ' + (m.innerH - m.gap));
  await page.close();
});

test('a long page: the document scrolls, the footer comes after the content', async () => {
  const page = await open('long');
  const m = await measure(page);
  assert.ok(m.docScroll > 100, 'the page scrolls: ' + m.docScroll);
  assert.ok(m.footerBottom > m.innerH, 'the footer is below the fold');
  await page.close();
});

/* the frame is data-g-fixed on <body>: glass-ui.js sets it for a fixed shell that is in the page, also one put in later, and takes back only what it set */
test('a shell put in later makes the frame, taken out it gives it back; data-g-fixed from the server stays', async () => {
  const page = await open('short');
  const has = () => page.evaluate(() => document.body.hasAttribute('data-g-fixed'));
  assert.equal(await has(), false, 'no shell: no frame');
  await page.evaluate(() => { const s = document.createElement('div'); s.className = 'g-shell g-shell--tools'; s.id = 'late'; s.innerHTML = '<aside>p</aside><main>w</main>'; document.querySelector('main').append(s); });
  await page.waitForFunction(() => document.body.hasAttribute('data-g-fixed'));
  const m = await measure(page);
  assert.ok(m.docScroll <= 1, 'the frame is one screen tall: ' + m.docScroll);
  await page.evaluate(() => document.getElementById('late').remove());
  await page.waitForFunction(() => !document.body.hasAttribute('data-g-fixed'));
  await page.evaluate(() => { const s = document.createElement('div'); s.className = 'g-shell'; s.innerHTML = '<aside>p</aside><main>w</main>'; s.id = 'attr'; document.querySelector('main').append(s); s.setAttribute('data-fixed', ''); });
  await page.waitForFunction(() => document.body.hasAttribute('data-g-fixed'));
  await page.evaluate(() => document.getElementById('attr').remove());
  await page.waitForFunction(() => !document.body.hasAttribute('data-g-fixed'));
  await page.evaluate(() => { document.body.setAttribute('data-g-fixed', ''); });
  await page.evaluate(() => { const s = document.createElement('div'); s.className = 'g-shell g-shell--tools'; s.id = 'late'; document.querySelector('main').append(s); s.remove(); });
  await page.waitForTimeout(100);
  assert.equal(await has(), true, 'the server\'s attribute is not taken back');
  await page.close();
});
