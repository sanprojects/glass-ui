/*!
 * Glass Morph — animates what changes on a page. No dependencies: a library of its own (glass-morph.js + glass-morph.css). With Glass UI
 * (glass-ui.js) on the page it also measures the kit's [data-g-fit] columns in an update, highlights with the kit and ends the kit's busy line.
 *
 * Glass.morph(target, next, opts)
 * Replaces the content of `target` with `next` (an element or an HTML string) and animates the difference, for ANY elements at any depth:
 *   - all at once, nothing waits: an element that is gone fades out where it stood (.g-morph-ghost, out of the flow) while the new ones
 *     slide in (.g-morph-enter, one after another), the rest glides to its new place and the box takes its new height; all end together;
 *   - an element that is in both trees stays the same node, it is patched in place (attributes, text): nothing replays on it, focus, scroll,
 *     what the user typed and animations that run survive;
 *   - an element that is in both trees but stands in another place (a list that was sorted again) glides there from where it stood (opts.move);
 *   - in a text that changed the new words light up (.g-morph-word); a change that adds no word is highlighted (g-anim-highlight / .g-morph-flash);
 *   - a number that became another number (6 -> 13, 63% -> 71%) turns its changed digits like the reels of an odometer: units first, up when it grew,
 *     down when it fell (.g-reel).
 * Returns a Promise: true when the DOM is patched, false when a newer call for the same target superseded this one.
 * How an old element is paired with a new one (siblings of one parent): 1) by key: opts.key(el), data-key or id (only when it is unique among
 * the siblings; the same id on every row is ignored), otherwise by tag + text (a list row is its word), and with no text by tag + src / href / name /
 * type / data-icon; what is still the same (two of a kind) is told apart by the order among them; 2) the rest, of one tag: containers
 * (with child elements) in order, they are walked into; a single leaf for a single leaf is the same element with another text. A list row (<li>)
 * is paired that way only when nothing but its numbers changed: a row with other words is another row.
 * Only what is on the screen is animated: an element outside the viewport is patched without an animation and takes no part in the stagger.
 * Hidden tab: patched at once. Reduced motion: patched at once, what is new fades in and new words only tint.
 * opts: key(el) -> string | null; keep(el) -> true: an element (of the box) that is paired stays as it is, nothing in it is patched (the form being sent);
 * leave / enter / flash / reel / move / height: false switches a part off.
 * What a script built into the page's markup (a UI kit's controls) is not the page's: the new markup does not have it, and it stays as it is.
 *   data-g-part            an element a script put in or runs (a button, a panel, an ad slot another script fills): left where it stands,
 *                          nothing in it is patched, and on a watched page what changes in it is not animated;
 *   data-g-wrap            a box a script put around elements of the page (a select in its combobox): left where it stands, and what of the
 *                          page is in it (its children that are not parts) is paired and patched as if it stood in its place;
 *   data-g-attrs="a b"     attributes of the element that a script owns (one it set, one it took away): left as they are.
 * Timing: --g-morph-leave, --g-morph-enter, --g-morph-stagger, --g-morph-reel, --g-morph-reel-stagger, --g-morph-move (CSS, on :root or on the target).
 *
 * <div data-g-morph>   whatever a script, a framework or the page changes in it is animated as Glass.morph does (rows go, come in, glide, a
 *                      number turns); its new nodes stay the page's. Glass.watch(el) for a box made later by hand (returns a function that stops).
 * <body data-g-morph>  the whole page: not while it loads, a box with its own data-g-morph in it animates its own changes, what is not content
 *                      is left out (ASIDE: popover, dialog, svg, edited text, aria-hidden), data-g-no-morph leaves a part out.
 * Glass.morphSkip = 'selector'   parts that are not content for it (a UI kit's widgets that run by themselves, what other scripts put in: ads);
 *                                set it before glass-ui.js loads (window.Glass = { morphSkip: '...' }) or add to it later: glass-ui.js adds its own.
 * The animations are CSS (glass-morph.css): .g-morph-enter (what comes in) and .g-morph-ghost (what goes), their timing in custom properties
 * that inherit (--g-morph-d: when, --g-morph-enter / --g-morph-run: how long). A page can move them to a part of the element in its own CSS
 * (an element that fades is a backdrop root: glass, backdrop-filter, in it blurs nothing until the fade ends; let the glass fade itself).
 */
(function (global) {
  'use strict';
  const kit = global.Glass = global.Glass || {};   /* glass-ui.js adds to the same object, whichever of the two comes first (kit.fit, kit.animate, kit.busy are its) */
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  /* a [data-g-fit] box of the kit (its columns take the width of the words): measured now, in the reads of an update */
  const fitBox = b => { if (b._gFit) b._gFit(); else if (kit.fit) kit.fit(b); };
  const morph = (() => {
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);   /* never paired, never animated */
    const FORM = new Set(['INPUT', 'TEXTAREA', 'SELECT']);               /* the user's value is not touched, they are not walked into */
    const KEEP = new Set(['data-new', 'data-g-new', 'data-g-attrs']);    /* entrance markers of the rows; what a script owns */
    const NUM = /^[\d\s., ]*\d[\d\s., ]*%?$/, MAX = 300;   /* a number, with a percent sign after it */
    /* the numbers of a box are the same things with new values only when nothing but digits differs in its text (another row of a list has other words) */
    const sameButDigits = (a, b) => a.textContent.replace(/[\d\s.,%]/g, '') === b.textContent.replace(/[\d\s.,%]/g, '');
    /* the paired elements stand in another order than before: they are moved, not only changed */
    const reordered = ps => ps.slice().sort((a, b) => a[0] - b[0]).some((p, k, a) => k && p[1] < a[k - 1][1]);
    const isNum = e => !e.children.length && NUM.test(e.textContent);
    const AUX = /(^|\s)g-morph-ghost(\s|$)/;   /* what fades out of the last update: not content */
    /* the children that are content; a script's part is not, the page's elements in a script's wrap stand in its place */
    const kids = p => { const out = []; for (const c of p.children) { if (SKIP.has(c.tagName) || AUX.test(c.className) || c.hasAttribute('data-g-part')) continue; if (c.hasAttribute('data-g-wrap')) out.push(...kids(c)); else out.push(c); } return out; };
    const part = n => !!n && n.nodeType === 1 && n.hasAttribute('data-g-part');
    const up = e => { let p = e.parentElement; while (p && p.hasAttribute('data-g-wrap')) p = p.parentElement; return p; };   /* the parent, a script's wraps left out */
    const later = (el, cls, ms, then) => setTimeout(() => { el.classList.remove(cls); if (!el.className) el.removeAttribute('class'); if (then) then(); }, ms);
    /* the animations of an update start with the first frame drawn after it, up to ~100 ms after the update itself (a large one): what is cleared when they
       are over counts from there, so it neither cuts them short nor lays the page out while they still move */
    const settled = f => requestAnimationFrame(() => requestAnimationFrame(f));
    const quiet = () => document.hidden;
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;   /* less motion: nothing slides, glides or turns; what is new or changed fades */
    /* in the viewport and with a size: one getBoundingClientRect per element, the reads go in a batch */
    const onScreen = r => !!(r.width || r.height) && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    const inView = el => onScreen(el.getBoundingClientRect());
    /* Before the patch, content the browser skips (in a content-visibility: auto box out of the viewport) is not measured: a read would make it lay all that content out.
       Told by the box (its own rect is there without its content); returns [box, its rect] or null. One per batch of reads: each box is looked up once */
    const skipper = () => {
      const m = new Map();
      return el => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          let v = m.get(p);
          if (v === undefined) { v = false; if (getComputedStyle(p).contentVisibility === 'auto') { const r = p.getBoundingClientRect(); if (!onScreen(r)) v = r; } m.set(p, v); }
          if (v) return [p, v];
        }
        return null;
      };
    };
    function sig(el) {
      if (FORM.has(el.tagName)) return (el.getAttribute('name') || '') + '|' + (el.getAttribute('type') || '');
      return el.textContent.trim();
    }
    /* a key that is set on purpose is the identity of the element in the whole tree: opts.key(el), data-key, id (an id is unique in a document) */
    function explicitKey(el, o) {
      const k = o.key && o.key(el), d = k != null ? k : el.getAttribute('data-key');
      return d != null && d !== '' ? 'k:' + d : el.id ? 'id:' + el.id : null;
    }
    /* where the element stands, from the container (the box that is morphed) down: TAG[index among the children of its parent]/TAG[...]/... */
    function path(el, root) {
      const p = [];
      for (let e = el; e && e !== root; e = up(e)) p.push(e.tagName + (up(e) ? kids(up(e)).indexOf(e) : ''));
      return p.reverse().join('/');
    }
    /* what an element with no text is told by: the tag, what it points at, and the full path to it, so that no two of them have one key */
    const looks = (el, root) => el.tagName + '|' + ['src', 'href', 'name', 'type', 'data-icon'].map(a => el.getAttribute(a) || '').join('|') + '|' + path(el, root);
    /* The roots of the two trees that are compared (set while a morph runs): the container and the new content */
    let R = null;
    /* the key of every element of a sibling list: a set key, else the tag and the text, else (no text) the tag, what it points at and the path; a key that repeats gets #2, ... */
    function keys(list, o, root) {
      const seen = {}, explicit = [];
      return { explicit, keys: list.map(el => {
        const own = explicitKey(el, o), text = sig(el); explicit.push(own ? (own.startsWith('id:') ? 'id' : 'key') : false);
        const k = own || (text ? el.tagName + '|' + text : looks(el, root));
        seen[k] = (seen[k] || 0) + 1; return k + '#' + seen[k];
      }) };
    }
    /* the same list row or keyed element in the whole old tree and the whole new one: a word that moved to another list (rows grouped by length) is still that word.
       Only what is unique by its key in both trees is paired. G = { map: new element -> old element, claimed: Set of old elements } while a morph runs */
    let G = null;
    function globalPairs(target, next, o) {
      const key = e => { const k = explicitKey(e, o); if (k) return k; const t = e.tagName === 'LI' && sig(e); return t ? 'LI|' + t : null; };   /* a set key or id, else a list row is its text; what repeats is not paired */
      const index = root => { const m = new Map(); root.querySelectorAll('ol > li, ul > li, [data-key], [id]').forEach(e => { const k = key(e); if (k != null) m.set(k, m.has(k) ? null : e); }); return m; };
      const old = index(target), fresh = index(next), g = { map: new Map(), claimed: new Set() };
      fresh.forEach((n, k) => { const e = old.get(k); if (n && e) { g.map.set(n, e); g.claimed.add(e); } });
      return g;
    }
    /* the boxes whose content was all taken out before the patch (what leaves goes first): still boxes, not leaves, when they are paired */
    let HOLLOW = new WeakSet();
    const box = e => e.children.length > 0 || HOLLOW.has(e);
    /* pairs of indexes [old, new] and the unpaired of both sides */
    function match(oldL, newL, o, nums) {   /* nums: a function, asked only when there are numbers left to pair (it reads the text of the whole box) */
      const ok = keys(oldL, o, R && R.old), nk = keys(newL, o, R && R.next), byKey = {}, usedO = {}, usedN = {}, pairs = [], groups = {};
      ok.keys.forEach((k, i) => { byKey[k] = i; });
      nk.keys.forEach((k, j) => { if (k in byKey) { pairs.push([byKey[k], j]); usedO[byKey[k]] = usedN[j] = 1; } });
      const foreign = [];   /* [new index, the old element of another parent that it is] */
      if (G) {
        const at = new Map(oldL.map((e, i) => [e, i]));
        newL.forEach((n, j) => {
          const e = !usedN[j] && G.map.get(n), i = e && at.has(e) ? at.get(e) : -1;
          if (i >= 0 && !usedO[i]) { pairs.push([i, j]); usedO[i] = usedN[j] = 1; } else if (e && i < 0) { foreign.push([j, e]); usedN[j] = 1; }
        });
        oldL.forEach((e, i) => { if (!usedO[i] && G.claimed.has(e)) usedO[i] = 1; });   /* it goes to its new place, it is not removed here */
      }
      const grp = el => groups[el.tagName] || (groups[el.tagName] = { o: [], n: [] });
      /* an id is a key only against the same id: an element whose id is not on the other side (one a script gave, as a UI kit gives its tabs)
         is paired as one with none, by its kind, text and place; a data-key (or opts.key) is a key the page set, it pairs only with itself */
      const loose = (x, i) => x.explicit[i] !== 'key';
      oldL.forEach((el, i) => { if (!usedO[i] && loose(ok, i) && !FORM.has(el.tagName)) grp(el).o.push(i); });
      newL.forEach((el, j) => { if (!usedN[j] && loose(nk, j) && !FORM.has(el.tagName)) grp(el).n.push(j); });
      Object.keys(groups).forEach(tag => {
        const g = groups[tag], oc = g.o.filter(i => box(oldL[i])), nc = g.n.filter(j => newL[j].children.length);
        /* boxes are walked into in order, but only a box of the same kind (its first class): a list does not turn into the "nothing found" card */
        const kind = e => e.classList[0] || '', queue = {};
        /* a list row is its text: a row with other words is another row (it slides in, the old one out), not this one with a new text; only its numbers may change (a counter) */
        const same = (a, b) => a.tagName !== 'LI' || sameButDigits(a, b);
        nc.forEach(j => (queue[kind(newL[j])] = queue[kind(newL[j])] || []).push(j));
        oc.forEach(i => { const q = queue[kind(oldL[i])], k = q ? q.findIndex(j => same(oldL[i], newL[j])) : -1; if (k >= 0) { const j = q.splice(k, 1)[0]; pairs.push([i, j]); usedO[i] = usedN[j] = 1; } });
        const ol = g.o.filter(i => !usedO[i]), nl = g.n.filter(j => !usedN[j]);
        const one = ol.length === 1 && nl.length === 1 && same(oldL[ol[0]], newL[nl[0]]) && (kind(oldL[ol[0]]) === kind(newL[nl[0]]) || (!oldL[ol[0]].children.length && !newL[nl[0]].children.length));   /* one for one: a leaf, or a box of the same kind */
        if (one) { pairs.push([ol[0], nl[0]]); usedO[ol[0]] = usedN[nl[0]] = 1; }
        else if (ol.length && nl.length && nums()) {   /* a row of numbers (<data>63%</data><data>13</data>): the numbers that changed are the same elements, in order, so their digits turn */
          const on = ol.filter(i => isNum(oldL[i])), nn = nl.filter(j => isNum(newL[j]));
          /* a percent is not a count: the numbers of one class go together */
          new Set(on.map(i => oldL[i].className)).forEach(c => {
            const oi = on.filter(i => oldL[i].className === c), nj = nn.filter(j => newL[j].className === c);
            for (let k = 0; k < Math.min(oi.length, nj.length); k++) { pairs.push([oi[k], nj[k]]); usedO[oi[k]] = usedN[nj[k]] = 1; }
          });
        }
      });
      return { pairs, foreign, oldL, newL, removed: oldL.filter((_, i) => !usedO[i]) };
    }
    /* phase 1: the old elements that have no pair in the new tree (the top one of a removed subtree) */
    function collect(op, np, o, out, moved) {
      const m = match(kids(op), kids(np), o, () => sameButDigits(op, np));
      out.push(...m.removed);
      if (moved) m.pairs.forEach(([i]) => moved.add(m.oldL[i]));   /* on a level that changes the others may be pushed: their rects are read before the DOM is touched (apply) */
      m.pairs.forEach(([i, j]) => { const a = m.oldL[i], b = m.newL[j]; if (!FORM.has(a.tagName) && !(o.keep && o.keep(a)) && !a.isEqualNode(b)) collect(a, b, o, out, moved); });
    }
    function syncAttrs(a, b) {
      const form = FORM.has(a.tagName), own = a.getAttribute('data-g-attrs'), mine = own ? own.split(/\s+/) : [];   /* a script's: left as they are */
      [...b.attributes].forEach(x => { if (!(form && /^(value|checked|selected)$/.test(x.name)) && !mine.includes(x.name) && a.getAttribute(x.name) !== x.value) a.setAttribute(x.name, x.value); });
      [...a.attributes].forEach(x => {
        if (b.hasAttribute(x.name) || KEEP.has(x.name) || mine.includes(x.name) || (x.name === 'style' && a.classList.contains('g-morph-enter'))) return;
        if (x.name === 'style' && a.style.getPropertyValue('--g-text-w')) { const w = a.style.getPropertyValue('--g-text-w'); a.removeAttribute('style'); a.style.setProperty('--g-text-w', w); return; }   /* the measure of data-g-fit is the kit's own, it is not in the new markup and nothing would measure it again */
        a.removeAttribute(x.name);
      });
    }
    /* the SVG filters of the reels: Gaussian blur along Y only, in 3 strengths; added to the page on the first reel */
    function blurFilters() {
      if (document.getElementById('g-reel-blur-1')) return;
      document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' +
        [1.5, 3, 5].map((v, i) => `<filter id="g-reel-blur-${i + 1}" x="-20%" y="-50%" width="140%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 ${v}"/></filter>`).join('') + '</svg>');
    }
    const el = (cls, text) => { const e = document.createElement('span'); e.className = cls; if (text != null) e.textContent = text; return e; };
    /* Replaces the text node `t` (a number) with a board of reels that shows `to` at the end. The characters are aligned to the right and a reel runs only
       where the digit changed. When it is over, the board is a plain text node again. */
    function reel(t, to, T, late) {   /* late: the height of a line is read when it is armed, with the other reads (a read here, among the writes, would work the styles out again) */
      blurFilters();
      const from = t.nodeValue, n = Math.max(from.length, to.length), a = from.padStart(n, '\0'), b = to.padStart(n, '\0');
      const up = parseFloat(to.replace(/[^\d.]/g, '')) >= parseFloat(from.replace(/[^\d.]/g, ''));   /* the number grew: the reels run up */
      const board = el('g-reel'); board.setAttribute('aria-label', to.trim()); board.setAttribute('role', 'text');
      let changed = 0;
      for (let i = n - 1; i >= 0; i--) {   /* right to left: the units run first */
        const o = a[i] === '\0' ? '' : a[i], c = b[i] === '\0' ? '' : b[i], cell = el('g-reel__cell'), size = el('g-reel__size', c || o || ' '), d = changed * T.reelStagger + 'ms';
        cell.setAttribute('aria-hidden', 'true'); cell.appendChild(size);
        if (o !== c && (o === '' || c === '')) { cell.classList.add('g-reel__cell--' + (o === '' ? 'new' : 'gone')); cell.style.setProperty('--g-reel-d', d); }
        if (o !== c && /^\d?$/.test(o) && /^\d?$/.test(c)) {   /* digit to digit (or to nothing): a sign never turns */
          /* the digits the reel passes, as an odometer counts (9 -> 3 goes 9, 0, 1, 2, 3); a digit that appears or goes away: blank -> digit */
          const seq = [o];
          if (o !== '' && c !== '') { for (let k = 0, d2 = +o; k < 10 && d2 !== +c; k++) { d2 = (d2 + (up ? 1 : 9)) % 10; seq.push(String(d2)); } } else seq.push(c);
          if (!up) seq.reverse();   /* the strip always runs up through its list; to go down it is listed the other way round */
          const strip = el('g-reel__strip g-reel__strip--' + (up ? 'up' : 'down'));
          seq.forEach(ch => { const r = document.createElement('i'); r.textContent = ch; strip.appendChild(r); });
          strip.style.setProperty('--g-reel-n', seq.length - 1); strip.style.setProperty('--g-reel-d', d);
          cell.appendChild(strip); changed++;
        } else { size.style.visibility = 'visible'; size.textContent = c || o; }   /* the same character, or a separator that appeared / went away */
        board.insertBefore(cell, board.firstChild);
      }
      const lineOf = host => { const cs = host ? getComputedStyle(host) : null; board.style.setProperty('--g-reel-h', (cs && parseFloat(cs.lineHeight) || (cs ? parseFloat(cs.fontSize) : 16) * 1.25) + 'px'); };   /* a cell is as tall as a line of its host */
      if (!late) lineOf(t.parentElement);
      board._arm = () => {   /* once it is in the DOM */
        if (late) lineOf(board.parentElement);
        $$('.g-reel__cell--new, .g-reel__cell--gone', board).forEach(c => { c.style.setProperty('--g-reel-w', c.firstChild.getBoundingClientRect().width + 'px'); });
      };
      board._finish = () => { clearTimeout(board._timer); if (board.parentNode) { const p = board.parentNode; p._gRun = null; p.replaceChild(document.createTextNode(to), board); unseen(p); } };
      settled(() => { if (board.parentNode) board._timer = setTimeout(board._finish, T.reel + Math.max(changed - 1, 0) * T.reelStagger + 60); });
      return board;
    }
    /* A text that changed: the words that are new in it are wrapped for a moment (.g-morph-word: they come in out of a soft blur on a tint that fades),
       the rest stays plain text. Returns a fragment for the old node `t`, or null when there is nothing new to show (only removed words) or the text is long. */
    /* the kit put its text back (a board that turned, marked words): no change for the boxes that watch it. Seen, the merge of the text nodes
       (normalize) would tell a part of the text as the text the element had, and the words would light up again and again */
    function unseen(node) { WATCHED.forEach(W => { if (W.box.contains(node)) W.mo.takeRecords(); }); }
    function words(t, to, ctx) {
      const a = t.nodeValue.split(/(\s+)/), b = to.split(/(\s+)/);
      if (!to.trim() || a.length * b.length > 40000) return null;
      const L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));   /* the longest common run of words */
      for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      const fresh = new Array(b.length).fill(false);
      for (let i = 0, j = 0; j < b.length;) { if (i < a.length && a[i] === b[j]) { i++; j++; } else if (i < a.length && L[i + 1][j] >= L[i][j + 1]) i++; else fresh[j++] = true; }
      const word = j => fresh[j] && b[j].trim() !== '';
      b.forEach((x, j) => { if (fresh[j] && !x.trim()) fresh[j] = j > 0 && j < b.length - 1 && word(j - 1) && word(j + 1); });   /* a space joins two new words, it does not stand alone */
      if (!b.some((x, j) => word(j))) return null;
      const frag = document.createDocumentFragment(), spans = [];
      let run = '', on = null;
      const out = () => { if (!run) return; if (on) { const s = el('g-morph-word', run); spans.push(s); frag.appendChild(s); } else frag.appendChild(document.createTextNode(run)); run = ''; };
      b.forEach((x, j) => { if (fresh[j] !== on) { out(); on = fresh[j]; } run += x; });
      out();
      const host = t.parentElement;
      const finish = () => { clearTimeout(timer); host._gRun = null; spans.forEach(s => { if (s.parentNode) s.replaceWith(s.firstChild || ''); }); if (host.isConnected) { host.normalize(); unseen(host); } };   /* plain text again, one node */
      const timer = setTimeout(finish, ctx.T.word + 60);
      spans.forEach(s => { s._finish = finish; });
      ctx.words.push([host, finish]);
      return frag;
    }
    /* phase 2: patch `op` (live) to look like `np` */
    function reconcile(op, np, o, ctx) {
      const oldL = kids(op), newL = kids(np), m = match(oldL, newL, o, () => sameButDigits(op, np)), pairOf = new Map(), oldTexts = [...op.childNodes].filter(n => n.nodeType === 3);
      /* where they stood: ctx.flush slides them from there; read before the patch (ctx.pre), a read here would lay the half-patched page out again */
      if (ctx.play && o.move !== false) {
        const live = m.pairs.length > 1 && reordered(m.pairs);   /* not read before (no leave phase): only a reordered level reads here */
        m.pairs.forEach(([i]) => { const e = oldL[i]; if (FORM.has(e.tagName) || ctx.moves.has(e)) return; const r = ctx.pre.get(e) || (live ? e.getBoundingClientRect() : null); if (r) ctx.moves.set(e, r); });
      }
      m.pairs.forEach(([i, j]) => pairOf.set(newL[j], oldL[i]));
      m.foreign.forEach(([j, e]) => pairOf.set(newL[j], e));
      /* what goes before the cursor is gathered in a fragment and put in with one insert: fewer mutations of the live tree (and fewer records for observers) */
      let cursor = op.firstChild, textChanged = false, batch = null;
      const put = () => { if (batch) { op.insertBefore(batch, cursor); batch = null; } };
      /* an element of the page in a script's wrap: the wrap is what is put in place (once), the element stays in it */
      const carrier = n => { for (let c = n; c.parentElement; c = c.parentElement) { if (c.parentElement === op) return c; if (!c.parentElement.hasAttribute('data-g-wrap')) return n; } return n; };
      const placed = new Set();
      [...np.childNodes].forEach(nk => {   /* the new children are taken out of `np` as they are placed: a copy */
        let node = nk;
        if (nk.nodeType === 1 && !SKIP.has(nk.tagName)) {
          if (pairOf.has(nk)) {
            node = pairOf.get(nk);
            if (!node.isEqualNode(nk) && !(o.keep && o.keep(node))) { syncAttrs(node, nk); if (!FORM.has(node.tagName)) reconcile(node, nk, o, ctx); }
          } else {
            const rows = G ? [...nk.querySelectorAll('li, [data-key]')] : [], fresh = [];
            rows.forEach(n => {   /* a new box with rows that are old rows: the old ones come to it, they are not drawn again */
              const e = G.map.get(n);
              if (!e || e === n) return fresh.push(n);
              if (!e.isEqualNode(n) && !(o.keep && o.keep(e))) { syncAttrs(e, n); if (!FORM.has(e.tagName)) reconcile(e, n, o, ctx); }
              n.replaceWith(e);
            });
            /* animated after, if it is in the viewport (ctx.flush); a box that took old rows does not come in itself (they glide to it), only its new rows do */
            if (ctx.play) { if (fresh.length < rows.length) { const set = new Set(fresh); ctx.entering.push(...fresh.filter(n => { for (let p = n.parentElement; p && p !== nk; p = p.parentElement) if (set.has(p)) return false; return true; })); } else ctx.entering.push(node); }
          }
        } else if (nk.nodeType === 3) {
          const t = oldTexts.shift();
          if (t) {
            node = t;
            if (t.nodeValue !== nk.nodeValue) {
              if (ctx.play && o.reel !== false && NUM.test(t.nodeValue) && NUM.test(nk.nodeValue) && t.parentElement && inView(t.parentElement)) node = reel(t, nk.nodeValue, ctx.T);   /* the old node stays at the cursor and goes below */
              else if (ctx.play && o.flash !== false && t.parentElement && (node = words(t, nk.nodeValue, ctx))) { /* the changed words are marked; the old node goes below */ }
              else { node = t; if (t.nodeValue.trim() || nk.nodeValue.trim()) textChanged = true; t.nodeValue = nk.nodeValue; }   /* not the whitespace between tags */
            }
          } else if (nk.nodeValue.trim() && !op.children.length && !oldTexts.length && cursor) textChanged = true;
        }
        const at = node.nodeType === 1 ? carrier(node) : node;
        if (at !== node) { if (placed.has(at)) return; placed.add(at); }
        while (part(cursor)) cursor = cursor.nextSibling;   /* a script's part stays where it stands */
        if (at === cursor) { put(); cursor = cursor.nextSibling; }
        else (batch || (batch = document.createDocumentFragment())).appendChild(at);
        if (node._arm) { put(); node._arm(); }   /* a reel measures itself: it has to be in the page */
      });
      put();
      while (cursor) { const next = cursor.nextSibling; if (!part(cursor)) op.removeChild(cursor); cursor = next; }
      if (textChanged && ctx.play && o.flash !== false) ctx.flashing.push(op);
    }
    /* What leaves does not hold the update up: it is put back where it stood, in its own parent but out of the flow (it pushes nothing),
       and fades out while the new content comes in and the rest glides. list: [element, parent, x, y, width, height, the parent is static] (all read before the patch:
       a read here, after the writes of the update, would make the page work out its styles once more). They fade out in `ms` and are taken away, all at once,
       at `until`: taking one away lays the page out, so they go when nothing moves any more, and in one go. Each starts with the new one of the
       place it stood (wave: viewport x, y -> ms of delay), on the same curve (ease) and the same way (to the right), and fades out in run(delay) ms. */
    function ghost(list, run, until, wave) {
      /* parent -> [how many ghosts it still holds, static, its own isolation]. Meanwhile a static parent is positioned for them, and isolated: the
         ghosts stand under its content (z-index -1), what comes in at their place covers them, and they stay over its background */
      const held = new Map(), all = [], byParent = new Map();
      list.forEach(([e, p, x, y, w, h, flat, vx, vy]) => {
        if (!p.isConnected) return;
        if (!held.has(p)) { held.set(p, [0, flat, p.style.isolation]); p.style.isolation = 'isolate'; }
        const hp = held.get(p); hp[0]++;
        if (hp[1]) p.style.position = 'relative';
        e.classList.remove('g-morph-leave', 'g-morph-enter'); e.removeAttribute('data-g-new'); e.style.animationDelay = '';   /* a row that was still coming in (newRows) only goes now */
        Object.assign(e.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', margin: '0', pointerEvents: 'none', boxSizing: 'border-box', counterIncrement: 'none', counterSet: 'none', counterReset: 'none', zIndex: '-1' });
        /* it fades out by the CSS of .g-morph-ghost (glass-morph.css): when (--g-morph-d, with the new one of its place) and how long (--g-morph-run).
           Both inherit: a page can put that animation on a part of it instead (the card in a link, ...) */
        const d = wave(vx, vy);
        e.style.setProperty('--g-morph-d', d + 'ms'); e.style.setProperty('--g-morph-run', run(d) + 'ms');
        e.classList.add('g-morph-ghost'); e.setAttribute('aria-hidden', 'true'); e.inert = true;
        p.appendChild(e);
        e._done = () => { if (!e.parentNode) return; e.remove(); if (!--hp[0]) { if (hp[1]) p.style.position = ''; p.style.isolation = hp[2]; } };
        all.push(e);
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p).push(e);
      });
      if (all.length) settled(() => setTimeout(() => all.forEach(e => e._done()), until));   /* a timer, not the end of the animation: one in a hidden pane does not finish */
      return byParent;
    }
    /* The ghosts are back in their parents, out of the flow: they push nothing, but selectors still see them (:has(), :empty, :last-child,
       :nth-child, a sibling combinator), so what stays may stand elsewhere while they are in the tree than once they are gone, and would jump
       then (a list whose columns follow whether a row has a chip: the ghost of the row with the chip keeps the wide columns till it goes; the
       ghost of a chip in a row that stays keeps the word beside it narrow). What stays must stand, now, where it will stand at the end: it is
       read again with the ghosts in (one more layout, only when there are ghosts) against where it was read without them (kept). Where it differs,
       the ghosts of the nearest parent of ghosts around what moved go at once, without their fade; then it is read again (at most 6 times, then
       all of them go). Before anything is animated: the reads see no transform of this update */
    function placed(byParent, kept) {
      kept = kept.filter(k => onScreen(k[1]));   /* a jump out of the viewport is not seen (and one above it moves what is in it) */
      const moved = () => kept.filter(([e, r]) => {
        if (!e.isConnected) return false;
        const b = e.getBoundingClientRect();
        return Math.abs(b.left - r.left) > .5 || Math.abs(b.top - r.top) > .5 || Math.abs(b.width - r.width) > .5 || Math.abs(b.height - r.height) > .5;
      }).map(k => k[0]);
      const drop = p => { byParent.get(p).forEach(g => g._done()); byParent.delete(p); };
      for (let i = 0; byParent.size; i++) {
        const m = moved();
        if (!m.length) return;
        if (i >= 6) { [...byParent.keys()].forEach(drop); return; }
        /* the parent of ghosts that holds what moved, the nearest one; else (a selector further away, :has() on an ancestor) the first */
        let p = null;
        for (const e of m) { for (let a = e; a && !p; a = a.parentElement) if (byParent.has(a)) p = a; if (p) break; }
        drop(p || byParent.keys().next().value);
      }
    }
    const least = (...v) => v.reduce((m, x) => Math.abs(x) < Math.abs(m) ? x : m);   /* the value nearest to 0 */
    /* the tuning of a box (its custom properties, in ms), read once per update: a style read among the writes of the update would make the page work out its styles again */
    /* a CSS time in ms: 180ms, .18s (what a minifier makes of 180ms: esbuild, cssnano), a bare number is ms; NaN when it is not a time */
    const time = v => { const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))(ms|s)?\s*$/i.exec(v || ''); return m ? parseFloat(m[1]) * (/^s$/i.test(m[2] || '') ? 1000 : 1) : NaN; };
    function timings(target) {
      const cs = getComputedStyle(target), css = (name, def) => time(cs.getPropertyValue(name)) || def;
      return { leave: css('--g-morph-leave', 180), enter: css('--g-morph-enter', 250), stagger: css('--g-morph-stagger', 20), reel: css('--g-morph-reel', 320), reelStagger: css('--g-morph-reel-stagger', 35), move: css('--g-morph-move', 320), word: css('--g-morph-word', 1200), ease: cs.getPropertyValue('--g-ease').trim() || 'ease-out' };
    }
    /* What an update of `target` animates and how: filled while the update is read (entering, moves, words, ...), played by flush() once the DOM is in its
       new state. One for Glass.morph (which patches the box itself) and for a watched box (data-g-morph: someone else changed it) */
    function stage(target, o, T, play) {
      const ctx = {
        play, T, entering: [], flashing: [], moves: new Map(), pre: new Map(), words: [], h0: null,
        /* after the DOM is patched: what is new / changed AND on the screen is animated (the stagger counts only those) */
        flush() {
          /* the reads first, all against one layout of the patched page (a read after a write lays the page out again): what is on the screen,
             the ::after of what flashes, where the moved rows stand now */
          /* after the patch the browser has not yet told which [data-g-lazy] boxes are on the screen (it does so in the next frame) and lays out
             a new or changed one at a guessed or stale size: while these reads run, all of them are laid out as they are (data-g-measure, the kit's CSS) */
          const scope = ctx.scope || [target];   /* the watched page: only where it changed */
          scope.forEach(s => s.setAttribute('data-g-measure', ''));
          /* the columns of a [data-g-fit] take the width of the new words first (else they would after this, and the rows would not end where they are read) */
          new Set(scope.flatMap(s => [...$$('[data-g-fit]', s), s.closest('[data-g-fit]')])).forEach(b => { if (b) fitBox(b); });
          const at = new Map();   /* where in the viewport each element that is animated starts: the wave reaches it from there */
          const kept = [];   /* [element, its rect]: where what stays stands in the new layout, without the ghosts (see placed) */
          const enter = o.enter !== false ? ctx.entering.filter(e => { if ((ctx.floats && ctx.floats(e)) || said(e)) return false; const r = e.getBoundingClientRect(); at.set(e, [r.left, r.top]); kept.push([e, r]); return onScreen(r); }).slice(0, MAX) : [];
          const hidden = ctx.words.filter(([host]) => !inView(host));   /* marked words out of the viewport: plain text at once */
          const box = target.getBoundingClientRect(), bs = getComputedStyle(target);
          const extra = bs.boxSizing === 'border-box' ? 0 : ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((v, k) => v + (parseFloat(bs[k]) || 0), 0);
          const flash = ctx.flashing.filter(inView).map(e => [e, !!kit.animate && getComputedStyle(e, '::after').content === 'none']);   /* the kit's highlight draws on ::after */
          const glide = [], away = [];   /* an element that changed its place (moved, or pushed by what came, went or grew) glides from where it stood (FLIP) */
          if (o.move !== false) {
            const raw = new Map(), gliding = new Map(), came = new Set();
            ctx.moves.forEach((f, e) => {
              if (!e.isConnected || !e.animate || said(e, true)) return;
              const l = e.getBoundingClientRect();
              kept.push([e, l]);
              /* where it went: by the side of it that stayed (the least of the moves of its two edges and its middle). One that only grew or shrank
                 (a name that got longer at the right of a bar, a box that got taller) did not go anywhere: it does not glide; one that moved, moved all of it */
              if (!f.box) return raw.set(e, [least(f.left - l.left, f.right - l.right, (f.left + f.right - l.left - l.right) / 2), least(f.top - l.top, f.bottom - l.bottom, (f.top + f.bottom - l.top - l.bottom) / 2), l, onScreen(f)]);
              /* it was in a box out of the viewport (not measured): it goes the way its box went, or, in another box now, comes from where that box stood */
              if (e.parentElement === f.box && f.box.isConnected) { const b = f.box.getBoundingClientRect(); raw.set(e, [f.at.left - b.left, f.at.top - b.top, l, false]); }
              else raw.set(e, [0, f.at.top - l.top, l, false]);
            });
            /* parents first: an element inside a gliding box rides with it and glides only by what is its own (else it would go twice the way) */
            const deep = new Map();   /* parents first: by depth (the order among siblings does not matter; a sort by document order costs ~8 ms for 1000 siblings) */
            raw.forEach((r, e) => { let d = 0; for (let p = e; p && p !== target; p = p.parentElement) d++; deep.set(e, d); });
            [...raw.keys()].sort((x, y) => deep.get(x) - deep.get(y)).forEach(e => {
              if (glide.length + away.length >= MAX) return;
              const r = raw.get(e);
              let [dx, dy, l, seen] = r;
              for (let p = e.parentElement; p && p !== target; p = p.parentElement) { if (came.has(p)) return; const a = gliding.get(p); if (a) { dx -= a[0]; dy -= a[1]; break; } }
              if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return;
              const on = onScreen(l);
              /* only what is on the screen before and after glides: one that comes from out of the viewport comes in as a new one does, one that goes
                 out of it fades out where it stood (a glide over thousands of pixels would only flash across the screen) */
              at.set(e, on && !seen ? [l.left, l.top] : [l.left + r[0], l.top + r[1]]);   /* one that comes in: where it ends; one that glides or goes: where it stood */
              if (on && !seen && o.enter !== false) { came.add(e); enter.push(e); }
              else if (on) { gliding.set(e, [r[0], r[1]]); glide.push([e, dx, dy]); }
              else if (seen) { gliding.set(e, [r[0], r[1]]); away.push([e, dx, dy]); }
            });
            if (came.size) enter.sort((x, y) => x.compareDocumentPosition(y) & 4 ? -1 : 1).splice(MAX);
          }
          /* where each row that goes is drawn: in its parent, where it stood in it (the parent may have moved with the update), as the new ones are read */
          ctx.ghosts.forEach(g => { const p = g[1]; if (!p.isConnected) return; const pr = p.getBoundingClientRect(); g[7] = pr.left + p.clientLeft - p.scrollLeft + g[2]; g[8] = pr.top + p.clientTop - p.scrollTop + g[3]; });
          /* and the parents the ghosts go back into, with what is in them (their columns, their gaps) */
          new Set(ctx.ghosts.map(g => g[1])).forEach(p => { if (!p.isConnected) return; kept.push([p, p.getBoundingClientRect()]); [...p.children].slice(0, MAX).forEach(c => kept.push([c, c.getBoundingClientRect()])); });
          if (ctx.onRead) ctx.onRead();   /* a watched box reads where all of it stands now, against this same layout */
          /* what moves and what comes in finish together: one end for all, the later of the glide and the last staggered entry */
          const lag = Math.min(enter.length - 1, 9) * T.stagger, end = Math.max(enter.length ? T.enter + lag : 0, ctx.moves.size && o.move !== false ? T.move : 0) || T.move;
          ctx.end = end; ctx.fade = Math.max(T.leave, end * .75); ctx.until = Math.max(T.leave, end) + 50;   /* what leaves: faded a little before the rest settles, taken away after it */
          /* When each one starts. A place is where something changes: the row that goes and the row that comes in there are one place and start
             together. The places are counted in lines (top to bottom) and in columns (left to right), only the lines and columns where something
             changes, and one more line or column is one step of the stagger later: the next place starts a little after its neighbour, however far the
             rows that changed stand apart. Many places: a shorter step. The end of all stays where it was (a later start, a shorter run), and the
             last ones still run three quarters of --g-morph-enter. */
          const ranks = (vs, near) => { const m = new Map(); let from = null, i = -1; [...new Set(vs.map(Math.round))].sort((a, b) => a - b).forEach(v => { if (from === null || v - from > near) { from = v; i++; } m.set(v, i); }); return [m, Math.max(i, 0)]; };
          const places = [...enter, ...glide.map(g => g[0]), ...away.map(g => g[0])].map(e => at.get(e)).filter(Boolean).concat(ctx.ghosts.map(g => [g[7], g[8]]));
          const [line, lines] = ranks(places.map(p => p[1]), 12), [col, cols] = ranks(places.map(p => p[0]), 30);
          const step = lines + cols ? Math.min(T.stagger, Math.max(0, end - T.enter * .75) / (lines + cols)) : 0;
          ctx.wave = (x, y) => Math.round(((line.get(Math.round(y)) || 0) + (col.get(Math.round(x)) || 0)) * step);
          ctx.run = d => Math.max(60, ctx.fade - d, (end - d) * .6);   /* how long a row that goes fades out: before the new one of its place is in */
          const waveOf = e => { const p = at.get(e); return p ? ctx.wave(p[0], p[1]) : 0; };
          if (ctx.ghosts.length) placed(ghost(ctx.ghosts, ctx.run, ctx.until, ctx.wave), kept);
          if (ctx.onWrite) ctx.onWrite();
          scope.forEach(s => s.removeAttribute('data-g-measure'));   /* the reads are done: what is out of the viewport is skipped again in the next frame */
          hidden.forEach(([, finish]) => finish());
          /* the box takes its new height smoothly, so what is below it does not jump (overflow clipped along Y meanwhile; X stays visible for the slides) */
          const h1 = box.height;
          if (ctx.h0 != null && o.height !== false && Math.abs(h1 - ctx.h0) > 1 && (onScreen(box) || ctx.h0Seen) && target.animate) {
            if (target._hAnim) target._hAnim.cancel();
            const was = target.style.overflowY;
            target.style.overflowY = 'clip';
            const an = target._hAnim = target.animate([{ height: ctx.h0 - extra + 'px' }, { height: h1 - extra + 'px' }], { duration: end, easing: T.ease });
            target._hFrom = ctx.h0; target._hTo = h1;   /* where it is at any time, without a layout: from + (to - from) * progress */
            const done = target._hDone = () => { if (target._hAnim === an) { target._hAnim = null; target.style.overflowY = was; } };
            an.onfinish = done; an.oncancel = done;
          }
          enter.forEach(e => {
            const d = waveOf(e);
            e.classList.add('g-morph-enter'); e.style.setProperty('--g-morph-d', d + 'ms'); e.style.setProperty('--g-morph-enter', (end - d) + 'ms');   /* a later start, a shorter run: all end at once; both inherit, as for what goes */
          });
          if (enter.length) settled(() => enter.forEach(e => later(e, 'g-morph-enter', end + 50, () => { e.style.removeProperty('--g-morph-enter'); e.style.removeProperty('--g-morph-d'); })));
          const again = flash.filter(([e, own]) => !own && e.classList.contains('g-morph-flash'));   /* a flash that still runs starts over: one reflow for all of them */
          if (again.length) { again.forEach(([e]) => e.classList.remove('g-morph-flash')); void again[0][0].offsetWidth; }
          flash.forEach(([e, own]) => {
            if (own) { kit.animate(e, 'highlight'); later(e, 'g-anim-highlight', 1600); }
            else { e.classList.add('g-morph-flash'); later(e, 'g-morph-flash', 1050); }
          });
          glide.forEach(([e, dx, dy]) => { const d = waveOf(e); e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: end - d, delay: d, easing: T.ease, fill: 'backwards' }); });   /* all in place at once */
          /* gone out of the viewport: held where it stood, it fades out as a ghost does; then it is in its new place, out of sight */
          away.forEach(([e, dx, dy]) => { const d = waveOf(e), from = `translate(${dx}px, ${dy}px)`, to = `translate(${dx + 24}px, ${dy}px)`, run = ctx.until - d;
            e.animate([{ transform: from, opacity: 1, easing: T.ease }, { transform: to, opacity: 0, offset: Math.min(1, ctx.run(d) / run) }, { transform: to, opacity: 0 }], { duration: run, delay: d, fill: 'backwards' }); });
          ctx.entering = []; ctx.flashing = []; ctx.moves = new Map(); ctx.pre = new Map(); ctx.words = []; ctx.h0 = null;
        }
      };
      return ctx;
    }
    /* A morph starts after the next frame is drawn: what the click or the key that asked for it shows at once (a switch that turns, the letter typed)
       is on the screen then and runs on its own while the page is patched. The morphs asked for meanwhile run in that one go, in the order asked */
    let batch = null;
    function afterPaint(run) {
      if (batch) return batch.push(run);
      const b = batch = [run], go = () => { if (batch !== b) return; batch = null; b.forEach(f => { if (f.pre) f.pre(); }); b.forEach(f => f()); };   /* what each one reads first is read for all before any of them writes */
      requestAnimationFrame(() => setTimeout(go));
      setTimeout(go, 100);   /* a page that draws no frames */
    }
    function morph(target, next, opts) {
      if (typeof target === 'string') target = document.querySelector(target);
      if (!target) return Promise.resolve(false);
      if (quiet()) return patch(target, next, opts);
      let T = null;
      return new Promise((resolve, reject) => afterPaint(Object.assign(() => { try { patch(target, next, opts, T).then(resolve, reject); } catch (e) { reject(e); } }, { pre: () => { T = timings(target); } })));
    }
    function patch(target, next, opts, tuned) {
      let o = opts || {};
      if (calm()) o = Object.assign({}, o, { leave: false, move: false, reel: false, height: false });   /* reduced motion: patched at once, the new and the changed fade in */
      if (typeof next === 'string') { const tmp = target.cloneNode(false); tmp.innerHTML = next; next = tmp; }
      if (!target.hasAttribute('data-g-no-enter')) target.setAttribute('data-g-no-enter', '');   /* the morph brings in its own new rows: the generic entrance of .g-list rows stays out */
      $$('.g-reel, .g-morph-word', target).forEach(b => { if (b._finish) b._finish(); });
      $$('.g-morph-ghost', target).forEach(e => { if (e._done) e._done(); else e.remove(); });   /* what was fading out of the last update is gone now */   /* a board that still turns is the plain number now, marked words plain text */
      const prev = target._morph;
      if (prev) { clearTimeout(prev.timer); prev.leaving.forEach(e => { e.classList.remove('g-morph-leave'); e.style.animationDelay = ''; }); prev.resolve(false); target._morph = null; }
      const T = tuned || timings(target), play = !quiet();
      const ctx = stage(target, o, T, play);
      return new Promise(resolve => {
        const gone = [], moved = new Set(), g = globalPairs(target, next, o), roots = { old: target, next };
        G = g; R = roots;
        if (play && o.leave !== false) collect(target, next, o, gone, o.move !== false ? moved : null);
        G = null; R = null;
        const carries = e => g.claimed.has(e) || [...e.querySelectorAll('li, [data-key]')].some(c => g.claimed.has(c));   /* what goes to another place does not slide out */
        /* what leaves fades out where it stood while the new content comes in: nothing waits (it is not what goes to another place) */
        const leaving = gone.filter(e => !carries(e));
        G = g; R = roots;
        target._morph = null;
        let ghosts = [];
        if (play) {   /* the reads before the patch, one layout for all of them: the height of the box, where the rows stand, where the leaving ones are */
          const skipped = skipper();
          const box = target.getBoundingClientRect();
          ctx.h0 = box.height; ctx.h0Seen = onScreen(box);
          if (o.move !== false) {
            const at = e => { const s = skipped(e); return s ? { box: s[0], at: s[1] } : e.getBoundingClientRect(); };
            g.claimed.forEach(e => { if (!ctx.moves.has(e)) ctx.moves.set(e, at(e)); });
            moved.forEach(e => { if (!ctx.moves.has(e) && e.isConnected) ctx.pre.set(e, at(e)); });
          }
          const flat = new Map(), isFlat = p => { if (!flat.has(p)) flat.set(p, getComputedStyle(p).position === 'static'); return flat.get(p); };
          ghosts = leaving.slice(0, MAX).map(e => { const p = e.parentElement; if (!p || skipped(e) || said(e)) return null; const r = e.getBoundingClientRect(); if (!onScreen(r)) return null; const pr = p.getBoundingClientRect(); return [e, p, r.left - pr.left - p.clientLeft + p.scrollLeft, r.top - pr.top - p.clientTop + p.scrollTop, r.width, r.height, isFlat(p), r.left, r.top]; }).filter(Boolean);
        }
        /* the height of the last update, if it still runs, is let go now (it was read as where this one starts): the new height is then read as it
           is, not halfway, and the box gets its own overflow back at once (an event later, the next height would take the clip for its own) */
        if (target._hAnim) { const an = target._hAnim; target._hDone(); an.cancel(); }
        ctx.ghosts = ghosts;   /* counted into the wave */
        if (kit.busy) kit.busy(target, false);   /* the kit's busy line: the content is here */
        HOLLOW = new WeakSet();
        gone.forEach(e => { const p = e.parentNode; if (p) { p.removeChild(e); if (!p.children.length) HOLLOW.add(p); } });
        reconcile(target, next, o, ctx);
        G = null; R = null;
        if (play) ctx.flush();   /* the ghosts go in there, after its reads */
        wrote(target, ctx.until || 0);
        resolve(true);
      });
    }
    /* ---------- A watched box: data-g-morph, Glass.morph.watch(box) ----------
       Whatever changes in it, whoever changed it (a script that writes innerHTML, a framework, another part of the page), is animated as Glass.morph
       animates: the rows that go fade out where they stood, the new ones come in, the rest glide, a number turns. Its nodes are not touched: the new
       ones are the page's and are only animated from where the old ones stood. A MutationObserver tells what was taken out and what was put in after
       the fact, before the frame is drawn; where things stood is not in the page any more then, so it is read beforehand and kept (W.cache): when the
       box has settled after an update, a scroll, a resize, and against the layout of each update.
       <body data-g-morph> watches the whole page. A box watched by itself in it animates its own changes (the innermost box does); the page is not
       animated while it loads, only what changes once it is loaded and drawn; an element that changes again and again (a clock, a running counter)
       and a page that changes on every frame (a game, a live chart) are left as they are while they run; what is not content (ASIDE) never is. */
    const WATCHED = new Map();   /* box -> watcher */
    const OWN = /(^|\s)(g-morph-ghost|g-reel|g-morph-word)(\s|$)/;   /* the library's own passing parts: their coming and going is not a change */
    const OWN_IN = '.g-reel, .g-morph-word, .g-morph-ghost';
    /* Not the page's content: what floats over the page (popover, dialog), graphics (svg), what the user edits, decoration (aria-hidden) and what
       the page marked data-g-no-morph, what a script runs (data-g-part); plus Glass.morphSkip, a selector the host sets (a UI kit: its widgets
       that run by themselves, glass-ui.js adds its own; a page: what other scripts put in, ad slots). A change in it, or one that only puts it in or
       takes it out, is no change */
    const ASIDE_BASE = '[popover], dialog, svg, [contenteditable]:not([contenteditable="false"]), select, textarea, [aria-hidden="true"], [data-g-no-morph], [data-g-part]';
    const INERT = 'script, style, template, noscript, link, meta, datalist';   /* not drawn: a <style> whose text a script sets is no text to light up */
    /* what the page or a host says is not content (not the generic guesses above): Glass.morph does not animate it either - it is put in or
       taken out at once, it does not come in or fade out (an ad slot, an auto ad that an ad script put among the content). It does not glide
       when it is marked (data-g-no-morph, data-g-part); what only matches Glass.morphSkip (the kit's parts: a select, a pager) still glides with the rest */
    const SAID_BASE = '[data-g-no-morph], [data-g-part]';
    let ASIDE = ASIDE_BASE, NOT_MINE = '', NOT_SHOWN = '', SAID = SAID_BASE, skipOf = null;
    const said = (e, marked) => { skips(); return e.nodeType === 1 && e.matches(marked ? SAID_BASE : SAID); };
    const skips = () => {   /* the selectors, again only when the host's selector changed */
      if (skipOf === (kit.morphSkip || '')) return;
      skipOf = kit.morphSkip || '';
      ASIDE = ASIDE_BASE + (skipOf ? ', ' + skipOf : ''); SAID = SAID_BASE + (skipOf ? ', ' + skipOf : '');
      NOT_MINE = OWN_IN + ', ' + ASIDE + ', ' + INERT; NOT_SHOWN = ASIDE + ', ' + INERT;
    };
    /* a record of what the kit wrote itself or of what is not content: in one of those, or only those came or went (text nodes with them: a board that is a number again) */
    function ownRecord(r, seen) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (t) { let v = seen.get(t); if (v === undefined) seen.set(t, v = !!t.closest(NOT_MINE)); if (v) return true; }   /* looked up once per target */
      if (r.type !== 'childList') return false;
      const els = [...r.addedNodes, ...r.removedNodes].filter(n => n.nodeType === 1);
      /* a text put in is the page's (the kit puts its text back unseen): the page wrote over a board or marked words */
      return els.length > 0 && els.every(n => OWN.test(n.className) || n.matches(NOT_SHOWN)) && ![...r.addedNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    }
    const elOf = n => n.nodeType === 1 ? n : n.parentElement;
    /* the watched box a node is in: the innermost one */
    const owner = n => { for (let e = n && elOf(n); e; e = e.parentElement) if (WATCHED.has(e)) return e; return null; };
    /* the text of an element that holds only text (a board that turns or marked words of the kit are its text, at their end): else null */
    function plain(e) {
      if (!e.children.length) return e.textContent;
      let t = '';
      for (const n of e.childNodes) {
        if (n.nodeType === 3) t += n.nodeValue;
        else if (n.nodeType === 1 && n.classList.contains('g-reel')) t += n.getAttribute('aria-label') || '';
        else if (n.nodeType === 1 && n.classList.contains('g-morph-word')) t += n.textContent;
        else return null;
      }
      return t;
    }
    /* the text the nodes taken out of an element held (a board that turned is its number, marked words their text); null if one was another element */
    function textOfNodes(ns) {
      let t = '';
      for (const n of ns) {
        if (n.nodeType === 3) t += n.nodeValue;
        else if (n.nodeType === 1 && n.classList.contains('g-reel')) t += n.getAttribute('aria-label') || '';
        else if (n.nodeType === 1 && n.classList.contains('g-morph-word')) t += n.textContent;
        else if (n.nodeType !== 8) return null;
      }
      return t;
    }
    /* where all of it stands now (page coordinates: a scroll of the page does not make them old), and the text of what holds only text */
    /* the scroll of the page, kept as it scrolls: read in a change it would lay the changed page out at once (the reads of an update come later, all in one) */
    let PX = 0, PY = 0;
    /* when the page (the window or a box in it) scrolled last: what changes while it scrolls is drawn for the scroll, not changed (see changed()) */
    let SCROLL_AT = -1e9;
    /* what a row that goes needs of the parent it goes back into: its border, its scroll, whether it is positioned (static: made relative for the ghosts) */
    const frame = (e, pos) => ({ cl: e.clientLeft, ct: e.clientTop, sl: e.scrollLeft, st: e.scrollTop, flat: (pos || getComputedStyle(e).position) === 'static' });
    /* What is kept of a box: its children down to 3 levels, and the rows (li, data-key, id) at any depth, not inside a row; at most 2000. On the
       page the levels count again from <main> and from each element with an id (a place the page writes into). A box watched by itself is kept,
       not what is in it. What is not drawn (display: none, what a closed <details> holds besides its summary, content-visibility: hidden) is not
       gone into: the browser has not worked its styles out, a read would make it work out all of them (~80 ms for a closed <details> with a
       few thousand elements in it) */
    function snapshot(W) {
      if (!W.box.isConnected) return;
      skips();
      PX = scrollX; PY = scrollY;
      const sx = PX, sy = PY, cache = new Map(), lazy = new Map(), b = W.box.getBoundingClientRect(), stuck = new Set(), page = W.page;
      W.at = Object.assign({ x: b.left + sx, y: b.top + sy, h: b.height, seen: onScreen(b) }, frame(W.box));
      W.text = plain(W.box);   /* a box that is only text (a status line): its text is kept too */
      W.T = timings(W.box);
      /* in a content-visibility box out of the viewport (s: [box, its rect]): not laid out, its box stands for it */
      (function walk(n, depth, s) {
        const shut = n.tagName === 'DETAILS' && !n.open;
        for (const e of n.children) {
          if (cache.size >= 2000) return;
          if (SKIP.has(e.tagName) || OWN.test(e.className) || (page && e.matches(INERT)) || (shut && e.tagName !== 'SUMMARY')) continue;
          const own = WATCHED.has(e), mark = page && (e.id || e.tagName === 'MAIN');
          const keep = own || mark || depth < 3 || e.tagName === 'LI' || e.id || e.hasAttribute('data-key');
          let inner = s;
          if (s) { if (keep) { if (!lazy.has(s[0])) lazy.set(s[0], { x: s[1].left + sx, y: s[1].top + sy, w: s[1].width, h: s[1].height }); cache.set(e, { lazy: s[0] }); } }
          else {
            const rs = e.getClientRects();
            if (!rs.length) continue;   /* not drawn, nor anything in it */
            if (keep) {
              const r = e.getBoundingClientRect(), holds = e.tagName !== 'LI' && e.firstElementChild;   /* a box rows may go back into (not a row: nothing goes back into a row) */
              const c = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height };
              const pos = page || holds ? getComputedStyle(e).position : null;
              if (holds) Object.assign(c, frame(e, pos));
              /* on the page: what stays in the window as the page scrolls (fixed, sticky, or in one of them) is kept where it is in the window; what
                 floats over the page (fixed, or absolute right in it) neither glides nor fades out */
              if (page) {
                let fx = pos === 'fixed' || pos === 'sticky';
                if (!fx && stuck.size) for (let p = e.parentElement; !fx && p && p !== W.box; p = p.parentElement) fx = stuck.has(p);
                if (fx) { stuck.add(e); c.x = r.left; c.y = r.top; c.fx = 1; }
                if (pos === 'fixed' || (pos === 'absolute' && e.parentElement === W.box)) c.out = 1;
              }
              cache.set(e, c);
            }
            if (e.firstElementChild) { const cv = getComputedStyle(e).contentVisibility; if (cv === 'hidden') continue; if (cv === 'auto') { const r = e.getBoundingClientRect(); if (!onScreen(r)) inner = [e, r]; } }
          }
          if (own || e.tagName === 'LI' || FORM.has(e.tagName) || (page && e.matches(ASIDE))) continue;
          walk(e, mark ? 0 : depth + 1, inner);
        }
      })(W.box, 0, skipper()(W.box));
      W.cache = cache; W.lazy = lazy;
    }
    /* read again when the box has settled: after what runs in it now, after the next frame (the layout is there then, the reads cost nothing) */
    function settle(W, ms) {
      if (!W.live) return;   /* the page still loading: read once it is idle */
      clearTimeout(W.timer);
      W.timer = setTimeout(() => {
        const wait = W.busy - performance.now();
        if (wait > 0) return settle(W, wait + 20);
        requestAnimationFrame(() => setTimeout(() => snapshot(W)));
      }, ms || 0);
    }
    /* it changed where nothing is animated (the kit's parts, what runs, what shows or hides): read again soon, not on every such change */
    function stale(W) { if (!W.soon) W.soon = setTimeout(() => { W.soon = 0; settle(W, 0); }, 150); }
    let listening = false;
    function listen() {
      if (listening) return;
      listening = true;
      const all = () => WATCHED.forEach(W => settle(W, 120));   /* once the scroll or the resize stops */
      addEventListener('scroll', () => { PX = scrollX; PY = scrollY; SCROLL_AT = performance.now(); all(); }, { passive: true, capture: true });
      addEventListener('resize', all, { passive: true });
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', all);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) all(); });
    }
    /* Glass.morph wrote into a watched box (or around one): that is no change to animate again; read where things stand when it is over */
    function wrote(target, ms) {
      WATCHED.forEach(W => {
        if (W.box !== target && !W.box.contains(target) && !target.contains(W.box)) return;
        W.mo.takeRecords();
        W.busy = Math.max(W.busy, performance.now() + ms + 100);
        settle(W, 0);
      });
    }
    const textOf = list => list.map(e => e.textContent).join('').replace(/[\d\s.,%]/g, '');
    const HOT = new WeakMap();   /* element -> [when it changed last, how many times in a row it changed again right after that] */
    function changed(W, recs) {
      const box = W.box;
      if (!box.isConnected) return;
      skips();
      const ours = new Map(), aside = new Map();   /* per target: most records of an update have one (the list) */
      recs = recs.filter(r => { const t = elOf(r.target); if (!t) return false; let v = ours.get(t); if (v === undefined) ours.set(t, v = owner(t) === box); return v; });   /* a box watched by itself in this one animates its own */
      const mine = recs.length;
      recs = recs.filter(r => !ownRecord(r, aside));
      if (recs.length < mine) stale(W);   /* the kit's parts may have moved what is around them */
      /* a row that was hidden and is shown (Show more) comes in; anything else that shows or hides only moves things */
      const shownRows = [];
      recs = recs.filter(r => {
        if (r.type !== 'attributes') return true;
        if (r.attributeName === 'hidden' && r.oldValue !== null && !r.target.hidden && r.target.tagName === 'LI') shownRows.push(r.target);
        else stale(W);
        return false;
      });
      if (!recs.length && !shownRows.length) return;
      const added = [];
      recs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1 && n.isConnected) added.push(n); }));
      const fits = () => (W.page ? added.flatMap(n => [n, ...$$('[data-g-fit]', n)]).filter(n => n.matches('[data-g-fit]')) : $$('[data-g-fit]', box))
        .forEach(b => { if (!b._gFit && kit.fit) kit.fit(b); });   /* what the kit left to the update (a fit box in a watched box) */
      /* While the page scrolls (within 200 ms of the last scroll event of the window or of any box) what changes is drawn for the scroll: a
         virtual list that writes the rows that come into view, rows loaded as the end comes near, a bar that follows the scroll, a panel that
         shows what came under the still pointer. It is not a change of the content: nothing is animated, it is only read again (the scroll
         that stops reads all anyway). The same write at another time animates as ever */
      if (performance.now() - SCROLL_AT < 200) { fits(); stale(W); return; }
      if (quiet()) { fits(); settle(W, 0); return; }   /* a hidden page draws nothing: only where things stand is read again */
      if (W.page) {
        if (!W.live) { fits(); stale(W); return; }   /* the page is still loading: it is being built, not changed */
        /* an element that changed twice right before (within 80 ms each time) runs (a clock, a counter, a game): left as it is until it pauses.
           The page changing on every frame (many elements, each once in a while) is left as it is too */
        const now = performance.now(), hot = new Set();
        new Set(recs.map(r => elOf(r.target))).forEach(t => { if (!t) return; const h = HOT.get(t) || [-1e9, 0]; h[1] = now - h[0] < 80 ? h[1] + 1 : 0; h[0] = now; HOT.set(t, h); if (h[1] >= 2) hot.add(t); });
        if (hot.size) recs = recs.filter(r => !hot.has(elOf(r.target)));
        if (recs.length || shownRows.length) { W.rush = now - W.last < 60 ? W.rush + 1 : 0; W.last = now; }
        if ((!recs.length && !shownRows.length) || W.rush >= 3) { fits(); stale(W); return; }
      }
      /* what went (top of each subtree taken out, with the parent it was in), what came (top of each subtree put in), whose text changed and what it was */
      const gone = [], came = new Set(), texts = new Set(), olds = new Map();
      const listed = new Set(recs.filter(r => r.type === 'childList').map(r => r.target));   /* the old value of a text node is the text of its element only when it was its one node */
      recs.forEach(r => {
        if (r.type === 'characterData') { const p = r.target.parentElement; if (p) { texts.add(p); if (!olds.has(p) && !listed.has(p) && p.childNodes.length === 1) olds.set(p, r.oldValue); } return; }
        let els = 0;
        r.removedNodes.forEach(n => { if (n.nodeType !== 1 || OWN.test(n.className)) return; els++; if (!box.contains(n)) gone.push([n, r.target]); });
        r.addedNodes.forEach(n => { if (n.nodeType !== 1 || OWN.test(n.className)) return; els++; if (box.contains(n)) came.add(n); });
        if (!els && r.target.nodeType === 1) {   /* only its text nodes: a new text; the one it had is what was taken out, when that was all of it */
          texts.add(r.target);
          if (!olds.has(r.target) && !r.previousSibling && !r.nextSibling) { const t = textOfNodes(r.removedNodes); if (t != null) olds.set(r.target, t); }
        }
      });
      /* The page wrote the same text again while it still turns or lights up (a second write of one click): the animation goes back in, as far as it
         got (a negative delay), instead of being cut */
      texts.forEach(e => {
        const run = e._gRun, t = e.firstChild;
        if (!run || !t || t.nodeType !== 3 || e.childNodes.length !== 1 || t.nodeValue !== run.to) return;
        const late = -Math.round(performance.now() - run.at) + 'ms';
        run.nodes.forEach(n => { if (n.nodeType !== 1) return; if (n.classList.contains('g-reel')) n.style.setProperty('--g-reel-shift', late); else n.style.animationDelay = late; });
        t.replaceWith(...run.nodes);
        texts.delete(e);
      });
      const fresh = [...came].filter(n => !W.cache.has(n));   /* one that only moved is not new: its place is kept */
      const was = e => olds.has(e) ? olds.get(e) : e === box ? W.text : undefined;   /* the text it had: what the records took out of it */
      const retext = [...texts].filter(e => { const t = was(e); return box.contains(e) && !e.children.length && t != null && t !== e.textContent; });
      if (!gone.length && !fresh.length && !retext.length && !shownRows.length && ![...came].some(n => W.cache.has(n))) { fits(); stale(W); return; }   /* nothing that shows (a text that is the same again) */
      let o = {};
      if (calm()) o = { leave: false, move: false, reel: false, height: false };
      if (W.page) o.height = false;   /* the page has no box to grow: what is below a change glides */
      const T = W.T || timings(box), ctx = stage(box, o, T, true);   /* its tuning as read when it settled: read now, after the page's write, it would work the styles out once more */
      /* what was passing from the last update where this one changes is over now: the text of an element whose text changes, what fades out of a
         parent that changes (a change elsewhere does not cut what plays there) */
      texts.forEach(e => $$('.g-reel, .g-morph-word', e).forEach(b => { if (b._finish) b._finish(); }));
      new Set([...gone.map(g => g[1]), ...[...came].map(n => n.parentElement)]).forEach(p => { if (p) [...p.children].forEach(e => { if (AUX.test(e.className)) { if (e._done) e._done(); else e.remove(); } }); });
      /* the height it had: its own, or where its last height animation is (a style read, no layout); that one is let go */
      if (box._hAnim) { const an = box._hAnim, k = an.effect.getComputedTiming().progress; ctx.h0 = k == null ? (W.at ? W.at.h : null) : box._hFrom + (box._hTo - box._hFrom) * k; box._hDone(); an.cancel(); }
      else if (W.at) ctx.h0 = W.at.h;
      ctx.h0Seen = !!(W.at && W.at.seen);
      /* Pairs, as Glass.morph pairs: a row is its key or its text wherever it went (another list); the rest by the place in its parent, and down
         into what is paired. pairs: new element -> old one, back: old -> new */
      const pairs = new Map(), back = new Map(), oldTops = gone.map(g => g[0]);
      const key = e => { const k = explicitKey(e, o); if (k) return k; const t = e.tagName === 'LI' && sig(e); return t ? 'LI|' + t : null; };
      const index = tops => { const m = new Map(); tops.forEach(t => [t, ...t.querySelectorAll('li, [data-key], [id]')].forEach(e => { const k = key(e); if (k != null) m.set(k, m.has(k) ? null : e); })); return m; };
      const oi = index(oldTops), ni = index(fresh), g = { map: new Map(), claimed: new Set() };
      ni.forEach((n, k) => { const e = oi.get(k); if (n && e) { g.map.set(n, e); g.claimed.add(e); } });
      const pair = (a, b) => { pairs.set(b, a); back.set(a, b); };
      /* two equal subtrees: what is in them is paired one by one only where an element whose place is kept is in them (it may glide); else the new
         one stands for all of the old one (nothing in it goes or comes: eqOld / eqNew) */
      const holds = new Set();
      W.cache.forEach((c, e) => { for (let p = e.parentElement; p && p !== box && !holds.has(p); p = p.parentElement) holds.add(p); });
      const eqOld = new Set(), eqNew = new Set();
      const same = (a, b) => { if (!holds.has(a)) { eqOld.add(a); eqNew.add(b); return; } const x = kids(a), y = kids(b); x.forEach((c, i) => { if (y[i]) { pair(c, y[i]); same(c, y[i]); } }); };
      const walk = (oldL, newL) => {
        const m = match(oldL, newL, o, () => textOf(oldL) === textOf(newL));
        m.pairs.forEach(([i, j]) => { const a = m.oldL[i], b = m.newL[j]; pair(a, b); if (FORM.has(a.tagName)) return; if (a.isEqualNode(b)) same(a, b); else walk(kids(a), kids(b)); });
        m.foreign.forEach(([j, e]) => pair(e, m.newL[j]));
      };
      const byParent = new Map(), side = p => byParent.get(p) || byParent.set(p, [[], []]).get(p);
      gone.forEach(([n, p]) => side(p)[0].push(n));
      fresh.forEach(n => side(n.parentElement)[1].push(n));
      G = g; R = null;
      byParent.forEach(([ol, nl]) => { if (ol.length && nl.length) walk(ol, nl); });
      G = null;
      g.map.forEach((e, n) => { if (!pairs.has(n)) pair(e, n); });   /* a keyed row that went to a parent of its own */
      /* a new text in a place that stays (the same node, or the new one of a pair): a number turns, new words light up (writes, before the reads) */
      const sx = PX, sy = PY, moving = performance.now() < W.busy;   /* no layout is read before the reads of flush(): the writes here would lay it out again */
      const view = c => c.fx ? { left: c.x, top: c.y, width: c.w, height: c.h, right: c.x + c.w, bottom: c.y + c.h }
        : { left: c.x - sx, top: c.y - sy, width: c.w, height: c.h, right: c.x - sx + c.w, bottom: c.y - sy + c.h };
      /* where it stood: its own place or the old one's it is, else the place of what holds it */
      const near = e => { for (let p = e; p && p !== box; p = p.parentElement) { const c = W.cache.get(p) || W.cache.get(pairs.get(p)); if (c) return c; } return null; };
      const shown = e => { const c = near(e); return !!c && !c.lazy && onScreen(view(c)); };
      const boards = [];
      const jobs = retext.map(e => [e, was(e)]);
      pairs.forEach((a, b) => { if (!a.children.length && !b.children.length && a.textContent !== b.textContent) jobs.push([b, a.textContent]); });
      jobs.forEach(([e, from]) => {
        const t = e.firstChild, to = t && t.nodeValue;
        if (!t || t.nodeType !== 3 || e.childNodes.length !== 1 || from === to) return;
        if (o.reel !== false && NUM.test(from) && NUM.test(to) && shown(e)) { t.nodeValue = from; const board = reel(t, to, T, true); t.replaceWith(board); boards.push(board); e._gRun = { to, nodes: [board], at: performance.now() }; }   /* measured with the reads of the update */
        else if (o.flash !== false) { t.nodeValue = from; const f = words(t, to, ctx); if (f) { const nodes = [...f.childNodes]; t.replaceWith(f); e._gRun = { to, nodes, at: performance.now() }; } else t.nodeValue = to; }
      });
      /* where each one stood: its own place, or the place of the old one it is (page coordinates to the viewport; a glide that still runs is where it is now) */
      const from = e => {
        const c = W.cache.get(e) || (pairs.has(e) ? W.cache.get(pairs.get(e)) : null);
        if (!c || c.out) return null;
        if (c.lazy) { const L = W.lazy.get(c.lazy); return L ? { box: c.lazy, at: view(L) } : null; }
        const v = view(c);
        if (moving && W.cache.has(e) && e.getAnimations && e.getAnimations().length) {   /* still gliding from the last update */
          const m = new DOMMatrixReadOnly(getComputedStyle(e).transform);
          if (m.m41 || m.m42) { v.left += m.m41; v.right += m.m41; v.top += m.m42; v.bottom += m.m42; }
        }
        return v;
      };
      /* what may have moved: each element whose place is kept, or the new one of it (in this box, not in a box watched by itself) */
      const force = new Set(shownRows);
      if (o.move !== false) W.cache.forEach((c, e) => {
        const n = e.isConnected && box.contains(e) ? e : back.get(e);
        if (!n || force.has(n) || ctx.moves.has(n) || owner(n.parentElement) !== box) return;
        const f = from(n); if (f) ctx.moves.set(n, f);
      });
      /* what comes in: the top of what is new, but a new box that holds old rows does not come in itself (they glide to it), only its new rows do */
      const carry = new Set();
      pairs.forEach((a, b) => { for (let p = b.parentElement; p && p !== box && !carry.has(p); p = p.parentElement) carry.add(p); });
      W.cache.forEach((c, e) => { if (e.isConnected) for (let p = e.parentElement; p && p !== box && !carry.has(p); p = p.parentElement) carry.add(p); });
      const into = n => { if (OWN.test(n.className) || eqNew.has(n)) return; if (!force.has(n) && (pairs.has(n) || W.cache.has(n) || carry.has(n))) kids(n).forEach(into); else ctx.entering.push(n); };   /* a board that turns or marked words are the kit's, not new content */
      fresh.forEach(into);
      shownRows.forEach(n => { if (!ctx.entering.includes(n)) ctx.entering.push(n); });
      /* what goes: fades out where it stood, in the place of its parent (the parent, or the new one of it); a box that held rows that live on does not */
      const ghosts = [];
      const hasPaired = e => [...e.querySelectorAll('*')].some(d => back.has(d));
      const leave = (e, p, oldParent) => {
        if (ghosts.length >= MAX || !p || !p.isConnected || (W.page && p === box)) return;   /* what goes right out of <body> floated over the page */
        const c = W.cache.get(e), pc = oldParent === box ? W.at : W.cache.get(oldParent);
        if (!c || c.lazy || c.out || !pc || pc.lazy || pc.cl == null || !onScreen(view(c))) return;
        const copy = e.cloneNode(true);   /* a copy: the node that went stays the page's */
        [copy, ...copy.querySelectorAll('[id]')].forEach(x => x.removeAttribute('id'));
        copy.querySelectorAll('input, select, textarea, button').forEach(x => { x.disabled = true; });
        ghosts.push([copy, p, c.x - pc.x - pc.cl + pc.sl, c.y - pc.y - pc.ct + pc.st, c.w, c.h, pc.flat, 0, 0]);   /* the old parent's frame: the new one of it is of its kind */
      };
      const out = (e, p, oldParent) => {
        if (eqOld.has(e)) return;   /* the same again: nothing of it goes */
        if (back.has(e)) { const b = back.get(e); kids(e).forEach(k => out(k, b, e)); return; }
        if (hasPaired(e)) return;
        leave(e, p, oldParent);
      };
      if (o.leave !== false) gone.forEach(([e, p]) => out(e, p, p));
      /* play it: the same as Glass.morph from here; the reads of flush() are where all of it is read again (the cache) */
      ctx.ghosts = ghosts;
      if (W.page) {   /* on the page, only where it changed is measured; what floats over the page (fixed, or absolute right in it) does not come in */
        const sc = new Set();
        gone.forEach(g => sc.add(g[1])); came.forEach(n => sc.add(n.parentElement)); retext.forEach(e => sc.add(e)); shownRows.forEach(e => sc.add(e.parentElement));
        ctx.scope = [...sc].filter(n => n && n.isConnected);
        ctx.floats = e => { const p = getComputedStyle(e).position; return p === 'fixed' || (p === 'absolute' && e.parentElement === box); };
      }
      ctx.onRead = () => snapshot(W);
      ctx.onWrite = () => boards.forEach(b => b._arm());   /* the boards take their size after the reads (and after the ghosts are checked against them) */
      ctx.flush();   /* the ghosts go in there, after its reads */
      W.mo.takeRecords();   /* the copies, the boards, the marked words: written here, not changes */
      W.busy = performance.now() + (ctx.until || 0) + 100;
      /* where all of it stands was read in the update (onRead: what glides or comes in moves by transform, the layout stays); read again when it is over
         only after numbers turned or words lit up (their text, back in place, may be a little wider or narrower than the board was) */
      if (jobs.length) settle(W, 0);
      /* the boxes it is in: what is below it moves as it grows, they read where all of it stands when it is over */
      WATCHED.forEach(V => { if (V !== W && V.box.contains(box)) { V.busy = Math.max(V.busy, W.busy); settle(V, 0); } });
    }
    function watch(box) {
      if (typeof box === 'string') box = document.querySelector(box);
      if (!box || !window.MutationObserver) return null;
      if (WATCHED.has(box)) return WATCHED.get(box).stop;
      const page = box === document.body || box === document.documentElement;
      const W = { box, page, cache: new Map(), lazy: new Map(), at: null, busy: 0, timer: 0, soon: 0, live: !page, rush: 0, last: 0 };
      W.mo = new MutationObserver(recs => changed(W, recs));
      W.mo.observe(box, { childList: true, subtree: true, characterData: true, characterDataOldValue: true, attributes: true, attributeFilter: ['hidden', 'open'], attributeOldValue: true });
      if (window.ResizeObserver) { W.ro = new ResizeObserver(() => settle(W, 50)); W.ro.observe(box); }
      if (!box.hasAttribute('data-g-no-enter')) box.setAttribute('data-g-no-enter', '');   /* its rows come in here, not by the generic entrance of new rows */
      W.stop = () => { W.mo.disconnect(); if (W.ro) W.ro.disconnect(); clearTimeout(W.timer); clearTimeout(W.soon); WATCHED.delete(box); };
      WATCHED.set(box, W);
      listen();
      if (!page) snapshot(W);
      else {   /* the page as it loads is built, not changed: it is read and animated once it is loaded and the browser is idle (what the page
                  still draws in its first moments, a background, an icon, would make every read of the layout work out all its styles again) */
        const go = () => (window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 1500 }) : f => setTimeout(f, 200))(() => settled(() => setTimeout(() => { W.live = true; snapshot(W); })));
        if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
      }
      return W.stop;
    }
    morph.watch = watch;
    morph.busy = () => { const now = performance.now(); for (const W of WATCHED.values()) if (W.busy > now) return true; return false; };
    morph.busyUntil = () => { let t = 0; for (const W of WATCHED.values()) t = Math.max(t, W.busy); return t; };   /* when what plays now is over (performance.now() time) */
    morph.watching = n => { for (const b of WATCHED.keys()) if (b.contains(n)) return true; return false; };
    return morph;
  })();
  kit.morph = morph;
  kit.watch = morph.watch;
  /* <body data-g-still>: the pointer's enter / leave events are not delivered while the page animates (what glides under a still pointer would
     fire them, and a hover that changes the page would answer with another animation). Clicks and moves go on; :hover in CSS is the browser's */
  const HOVER = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave'];
  const moving = () => document.body && document.body.hasAttribute('data-g-still') && morph.busy();
  /* What was held back is given afterwards, as the browser would have given it: once the animation is over, the hover goes from the element the
     page last heard of (hovered) to the one under the pointer (out, leave, over, enter); and a press during the animation first brings the hover
     to what it presses (a click comes after the hover of what it clicks: a page that acts on the hovered item gets the right one). Only after
     something was held back; else the browser's own events are all there is */
  let hovered = null, held = false, px = -1, py = -1, replaying = false, wait = 0;
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; }, { capture: true, passive: true });
  HOVER.forEach(t => addEventListener(t, e => {
    if (replaying) return;
    px = e.clientX; py = e.clientY;
    if (moving()) { e.stopImmediatePropagation(); if (!held) { held = true; later(); } return; }
    if (t === 'mouseover') hovered = e.target;
    if (t === 'mouseout' && !e.relatedTarget) hovered = null;   /* the pointer left the window */
  }, true));
  function later() { clearTimeout(wait); wait = setTimeout(() => { if (moving()) later(); else follow(document.elementFromPoint(px, py)); }, Math.max(20, morph.busyUntil() - performance.now() + 20)); }
  function follow(to) {
    held = false; clearTimeout(wait);
    const from = hovered && hovered.isConnected ? hovered : null;
    if (from === to) return;
    const fire = (el, type, rel) => {
      const bubbles = !/enter|leave/.test(type), init = { bubbles, cancelable: bubbles, composed: true, view: window, clientX: px, clientY: py, relatedTarget: rel };
      el.dispatchEvent(type.startsWith('pointer') && window.PointerEvent ? new PointerEvent(type, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, init)) : new MouseEvent(type, init));
    };
    const chain = el => { const a = []; for (let n = el; n; n = n.parentElement) a.push(n); return a; };
    const outOf = from ? chain(from).filter(n => !to || !n.contains(to)) : [], into = to ? chain(to).filter(n => !from || !n.contains(from)).reverse() : [];
    replaying = true;
    try {
      ['pointer', 'mouse'].forEach(k => {   /* the pointer events, then the mouse ones, as the browser gives them */
        if (from) { fire(from, k + 'out', to); outOf.forEach(n => fire(n, k + 'leave', to)); }
        if (to) { fire(to, k + 'over', from); into.forEach(n => fire(n, k + 'enter', from)); }
      });
    } finally { replaying = false; }
    hovered = to;
  }
  addEventListener('pointerdown', e => { if (held) follow(e.target); }, true);
  /* the boxes marked data-g-morph are watched from the start (a change made early is animated too), and those put in later as they come */
  function start() {
    $$('[data-g-morph]').forEach(b => morph.watch(b));
    if (!global.MutationObserver) return;
    new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(x => {
      if (x.nodeType !== 1) return;
      if (x.matches('[data-g-morph]')) morph.watch(x);
      if (x.firstElementChild) $$('[data-g-morph]', x).forEach(b => morph.watch(b));
    }))).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
