// The overflow bar (nav[data-g-overflow]): node --test test/overflow.test.mjs
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
    off: [...nav.querySelectorAll('[data-g-off]')].filter(n => n !== btn).map(n => n.getAttribute('aria-label') || n.textContent.trim()),
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

test('items go from the end, and the one with a high data-g-priority goes last', async () => {
  const r = await at(540);
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

test('the page runs without script errors', () => { assert.deepEqual(errors, []); });
