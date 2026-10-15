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

test('page: the page still runs without script errors', () => { assert.deepEqual(errors, []); });
