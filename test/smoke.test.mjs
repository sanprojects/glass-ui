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

test('morph: a row that stays is the same node, a gone one slides out, a new one slides in, a number turns', async () => {
  const r = await page.evaluate(async () => {
    const box = document.createElement('div'); box.innerHTML = '<p><b>199</b> words</p><ol class="g-list"><li data-key="a">a</li><li data-key="b">b</li></ol>'; box.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999'; document.body.appendChild(box);   // in the viewport: only what is on the screen is animated
    const a = box.querySelector('[data-key=a]'), out = {};
    const p = Glass.morph(box, '<p><b>203</b> words</p><ol class="g-list"><li data-key="a">a</li><li data-key="c">c</li></ol>');
    await new Promise(r => setTimeout(r, 40)); out.leaving = box.querySelectorAll('li.g-morph-ghost').length;   // the gone row fades out where it stood
    await p; await new Promise(r => setTimeout(r, 40));
    out.keys = [...box.querySelectorAll('li:not(.g-morph-ghost)')].map(l => l.dataset.key).join(); out.same = box.querySelector('[data-key=a]') === a;
    out.entering = box.querySelector('[data-key=c]').classList.contains('g-morph-enter'); out.reel = box.querySelectorAll('.g-reel__strip').length;
    await new Promise(r => setTimeout(r, 900)); out.plain = box.querySelector('b').textContent; out.ghosts = box.querySelectorAll('.g-morph-ghost').length; box.remove();
    return out;
  });
  assert.deepEqual(r, { leaving: 1, keys: 'a,c', same: true, entering: true, reel: 3, plain: '203', ghosts: 0 });
});

test('morph: a list row with other words is another row (it comes in, nothing lights up), a row whose number changed is the same row', async () => {
  const r = await page.evaluate(async () => {
    const box = document.createElement('div'); box.innerHTML = '<ol class="g-list"><li><a href="#x">кот</a></li><li>онлайн <b>5</b></li></ol>'; box.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999'; document.body.appendChild(box);
    const counter = box.querySelectorAll('li')[1];
    await Glass.morph(box, '<ol class="g-list"><li><a href="#y">дом</a></li><li>онлайн <b>7</b></li></ol>');
    const li = box.querySelectorAll('li:not(.g-morph-ghost)');
    const out = { words: box.querySelectorAll('.g-morph-word').length, entering: li[0].classList.contains('g-morph-enter'), counter: li[1] === counter, reel: box.querySelectorAll('.g-reel__strip').length };
    box.remove();
    return out;
  });
  assert.deepEqual(r, { words: 0, entering: true, counter: true, reel: 1 });
});

test('busy: a form with no card around it waits on itself, and stops waiting when its submit is handled with no request', async () => {
  const r = await page.evaluate(async () => {
    const f = document.createElement('form'); f.className = 'g-input-wrap'; f.innerHTML = '<input name="q">'; f.onsubmit = () => false; document.body.appendChild(f);
    f.requestSubmit();
    const during = f.hasAttribute('data-g-busy');
    await new Promise(r => setTimeout(r, 100));
    const out = { during, after: f.hasAttribute('data-g-busy') || f.hasAttribute('aria-busy') || !!f.querySelector('.g-busy-bar') };
    f.remove();
    return out;
  });
  assert.deepEqual(r, { during: true, after: false });
});

test('morph: a row that fades out is not measured by data-g-fit, the columns take the width of the new words at once', async () => {
  const r = await page.evaluate(async () => {
    const list = words => '<div data-g-fit><ol class="g-list">' + words.map(w => `<li data-key="${w}"><a href="#">${w}</a></li>`).join('') + '</ol></div>';
    const box = document.createElement('div'); box.innerHTML = list(['ab', 'a rather long row of words']); box.style.cssText = 'position:fixed;top:8px;left:8px;width:600px;z-index:9999'; document.body.appendChild(box);
    await new Promise(r => setTimeout(r, 100));
    const width = () => parseFloat(box.querySelector('[data-g-fit]').style.getPropertyValue('--g-text-w'));
    const w0 = width();
    await Glass.morph(box, list(['ab', 'cd']));
    const out = { ghosts: box.querySelectorAll('.g-morph-ghost').length, narrower: width() < w0 / 2 };
    box.remove();
    return out;
  });
  assert.deepEqual(r, { ghosts: 1, narrower: true });
});
