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

test('dialog opens from a button and closes on Escape', async () => {
  await page.locator('button[data-g-open="#dlg"]').scrollIntoViewIfNeeded();
  await page.click('button[data-g-open="#dlg"]');
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), true);
  await page.keyboard.press('Escape');
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
  const opt = page.locator('[role="listbox"] [role="option"]').filter({ hasText: 'Designer' }).first();
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
  const r = await page.evaluate(() => { const g = document.querySelector('[data-grid]'), c = getComputedStyle(g);
    return { cols: new Set(c.gridTemplateColumns.split(' ')).size, gap: c.columnGap + ' ' + c.rowGap }; });
  assert.equal(r.cols, 1); assert.equal(r.gap, '14px 14px');
});
