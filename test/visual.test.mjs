// Whole-page visual check of the kit: node --test test/visual.test.mjs  (UPDATE_VISUAL=1 writes new baselines to test/visual/)
// One shared Chromium, one page per variant, all taken at once; animations and clocks are frozen, so a run repeats pixel for pixel.
// The images are compared in the browser (canvas), so there is no image library to install. A change shows in test/visual/<name>.diff.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url)), dir = path.join(here, 'visual');
const url = 'file://' + path.resolve(here, '../index.html');
const variants = {
  'desktop-dark': { viewport: { width: 1400, height: 900 } },
  'desktop-light': { viewport: { width: 1400, height: 900 }, theme: 'light' },
  'phone-dark': { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true },
};
const freeze = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
.g-anim-scroll, .m-wave { visibility: hidden !important; }   /* driven by scroll position and the clock: never the same twice */`;
let browser; const shots = {}, errors = [];

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await Promise.all(Object.entries(variants).map(async ([name, { theme, ...opts }]) => {
    const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.addInitScript(() => { const t = Date.parse('2026-01-01T12:00:00Z'); Date.now = () => t; Math.random = () => 0.5; });
    await page.goto(url, { waitUntil: 'load' });
    if (theme) await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.addStyleTag({ content: freeze });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    shots[name] = await page.screenshot({ fullPage: true });
    await ctx.close();
  }));
});
after(async () => { await browser.close(); });

// pixels that differ by more than 3/255 in some channel; the diff picture marks them red on the faded page
const compare = (a, b) => browser.newPage().then(async page => {
  try {
    return await page.evaluate(async ([a, b]) => {
      const load = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + s; });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const w = x.width, h = x.height, px = i => { const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }); c.drawImage(i, 0, 0); return c.getImageData(0, 0, w, h); };
      const p = px(x), q = px(y), out = new ImageData(w, h); let bad = 0, top = h, bottom = 0;
      for (let k = 0; k < p.data.length; k += 4) {
        const d = Math.max(Math.abs(p.data[k] - q.data[k]), Math.abs(p.data[k + 1] - q.data[k + 1]), Math.abs(p.data[k + 2] - q.data[k + 2]));
        if (d > 3) { bad++; const row = (k / 4 / w) | 0; if (row < top) top = row; if (row > bottom) bottom = row; out.data.set([255, 0, 0, 255], k); } else out.data.set([q.data[k], q.data[k + 1], q.data[k + 2], 70], k);
      }
      if (!bad) return { bad };
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(await createImageBitmap(out), 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let k = 0; k < buf.length; k += 8192) s += String.fromCharCode(...buf.subarray(k, k + 8192));
      return { bad, top, bottom, diff: btoa(s) };
    }, [a.toString('base64'), b.toString('base64')]);
  } finally { await page.close(); }
});

for (const name of Object.keys(variants)) {
  test(`the whole page looks as it did: ${name}`, async () => {
    const file = path.join(dir, name + '.png'), now = shots[name];
    if (process.env.UPDATE_VISUAL || !fs.existsSync(file)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, now); return; }
    if (now.equals(fs.readFileSync(file))) return;
    const r = await compare(fs.readFileSync(file), now);
    if (r.size) assert.fail(`${name}: the page is ${r.size[2]}x${r.size[3]}px, it was ${r.size[0]}x${r.size[1]}px (UPDATE_VISUAL=1 accepts it)`);
    if (r.bad) { fs.writeFileSync(path.join(dir, name + '.diff.png'), Buffer.from(r.diff, 'base64')); assert.fail(`${name}: ${r.bad} pixels changed, rows ${r.top}-${r.bottom}; see test/visual/${name}.diff.png (UPDATE_VISUAL=1 accepts it)`); }
  });
}
test('the page has no script errors', () => assert.deepEqual(errors, []));
