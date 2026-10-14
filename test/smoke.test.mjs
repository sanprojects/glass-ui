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
    await p; out.leaving = box.querySelectorAll('li.g-morph-ghost').length;   // the gone row fades out where it stood (the morph runs after the next frame: waited for, not timed)
    await new Promise(r => setTimeout(r, 40));
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

test('morph: the row that goes and the row that comes in at one place start together, the next place a step later, all end together', async () => {
  const r = await page.evaluate(async () => {
    const list = (p, n) => '<ol class="g-list">' + Array.from({ length: n }, (_, i) => `<li data-key="${p}${i}">${p} ${i}</li>`).join('') + '</ol>';
    const box = document.createElement('div'); box.innerHTML = '<p>head</p>' + list('old', 12); box.style.cssText = 'position:fixed;top:8px;left:8px;width:300px;z-index:9999'; document.body.appendChild(box);
    await new Promise(r => setTimeout(r, 50));
    await Glass.morph(box, '<p>head<br>two<br>three</p>' + list('new', 12));   // the text above grows: the list, and the rows that go with it, move down
    const timing = e => { const t = e.getAnimations()[0].effect.getTiming(); return { y: Math.round(e.getBoundingClientRect().top), d: t.delay, end: t.delay + t.duration }; };
    const gone = [...box.querySelectorAll('li.g-morph-ghost')].map(timing), came = [...box.querySelectorAll('li.g-morph-enter')].map(timing).sort((a, b) => a.y - b.y);
    const apart = gone.map(g => { const n = came.find(c => Math.abs(c.y - g.y) < 2); return n ? Math.abs(n.d - g.d) : Infinity; });
    const out = { pairs: apart.length, together: Math.max(...apart) <= 2, lowerLater: came.every((c, i) => !i || c.d - came[i - 1].d >= 15), spread: came[came.length - 1].d - came[0].d > 50,
      noBatch: came.filter(c => c.d === came[came.length - 1].d).length < came.length / 2, oneEnd: new Set(came.map(c => Math.round(c.end))).size === 1 };
    box.remove();
    return out;
  });
  assert.deepEqual(r, { pairs: 12, together: true, lowerLater: true, spread: true, noBatch: true, oneEnd: true });
});

test('morph: an update that comes while the box still grows from the last one: the box ends at its real height and gets its overflow back', async () => {
  const r = await page.evaluate(async () => {
    const list = (p, n) => '<ol class="g-list">' + Array.from({ length: n }, (_, i) => `<li data-key="${p}${i}">${p} ${i}</li>`).join('') + '</ol>';
    const box = document.createElement('div'); box.innerHTML = list('a', 2); box.style.cssText = 'position:fixed;top:8px;left:8px;width:300px;z-index:9999'; document.body.appendChild(box);
    await new Promise(r => setTimeout(r, 50));
    await Glass.morph(box, list('b', 10));
    await new Promise(r => setTimeout(r, 80));   // the box is halfway
    await Glass.morph(box, list('c', 6));
    const to = parseFloat(box.getAnimations().find(a => a.effect.getKeyframes().some(k => k.height)).effect.getKeyframes()[1].height);
    await new Promise(r => setTimeout(r, 900));
    const out = { endsAtReal: Math.abs(to - box.getBoundingClientRect().height) < 1, overflow: box.style.overflowY };
    box.remove();
    return out;
  });
  assert.deepEqual(r, { endsAtReal: true, overflow: '' });
});

/* A watched box (data-g-morph): whoever changes it, the change is animated; the new nodes stay the page's */
const watched = async (html, change, wait = 40) => page.evaluate(async ([html, change, wait]) => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = document.createElement('div'); box.setAttribute('data-g-morph', ''); box.innerHTML = html;
  box.style.cssText = 'position:fixed;top:8px;left:8px;width:300px;z-index:9999'; document.body.appendChild(box);
  await frame(); await new Promise(r => setTimeout(r, 50));
  const out = {}, fn = new Function('box', 'out', change);
  fn(box, out);
  await new Promise(r => setTimeout(r, wait));
  const li = [...box.querySelectorAll('li:not(.g-morph-ghost)')];
  Object.assign(out, {
    ghosts: [...box.querySelectorAll('.g-morph-ghost')].map(e => e.textContent.trim()).join(),
    entering: li.filter(e => e.classList.contains('g-morph-enter')).map(e => e.textContent.trim()).join(),
    gliding: li.filter(e => e.getAnimations().some(a => !(a instanceof CSSAnimation) && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none'))).map(e => e.textContent.trim()).join(),
    reels: box.querySelectorAll('.g-reel__strip').length,
  });
  await new Promise(r => setTimeout(r, 1300));   // all over: plain again, and nothing moves on by itself (the kit's own writes are no change)
  if (out.keep) { out.kept = out.keep.isConnected && box.contains(out.keep); delete out.keep; }   // the node the page put in is the one on the page
  out.after = { ghosts: box.querySelectorAll('.g-morph-ghost').length, anims: [...box.querySelectorAll('*')].filter(e => e.getAnimations().length).length, reels: box.querySelectorAll('.g-reel').length, text: [...box.querySelectorAll('p, li')].map(e => e.textContent.trim()).join(' ') };
  box.remove();
  return out;
}, [html, change, wait]);

test('watch: innerHTML written by a script: the row that went fades out, the new one comes in, the rest glide, the number turns', async () => {
  const r = await watched('<p>Found: <b>3</b></p><ol class="g-list"><li>alpha</li><li>beta</li><li>gamma</li></ol>',
    `box.innerHTML = '<p>Found: <b>4</b></p><ol class="g-list"><li>beta</li><li>gamma</li><li>delta</li><li>omega</li></ol>'; out.keep = box.querySelector('li');`);
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, gliding: r.gliding, reels: r.reels > 0, kept: r.kept, after: r.after },
    { ghosts: 'alpha', entering: 'delta,omega', gliding: 'beta,gamma', reels: true, kept: true, after: { ghosts: 0, anims: 0, reels: 0, text: 'Found: 4 beta gamma delta omega' } });
});

test('watch: rows taken out and put in one by one (as a framework does), and a row moved: only those animate, the moved one glides', async () => {
  const r = await watched('<ul class="g-list"><li data-key="1">one</li><li data-key="2">two</li><li data-key="3">three</li></ul>', `
    const ul = box.querySelector('ul'), li = n => ul.querySelector('[data-key="' + n + '"]');
    ul.removeChild(li(1));
    const four = document.createElement('li'); four.dataset.key = '4'; four.textContent = 'four'; ul.appendChild(four);
    ul.insertBefore(li(3), li(2));`);   // three, two, four: two keeps its place
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, gliding: r.gliding, after: r.after },
    { ghosts: 'one', entering: 'four', gliding: 'three', after: { ghosts: 0, anims: 0, reels: 0, text: 'three two four' } });
});

test('watch: a counter whose text a script sets turns its digits', async () => {
  const r = await watched('<p>Online: <b id="n">5</b></p>', `box.querySelector('#n').textContent = '17';`);
  assert.deepEqual({ reels: r.reels > 0, after: r.after }, { reels: true, after: { ghosts: 0, anims: 0, reels: 0, text: 'Online: 17' } });
});

test('watch: Glass.morph into a watched box is animated once, not twice', async () => {
  const r = await watched('<ol class="g-list"><li>alpha</li><li>beta</li></ol>', `out.p = Glass.morph(box, '<ol class="g-list"><li>beta</li><li>delta</li></ol>');`, 120);
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, after: r.after }, { ghosts: 'alpha', entering: 'delta', after: { ghosts: 0, anims: 0, reels: 0, text: 'beta delta' } });
});

test('watch: a word that went to another list (all written anew) glides there, it does not go and come', async () => {
  const r = await watched('<ol class="g-list"><li>alpha</li><li>beta</li></ol><ol class="g-list"><li>gamma</li></ol>',
    `box.innerHTML = '<ol class="g-list"><li>alpha</li></ol><ol class="g-list"><li>beta</li><li>gamma</li></ol>';`);
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, gliding: r.gliding.split(',').includes('beta'), after: r.after },
    { ghosts: '', entering: '', gliding: true, after: { ghosts: 0, anims: 0, reels: 0, text: 'alpha beta gamma' } });
});

test('watch: a second change while the first one still moves ends in the state of the second, with nothing left over', async () => {
  const r = await watched('<ol class="g-list"><li>a1</li><li>a2</li><li>a3</li></ol>', `
    box.querySelector('ol').innerHTML = '<li>a2</li><li>b1</li><li>a3</li><li>b2</li>';
    setTimeout(() => { box.querySelector('ol').innerHTML = '<li>c1</li><li>a3</li>'; }, 90);`, 200);
  assert.deepEqual(r.after, { ghosts: 0, anims: 0, reels: 0, text: 'c1 a3' });
});
