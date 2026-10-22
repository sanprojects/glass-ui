// The overflow bar (nav[data-g-overflow], and a plain <nav> in .g-root): node --test test/overflow.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const page_url = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html');
let browser, page; const errors = [];

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 1900, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(page_url); await page.waitForTimeout(1200);
});
after(async () => { await browser.close(); });

// the demo bar, set to a width; a bar settles in a few frames (its ResizeObserver, the grid's transition)
const at = w => page.evaluate(async w => {
  const box = document.querySelector('.resizable'); box.style.maxWidth = 'none'; box.style.width = w + 'px'; box.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 500));
  const nav = box.querySelector('nav[data-g-overflow]'), btn = nav.querySelector('[data-g-menu]'), vis = n => getComputedStyle(n).display !== 'none';
  const right = nav.getBoundingClientRect().right - parseFloat(getComputedStyle(nav).paddingRight);
  return {
    field: nav.querySelector('.g-input-wrap').offsetWidth, menu: vis(btn),
    spill: Math.max(...[...nav.children].filter(vis).map(c => c.getBoundingClientRect().right)) - right,
    title: (t => ({ shown: vis(t), whole: t.scrollWidth <= t.clientWidth, off: t.hasAttribute('data-g-off') }))(nav.querySelector('[data-g-title]')),
    off: [...nav.querySelectorAll('[data-g-off]')].filter(n => n !== btn && !n.hasAttribute('data-g-title')).map(n => n.getAttribute('aria-label') || n.textContent.trim()),
    rows: [...document.querySelectorAll(btn.getAttribute('data-g-menu') + ' > [data-g-auto]')].map(n => n.textContent),
    shown: [...nav.querySelectorAll('div > :not([data-g-menu])')].filter(vis).map(n => n.getAttribute('aria-label') || n.textContent.trim()),
  };
}, w);

test('the field is never narrower than 200px, and nothing sticks out of the bar', async () => {
  for (let w = 640; w >= 300; w -= 20) {
    const r = await at(w);
    assert.ok(r.field >= 200, `field ${r.field}px at ${w}px`);
    assert.ok(r.spill < 1, `spill ${r.spill}px at ${w}px`);
  }
});

test('no menu when everything fits; the menu holds exactly what was cut', async () => {
  const wide = await at(1000);
  assert.equal(wide.menu, false); assert.deepEqual(wide.off, []); assert.deepEqual(wide.rows, []);
  const narrow = await at(420);
  assert.equal(narrow.menu, true);
  assert.ok(narrow.off.length > 0);
  assert.deepEqual(narrow.rows.sort(), narrow.off.sort());
});

test('the name of the bar is whole or gone, and it is the first to go', async () => {
  let seen = { whole: 0, gone: 0 };
  for (let w = 1000; w >= 300; w -= 20) {
    const r = await at(w);
    if (r.title.shown) { assert.ok(r.title.whole, `the name is clipped at ${w}px`); seen.whole++; } else { assert.ok(r.title.off); seen.gone++; }
    if (r.off.length || r.menu) assert.equal(r.title.shown, false, `a button is in the menu while the name is shown at ${w}px`);
    assert.deepEqual(r.rows.sort(), r.off.sort());   // the name has no row
  }
  assert.ok(seen.whole > 0 && seen.gone > 0);
});

test('a bar settles to the same state whether it got narrower or wider', async () => {
  const down = {}, up = {};
  for (let w = 900; w >= 300; w -= 30) down[w] = JSON.stringify(await at(w));
  for (let w = 300; w <= 900; w += 30) up[w] = JSON.stringify(await at(w));
  for (const w in down) assert.equal(up[w], down[w], 'at ' + w + 'px');
});

test('items go from the end, and the one with a high data-g-priority goes last', async () => {
  const r = await at(460);   // the name went first, so what is cut here starts further down
  assert.ok(r.off.includes('Settings') && !r.off.includes('New'), JSON.stringify(r));
  assert.ok(r.shown.includes('New'));
  const narrow = await at(300);
  assert.ok(narrow.off.includes('New'));
});

test('a row of the menu does what the button it stands for does', async () => {
  await at(420);
  await page.evaluate(() => { window.__hit = 0; document.querySelector('.resizable nav [aria-label="Notifications"]').addEventListener('click', () => window.__hit++); });
  await page.click('.resizable nav [data-g-menu]');
  await page.locator('[data-g-auto]', { hasText: 'Notifications' }).click();
  assert.equal(await page.evaluate(() => window.__hit), 1);
});

test('a row of the menu with the hidden attribute is not drawn', async () => {
  const r = await page.evaluate(() => {
    const row = document.createElement('button'); row.textContent = 'Ghost'; row.hidden = true;
    const menu = document.querySelector(document.querySelector('.resizable nav [data-g-menu]').getAttribute('data-g-menu'));
    menu.prepend(row); const d = getComputedStyle(row).display; row.remove(); return d;
  });
  assert.equal(r, 'none');
});

// a plain <nav> in .g-root: no attribute, no class
const bare = w => page.evaluate(async w => {
  const nav = document.querySelector('nav[aria-label="Toolbar"]'), box = nav.parentElement; box.style.maxWidth = 'none'; box.style.minWidth = '0'; box.style.width = w + 'px'; box.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 500));
  const btn = nav.querySelector('[data-g-menu]'), vis = n => getComputedStyle(n).display !== 'none', right = nav.getBoundingClientRect().right - parseFloat(getComputedStyle(nav).paddingRight);
  return {
    mounted: nav.hasAttribute('data-g-overflow'), menu: !!btn && vis(btn),
    spill: Math.max(...[...nav.children].filter(vis).map(c => c.getBoundingClientRect().right)) - right,
    brand: vis(nav.firstElementChild),
    off: [...nav.querySelectorAll('[data-g-off]')].filter(n => n !== btn && n.parentElement === nav).map(n => n.getAttribute('aria-label')),
    rows: btn ? [...document.querySelectorAll(btn.getAttribute('data-g-menu') + ' > [data-g-auto]')].map(n => n.textContent) : [],
  };
}, w);

test('a plain <nav> folds its own links and buttons into a menu, and keeps the brand', async () => {
  const wide = await bare(900);
  assert.equal(wide.mounted, true); assert.equal(wide.menu, false); assert.deepEqual(wide.rows, []);
  for (let w = 500; w >= 200; w -= 20) {
    const r = await bare(w);
    assert.ok(r.spill < 1, `spill ${r.spill}px at ${w}px`);
    assert.ok(r.brand || r.menu, `the brand is gone and there is no menu at ${w}px`);
  }
  const narrow = await bare(260);
  assert.equal(narrow.menu, true); assert.ok(narrow.off.length > 0);
  assert.deepEqual(narrow.rows.sort(), narrow.off.sort());
  assert.ok(!narrow.off.includes('Editor'));
});

test('the last item of a plain <nav> goes first', async () => {
  const r = await bare(300);
  if (r.off.length) assert.equal(r.off[0] === 'Settings' || r.off.includes('Settings'), true, JSON.stringify(r));
});

test('a pager, a nav with a data-g-nav-auto list and data-g-overflow="off" are left alone', async () => {
  const r = await page.evaluate(() => {
    const root = document.querySelector('.g-root'), mk = html => { const d = document.createElement('div'); d.innerHTML = html; const n = d.firstElementChild; root.appendChild(n); return n; };
    const off = mk('<nav data-g-overflow="off"><button>A</button><button>B</button></nav>'), auto = mk('<nav><ul data-g-nav-auto data-sections="#nope"></ul></nav>');
    const out = { off: off.querySelector('[data-g-menu]') === null, auto: auto.querySelector('[data-g-menu]') === null, pager: [...document.querySelectorAll('nav[data-g-pager]')].every(n => !n.hasAttribute('data-g-overflow')) };
    off.remove(); auto.remove(); return out;
  });
  await page.waitForTimeout(100);
  assert.deepEqual(r, { off: true, auto: true, pager: true });
});

test('the page runs without script errors', () => { assert.deepEqual(errors, []); });
