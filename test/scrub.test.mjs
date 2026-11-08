// Pulling a number: a plain number, one end of a range, and no native text drag.
//   node --test test/scrub.test.mjs
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

// the point in the element at fraction fx of the width of the text slice [from, to)
const at = async (id, from, to) => {
  await page.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'center', behavior: 'instant' }), id); await page.waitForTimeout(150);
  return page.evaluate(([id, from, to]) => {
  const el = document.getElementById(id), tn = el.firstChild, r = document.createRange();
  r.setStart(tn, from); r.setEnd(tn, to === undefined ? tn.length : to);
  const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [id, from, to]);
};
const pull = async (p, dy) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, p.y + dy / 2, { steps: 4 }); await page.mouse.move(p.x, p.y + dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(700); };
const text = id => page.evaluate(id => document.getElementById(id).textContent, id);

test('a plain number: pulled up it grows, pulled down it shrinks, clamped at data-min', async () => {
  await pull(await at('scrubDemo', 0), -48);
  assert.ok(Number(await text('scrubDemo')) > 12, 'grew: ' + await text('scrubDemo'));
  await pull(await at('scrubDemo', 0), 400); assert.equal(await text('scrubDemo'), '0');
});

test('a range: the end under the pointer moves, the other stays, low never passes high', async () => {
  const get = async () => (await text('scrubRange')).split('–').map(Number);
  await pull(await at('scrubRange', 2), -48);   // the right end, up
  let [lo, hi] = await get(); assert.equal(lo, 8); assert.ok(hi > 12, `${lo}–${hi}`);
  const top = hi;
  await pull(await at('scrubRange', 0, 1), -400);   // the left end far up: stops at the high one
  [lo, hi] = await get(); assert.equal(hi, top); assert.equal(lo, top, `${lo}–${hi}`);
  await pull(await at('scrubRange', 0, 1), 48);   // the left end down: only it moves
  [lo, hi] = await get(); assert.equal(hi, top); assert.ok(lo < top, `${lo}–${hi}`);
  await pull(await at('scrubRange', 2), 400);   // the right end far down: stops at the low one
  [lo, hi] = await get(); assert.equal(hi, lo, `${lo}–${hi}`);
});

test('dragstart on a scrub element is always prevented (a focused number is selected whole)', async () => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('scrubDemo'); el.focus();
    const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(rg);
    const ev = new Event('dragstart', { bubbles: true, cancelable: true }); el.firstChild.dispatchEvent(ev);   // a Text node target
    return ev.defaultPrevented;
  });
  assert.equal(r, true);
});

test('a pull on a focused, fully selected number scrubs it; every dragstart is cancelled', async () => {
  await page.evaluate(() => { window.__ds = []; document.addEventListener('dragstart', e => queueMicrotask(() => window.__ds.push(e.defaultPrevented)), false); });
  const before = Number(await text('scrubDemo')), p = await at('scrubDemo', 0);
  await page.evaluate(() => { const el = document.getElementById('scrubDemo'); el.focus(); const rg = document.createRange(); rg.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(rg); });
  await pull(p, -64);
  assert.ok(Number(await text('scrubDemo')) > before, `${before} → ${await text('scrubDemo')}`);
  assert.ok((await page.evaluate(() => window.__ds)).every(Boolean), 'a dragstart was not cancelled');
});

test('a number inside a text: the one under the pointer moves, the rest of the text stays; no click needed with dblclick editing', async () => {
  const el = () => page.evaluate(() => { const n = document.getElementById('scrubText'); return { t: n.textContent, ce: n.isContentEditable }; });
  await pull(await at('scrubText', 0, 1), -48);   // the "3"
  let r = await el(); assert.match(r.t, /^\d+ sets of 10 reps$/); assert.ok(parseInt(r.t) > 3, r.t); assert.equal(r.ce, false);
  const n = (await el()).t; const i = n.indexOf('10');
  await pull(await at('scrubText', i, i + 2), -48);   // the "10"
  r = await el(); assert.match(r.t, /^\d+ sets of \d+ reps$/); assert.ok(parseInt(r.t.split(' of ')[1]) > 10, r.t); assert.equal(r.t.split(' ')[0], n.split(' ')[0]);
  await pull(await at('scrubText', 0, 1), 400); assert.match((await el()).t, /^0 sets/);   // clamped at data-min
});
