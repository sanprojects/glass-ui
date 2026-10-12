// Minimal browser tests: node --test test/smoke.test.mjs   (needs: npm i && npx playwright install chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const page_url = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html');
let browser, page; const errors = [];

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(page_url); await page.waitForTimeout(1200);
  await page.evaluate(() => Glass.init(document));   // build select / pager / more parts right away
});
after(async () => { await browser.close(); });

test('the page runs without script errors', () => { assert.deepEqual(errors, []); });

test('dialog opens from a button, closes on Escape and on a backdrop click', async () => {
  const open = 'button[command="show-modal"][commandfor="dlg"]';
  await page.locator(open).scrollIntoViewIfNeeded();
  await page.click(open);
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), false);
  await page.click(open); await page.mouse.click(4, 4);
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), false);
});

test('tabs: arrow keys move the selection', async () => {
  const tabs = page.locator('[data-tabs-demo] [role="tablist"] > *');
  await tabs.nth(0).scrollIntoViewIfNeeded(); await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'false');
});

test('select: opens as a listbox and picks an option', async () => {
  const trigger = page.locator('#s-role + .g-select, .g-select').first().locator('.g-select__trigger');
  await trigger.scrollIntoViewIfNeeded(); await trigger.click();
  const opt = page.locator('[role="listbox"]:popover-open [role="option"]').filter({ hasText: 'Designer' }).first();
  await opt.click();
  assert.equal(await page.evaluate(() => document.getElementById('s-role').value), 'Designer');
});

test('table: rows select, Clear empties the selection', async () => {
  const t = page.locator('table[data-g-selectable]').first();
  await t.scrollIntoViewIfNeeded();
  const rows = t.locator('tbody tr'); await rows.nth(0).click();
  assert.ok((await t.locator('tbody tr[aria-selected="true"]').count()) >= 1);
  await t.locator('[data-g-clear]').click();
  assert.equal(await t.locator('tbody tr[aria-selected="true"]').count(), 0);
});

test('grid: columns are equal and every gap is --g-gap', async () => {
  // the grid of the Grid section (the icon list above is a [data-grid] too, with a gap of its own); auto-fit collapses the empty tracks to 0px, the rest differ only by subpixel rounding
  const r = await page.evaluate(() => { const h = [...document.querySelectorAll('.sec__head h3')].find(e => e.textContent.trim() === 'Grid');
    const g = h.closest('.sec__head').nextElementSibling.querySelector('[data-grid]'), c = getComputedStyle(g);
    const w = c.gridTemplateColumns.split(' ').map(parseFloat).filter(v => v > 0);
    return { cols: w.length, spread: Math.max(...w) - Math.min(...w), gap: c.columnGap + ' ' + c.rowGap }; });
  assert.ok(r.cols > 1, 'columns: ' + r.cols); assert.ok(r.spread < 1, 'columns differ by ' + r.spread + 'px'); assert.equal(r.gap, '16px 16px');
});
