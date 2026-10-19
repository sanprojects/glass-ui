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
