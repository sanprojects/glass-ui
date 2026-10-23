// A :has() left of the element a rule styles makes Chrome restyle every element under the one that :has() was tested on, on every change
// below it, unless the styled element is told by a tag, a class, an id or an attribute (Blink: the pseudo-has invalidation set of a
// featureless compound is "all descendants"). On <body> that is the whole page per change: sanstv.ru/find-words, 23.10.2026, CPU 4x:
// 4495 elements and 221 ms of style per load, 3470 and 154 ms with the featureless rules gone. So the element a rule with such a :has()
// styles names itself: `[role="tablist"]:has(...) > :first-child` restyles the whole tab bar's subtree, `... > :is(button, [role="tab"]):first-child`
// only the tabs. A :has() in the styled element itself (`body:has(dialog[open])`) restyles only that element and is not checked.
// node test/has.test.mjs [file.css ...] lists the rules of other stylesheets too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Split at the top level (outside brackets, parens and strings) wherever `at(s, i)` gives the length of a separator.
function split(s, at) {
  const out = []; let depth = 0, quote = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (!depth) { const n = at(s, i); if (n) { out.push(s.slice(start, i)); start = i + n; i += n - 1; continue; } }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
  }
  out.push(s.slice(start));
  return out;
}
const list = s => split(s, (t, i) => t[i] === ',' ? 1 : 0).map(x => x.trim()).filter(Boolean);
// Compounds of a complex selector. A pseudo-element Blink renders in a shadow tree (::details-content, ::placeholder, ::-webkit-*) starts a compound of its own.
const SHADOW = /^::(details-content|placeholder|file-selector-button|part|slotted|picker|-webkit-|-moz-)/;
const compounds = s => split(s.trim().replace(new RegExp(`(?<!:)(?=${SHADOW.source.slice(1)})`, 'g'), ' '), (t, i) => /[\s>+~]/.test(t[i]) ? 1 : 0)
  .map(x => x.trim()).filter(Boolean);

// Does the compound name its element: a tag, a class, an id, an attribute, or an :is()/:where() all of whose branches do.
function named(c) {
  if (/^[a-z]/i.test(c)) return true;
  let found = false;
  split(c, (t, i) => {
    if (found) return 0;
    if (t[i] === '.' || t[i] === '#' || t[i] === '[') found = true;
    else if (t.startsWith(':is(', i) || t.startsWith(':where(', i)) {
      const open = t.indexOf('(', i);
      found = list(t.slice(open + 1, close(t, open))).every(b => named(compounds(b).at(-1)));
    }
    return 0;
  });
  return found;
}
function close(s, open) { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')' && !--d) return i; } return s.length; }

// Every selector of a stylesheet, with its line.
export function selectors(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  let prelude = '', from = 0, skip = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      const p = prelude.trim();
      if (skip || /^@(keyframes|font-face|property|counter-style|page|view-transition)/.test(p)) skip++;
      else if (!p.startsWith('@')) {
        const line = text.slice(0, from + prelude.search(/\S/)).split('\n').length;
        for (const sel of list(p)) out.push({ sel, line });
        skip = 1;
      }
      prelude = ''; from = i + 1;
    } else if (c === '}') { if (skip) skip--; prelude = ''; from = i + 1; }
    else if (c === ';' && !skip) { prelude = ''; from = i + 1; }
    else if (!skip) prelude += c;
  }
  return out;
}

// A :has() left of a styled element that names nothing, in the selector or in a selector inside its :is()/:where().
function offends(sel) {
  const cs = compounds(sel), last = cs.at(-1);
  if (cs.slice(0, -1).some(c => c.includes(':has(')) && !named(last)) return true;
  let found = false;
  split(last, (t, i) => {
    if (!found && (t.startsWith(':is(', i) || t.startsWith(':where(', i))) { const open = t.indexOf('(', i); found = list(t.slice(open + 1, close(t, open))).some(offends); }
    return 0;
  });
  return found;
}
export const offenders = css => selectors(css).filter(({ sel }) => offends(sel));

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.length > 2) {
  for (const f of process.argv.slice(2)) for (const o of offenders(fs.readFileSync(f, 'utf8'))) console.log(`${f}:${o.line}  ${o.sel}`);
} else {
  for (const f of fs.readdirSync(root).filter(f => /^glass-.*\.css$/.test(f) && !f.includes('.min.'))) {
    test(`${f}: no :has() restyles everything under it`, () => {
      const found = offenders(fs.readFileSync(path.join(root, f), 'utf8'));
      assert.deepEqual(found.map(o => `${f}:${o.line} ${o.sel}`), []);
    });
  }
  test('the check finds what it is for', () => {
    const css = `a:has(b) > * {} a:has(b) > :not(c) {} details:has(> p)::details-content {} t:has(x) > :first-child {} :where(a:has(b) > *) {}
      a:has(b) > c {} a:has(b) > .c {} a:has(b) > :is(c, [d]) {} body:has(dialog) {} a > b:has(c) {} @media (x) { a:has(b) > d {} }`;
    assert.deepEqual(offenders(css).map(o => o.sel), ['a:has(b) > *', 'a:has(b) > :not(c)', 'details:has(> p)::details-content', 't:has(x) > :first-child', ':where(a:has(b) > *)']);
  });
}
