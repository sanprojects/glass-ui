// The watched page (<body data-g-morph>): node --test test/page.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

/* served over http: slow.gif comes 700 ms late, so the page is a while between its start and its load */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/slow.gif')) return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'image/gif' }); res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')); }, 700);
  fs.readFile(path.join(root, p), (err, b) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
let browser, page, page_url; const errors = [];

before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  page_url = 'http://127.0.0.1:' + server.address().port + '/test/page.html';
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(page_url); await page.waitForTimeout(300);
});
after(async () => { await browser.close(); server.close(); });

/* runs a change on the page, then tells what it animated (at `wait` ms) and what is left when all is over */
const change = (code, wait = 40, settle = 1300) => page.evaluate(async ([code, wait, settle]) => {
  const out = {}, made = { reels: 0, words: 0, enter: [] };
  const mo = new MutationObserver(rs => rs.forEach(r => {
    r.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('g-reel')) made.reels++; if (n.nodeType === 1 && n.classList.contains('g-morph-word')) made.words++; });
    if (r.type === 'attributes' && r.target.classList.contains('g-morph-enter')) made.enter.push(r.target.id || r.target.className || r.target.textContent.trim());
  }));
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  await new Function('out', 'return (async () => {' + code + '})()')(out);
  await new Promise(r => setTimeout(r, wait));
  const li = [...document.querySelectorAll('li:not(.g-morph-ghost)')];
  const moving = e => e.getAnimations().some(a => !(a instanceof CSSAnimation) && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none'));
  Object.assign(out, {
    ghosts: [...document.querySelectorAll('.g-morph-ghost')].map(e => e.textContent.trim()).join(),
    entering: li.filter(e => e.classList.contains('g-morph-enter')).map(e => e.textContent.trim()).join(),
    gliding: [...li, ...document.querySelectorAll('p, nav')].filter(moving).map(e => e.id || e.textContent.trim()).join(),
  });
  await new Promise(r => setTimeout(r, settle));
  mo.disconnect();
  out.made = { reels: made.reels, words: made.words, enter: [...new Set(made.enter)].join() };
  out.after = { ghosts: document.querySelectorAll('.g-morph-ghost').length, anims: [...document.querySelectorAll('main *')].filter(e => e.getAnimations().length).length, reels: document.querySelectorAll('.g-reel').length };
  return out;
}, [code, wait, settle]);

test('the page runs without script errors, and what it wrote while it loaded is not animated', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.__early), { state: 'interactive', animated: false });
});

test('page: a list written anew anywhere on the page: the row that went fades out, the new one comes in, the rest glide, what is below glides', async () => {
  const r = await change(`document.getElementById('res').innerHTML = '<ol class="g-list"><li>beta</li><li>gamma</li><li>delta</li><li>omega</li><li id="early">early</li></ol>';`);
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, gliding: r.gliding.split(',').filter(x => ['beta', 'gamma', 'below'].includes(x)).sort().join(), after: r.after },
    { ghosts: 'alpha', entering: 'delta,omega', gliding: 'below,beta,gamma', after: { ghosts: 0, anims: 0, reels: 0 } });
});

test('page: a box watched by itself animates its own change, once (the page does not animate it again)', async () => {
  const r = await change(`document.getElementById('own').innerHTML = '<ol class="g-list"><li>two</li><li>three</li></ol>';`);
  assert.deepEqual({ ghosts: r.ghosts, entering: r.entering, after: r.after }, { ghosts: 'one', entering: 'three', after: { ghosts: 0, anims: 0, reels: 0 } });
});

test('page: a number set by a script turns, deep in the page too (its text node set)', async () => {
  const r = await change(`document.getElementById('count').textContent = '12'; document.querySelector('#deep i').firstChild.nodeValue = '7';`);
  assert.deepEqual({ reels: r.made.reels, after: r.after, text: await page.evaluate(() => document.querySelector('main p').textContent) }, { reels: 2, after: { ghosts: 0, anims: 0, reels: 0 }, text: 'Found: 12 7' });
});

test('page: a clock that ticks every 20 ms is left as it is while it runs', async () => {
  const r = await change(`const c = document.getElementById('clock'); for (let i = 1; i <= 12; i++) { c.textContent = String(i); await new Promise(r => setTimeout(r, 20)); }`, 0, 600);
  assert.ok(r.made.reels <= 2, 'reels: ' + r.made.reels);
  assert.equal(await page.evaluate(() => document.getElementById('clock').textContent), '12');
});

test('page: a row that was hidden and is shown comes in', async () => {
  const r = await change(`document.querySelector('#more li[hidden]').hidden = false;`);
  assert.deepEqual({ entering: r.entering, after: r.after }, { entering: 'm2', after: { ghosts: 0, anims: 0, reels: 0 } });
});

test('page: what floats over the page (a toast of the kit, a fixed layer of the page) does not come in as content', async () => {
  const r = await change(`Glass.toast('Saved'); const d = document.createElement('div'); d.id = 'layer'; d.textContent = 'layer'; d.style.cssText = 'position:fixed;inset:20px'; document.body.appendChild(d); out.d = 1;`);
  assert.equal(r.made.enter, '');
  await page.evaluate(() => document.getElementById('layer').remove());
});

test('page: what changes in a layer that floats over the page (a cookie banner that another script draws, then draws again) is not animated', async () => {
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'banner'; d.style.cssText = 'position:fixed;left:20px;bottom:20px;width:300px'; d.innerHTML = '<p>cookies?</p><div id="btns"><button>no</button></div>'; document.body.appendChild(d); });
  await page.waitForTimeout(400);
  const r = await change(`const b = document.getElementById('btns'); b.innerHTML = '<button><span>No</span></button><button><span>Yes</span></button>'; document.querySelector('#banner p').textContent = 'cookies, please?';`);
  assert.deepEqual([r.made.enter, r.ghosts, r.made.words, r.made.reels], ['', '', 0, 0]);
  await page.evaluate(() => document.getElementById('banner').remove());
  await page.waitForTimeout(300);
  /* a layer put in before its stylesheet makes it fixed (another script's banner), then drawn: what is drawn in it does not come in either */
  await page.evaluate(() => { const w = document.createElement('div'); w.id = 'card'; w.className = 'late'; w.style.cssText = 'right:20px;bottom:20px;width:200px'; document.body.appendChild(w); });
  await page.waitForTimeout(1500);   /* read as it stands: in the flow (its own coming in, as a box of the flow, is over) */
  const n = await change(`const st = document.createElement('style'); st.textContent = '.late { position: fixed }'; document.head.appendChild(st);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); document.getElementById('card').innerHTML = '<p>cookies?</p><button><span>Yes</span></button>';`);
  assert.deepEqual([n.made.enter.replace(/^card,?/, ''), n.ghosts], ['', '']);
  await page.evaluate(() => { document.getElementById('card').remove(); [...document.head.querySelectorAll('style')].pop().remove(); });
  await page.waitForTimeout(300);
});

test('page: a <style> whose text a script sets stays a style (nothing is lit up in it)', async () => {
  const r = await change(`const st = document.getElementById('st'); st.textContent = '#below { color: red }'; await new Promise(r => setTimeout(r)); out.inside = st.children.length;`);
  assert.deepEqual({ inside: r.inside, color: await page.evaluate(() => getComputedStyle(document.getElementById('below')).color) }, { inside: 0, color: 'rgb(255, 0, 0)' });
});

test('page: what a closed <details> holds is not read (the browser has not worked out its styles; a read would make it work out all of them)', async () => {
  await page.evaluate(() => { const i = document.getElementById('inside'); window.__touched = 0; ['getClientRects', 'getBoundingClientRect'].forEach(m => { const f = i[m]; i[m] = function () { window.__touched++; return f.call(this); }; }); });
  await change(`document.getElementById('count').textContent = '30';`);
  assert.equal(await page.evaluate(() => window.__touched), 0);
});

test('glass-morph.js alone (no glass-ui.js): a watched box and Glass.morph animate, with no errors', async () => {
  const p2 = await browser.newPage({ viewport: { width: 900, height: 700 } }), errs = [];
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(page_url.replace('page.html', 'alone.html')); await p2.waitForTimeout(300);
  const r = await p2.evaluate(async () => {
    const box = document.getElementById('box');
    box.innerHTML = '<p>Found: <b>4</b></p><ul><li>beta</li><li>gamma</li></ul>';
    await new Promise(r => setTimeout(r, 40));
    const watched = { ghosts: [...box.querySelectorAll('.g-morph-ghost')].map(e => e.textContent).join(), entering: [...box.querySelectorAll('.g-morph-enter')].map(e => e.textContent).join(), reels: box.querySelectorAll('.g-reel').length };
    const done = await Glass.morph('#other', '<ul><li>two</li><li>three</li></ul>');
    return { watched, done, api: Object.keys(Glass).sort().join() };
  });
  await p2.close();
  assert.deepEqual({ ...r, errs }, { watched: { ghosts: 'alpha', entering: 'gamma', reels: 1 }, done: true, api: 'morph,watch', errs: [] });
});

test('page: a page moves the fade to a part of what comes in or goes, in its own CSS (the timing inherits); the library only marks the element', async () => {
  const r = await change(`const t = document.getElementById('tiles');
    t.insertAdjacentHTML('beforeend', '<a href="#t2" data-key="t2"><article style="backdrop-filter: blur(4px); padding: 8px">tile two</article></a>');
    t.querySelector('a[href="#t1"]').remove();
    await new Promise(r => setTimeout(r, 20));
    const a = t.querySelector('a[href="#t2"]'), g = t.querySelector('a.g-morph-ghost'), names = e => e.getAnimations().map(x => x.animationName).join();
    out.on = { link: a.classList.contains('g-morph-enter'), linkRuns: names(a), cardRuns: names(a.firstElementChild), ghostRuns: g && names(g), ghostCardRuns: g && names(g.firstElementChild) };`);
  assert.deepEqual(r.on, { link: true, linkRuns: '', cardRuns: 'g-morph-in', ghostRuns: '', ghostCardRuns: 'g-morph-away' });
});

test('page: a name that only got longer (its right edge stays) lights up its new word and does not slide; what moved still glides', async () => {
  const r = await change(`document.getElementById('rname').textContent = 'Green Lizard'; await new Promise(r => setTimeout(r, 20));
    const n = document.getElementById('rname'); out.slides = n.getAnimations().filter(a => !(a instanceof CSSAnimation)).length; out.words = n.querySelectorAll('.g-morph-word').length;`);
  assert.deepEqual({ slides: r.slides, words: r.words }, { slides: 0, words: 1 });
});

test('page: the same text written again while its words light up (two writes of one click) keeps them lighting up, from where they were', async () => {
  const r = await change(`const n = document.getElementById('rname'); n.textContent = 'French Violet'; await new Promise(r => setTimeout(r, 60));
    n.textContent = 'French Violet'; await new Promise(r => setTimeout(r, 20));
    const w = n.querySelectorAll('.g-morph-word'); out.kept = w.length; out.delay = w[0] ? w[0].style.animationDelay : '';`, 0, 1600);
  assert.deepEqual({ kept: r.kept, late: /^-\d+ms$/.test(r.delay), text: await page.evaluate(() => [document.getElementById('rname').childNodes.length, document.getElementById('rname').textContent]) },
    { kept: 2, late: true, text: [1, 'French Violet'] });
});

test('page: what stays stands, while what goes fades out, where it stands once that is gone (a ghost that selectors see does not move it)', async () => {
  const r = await change(`const ol = document.getElementById('cols'), at = () => [...ol.querySelectorAll(':scope > li:not(.g-morph-ghost)')].map(e => [e.offsetLeft, e.offsetTop, e.offsetWidth].join(':')).join(' ');
    ol.querySelector('[data-key="c1"]').remove();   /* the one row with a chip goes: 4 columns instead of 3 */
    await new Promise(r => setTimeout(r, 30)); out.during = at(); out.cols = getComputedStyle(ol).gridTemplateColumns.split(' ').length;
    await new Promise(r => setTimeout(r, 1300)); out.end = at();`, 0, 100);
  assert.equal(r.cols, 4);
  assert.equal(r.during, r.end);
});

test('page: a virtual list that writes its rows as its box scrolls is not animated; the same write at another time is', async () => {
  const r = await change(`const box = document.getElementById('vlist'), ol = document.getElementById('vrows');
    const draw = () => { const first = Math.floor(box.scrollTop / 30); ol.style.top = first * 30 + 'px'; ol.innerHTML = [0, 1, 2, 3].map(i => '<li>r' + (first + i) + '</li>').join(''); };
    box.addEventListener('scroll', draw);
    box.scrollTop = 300; await new Promise(r => setTimeout(r, 60));
    out.scroll = { enter: ol.querySelectorAll('.g-morph-enter').length, ghosts: ol.querySelectorAll('.g-morph-ghost').length, first: ol.firstElementChild.textContent };
    box.removeEventListener('scroll', draw);
    await new Promise(r => setTimeout(r, 400));
    ol.innerHTML = '<li>x1</li><li>x2</li>'; await new Promise(r => setTimeout(r, 30));
    out.write = { enter: ol.querySelectorAll('.g-morph-enter').length };`, 0, 1300);
  assert.deepEqual(r.scroll, { enter: 0, ghosts: 0, first: 'r10' });
  assert.ok(r.write.enter > 0, 'a write at another time comes in: ' + JSON.stringify(r.write));
});

test('page: the hover held back while the page animates (data-g-still) is given when it is over, and before a press', async () => {
  await page.evaluate(() => { const h = document.getElementById('hov'); window.__hov = []; ['mouseover', 'mouseenter', 'mouseout', 'mouseleave', 'pointerover'].forEach(t => h.addEventListener(t, () => window.__hov.push(t)));
    h.addEventListener('pointerdown', () => window.__hov.push('down:' + (window.__hov.includes('mouseover') ? 'hovered' : 'not hovered'))); });
  const at = async id => page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, id);
  const go = async () => { await page.evaluate(() => { const c = document.getElementById('count'); c.textContent = String(+c.textContent + 1); }); await page.waitForTimeout(40); };   /* an animation that moves nothing */
  await page.evaluate(() => document.getElementById('hov').scrollIntoView({ block: 'center' })); await page.waitForTimeout(400);   /* out of the scroll's 200 ms */
  const [ax, ay] = await at('away'), [hx, hy] = await at('hov');
  // once it is over
  await page.mouse.move(ax, ay); await page.waitForTimeout(100); await page.evaluate(() => { window.__hov.length = 0; });
  await go(); await page.mouse.move(hx, hy);
  const during = await page.evaluate(() => window.__hov.slice());
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__hov.slice());
  // a press while it animates
  await page.mouse.move(ax, ay); await page.waitForTimeout(900); await page.evaluate(() => { window.__hov.length = 0; });
  await go(); await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.up();
  const pressed = await page.evaluate(() => window.__hov.slice());
  assert.deepEqual({ during, after, pressed }, { during: [], after: ['pointerover', 'mouseover', 'mouseenter'], pressed: ['pointerover', 'mouseover', 'mouseenter', 'down:hovered'] });
});

test('page: new words light up once (putting the text back is no change: it used to light them up again and again)', async () => {
  await page.evaluate(() => { document.getElementById('below').textContent = 'Воды минеральные'; });
  await page.waitForTimeout(1600);
  const r = await change(`document.getElementById('below').textContent = 'Воды лечебно-столовые';`, 40, 3500);   /* "Воды" stays, one word is new */
  assert.deepEqual({ words: r.made.words, text: await page.evaluate(() => [document.getElementById('below').childNodes.length, document.getElementById('below').textContent]) }, { words: 1, text: [1, 'Воды лечебно-столовые'] });
});

test('page: what another script runs (an ad slot it fills, data-g-part; auto ads, Glass.morphSkip set by the page before the kit) is not animated, nor is what it pushes', async () => {
  assert.match(await page.evaluate(() => Glass.morphSkip), /^\.ad-auto, \.g-select/);   // the page's selector stays, the kit adds its own
  const fill = await change(`const f = document.createElement('div'); f.id = 'filled'; f.style.height = '60px'; f.textContent = 'an ad'; document.querySelector('#slot ins').appendChild(f);`);
  assert.deepEqual([fill.made.enter, fill.gliding], ['', '']);
  const auto = await change(`const a = document.createElement('div'); a.className = 'ad-auto'; a.style.height = '50px'; a.innerHTML = '<p>auto ad</p>'; document.getElementById('below').before(a);`);
  assert.deepEqual([auto.made.enter, auto.gliding], ['', '']);
  await page.evaluate(() => { document.getElementById('filled').remove(); document.querySelector('.ad-auto').remove(); });
  await page.waitForTimeout(400);
  /* Glass.morph of new markup (a form's answer): the auto ad an ad script put among the content goes at once, it does not fade out */
  const r = await page.evaluate(async () => {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;top:8px;left:8px;width:300px;z-index:9999';   /* in the window whatever was scrolled before */
    box.innerHTML = '<p>first</p><div class="ad-auto" style="height:40px">ad</div><p>second</p>'; document.body.appendChild(box);
    await new Promise(r => setTimeout(r, 300));
    await Glass.morph(box, '<p>first</p><p>second</p><p>third</p>');
    const out = { ghosts: [...box.querySelectorAll('.g-morph-ghost')].map(e => e.className.replace(' g-morph-ghost', '')).join(), entering: box.querySelectorAll('.g-morph-enter').length };
    box.remove(); return out;
  });
  assert.deepEqual(r, { ghosts: '', entering: 1 });
});

test('page: where things stand is read in the background while the tab is hidden: the first change once it is back is animated at once, from where they stand now', async () => {
  const r = await page.evaluate(async () => {
    /* a hidden tab as the browser has it: no frames, what waits for one runs once it is shown again */
    const raf = window.requestAnimationFrame, held = [];
    const vis = h => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
      window.requestAnimationFrame = h ? f => held.push(f) : raf;
      document.dispatchEvent(new Event('visibilitychange'));
      if (!h) held.splice(0).forEach(f => raf(f));
    };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    vis(true);
    const pad = document.createElement('div'); pad.id = 'pad'; pad.style.height = '60px'; document.getElementById('below').before(pad);   /* the page changes while the tab is away: not animated */
    await wait(1500);   /* read meanwhile, when the browser is idle (no frames are drawn for a hidden tab) */
    vis(false);
    const li = document.createElement('li'); li.textContent = 'back'; document.querySelector('#res ol').appendChild(li);   /* right away, once it is back */
    await wait(60);
    const dys = document.getAnimations().filter(x => !(x instanceof CSSAnimation) && x.effect && x.effect.target !== li).map(x => { const k = x.effect.getKeyframes()[0].transform || ''; const m = /translate\([^,]+,\s*(-?[\d.]+)px/.exec(k); return m ? Math.abs(+m[1]) : null; }).filter(v => v);   /* what is below it glides */
    const out = { entered: li.classList.contains('g-morph-enter'), dys: [...new Set(dys.map(Math.round))], rowH: Math.round(li.getBoundingClientRect().height) };
    await wait(800); li.remove(); pad.remove(); await wait(800);
    delete document.hidden; delete document.visibilityState;
    return out;
  });
  assert.equal(r.entered, true);
  assert.ok(r.dys.length && r.dys.every(d => Math.abs(d - r.rowH) <= 2), JSON.stringify(r));   // what is below glides by the new row only, not by what came while the tab was away
});

test('page: a long table written anew turns the numbers that are on the screen only (not one per row of the table)', async () => {
  const r = await page.evaluate(async () => {
    const rows = n => '<table id="big"><tbody>' + Array.from({ length: 900 }, (_, i) => `<tr${i ? "" : " id=\"r0\""}><td>row ${i}</td><td><a>${(i * 7 + n) % 40}</a></td></tr>`).join('') + '</tbody></table>';   /* longer than what is read of the page (2000 elements): the rows below are not known one by one */
    const box = document.createElement('div'); box.id = 'bigbox'; box.innerHTML = rows(0); document.querySelector('main').prepend(box);
    await new Promise(r => setTimeout(r, 900));   /* read as it stands */
    let reels = 0; const mo = new MutationObserver(rs => rs.forEach(x => x.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('g-reel')) reels++; }))); mo.observe(box, { childList: true, subtree: true });
    const t = document.createElement('template'); t.innerHTML = rows(1); document.getElementById('big').replaceWith(t.content.querySelector('table'));   /* every number changed */
    await new Promise(r => setTimeout(r, 300)); mo.disconnect();
    const rowH = document.getElementById('r0').getBoundingClientRect().height, onScreen = Math.ceil(innerHeight / rowH) + 1;
    await new Promise(r => setTimeout(r, 900)); box.remove(); await new Promise(r => setTimeout(r, 600));
    return { reels, onScreen };
  });
  assert.ok(r.reels <= r.onScreen, JSON.stringify(r));   // it was one per row: the table, taller than the window, told nothing of where a cell of it stands
});

test('page: thousands of elements written anew at once (a long table) are not animated; a few are, and a row put into the long table is', async () => {
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const table = (n, k) => '<table><tbody>' + Array.from({ length: n }, (_, i) => `<tr><td>${k}-${i}</td><td><a>${(i + k) % 9}</a></td></tr>`).join('') + '</tbody></table>';
    scrollTo(0, 0); await wait(400);   /* in the window: what is out of it is not animated anyway */
    const box = document.createElement('div'); box.id = 'many'; document.querySelector('main').prepend(box);
    const count = async html => { box.innerHTML = html; await wait(60); const l = [...box.querySelectorAll('.g-morph-enter, .g-reel'), ...document.querySelectorAll('.g-morph-ghost')]; return l.length; };
    box.innerHTML = table(10, 0); await wait(900);
    const few = await count(table(10, 1)); await wait(900);
    box.innerHTML = table(1000, 2); await wait(900);   /* 4000 elements */
    const many = await count(table(1000, 3)); await wait(900);
    /* the same long table, with only what changed put in (a page that patches its rows): 800 new rows, 3200 elements, less than half of it */
    const tb = box.querySelector('tbody'), add = document.createElement('tbody'); add.innerHTML = Array.from({ length: 800 }, (_, i) => `<tr><td>new-${i}</td><td><a>${i % 9}</a></td></tr>`).join('');
    const first = add.rows[0], frag = document.createDocumentFragment(); [...add.rows].forEach(r => frag.appendChild(r));
    tb.insertBefore(frag, tb.rows[2]); await wait(60);
    const patched = first.classList.contains('g-morph-enter');
    await wait(900); box.remove(); await wait(600);
    return { few: few > 0, many, patched };
  });
  assert.deepEqual(r, { few: true, many: 0, patched: true });
});

test('page: a row with an id that comes from far below is not paired with another one that went (it does not glide from that one\'s place)', async () => {
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    scrollTo(0, 0); await wait(400);
    const box = document.createElement('div'); box.innerHTML = '<table><tbody>' + Array.from({ length: 700 }, (_, i) => `<tr id="v${i}"><td>visitor ${i}</td><td><a>${i}</a></td></tr>`).join('') + '</tbody></table>';
    document.querySelector('main').prepend(box); await wait(1200);   /* read: the rows far below are past what is read of the page */
    const tb = box.querySelector('tbody'), far = document.getElementById('v650'), gone = document.getElementById('v3'), before = far.offsetTop;
    gone.remove(); tb.insertBefore(far, document.getElementById('v1'));   /* one leaves near the top, one comes from far below to the top */
    await wait(60);
    const a = far.getAnimations().find(x => !(x instanceof CSSAnimation) && x.effect.getKeyframes().some(k => k.transform && k.transform !== 'none'));
    const m = a && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(a.effect.getKeyframes()[0].transform || ''), dy = m ? Math.round(+m[2]) : null, real = before - far.offsetTop;
    await wait(900); box.remove(); await wait(600);
    return { ok: dy === null || Math.abs(dy - real) <= 3, dy, real };
  });
  assert.ok(r.ok, JSON.stringify(r));   // it glided from the place of the row that went
});

test('page: what changes elsewhere while rows glide (a counter) does not glide them again from where they were read', async () => {
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    scrollTo(0, 0); await wait(400);
    const box = document.createElement('div');
    box.innerHTML = '<p><span id="c1">10</span> <span id="c2">20</span></p><table><tbody>' + Array.from({ length: 12 }, (_, i) => `<tr id="g${i}"><td>row ${i}</td><td>${i}</td></tr>`).join('') + '</tbody></table>';
    document.querySelector('main').prepend(box); await wait(1200);
    const tb = box.querySelector('tbody'), row = document.getElementById('g8'), tops = [];
    let on = true; const tick = () => { tops.push(row.getBoundingClientRect().top); if (on) requestAnimationFrame(tick); };
    tb.insertAdjacentHTML('afterbegin', '<tr id="n1"><td>new 1</td><td>1</td></tr><tr id="n2"><td>new 2</td><td>2</td></tr><tr id="n3"><td>new 3</td><td>3</td></tr>');   /* the rows below go down by three */
    requestAnimationFrame(tick);
    await wait(80); document.getElementById('c1').textContent = '11';   /* read while they glide */
    await wait(100); document.getElementById('c2').textContent = '21';   /* and once more */
    await wait(900); on = false; await wait(50); box.remove(); await wait(600);
    const back = tops.slice(1).map((t, i) => tops[i] - t).filter(d => d > 1.5);   /* a row going down never goes up meanwhile */
    return { ok: !back.length, back: back.map(Math.round), from: Math.round(tops[0]), to: Math.round(tops[tops.length - 1]) };
  });
  assert.ok(r.ok, JSON.stringify(r));   // it jumped back to where it was when the counter's change read it, and came again
});

test('page: a browser that does not keep up gets less motion, step by step, and more again once it keeps up', async () => {
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    scrollTo(0, 0); await wait(400);
    Glass.morph.motion(0);
    const box = document.createElement('div');
    box.innerHTML = '<ul>' + Array.from({ length: 12 }, (_, i) => `<li data-key="m${i}">row ${i}</li>`).join('') + '</ul>';
    document.querySelector('main').prepend(box); await wait(1200);
    const ul = box.querySelector('ul'), glides = () => ul.querySelectorAll('li').length && [...ul.children].filter(li => li.getAnimations().some(a => a.id === 'g-morph')).length;
    const update = async () => { ul.prepend(ul.lastElementChild); await wait(60); const n = glides(); await wait(1000); return n; };   /* a row moves to the top: the rest glide */
    const first = await update();
    let hog = true; const frame = () => { const t = performance.now(); while (performance.now() - t < 50); if (hog) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);   /* every frame takes 50 ms: 20 frames a second */
    await update(); await update();
    const slow = Glass.morph.motion(), mark = document.documentElement.getAttribute('data-g-motion');
    hog = false; await wait(300);
    const calm = await update();   /* at step 1 rows still glide; set 2: they do not */
    Glass.morph.motion(2); const still = await update(); Glass.morph.motion(1);
    for (let i = 0; i < 5; i++) await update();
    const back = Glass.morph.motion(), unmarked = !document.documentElement.hasAttribute('data-g-motion');
    box.remove(); Glass.morph.motion(0); await wait(600);
    return { first, slow, mark, calm, still, back, unmarked };
  });
  assert.ok(r.first > 0, JSON.stringify(r));   // smooth: the rows glide
  assert.equal(r.slow, 1, JSON.stringify(r));   // two slow updates: one step less
  assert.equal(r.mark, '1');
  assert.ok(r.calm > 0, JSON.stringify(r));   // step 1 still glides
  assert.equal(r.still, 0, JSON.stringify(r));   // step 2 does not
  assert.equal(r.back, 0, JSON.stringify(r));   // five smooth ones: back to all of it
  assert.ok(r.unmarked);
});

test('page: a table written anew keeps its columns in place: the kit sets their widths before the rows are read, ghost cells are no columns', async () => {
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    scrollTo(0, 0); await wait(400);
    const row = (id, a, b, c) => `<tr id="${id}"><td>${a}</td><td>${b ? '<a>' + b + '</a>' : ''}</td><td>${c ? '<a>' + c + '</a>' : ''}</td></tr>`;
    const box = document.createElement('div');
    box.innerHTML = '<table id="fitT"><thead><tr><th>code</th><th>country</th><th>city</th></tr></thead><tbody>' +
      Array.from({ length: 8 }, (_, i) => row('t' + i, '+35' + i, 'a long country name ' + i, 'city ' + i)).join('') + '</tbody></table>';
    document.querySelector('main').prepend(box); await wait(1200);
    const t = box.querySelector('table'), frames = [];
    let on = true; const tick = () => { const cg = t.querySelector(':scope > colgroup'); frames.push(cg ? cg.children.length : 0); if (on) requestAnimationFrame(tick); };
    /* the first row stays and loses its long cells (they fade out in it), the rest are new */
    t.tBodies[0].innerHTML = row('t0', '+350', '', '') + Array.from({ length: 6 }, (_, i) => row('n' + i, '+357 ' + i, 'Cy', 'a much longer city name than before ' + i)).join('');
    requestAnimationFrame(tick);
    await wait(1000); on = false; await wait(50); box.remove(); await wait(600);
    return { frames: [...new Set(frames)] };
  });
  assert.deepEqual(r.frames, [3], JSON.stringify(r));   // a frame without the kit's columns (the browser's widths), then 5 of them while the ghost cells were in the row
});

test('page: the page still runs without script errors', () => { assert.deepEqual(errors, []); });
