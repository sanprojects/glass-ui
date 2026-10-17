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
let browser, page, requests, slow, errors, parts;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/* what the answer writes into the form (its id with X-G-Form): an <output> of the result, a hidden field the server picks */
const formParts = (word, dict) => `<output id="sum">3 × ${dict}</output><input type="hidden" name="seed" value="${dict}-${word.length}">`;
function render(u, fetchMode, form = '') {
  const word = decodeURIComponent(u.pathname.split('/')[2] || ''), dict = u.searchParams.get('dict') || 'nouns', repeat = u.searchParams.get('repeat') === '1';
  const options = DICTS.map(d => `<option value="${d}"${d === dict ? ' selected' : ''}>${d}</option>`).join('');
  const main = `<main id="content">
  <div id="slot">ad slot</div>
  ${word === 'outside' ? '<p>a change outside every region</p>' : ''}
  <aside><form id="f" method="get" action="/find/{word}">
    <input name="word" type="search" value="${esc(word)}">
    <select name="dict"${parts ? ' data-g-select data-icon="book-open"' : ''}>${options}</select>
    <label><input type="checkbox" name="repeat" value="1"${repeat ? ' checked' : ''}> repeat</label>
    ${parts ? formParts(word, dict) : ''}
  </form></aside>
  <section id="result"><ol>${[1, 2, 3].map(i => `<li>${esc(word)}-${dict}${repeat ? '-r' : ''}-${i}</li>`).join('')}</ol><a id="next" href="/find/${encodeURIComponent('дом')}?dict=cities">дом</a><script>window.ran = (window.ran || 0) + 1</script></section>
</main>`;
  const asked = fetchMode && parts && form;   /* X-G-Form: the form goes back as "as you have it", with only what the answer writes into it */
  const page = asked === 'f' ? main.replace(/<form id="f"[^]*?<\/form>/, `<form id="f" data-g-same>${formParts(word, dict)}</form>`) : main;
  const head = `<title>${esc(word)} · ${dict}</title><link rel="canonical" href="${ORIGIN}/find/${encodeURIComponent(word)}">`;
  return fetchMode ? `<!doctype html><html><head>${head}</head><body>${page}</body></html>`
    : `<!doctype html><html><head>${head}<link rel="stylesheet" href="/glass-ui.css"><link rel="stylesheet" href="/glass-morph.css"><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script></head><body class="g-root">${main}</body></html>`;
}

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser.close(); });

beforeEach(async () => {
  requests = []; slow = new Map(); errors = []; parts = false;
  page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route(ORIGIN + '/**', async route => {
    const r = route.request(), u = new URL(r.url());
    if (['/glass-ui.js', '/glass-ui.css', '/glass-morph.js', '/glass-morph.css'].includes(u.pathname)) return route.fulfill({ body: readFileSync(path.join(root, u.pathname.slice(1))), contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
    const fetchMode = r.headers()['x-g-fetch'] === '1';
    const form = r.headers()['x-g-form'] || '';
    requests.push({ url: u.pathname + u.search, fetchMode, form });
    const wait = slow.get(decodeURIComponent(u.pathname));
    if (wait) await new Promise(res => setTimeout(res, wait));
    return route.fulfill({ body: render(u, fetchMode, form), contentType: 'text/html; charset=utf-8' }).catch(() => {});
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
  await page.route(ORIGIN + '/off', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main><form method="get" action="/off" data-g-url="off"><input name="q"></form></main>' }));
  await page.goto(ORIGIN + '/off');
  await page.waitForFunction(() => window.Glass);
  await page.fill('input[name=q]', 'x');
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/off');
});

test('a form with a submit button waits for it', async () => {
  const ping = host => `<!doctype html><title>ping ${esc(host)}</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main id="m"><form method="get" action="/ping/{host}"><input name="host" value="${esc(host)}"><label><input type="checkbox" name="v6" value="1"> v6</label><button>Ping</button></form><pre id="out">${esc(host) || '-'}</pre></main>`;
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
  const entries = await page.evaluate(() => history.length);
  await page.click('button');   // the same address once more: asked anew (a ping, a random pick), not taken from what is on the screen
  await page.waitForTimeout(500);
  assert.equal(fetches().filter(r => r.url === '/ping/example.org').length, 2);
  assert.equal(await page.evaluate(() => history.length), entries);   // and no new history entry
});

test('a submit a script sends for the fields back / forward put back is not a new pick', async () => {
  // the page sends the form when a box changes (submit on change), so also when the kit puts the box back with the address
  const ping = host => `<!doctype html><title>ping ${esc(host)}</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><script>document.addEventListener('change', e => { if (e.target.type === 'checkbox') setTimeout(() => e.target.form.requestSubmit(), 30); });</script><main id="m"><form method="get" action="/ping/{host}"><input name="host" value="${esc(host)}"><label><input type="checkbox" name="v6" value="1"> v6</label><button>Ping</button></form><pre id="out">${esc(host) || '-'}</pre></main>`;
  await page.route(ORIGIN + '/ping**', route => { const u = new URL(route.request().url()); requests.push({ url: u.pathname + u.search, fetchMode: route.request().headers()['x-g-fetch'] === '1' }); return route.fulfill({ contentType: 'text/html', body: ping(decodeURIComponent(u.pathname.split('/')[2] || '')) }); });
  await page.goto(ORIGIN + '/ping');
  await page.waitForFunction(() => window.Glass);
  await page.fill('input[name=host]', 'a.org'); await page.check('input[name=v6]'); await page.waitForTimeout(500);
  await page.fill('input[name=host]', 'b.org'); await page.uncheck('input[name=v6]'); await page.waitForTimeout(500);
  assert.deepEqual(fetches().map(r => r.url), ['/ping/a.org?v6=1', '/ping/b.org']);
  await page.goBack(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/ping/a.org?v6=1');
  assert.equal(await page.evaluate(() => document.querySelector('input[name=v6]').checked), true);
  assert.deepEqual(fetches().map(r => r.url), ['/ping/a.org?v6=1', '/ping/b.org']);   // seen before: no request, and the submit of the page asks nothing anew
  await page.click('button'); await page.waitForTimeout(500);   // the button still asks anew
  assert.deepEqual(fetches().map(r => r.url), ['/ping/a.org?v6=1', '/ping/b.org', '/ping/a.org?v6=1']);
});

test('the clear cross is one more button: the answer with that field empty comes at once', async () => {
  const cross = () => page.evaluate(() => { const i = document.querySelector('input[name=word], input[name=host]'), w = document.createElement('span'); w.className = 'g-input-wrap'; i.replaceWith(w); w.append(i); w.insertAdjacentHTML('beforeend', '<button class="g-input-end" data-icon="x" data-g-clear-input></button>'); });
  await cross();
  const entries = await page.evaluate(() => history.length);
  await page.click('[data-g-clear-input]');
  await page.waitForTimeout(150);   // less than the pause in typing
  assert.equal(await path_(), '/find');
  assert.deepEqual(fetches().map(r => r.url), ['/find']);
  assert.equal(await page.evaluate(() => history.length), entries + 1);   // an entry: back is the word again
  await page.waitForTimeout(300);
  assert.match(await result(), /^-nouns-1/);
  // a form with a submit button: the cross sends it, as its button does
  const ping = host => `<!doctype html><title>ping ${esc(host)}</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main id="m"><form method="get" action="/ping/{host}"><input name="host" value="${esc(host)}"><button>Ping</button></form><pre id="out">${esc(host) || '-'}</pre></main>`;
  await page.route(ORIGIN + '/ping**', route => { const u = new URL(route.request().url()); requests.push({ url: u.pathname, fetchMode: route.request().headers()['x-g-fetch'] === '1' }); return route.fulfill({ contentType: 'text/html', body: ping(decodeURIComponent(u.pathname.split('/')[2] || '')) }); });
  await page.goto(ORIGIN + '/ping/example.org');
  await page.waitForFunction(() => window.Glass);
  await cross();
  await page.click('[data-g-clear-input]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/ping');
  assert.equal(await page.textContent('#out'), '-');
  assert.deepEqual(errors, []);
});

test('a box in the header whose answer the page works out itself: the address is the form\'s, nothing is asked', async () => {
  const home = q => `<!doctype html><title>home</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><nav><form action="/"><input name="q" type="search" value="${esc(q)}"></form></nav><main id="m"><p id="shown"></p><a id="page" href="/about">about</a></main><script>
    const f = document.querySelector('form'), shown = document.getElementById('shown'), show = () => { shown.textContent = f.q.value; };
    show();
    f.addEventListener('g:answer', e => { e.preventDefault(); show(); });
  </script>`;
  await page.route(ORIGIN + '/**', route => {
    const u = new URL(route.request().url());
    if (/\.(js|css)$/.test(u.pathname)) return route.fallback();
    requests.push({ url: decodeURIComponent(u.pathname), fetchMode: route.request().headers()['x-g-fetch'] === '1' });
    return route.fulfill({ contentType: 'text/html', body: home(u.searchParams.get('q') || '') });
  });
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => window.Glass);
  await page.click('input[name=q]');
  await page.keyboard.type('ко');
  assert.equal(await path_(), '/?q=ко');   // the address of the form
  assert.equal(await page.textContent('#shown'), 'ко');   // at once, with no pause and no request
  await page.evaluate(() => { const i = document.querySelector('input[name=q]'); i.value = 'дом'; i.dispatchEvent(new Event('change', { bubbles: true })); });   // a script's choice: an entry
  assert.equal(await path_(), '/?q=дом');
  assert.equal(await page.textContent('#shown'), 'дом');
  await page.goBack();
  await page.waitForTimeout(100);
  assert.equal(await path_(), '/?q=ко');
  assert.equal(await page.inputValue('input[name=q]'), 'ко');
  assert.equal(await page.textContent('#shown'), 'ко');
  await page.click('#page');   // a link to another page is the browser's
  await page.waitForURL(ORIGIN + '/about');
  assert.deepEqual(fetches(), []);
  assert.deepEqual(errors, []);
});

test('a form with no action, or whose submit the page cancels, is the page\'s', async () => {
  const own = '<!doctype html><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main><form id="a" method="get"><input name="q"></form>'
    + '<form id="b" method="get" action="/own"><input name="w"><button>Go</button></form><p id="out"></p></main>'
    + '<script>document.getElementById("b").addEventListener("submit", e => { e.preventDefault(); out.textContent += "page:" + e.target.w.value + ";"; });</script>';
  await page.route(ORIGIN + '/own**', route => { requests.push({ url: new URL(route.request().url()).pathname, fetchMode: route.request().headers()['x-g-fetch'] === '1' }); return route.fulfill({ contentType: 'text/html', body: own }); });
  await page.goto(ORIGIN + '/own');
  await page.waitForFunction(() => window.Glass);
  await page.fill('#a input', 'x');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/own');   // no action: not bound
  await page.fill('#b input', 'y');
  await page.click('#b button');
  await page.fill('#b input', 'z');
  await page.click('#b button');
  await page.waitForTimeout(500);
  assert.equal(await page.textContent('#out'), 'page:y;page:z;');   // the page's handler gets every submit
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/own');
  assert.equal(fetches().length, 0);
});

test('a POST form of the page is sent in the background: the focus and what is typed stay, the address stays', async () => {
  const posted = [];
  const page2 = (text, extra) => `<!doctype html><title>stat</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main id="m"><aside><form id="p" method="post" action="/stat"><textarea name="t">${esc(text)}</textarea><input name="u"></form></aside>${extra || ''}<section id="out">${text ? 'words: ' + esc(text).split(/\s+/).length : 'nothing'}</section></main>`;
  await page.route(ORIGIN + '/stat**', async route => {
    const r = route.request();
    if (r.method() === 'POST') {
      const t = new URLSearchParams(r.postData()).get('t') || '', u = new URLSearchParams(r.postData()).get('u') || '';
      posted.push({ t, fetchMode: r.headers()['x-g-fetch'] === '1' });
      if (u === 'file') return route.fulfill({ contentType: 'text/xml', body: '<x>' + esc(t) + '</x>' });
      return route.fulfill({ contentType: 'text/html', body: page2(t, u === 'outside' ? '<p>outside every region</p>' : '') });
    }
    return route.fulfill({ contentType: 'text/html', body: page2('') });
  });
  await page.goto(ORIGIN + '/stat');
  await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => { window.marker = 1; });
  await page.click('textarea');
  await page.keyboard.type('one two three');
  await page.evaluate(() => document.getElementById('p').requestSubmit());   // what a script sends (submit on change)
  await page.waitForFunction(() => document.getElementById('out').textContent === 'words: 3');
  assert.deepEqual(posted, [{ t: 'one two three', fetchMode: true }]);
  assert.deepEqual(await page.evaluate(() => [document.activeElement.name, document.activeElement.value, window.marker, location.pathname + location.search]), ['t', 'one two three', 1, '/stat']);
  await page.fill('input[name=u]', 'outside');   // a change outside every region: <main> is morphed as a whole, the form being sent stays as it is
  await page.evaluate(() => { const i = document.createElement('i'); i.className = 'part'; document.getElementById('p').append(i); });   // what scripts built in it (the kit's parts of its fields)
  await page.click('textarea');
  await page.keyboard.type(' four');
  await page.evaluate(() => document.getElementById('p').requestSubmit());
  await page.waitForFunction(() => document.getElementById('out').textContent === 'words: 4');
  await page.waitForTimeout(600);   // what leaves is gone by now
  assert.deepEqual(await page.evaluate(() => [document.activeElement.name, !!document.querySelector('main > p'), !!document.querySelector('#p > .part:not(.g-morph-ghost)'), window.marker]), ['t', true, true, 1]);
  await page.fill('input[name=u]', 'file');   // an answer that is not a page: the browser sends the form itself
  await page.evaluate(() => document.getElementById('p').requestSubmit());
  await page.waitForFunction(() => !window.marker && document.contentType === 'text/xml');
  assert.deepEqual(posted.map(p => p.fetchMode), [true, true, true, false]);
});

test('the form the user changed is not sent again: only what the answer writes into it (its <output>s, its hidden fields) comes back', async () => {
  parts = true;
  await page.goto(ORIGIN + '/find/' + encodeURIComponent('кот'));
  await page.waitForFunction(() => window.Glass);
  await page.evaluate(() => {
    window.form0 = document.getElementById('f'); window.select0 = document.querySelector('select[name=dict]');
    const i = document.createElement('i'); i.className = 'part'; window.form0.append(i);   // what scripts built in it (the kit's parts of its fields)
  });
  const form = () => page.evaluate(() => ({ same: document.getElementById('f') === window.form0 && document.querySelector('select[name=dict]') === window.select0,
    part: !!document.querySelector('#f > .part'), dict: document.querySelector('select[name=dict]').value, sum: document.getElementById('sum').textContent,
    seed: document.querySelector('input[name=seed]').value, empty: document.querySelectorAll('[data-g-same]').length }));
  await page.selectOption('select[name=dict]', 'cities');
  await settle();
  assert.deepEqual(fetches().map(r => [decodeURIComponent(r.url), r.form]), [['/find/кот?dict=cities&seed=nouns-3', 'f']]);
  assert.match(await result(), /^кот-cities-1/);
  assert.deepEqual(await form(), { same: true, part: true, dict: 'cities', sum: '3 × cities', seed: 'cities-3', empty: 0 });
  await page.selectOption('select[name=dict]', 'all');
  await settle();
  assert.deepEqual(await form(), { same: true, part: true, dict: 'all', sum: '3 × all', seed: 'all-3', empty: 0 });
  await page.goBack(); await settle();   // its answer came without the form: back asks for the whole page
  assert.deepEqual(fetches().slice(2).map(r => [decodeURIComponent(r.url), r.form]), [['/find/кот?dict=cities&seed=nouns-3', '']]);
  assert.match(await result(), /^кот-cities-1/);
  assert.deepEqual(await form(), { same: true, part: false, dict: 'cities', sum: '3 × cities', seed: 'cities-3', empty: 0 });
  await page.click('#next'); await settle();   // a link: the whole page
  assert.deepEqual(fetches().slice(3).map(r => r.form), ['']);
  assert.equal(await page.evaluate(() => document.querySelector('input[name=word]').value), 'дом');
  assert.equal(await page.evaluate(() => window.marker), undefined);   // a page loaded anew by goto: no marker; nothing reloaded since
  assert.deepEqual(errors, []);
});

test('what the kit built into the form (a select made a combobox) stays when the whole page answers after an answer without the form', async () => {
  parts = true;
  await page.goto(ORIGIN + '/find/' + encodeURIComponent('кот'));
  await page.waitForFunction(() => window.Glass && document.querySelector('.g-select__trigger'));
  await page.evaluate(() => { window.select0 = document.querySelector('select[name=dict]'); window.trigger0 = document.querySelector('.g-select__trigger'); });
  const combo = () => page.evaluate(() => ({ same: document.querySelector('select[name=dict]') === window.select0 && document.querySelector('.g-select__trigger') === window.trigger0,
    wrapped: !!window.select0.closest('.g-select'), icon: window.trigger0.getAttribute('data-icon'), shown: window.trigger0.textContent, dict: window.select0.value,
    seed: document.querySelector('input[name=seed]').value }));
  await page.click('.g-select__trigger'); await page.click('[role=option]:has-text("all")');   // the combobox of the kit
  await settle();
  assert.deepEqual(fetches().map(r => r.form), ['f']);   // its answer came without the form
  assert.deepEqual(await combo(), { same: true, wrapped: true, icon: 'book-open', shown: 'all', dict: 'all', seed: 'all-3' });
  await page.click('#next'); await settle();   // a link: the whole page, the form as the server draws it
  assert.deepEqual(fetches().map(r => r.form), ['f', '']);
  assert.match(await result(), /^дом-cities-1/);
  assert.deepEqual(await combo(), { same: true, wrapped: true, icon: 'book-open', shown: 'cities', dict: 'cities', seed: 'cities-3' });   // a hidden field the link does not name: the server's
  assert.deepEqual(errors, []);
});

test('data-default names the default of a field when the server\'s is not the first option: at it the field is left out, an address that does not name it puts it back', async () => {
  const words = min => `<!doctype html><title>words</title><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main id="m"><form id="w" method="get" action="/words"><select name="min" data-default="3">${['2', '3', '4'].map(v => `<option value="${v}"${v === min ? ' selected' : ''}>${v}</option>`).join('')}</select></form><p id="out">min ${min}</p><a id="bare" href="/words">words</a></main>`;
  await page.route(ORIGIN + '/words**', route => { const u = new URL(route.request().url()); requests.push({ url: u.pathname + u.search, fetchMode: route.request().headers()['x-g-fetch'] === '1' }); return route.fulfill({ contentType: 'text/html', body: words(u.searchParams.get('min') || '3') }); });
  await page.goto(ORIGIN + '/words');
  await page.waitForFunction(() => window.Glass);
  await page.selectOption('select[name=min]', '2'); await settle();
  assert.equal(await path_(), '/words?min=2');   // the first option is not the default here: it is in the address
  assert.equal(await page.textContent('#out'), 'min 2');
  await page.selectOption('select[name=min]', '3'); await settle();
  assert.equal(await path_(), '/words');   // the default is left out
  await page.selectOption('select[name=min]', '4'); await settle();
  await page.click('#bare'); await settle();   // an address that does not name it: the default, as the server has it
  assert.deepEqual(await page.evaluate(() => [document.querySelector('select[name=min]').value, document.getElementById('out').textContent]), ['3', 'min 3']);
});

/* The busy line of a form (Glass.busy): on while anything of the form is on its way, off when the last answer is in - not when one of them is */
const busyBoxes = () => page.evaluate(() => [...document.querySelectorAll('[data-g-busy]')].map(b => b.tagName.toLowerCase() + (b.id ? '#' + b.id : '')));

test('the busy line stays until the answer is in: Enter while the typed address is still on its way', async () => {
  slow.set('/find/лес', 1500);
  await page.fill('input[name=word]', 'лес');
  await page.waitForFunction(() => document.querySelector('[data-g-busy]'));   // the request of the typed word is on its way
  await page.keyboard.press('Enter');   // the same address: no second request
  await page.waitForTimeout(500);
  assert.deepEqual(await busyBoxes(), ['aside'], 'the line is still on');
  await page.waitForFunction(() => /^лес-/.test(document.querySelector('#result li')?.textContent || ''), null, { timeout: 5000 });
  await settle();
  assert.deepEqual(await busyBoxes(), []);
  assert.equal(fetches().length, 1);
  assert.deepEqual(errors, []);
});

test('the busy line stays while a newer submit is answered, when the page aborted the older request', async () => {
  const own = '<!doctype html><script defer src="/glass-ui.js"></script><script defer src="/glass-morph.js"></script><main><article><form id="b" method="get" action="/own"><input name="w"><button>Go</button></form></article><p id="out"></p></main>'
    + '<script>let x; document.getElementById("b").addEventListener("submit", e => { e.preventDefault(); if (x) x.abort(); x = new XMLHttpRequest(); x.open("GET", "/slow?w=" + e.target.w.value); x.onload = () => { out.textContent = x.responseText; }; x.send(); });</script>';
  await page.route(ORIGIN + '/own**', route => route.fulfill({ contentType: 'text/html', body: own }));
  await page.route(ORIGIN + '/slow**', async route => { await new Promise(r => setTimeout(r, 1200)); return route.fulfill({ contentType: 'text/plain', body: new URL(route.request().url()).searchParams.get('w') }).catch(() => {}); });
  await page.goto(ORIGIN + '/own');
  await page.waitForFunction(() => window.Glass);
  await page.fill('#b input', 'y');
  await page.click('#b button');
  await page.waitForTimeout(300);
  await page.fill('#b input', 'z');
  await page.click('#b button');   // the page aborts the request for y and asks for z
  await page.waitForTimeout(500);
  assert.deepEqual(await busyBoxes(), ['article'], 'the line is on while z is on its way');
  await page.waitForFunction(() => document.getElementById('out').textContent === 'z', null, { timeout: 5000 });
  await page.waitForTimeout(100);
  assert.deepEqual(await busyBoxes(), []);
  assert.deepEqual(errors, []);
});

test('a select that loads its list (data-load-list) has the busy line on the list while the server answers', async () => {
  const own = '<!doctype html><script defer src="/glass-ui.js"></script><main><form id="c" method="get" action="/sel"><select name="city" data-g-select data-searchable data-load-list="/list"><option value="">Any</option></select></form></main>';
  await page.route(ORIGIN + '/sel**', route => route.fulfill({ contentType: 'text/html', body: own }));
  await page.route(ORIGIN + '/list**', async route => { await new Promise(r => setTimeout(r, 1000)); return route.fulfill({ contentType: 'application/json', body: JSON.stringify([['Москва', 'msk'], ['Лимасол', 'lim']]) }).catch(() => {}); });
  await page.goto(ORIGIN + '/sel');
  await page.waitForFunction(() => document.querySelector('.g-select__trigger'));
  await page.click('.g-select__trigger');
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[role="listbox"][data-g-busy] > .g-busy-bar')].length), 1, 'the line runs along the list');
  await page.waitForFunction(() => document.querySelectorAll('[role="listbox"] [role="option"]').length >= 2, null, { timeout: 5000 });
  assert.deepEqual(await busyBoxes(), []);
  assert.deepEqual(errors, []);
});
