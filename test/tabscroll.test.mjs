// A tablist wider than its box scrolls sideways: the wheel turns it, the chosen tab is brought into view, the edges say where more tabs are;
// the timeline keeps time left of the rule on a narrow box.
//   node --test test/tabscroll.test.mjs
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
  await page.evaluate(() => {
    const box = document.createElement('div'); box.className = 'g-root'; box.style.cssText = 'width:240px;position:fixed;top:0;left:0;z-index:9';
    box.innerHTML = '<div role="tablist" data-no-scroll id="ts">' + Array.from({ length: 8 }, (_, i) => `<button role="tab">Workout number ${i}</button>`).join('') + '</div>';
    document.body.append(box); Glass.init(document);
  });
});
after(async () => { await browser.close(); });

test('a long tablist scrolls, the wheel moves it, edges are marked', async () => {
  const r = await page.evaluate(async () => {
    const l = document.getElementById('ts'), w = () => new Promise(r => setTimeout(r, 120));
    await w(); const a = { sw: l.scrollWidth, cw: l.clientWidth, edge0: l.getAttribute('data-g-edge') };
    l.dispatchEvent(new WheelEvent('wheel', { deltaY: 90, bubbles: true, cancelable: true })); await w();
    return { ...a, x: l.scrollLeft, edge1: l.getAttribute('data-g-edge') };
  });
  assert.ok(r.sw > r.cw, JSON.stringify(r)); assert.equal(r.edge0, 'end'); assert.ok(r.x > 0); assert.equal(r.edge1, 'both');
});

test('choosing a tab brings it into view', async () => {
  const r = await page.evaluate(async () => {
    const l = document.getElementById('ts'), t = l.children[7]; t.click(); await new Promise(r => setTimeout(r, 700));
    const a = l.getBoundingClientRect(), b = t.getBoundingClientRect(); return { l: a.left, r: a.right, tl: b.left, tr: b.right };
  });
  assert.ok(r.tl >= r.l - 1 && r.tr <= r.r + 1, JSON.stringify(r));
});

test('timeline on a narrow box: time left of the rule, text right of it', async () => {
  const r = await page.evaluate(() => {
    const wrap = document.querySelector('#timeline .tl-wrap'); wrap.style.width = '320px';
    const li = wrap.querySelector('.tl > li'), t = li.querySelector('time').getBoundingClientRect(), c = li.querySelector('div').getBoundingClientRect(), m = li.querySelector('i').getBoundingClientRect();
    return { tr: t.right, ml: m.left, cl: c.left, mr: m.right };
  });
  assert.ok(r.tr <= r.ml && r.cl >= r.mr, JSON.stringify(r));
});
