// Tabs keep the address, the ruler and the tabs agree on it, the time counts: node --test test/hash.test.mjs
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
let browser, base; const errors = [];

before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/test/hash.html';
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser.close(); server.close(); });

/* a fresh page on the given address, the kit mounted at once (as the idle pass would do) */
async function open(hash = '') {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + hash); await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => Glass.init(document)); await page.waitForTimeout(100);
  return page;
}
const shown = page => page.evaluate(() => ({
  visitors: document.getElementById('visitors').getAttribute('aria-selected'),
  messages: document.getElementById('messages').getAttribute('aria-selected'),
  hash: location.hash,
  marks: document.querySelectorAll('#box .g-ruler__seg:not([hidden])').length,
}));

test('a reload keeps the tab named in the address', async () => {
  const page = await open('#messages');
  assert.equal((await shown(page)).messages, 'true');
  await page.reload(); await page.waitForFunction(() => window.Glass); await page.evaluate(() => Glass.init(document));
  const s = await shown(page);
  assert.equal(s.messages, 'true'); assert.equal(s.visitors, 'false'); assert.equal(s.hash, '#messages');
  await page.close();
});

test('a click on a tab writes its id into the address without a history entry', async () => {
  const page = await open();
  const before = await page.evaluate(() => history.length);
  await page.click('#messages');
  let s = await shown(page);
  assert.equal(s.hash, '#messages'); assert.equal(s.messages, 'true');
  assert.equal(await page.evaluate(() => history.length), before);
  await page.click('#visitors');
  assert.equal((await shown(page)).hash, '#visitors');
  await page.close();
});

test('a place inside a panel opens its tab and scrolls there', async () => {
  const page = await open('#messages');
  await page.evaluate(() => { location.hash = '#svc-blog'; });   // what a link or the ruler does
  await page.waitForTimeout(200);
  const s = await shown(page);
  assert.equal(s.visitors, 'true'); assert.equal(s.messages, 'false');
  assert.ok(await page.evaluate(() => document.getElementById('box').scrollTop) > 0, 'the section is scrolled to');
  await page.close();
});

test('a click on a tab does not take a place inside the panel out of the address', async () => {
  const page = await open('#svc-shop');
  await page.click('#visitors');
  assert.equal((await shown(page)).hash, '#svc-shop');
  await page.close();
});

test('a tablist whose panels are missing does not touch the address', async () => {
  const page = await open();
  await page.click('#loose > button:nth-child(2)');
  assert.equal((await shown(page)).hash, '');
  await page.close();
});

test('the ruler is read again when the address moves to a tab it could not see', async () => {
  const page = await open('#messages');
  assert.equal((await shown(page)).marks, 0, 'no marks on the Messages tab');
  await page.evaluate(() => { location.hash = '#svc-shop'; });
  await page.waitForTimeout(200);
  assert.equal((await shown(page)).marks, 2, 'the two sections of Visitors have their marks');
  await page.close();
});

test('elapsed and remaining time show their number in a drum span and count', async () => {
  const page = await open('#messages');
  const read = () => page.evaluate(() => ({ ago: document.querySelector('#ago .g-age__n').textContent + ' ' + document.querySelector('#ago .g-age__u').textContent, left: document.querySelector('#left .g-age__n').textContent + ' ' + document.querySelector('#left .g-age__u').textContent }));
  const first = await read();
  assert.deepEqual(first, { ago: '45 s', left: '30 s' });
  await page.waitForFunction(() => document.querySelector('#ago .g-age__n').textContent !== '45', null, { timeout: 3000 });
  assert.deepEqual(await read(), { ago: '46 s', left: '29 s' }, 'one second later');
  await page.close();
});

test('the times count on the server clock once the page has it', async () => {
  const page = await open('#messages');
  await page.evaluate(() => Glass.syncClock(Date.now() + 120000, Date.now()));   // the browser runs 2 min behind the server
  const s = await page.evaluate(() => ({ ago: document.querySelector('#ago .g-age__n').textContent + ' ' + document.querySelector('#ago .g-age__u').textContent, left: document.querySelector('#left .g-age__n').textContent + ' ' + document.querySelector('#left .g-age__u').textContent }));
  assert.deepEqual(s, { ago: '3 min', left: '2 min' }, 'the server sees 165 s and 90 s, the rounded minutes are 3 and 2');
  await page.close();
});

test('a re-sync moves the numbers silently: only a tick drums', async () => {
  const page = await open('#messages');
  const drums = await page.evaluate(async () => {
    let n = 0;
    const mo = new MutationObserver(rs => { for (const r of rs) if (r.target.classList.contains('g-drum')) n++; });
    mo.observe(document.getElementById('ago'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    for (let k = 0; k < 4; k++) { Glass.syncClock(Date.now() + 120000 + (k % 2) * 1000, Date.now()); await new Promise(r => setTimeout(r, 30)); }
    mo.disconnect();
    return n;
  });
  assert.equal(drums, 0, 'no drum from the re-sync');
  await page.close();
});

test('a tick that changes the number drums it; a hidden time is not counted', async () => {
  const page = await open('#messages');
  assert.equal(await page.evaluate(() => document.querySelector('#ago .g-age__n').classList.contains('g-drum')), false);
  await page.waitForFunction(() => document.querySelector('#ago .g-age__n').textContent !== '45', null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => document.querySelector('#ago .g-age__n').classList.contains('g-drum')), true, 'the tick drums');
  await page.close();
  const off = await open('#visitors');   // the Messages panel is hidden: its times are not on screen, so no tick touches them
  await off.waitForTimeout(2200);
  assert.equal(await off.evaluate(() => document.querySelector('#ago .g-age__n').textContent), '45', 'a hidden time does not count');
  await off.click('#messages');
  await off.waitForTimeout(200);
  assert.notEqual(await off.evaluate(() => document.querySelector('#ago .g-age__n').textContent), '45', 'shown again, it is brought up to date');
  await off.close();
});

test('the page runs without script errors', () => { assert.deepEqual(errors, []); });
