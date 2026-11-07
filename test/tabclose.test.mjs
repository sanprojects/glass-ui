// The close cross of a tab is as far from the tab's right edge as the label is from its left edge (the kit's --g-inset).
//   node --test test/tabclose.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let browser, page;
before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('file://' + path.join(root, 'index.html')); await page.waitForTimeout(1200);
  await page.evaluate(() => Glass.init(document));
});
after(async () => { await browser.close(); });

test('the demo tab with a cross: right inset of the cross == left inset of the label == --g-inset', async () => {
  const r = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#closeTabs > [role=tab]').forEach(tab => {
      const x = tab.querySelector('[data-g-close]'), t = tab.getBoundingClientRect(), xr = x.getBoundingClientRect(), k = t.width / tab.offsetWidth;   // k: the tab may be scaled while pressed or settling
      const rg = document.createRange(); rg.setStart(tab.firstChild, 0); rg.setEnd(tab.firstChild, tab.firstChild.length);
      const lr = rg.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g-inset')) || parseFloat(getComputedStyle(tab).paddingLeft);
      out.push({ left: Math.round((lr.left - t.left) / k * 100) / 100, right: Math.round((t.right - xr.right) / k * 100) / 100, pad: parseFloat(getComputedStyle(tab).paddingLeft), inset });
    });
    return out;
  });
  assert.equal(r.length, 2);
  for (const t of r) { assert.ok(Math.abs(t.left - t.right) <= 0.1, JSON.stringify(t)); assert.ok(Math.abs(t.left - t.pad) <= 0.1, JSON.stringify(t)); }
});
