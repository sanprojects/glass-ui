// A POST form whose request gets no usable answer (the edge's own 415 page, a 502, a dropped connection) stops its busy line and shows the status:
// node --test test/posterror.test.mjs   (needs: npm i && npx playwright install chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://kit.test';
let browser, page, mode;
const PAGE = `<!doctype html><html><head><link rel="stylesheet" href="/glass-ui.css"><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script></head><body class="g-root"><main id="m"><article><form id="f" method="post" action="/login"><input name="email" value="a@b.c"><button>Go</button></form></article></main></body></html>`;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(ORIGIN + '/**', route => {
    const u = new URL(route.request().url());
    if (['/glass-ui.js', '/glass-ui.css', '/glass-morph.js'].includes(u.pathname)) return route.fulfill({ body: readFileSync(path.join(root, u.pathname.slice(1))), contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
    if (u.pathname === '/login' && route.request().method() === 'POST') {
      if (mode === 'abort') return route.abort();
      const [status, body, type] = mode === '415' ? [415, '<html><body><h1>415 Unsupported Media Type</h1></body></html>', 'text/html'] : [502, 'bad gateway', 'text/plain'];
      return route.fulfill({ status, body, contentType: type });
    }
    return route.fulfill({ body: PAGE, contentType: 'text/html; charset=utf-8' });
  });
  await page.goto(ORIGIN + '/login');
});
after(() => browser.close());

const submit = async m => {
  mode = m;
  await page.evaluate(() => { document.querySelector('[data-g-error]')?.remove(); });
  await page.click('#f button');
  await page.waitForSelector('#f [data-g-error]', { timeout: 3000 });
  return page.evaluate(() => ({ text: document.querySelector('#f [data-g-error]').textContent, busy: !!document.querySelector('[aria-busy="true"], [data-g-busy]'), url: location.pathname }));
};

test('an HTML error page with no <main> (415) shows the status, the line is off, the page stays', async () => {
  const r = await submit('415');
  assert.match(r.text, /415/);
  assert.equal(r.url, '/login');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => !!document.querySelector('[aria-busy="true"], [data-g-busy]')), false);
});

test('a non-HTML error (502) shows its status', async () => { assert.match((await submit('502')).text, /502/); });

test('no answer at all: an error with no status, the line is off', async () => {
  const r = await submit('abort');
  assert.match(r.text, /No answer/);
  assert.equal(r.busy, false);
});

test('g:error is cancelable: the page shows it itself', async () => {
  await page.evaluate(() => { document.querySelector('[data-g-error]')?.remove(); window.seen = null; document.getElementById('f').addEventListener('g:error', e => { window.seen = e.detail.status; e.preventDefault(); }, { once: true }); });
  mode = '415';
  await page.click('#f button');
  await page.waitForFunction(() => window.seen);
  assert.equal(await page.evaluate(() => window.seen), 415);
  assert.equal(await page.evaluate(() => !!document.querySelector('[data-g-error]')), false);
});
