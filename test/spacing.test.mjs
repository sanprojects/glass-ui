// Spacing test: every gap between sibling boxes in the demo is on the rhythm, and the stylesheet keeps its spacing rules.
//   node --test test/spacing.test.mjs     (needs: npm i && npx playwright install chromium; CHROMIUM_PATH optional)
// Rhythm: --g-gap (16px) between elements, 0 for joined groups, --g-gap-inner (8px) inside one component,
// 4px or less for tight segmented groups (tabs, pager pages, nav links). Dialogs and popovers are opened to be measured.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE = `(() => {
  const ok = e => { const cs = getComputedStyle(e); if (cs.display==='none'||cs.visibility==='hidden'||cs.position==='absolute'||cs.position==='fixed') return false;
    if (!e.checkVisibility()) return false;   // the body of a closed <details> keeps its box but is not rendered
    if (/^(SCRIPT|STYLE|TEMPLATE|OPTION|LINK|META|BR|COL|COLGROUP)$/.test(e.tagName)) return false; const r=e.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const path = e => { const p=[]; while(e&&e!==document.body&&p.length<4){ p.unshift(e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:'')); e=e.parentElement;} return p.join(' > '); };
  const st=document.createElement('style'); st.textContent='*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(st);
  document.querySelectorAll('dialog').forEach(d=>{ try{ d.show(); d.style.position='static'; d.style.margin='0'; }catch(e){} }); document.querySelectorAll('[popover]').forEach(d=>{ try{ d.showPopover(); }catch(e){} });
  const roots = [...document.querySelectorAll('.demo, .g-shell, [data-code], dialog, [popover]')].filter(e=>!e.closest('.code, pre'));
  const seen = new Set(), out = [];
  const INNER='.g-field, hgroup, .g-empty, .g-file__drop, .g-file__main, .g-file__row, .g-file__item, blockquote, .g-list > li, .g-toast, [data-tile], summary, a, button, label, data, th, td, [role=menu], [role=listbox], [role=option], .g-select__value';
  const TIGHT='[role=tablist], .g-pager__pages, nav > ul, .g-shell__head [role=tablist]';
  const allowedIn = c => c.matches(INNER) ? 8 : (c.matches(TIGHT) ? 'tight' : null);
  const visit = c => { if (seen.has(c) || c.closest('pre,.code,[data-code-src]')) return; seen.add(c);
    const cs0 = getComputedStyle(c);
    if (cs0.display==='grid' || cs0.display==='inline-grid') { const rg=parseFloat(cs0.rowGap)||0, cg=parseFloat(cs0.columnGap)||0; if (c.children.length>1) { out.push({axis:'gv', gap:rg, allowed:allowedIn(c), at:path(c), a:'grid', b:'rows'}); out.push({axis:'gh', gap:cg, allowed:allowedIn(c), at:path(c), a:'grid', b:'cols'}); } c.querySelectorAll(':scope > *').forEach(visit); return; }
    if (c.closest('tfoot')) return;
    const kids = [...c.children].filter(ok).filter(k=>getComputedStyle(k).float==='none' && k.getAttribute('role')!=='progressbar');
    for (let i=1;i<kids.length;i++){ const a=kids[i-1].getBoundingClientRect(), b=kids[i].getBoundingClientRect();
      const vOverlap = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) > 1, hOverlap = Math.min(a.right,b.right)-Math.max(a.left,b.left) > 1;
      let axis=null, gap=null;
      if (hOverlap && vOverlap && !/^(grid|inline-grid)$/.test(getComputedStyle(c).display)) out.push({axis:'overlap', gap:-1, allowed:null, at:path(c), a:path(kids[i-1]).split(' > ').pop(), b:path(kids[i]).split(' > ').pop()});
      if (hOverlap && !vOverlap && b.top >= a.bottom-0.5) { axis='v'; gap=b.top-a.bottom; }
      else if (vOverlap && !hOverlap && b.left >= a.right-0.5) { axis='h'; gap=b.left-a.right; }
      const jc = getComputedStyle(c).justifyContent; const dist = /space-(between|around|evenly)/.test(jc); const allowed = kids[i-1].tagName==='LEGEND' ? 8 : allowedIn(c);
      if (axis && !dist) out.push({axis, gap: Math.round(gap*10)/10, allowed, at: path(c), a: path(kids[i-1]).split(' > ').pop(), b: path(kids[i]).split(' > ').pop()}); }
    for (const k of c.children) visit(k); };
  roots.forEach(visit); return out; })()`;
let browser, found;

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('file://' + path.join(root, 'index.html')); await page.waitForTimeout(1200);
  await page.evaluate(() => Glass.init(document));
  found = await page.evaluate(MEASURE);
});
after(async () => { await browser.close(); });

const onRhythm = r => r.gap === 0 || r.gap === 16 || (r.allowed === 8 && r.gap === 8) || (r.allowed === 'tight' && r.gap <= 4);

test('the demo has measurable layouts', () => { assert.ok(found.length > 150, 'measured ' + found.length + ' pairs'); });

test('every gap between neighbouring boxes is on the rhythm', () => {
  const bad = found.filter(r => !onRhythm(r)).map(r => `${r.at} [${r.axis}] ${r.a} / ${r.b}: ${r.gap}px`);
  assert.deepEqual(bad, []);
});

test('the stylesheet keeps its spacing rules', () => {
  const css = readFileSync(path.join(root, 'glass-ui.css'), 'utf8');
  // gaps are tokens; only 0 and the tight 2px / 4px steps may be literal
  const literalGaps = [...css.matchAll(/(?<![-\w])(?:row-|column-)?gap:\s*(\d+)px/g)].map(m => m[0]).filter(g => !/\b[024]px/.test(g) && !/--g-gap:/.test(g));
  assert.deepEqual(literalGaps, []);
  // margins are not used for spacing between elements: what is left is optical alignment inside a control (icons, range thumb, underline tabs, chip cross, the last closed fold),
  // the card media bleed, the hairlines of a plain list, the menu separator, the listbox search, the legend (outside the fieldset's flow), the offset of a menu / listbox / tooltip
  // from its anchor, the ruler's distance from the edge (Glass.ruler reads it) and .g-prose
  const margins = [...css.matchAll(/(?<![-\w])margin(?:-[a-z]+)?:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^(0|auto|0 auto)$/.test(v));
  assert.ok(margins.length <= 21, 'non-zero margins: ' + margins.length + ' (expected the known exceptions, at most 21)');
});
