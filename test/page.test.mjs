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
  const out = {}, made = { reels: 0, enter: [] };
  const mo = new MutationObserver(rs => rs.forEach(r => {
    r.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('g-reel')) made.reels++; });
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
  out.made = { reels: made.reels, enter: [...new Set(made.enter)].join() };
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

test('page: glass in a wrapper (<a><article>) fades itself and keeps its blur (a wrapper that fades would take the blur away)', async () => {
  const r = await change(`document.getElementById('tiles').innerHTML += '<a href="#t2"><article style="backdrop-filter: blur(4px); padding: 8px">tile two</article></a>';
    await new Promise(r => setTimeout(r, 20)); const a = document.querySelector('#tiles a[href="#t2"]'), art = a.firstElementChild;
    out.on = { a: a.classList.contains('g-morph-enter'), article: art.classList.contains('g-morph-enter'), blur: getComputedStyle(art).backdropFilter };`);
  assert.deepEqual({ on: r.on, after: await page.evaluate(() => getComputedStyle(document.querySelector('#tiles a[href="#t2"] article')).backdropFilter) },
    { on: { a: false, article: true, blur: 'blur(4px)' }, after: 'blur(4px)' });
});

test('page: the page still runs without script errors', () => { assert.deepEqual(errors, []); });
