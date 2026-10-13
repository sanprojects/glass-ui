// The address of a GET form (glass-ui.js, "Address"): node --test test/address.test.mjs   (needs: npm i && npx playwright install chromium)
// A small site is served by page.route: /find/{word}?dict=&repeat= answers with a page whose #result lists what was asked.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://kit.test';
const DICTS = ['nouns', 'all', 'cities'];
let browser, page, requests, slow, errors;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function render(u, fetchMode) {
  const word = decodeURIComponent(u.pathname.split('/')[2] || ''), dict = u.searchParams.get('dict') || 'nouns', repeat = u.searchParams.get('repeat') === '1';
  const options = DICTS.map(d => `<option value="${d}"${d === dict ? ' selected' : ''}>${d}</option>`).join('');
  const main = `<main id="content">
  <div id="slot">ad slot</div>
  ${word === 'outside' ? '<p>a change outside every region</p>' : ''}
  <aside><form id="f" method="get" action="/find/{word}">
    <input name="word" type="search" value="${esc(word)}">
    <select name="dict">${options}</select>
    <label><input type="checkbox" name="repeat" value="1"${repeat ? ' checked' : ''}> repeat</label>
  </form></aside>
  <section id="result"><ol>${[1, 2, 3].map(i => `<li>${esc(word)}-${dict}${repeat ? '-r' : ''}-${i}</li>`).join('')}</ol><a id="next" href="/find/${encodeURIComponent('дом')}?dict=cities">дом</a><script>window.ran = (window.ran || 0) + 1</script></section>
</main>`;
  const head = `<title>${esc(word)} · ${dict}</title><link rel="canonical" href="${ORIGIN}/find/${encodeURIComponent(word)}">`;
  return fetchMode ? `<!doctype html><html><head>${head}</head><body>${main}</body></html>`
    : `<!doctype html><html><head>${head}<link rel="stylesheet" href="/glass-ui.css"><script defer src="/glass-ui.js"></script></head><body class="g-root">${main}</body></html>`;
}

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser.close(); });

beforeEach(async () => {
  requests = []; slow = new Map(); errors = [];
  page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route(ORIGIN + '/**', async route => {
    const r = route.request(), u = new URL(r.url());
    if (u.pathname === '/glass-ui.js' || u.pathname === '/glass-ui.css') return route.fulfill({ body: readFileSync(path.join(root, u.pathname.slice(1))), contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
    const fetchMode = r.headers()['x-g-fetch'] === '1';
    requests.push({ url: u.pathname + u.search, fetchMode });
    const wait = slow.get(decodeURIComponent(u.pathname));
    if (wait) await new Promise(res => setTimeout(res, wait));
    return route.fulfill({ body: render(u, fetchMode), contentType: 'text/html; charset=utf-8' }).catch(() => {});
  });
  await page.goto(ORIGIN + '/find/' + encodeURIComponent('кот'));
  await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => {
    window.marker = 1;   // gone when the page is loaded again
    const ad = document.createElement('ins'); ad.className = 'foreign'; ad.textContent = 'put here by another script';
    document.querySelector('main').appendChild(ad);
    document.getElementById('slot').appendChild(ad.cloneNode(true));
    window.navs = []; document.addEventListener('g:navigate', e => window.navs.push(e.detail));
  });
});

const path_ = () => page.evaluate(() => decodeURIComponent(location.pathname + location.search));
const result = () => page.evaluate(() => [...document.querySelectorAll('#result li')].map(l => l.textContent).join(' '));
const fetches = () => requests.filter(r => r.fetchMode);
const settle = () => page.waitForTimeout(700);

test('typing writes the address at once, one history entry for the whole edit', async () => {
  const len = await page.evaluate(() => history.length);
  await page.click('input[name=word]');
  await page.keyboard.press('End');
  await page.keyboard.type('ик');
  assert.equal(await path_(), '/find/котик');   // no request yet: the address does not wait for one
  assert.equal(fetches().length, 0);
  assert.equal(await page.evaluate(() => history.length), len + 1);
  await settle();
  assert.deepEqual(fetches().map(r => decodeURIComponent(r.url)), ['/find/котик']);
  assert.match(await result(), /^котик-nouns-1/);
  assert.equal(await page.title(), 'котик · nouns');
  assert.deepEqual(errors, []);
});

test('only the region that changed is morphed: what other scripts put into <main> stays', async () => {
  await page.selectOption('select[name=dict]', 'cities');
  await settle();
  assert.match(await result(), /^кот-cities-1/);
  assert.equal(await page.locator('ins.foreign').count(), 2);
  assert.equal(await page.evaluate(() => window.marker), 1);
  assert.equal(await page.evaluate(() => window.ran), 2);   // once with the page, once more with the new #result
  assert.equal(await page.evaluate(() => document.querySelector('link[rel=canonical]').href), ORIGIN + '/find/' + encodeURIComponent('кот'));
});

test('a choice is an entry of its own; a field at its default is left out', async () => {
  const len = await page.evaluate(() => history.length);
  await page.selectOption('select[name=dict]', 'all');
  assert.equal(await path_(), '/find/кот?dict=all');
  await page.check('input[name=repeat]');
  assert.equal(await path_(), '/find/кот?dict=all&repeat=1');
  await page.selectOption('select[name=dict]', 'nouns');   // the first option
  assert.equal(await path_(), '/find/кот?repeat=1');
  assert.equal(await page.evaluate(() => history.length), len + 3);
  await page.fill('input[name=word]', '');
  assert.equal(await path_(), '/find?repeat=1');   // an empty path field: the section itself
});

test('back and forward put the fields and the answer back, without a request', async () => {
  await page.selectOption('select[name=dict]', 'all');
  await settle();
  await page.check('input[name=repeat]');
  await settle();
  const n = fetches().length;
  await page.goBack(); await settle();
  assert.equal(await path_(), '/find/кот?dict=all');
  assert.equal(await page.evaluate(() => document.querySelector('input[name=repeat]').checked), false);
  assert.match(await result(), /^кот-all-1/);
  await page.goBack(); await settle();
  assert.equal(await path_(), '/find/кот');
  assert.equal(await page.evaluate(() => document.querySelector('select[name=dict]').value), 'nouns');
  assert.match(await result(), /^кот-nouns-1/);   // the first address: the page as it came
  await page.goForward(); await settle();
  assert.match(await result(), /^кот-all-1/);
  assert.equal(fetches().length, n);
  assert.equal(await page.evaluate(() => window.marker), 1);
});

test('a link to an address of the form is followed in place', async () => {
  await page.click('#next');
  assert.equal(await path_(), '/find/дом?dict=cities');
  assert.equal(await page.evaluate(() => document.querySelector('input[name=word]').value), 'дом');
  assert.equal(await page.evaluate(() => document.querySelector('select[name=dict]').value), 'cities');
  await settle();
  assert.match(await result(), /^дом-cities-1/);
  assert.equal(await page.evaluate(() => window.marker), 1);
});

test('Enter does not leave the page', async () => {
  await page.fill('input[name=word]', 'лес');
  await page.keyboard.press('Enter');
  await settle();
  assert.match(await result(), /^лес-nouns-1/);
  assert.equal(requests.filter(r => !r.fetchMode).length, 1);   // only the first page
  assert.equal(await page.evaluate(() => window.marker), 1);
});

test('an answer that came late is not shown over a newer one', async () => {
  slow.set('/find/a', 900);
  await page.fill('input[name=word]', 'a');
  await page.waitForTimeout(450);   // its request is on its way
  await page.fill('input[name=word]', 'b');
  await page.waitForTimeout(1500);
  assert.match(await result(), /^b-nouns-1/);
  assert.equal(await path_(), '/find/b');
});

test('a change outside every element with an id loads the page the usual way', async () => {
  await page.fill('input[name=word]', 'outside');
  await page.waitForFunction(() => !window.marker, null, { timeout: 3000 });
  assert.equal(await path_(), '/find/outside');
  assert.match(await result(), /^outside-nouns-1/);
});

test('g:navigate comes once the answer is on the page', async () => {
  await page.selectOption('select[name=dict]', 'all');
  await settle();
  assert.deepEqual(await page.evaluate(() => window.navs), [{ url: ORIGIN + '/find/' + encodeURIComponent('кот') + '?dict=all', title: 'кот · all' }]);
});

test('data-g-url="off" leaves a form alone', async () => {
  await page.route(ORIGIN + '/off', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><script defer src="/glass-ui.js"></script><main><form method="get" action="/off" data-g-url="off"><input name="q"></form></main>' }));
  await page.goto(ORIGIN + '/off');
  await page.waitForFunction(() => window.Glass);
  await page.fill('input[name=q]', 'x');
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/off');
});

test('a form with a submit button waits for it', async () => {
  const ping = host => `<!doctype html><title>ping ${esc(host)}</title><script defer src="/glass-ui.js"></script><main id="m"><form method="get" action="/ping/{host}"><input name="host" value="${esc(host)}"><label><input type="checkbox" name="v6" value="1"> v6</label><button>Ping</button></form><pre id="out">${esc(host) || '-'}</pre></main>`;
  await page.route(ORIGIN + '/ping**', route => { const u = new URL(route.request().url()); requests.push({ url: u.pathname, fetchMode: route.request().headers()['x-g-fetch'] === '1' }); return route.fulfill({ contentType: 'text/html', body: ping(decodeURIComponent(u.pathname.split('/')[2] || '')) }); });
  await page.goto(ORIGIN + '/ping');
  await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => { window.marker = 1; });
  await page.fill('input[name=host]', 'example.org');
  await page.check('input[name=v6]');
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/ping');   // nothing is sent before the button
  assert.equal(fetches().length, 0);
  await page.click('button');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/ping/example.org?v6=1');
  assert.equal(await page.textContent('#out'), 'example.org');
  assert.equal(await page.evaluate(() => window.marker), 1);
});
