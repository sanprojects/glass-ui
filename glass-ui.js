/*!
 * Glass UI — vanilla JS for glass-ui.css. No dependencies.
 * Passive: the page is drawn by CSS alone. After first paint the script prepares markup that needs it (builds the select / pager / "more" parts, fills ARIA) in idle time,
 * or on the first pointer / key / focus on a component. ALL behaviour is handled by delegated listeners on `document`, with the state kept in the DOM,
 * so elements added later work the same. Call Glass.init(root) after inserting markup that has to be built (select, pager, more, number, color, file, menu).
 * Markup is plain HTML: native elements, ARIA roles and data- attributes (see glass-ui.css).
 *
 *   <select data-g-select multiple>   -> multi-select: list stays open, toggles options, shows "A, B" or "3 selected"
 *   <select data-g-select>            -> glass dropdown (add data-searchable for a combobox filter)
 *   <option value="bots">Bots <small>12</small></option> -> the markup of an option goes into the list and the trigger, as <selectedcontent> does; a <small> in it is a dimmed side note at the right end, such as a count
 *     (give it a value: without one the value is the whole text, the count too). Options changed by a script are followed
 *   <select data-g-select data-searchable data-load-list="/url">  -> the options come from the server: GET /url?value=<typed text> returns [[text, value?], ...] (opens with value=""; the empty <option> is the "any" row, labelled data-clear-label)
 *   (automatic) every text <input> in a .g-field gets this cross; data-g-no-clear on the input or a container turns it off. Written by hand:
 *   <input pattern="…" data-error="Message" required>  -> checks in a .g-field: pattern as you type; empty required after leaving / on submit (data-error-required); red control + message under it
 *   <button class="g-input-end" data-icon="x" data-g-clear-input aria-label="Clear">  -> clear cross inside .g-input-wrap: shown while the <input> has a value, click empties it (fires `input`) and focuses it
 *   <button class="g-input-end" data-g-password>  -> show/hide password (inside .g-input-wrap next to the <input type=password>)
 *   <div class="g-input-wrap g-stepper" data-g-number> -> number field with − / + buttons (data-step="-1" / "1")
 *   <div class="g-input-wrap g-color" data-g-color>    -> colour field: swatch (native picker) + hex text input
 *   <div class="g-file" data-g-file>   -> file upload: dropzone with a file list (add class g-file--field for a compact one-row version; data-max-size="10" in MB; `multiple` on the input accumulates files across picks, data-max-files caps the count)
 *   Glass.fileProgress('#uploader', fileOrIndex, 0..100)  -> show per-file upload progress (bar turns green at 100)
 *   Glass.morph / Glass.watch / data-g-morph -> glass-morph.js (a library of its own; with this file it measures [data-g-fit], highlights with the kit and ends the busy line)
 *   <button data-g-menu="#m" data-g-align="end"> + <div role="menu" id="m"> -> dropdown menu: buttons or links, <hr>; arrow keys, Esc, outside click
 *   <div role="tablist"><button>…</button>…</div> <div role="tabpanel">…</div>…  -> tabs / segmented control; roles, ids, aria-controls and hidden are filled in
 *   <button command="show-modal" commandfor="dlg"> -> opens <dialog id="dlg" closedby="any"> (closedby="any": a click on the backdrop closes it)
 *   <button command="close" commandfor="dlg" value="ok"> -> closes it (returnValue = button value)
 *   <input type="range">              -> fill is updated automatically
 *   <th aria-sort="none"><button>Name …</button></th> -> sortable column (text, or numeric via data-sort on the cells)
 *   <div class="g-clamp" data-g-clamp="3"><div class="g-clamp__text">…</div><button class="g-clamp__btn" hidden>more</button></div> -> text clamped to 3 lines with an inline more / less pill (hidden when the text fits)
 *   <ol class="g-list" data-g-more="6">  -> shows 6 items and a "Show K more" / "Show less" button (data-more-label="Show {n} more")
 *   <ol class="g-list" data-g-fit>     -> rows as wide as the longest text in the list (also data-g-fit on a box with several lists: the longest of all; or style="--g-chars: 9" for a width you know), as many columns as fit
 *   <table data-g-selectable> -> row selection
 *   <nav data-g-pager data-total="24" data-size="4" data-page="1"> -> pager
 *   <button data-size="sm" data-g-remove>Berlin</button>  -> removable chip: draws a × and removes itself on click (g:remove)
 *   <button data-size="sm" data-g-toggle aria-pressed="false">Design</button>  -> toggle chip
 *   <button data-g-toggle data-icon="eye-off" aria-pressed="true" aria-label="Hide ticked"></button>  -> round icon toggle (the state is aria-pressed; the button fires a non-bubbling `change` after it flips)
 *   <button popovertarget="p"> + <aside popover id="p"> -> native popover panel (top layer, closes on outside click / Esc)
 *   (automatic) touch hover: a finger on an element is a mouse over it ([data-g-hover] + mouseover/mouseenter for the page's handlers), lifted off it: no click; <html data-g-touch-hover="off"> turns it off
 *   title="…" on any element inside .g-root -> glass tooltip (data-tip-position="bottom" to show it below)
 *   data-icon="play" / data-icon-end="chevron-down" / data-icon="heart" on any element -> icon from glass-icons.css (Lucide subset, CSS masks; no JS involved)
 *   Glass.toast({ title, text, variant, duration })
 */
(global => {
  'use strict';
  let uid = 0;
  /* toast icon per variant: names from glass-icons.css */
  const ICONS = { info: 'info', success: 'check', warning: 'triangle-alert', danger: 'x' };

  /* element that an attribute such as data-g-menu="#id" points to */
  function target(el, attr) { return document.querySelector(el.getAttribute(attr)); }
  function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  /* per-element state lives in a WeakMap, not on the DOM node: mem(node, key) reads, mem(node, key, value) writes */
  const state = new WeakMap();
  function mem(node, key, value) {
    let m = state.get(node);
    if (arguments.length < 3) return m && m[key];
    if (!m) state.set(node, m = {});
    return (m[key] = value);
  }
  /* attrs(el, { name: value, … }): several attributes at once */
  function attrs(node, o) { for (const k in o) node.setAttribute(k, o[k]); return node; }
  /* what the kit builds into the page's markup is not the page's: a morph of the page (glass-morph.js: the answer of a form, a framework's render)
     leaves it as it is. part: an element the kit put in; wrap: a box it put around elements of the page; owns: attributes it set or took away */
  function part(n) { n.setAttribute('data-g-part', ''); return n; }
  function wrapper(n) { n.setAttribute('data-g-wrap', ''); return n; }
  function owns(n, ...names) { const had = (n.getAttribute('data-g-attrs') || '').split(' ').filter(Boolean), add = names.filter(x => !had.includes(x)); if (add.length) n.setAttribute('data-g-attrs', had.concat(add).join(' ')); return n; }
  /* data(el, 'more-label', 'Show more'): the data-* attribute, or the default */
  function data(node, key, def) { return node.getAttribute('data-' + key) || def; }
  /* num(el, 'data-g-more', 5): an integer attribute, or the default */
  function num(node, attr, def) { return parseInt(node.getAttribute(attr), 10) || def; }
  function isDisabled(node) { return node.getAttribute('aria-disabled') === 'true'; }
  /* commit(field): a value changed by script gets the same input + change events as one typed by the user */
  function commit(node) { fire(node, 'input'); fire(node, 'change'); }
  function once(node, key) { const d = mem(node, 'done') || mem(node, 'done', {}); if (d[key]) return false; d[key] = 1; return true; }
  /* on(type, selector, fn, capture): one delegated listener on `document`; fn(event, matchedElement) runs when the target is inside `selector` */
  function on(type, sel, fn, capture) {
    document.addEventListener(type, e => { const t = e.target, n = t.closest && t.closest(sel); if (n) fn(e, n); }, capture);
  }
  function fire(el, type, detail) { el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail })); }
  /* aria(el, 'expanded' | 'selected' | 'pressed' | 'current', bool) */
  function aria(el, name, on) { el.setAttribute('aria-' + name, on ? 'true' : 'false'); }
  /* mount(selector, fn, root): runs fn once for every matching element (safe to call again after new markup is added) */
  function mount(sel, fn, root) { $$(sel, root).forEach(n => { if (once(n, sel)) fn(n); }); }
  /* ---------- Floating panel: shared by select, menu and nav "More" ----------
   * A native popover (top layer, so its blur sees the real page) placed by CSS anchor positioning: the trigger gets an anchor-name, the panel a position-anchor,
   * and glass-ui.css flips it above the trigger when there is no room below. JS only keeps the open state, outside press, Esc and arrow keys.
   * o: { anchor, align: 'start' | 'end', menu: arrow-key menu, items: close on item click, focusBack, onClose } */
  const floats = [];
  function floatPanel(trigger, panel, o) {
    o = o || {};
    const name = '--g-a' + (++uid);
    (o.anchor || trigger).style.setProperty('anchor-name', name); panel.style.setProperty('position-anchor', name);
    if (o.align === 'end') panel.style.setProperty('position-area', 'block-end span-inline-start');
    panel.setAttribute('popover', o.auto ? 'auto' : 'manual');
    const f = {
      trigger, panel, o,
      isOpen() { return floats.includes(f); },
      open() {
        if (f.isOpen()) return; floats.push(f);
        const host = trigger.closest('dialog, [popover]') || document.body;   // inside a modal dialog or popover the panel must stay in it
        if (panel.parentNode !== host) host.appendChild(panel);
        if (panel.showPopover) panel.showPopover();   /* a browser without the Popover API (iOS < 17): the panel is not raised, but nothing throws */
        aria(trigger, 'expanded', true);
      },
      close(focus) {
        const i = floats.indexOf(f); if (i < 0) return; floats.splice(i, 1);
        if (panel.hidePopover) panel.hidePopover();
        aria(trigger, 'expanded', false); if (o.onClose) o.onClose();
        if (focus) trigger.focus();
      }
    };
    if (o.auto) {   // popover="auto" + popovertarget: the browser toggles it, dismisses it on an outside click / Esc and returns the focus; here only the bookkeeping follows
      (trigger.closest('dialog, [popover]') || document.body).appendChild(panel); trigger.setAttribute('popovertarget', panel.id);
      panel.addEventListener('toggle', e => {
        if (e.newState === 'open' && !f.isOpen()) { floats.push(f); aria(trigger, 'expanded', true); const first = menuItems(panel).find(enabled); if (first) first.focus(); }
        else if (e.newState === 'closed' && f.isOpen()) { floats.splice(floats.indexOf(f), 1); aria(trigger, 'expanded', false); if (o.onClose) o.onClose(); }
      });
    }
    return f;
  }
  document.addEventListener('mousedown', e => {
    const t = e.target; if (!t.closest) return;
    const opt = t.closest('[role="option"]'); if (opt && mem(opt.closest('[role="listbox"]'), 'st')) e.preventDefault();   // keep the focus where it is
    floats.slice().forEach(f => { if (!f.o.auto && !f.trigger.contains(t) && !f.panel.contains(t)) f.close(false); });
  });
  /* the items of a menu: its buttons and links (or anything with role="menuitem") */
  function menuItems(panel) { return [...panel.children].filter(c => /^(BUTTON|A)$/.test(c.tagName) || c.getAttribute('role') === 'menuitem'); }
  function enabled(i) { return !isDisabled(i) && !i.disabled; }
  /* Esc closes the top panel (focus back on the trigger); in a menu Arrow / Home / End move between the items and Tab closes */
  document.addEventListener('keydown', e => {
    const k = e.key, top = floats[floats.length - 1];
    if (k === 'Escape' && top && !top.o.auto) { e.preventDefault(); e.stopPropagation(); top.close(true); return; }
    const f = floats.find(x => x.o.menu && x.panel.contains(document.activeElement)); if (!f) return;
    const items = menuItems(f.panel).filter(enabled), n = items.indexOf(document.activeElement);
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (items.length) items[n < 0 ? (k === 'ArrowDown' ? 0 : items.length - 1) : (n + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (k === 'Home' && items.length) { e.preventDefault(); items[0].focus(); }
    else if (k === 'End' && items.length) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (k === 'Tab') f.close(false);
  });
  document.addEventListener('click', e => {   // a click on a menu item closes its menu
    const t = e.target; if (!t.closest) return;
    floats.slice().forEach(f => { if (f.o.items && f.panel.contains(t)) { const i = t.closest('button, a, [role="menuitem"]'); if (i && i.parentNode === f.panel) f.close(!!f.o.focusBack); } });
  });

  /* <button data-g-menu="#m" data-g-align="end"> + <div role="menu" id="m"> with buttons or links and <hr> separators */
  function initMenu(trigger) {
    const panel = target(trigger, 'data-g-menu'); if (!panel) return;
    const id = panel.id || (panel.id = 'g-menu-' + (++uid));
    mem(trigger, 'fp', floatPanel(trigger, panel, { auto: trigger.localName === 'button', align: trigger.getAttribute('data-g-align') || 'start', menu: true, items: true, focusBack: true }));
    panel.setAttribute('role', 'menu'); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-controls', id); aria(trigger, 'expanded', false);
    menuItems(panel).forEach(i => { if (!i.hasAttribute('role')) i.setAttribute('role', 'menuitem'); i.tabIndex = -1; });
    $$('hr', panel).forEach(i => { i.setAttribute('role', 'separator'); });
  }
  function openMenu(fp, last) {
    if (fp.isOpen()) return; fp.open();
    const items = menuItems(fp.panel).filter(enabled), f = last ? items[items.length - 1] : items[0]; if (f) f.focus();
  }
  on('click', '[data-g-menu]', (e, t) => {
    const fp = mem(t, 'fp');
    if (fp && !fp.o.auto) fp.isOpen() ? fp.close(true) : openMenu(fp);
  });
  on('keydown', '[data-g-menu]', (e, t) => {
    const fp = mem(t, 'fp');
    if (fp && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openMenu(fp, e.key === 'ArrowUp'); }
  });

  /* ---------- Select / combobox: initSelect builds the parts once (state lives in st); all events are delegated below ---------- */
  function selectParts(sel, id) {   // <div.g-select> around the <select>: a combobox button and a listbox panel (with a filter field when data-searchable)
    const wrap = el('div', 'g-select'), trigger = el('button', 'g-select__trigger', '<span class="g-select__value"></span>'), list = el('div'), holder = el('div');
    sel.parentNode.insertBefore(wrapper(wrap), sel); wrap.appendChild(sel);
    sel.tabIndex = -1; aria(sel, 'hidden', true); owns(sel, 'tabindex', 'aria-hidden', 'data-icon'); part(trigger); part(list);
    attrs(trigger, { type: 'button', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-controls': id, 'data-icon-end': 'chevron-down' }); aria(trigger, 'expanded', false);
    if (sel.hasAttribute('data-icon')) { trigger.setAttribute('data-icon', sel.getAttribute('data-icon')); sel.removeAttribute('data-icon'); }   /* <select data-icon="x"> puts an icon at the start of the trigger */
    const lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    if (lab) { if (!lab.id) owns(lab, 'id').id = id + '-lbl'; trigger.setAttribute('aria-labelledby', lab.id); }
    attrs(list, { id, role: 'listbox' }); if (sel.multiple) list.setAttribute('aria-multiselectable', 'true');
    let search = null;
    if (sel.hasAttribute('data-searchable')) {
      search = attrs(el('input', 'g-select__search'), { type: 'search', placeholder: data(sel, 'search-placeholder', 'Search…'), 'aria-label': 'Filter options' });
      list.appendChild(search);
    }
    list.appendChild(holder); wrap.append(trigger, list);
    return { wrap, trigger, list, holder, search };
  }
  function initSelect(sel) {
    const id = 'g-sel-' + (++uid), multi = sel.multiple, { wrap, trigger, list, holder, search } = selectParts(sel, id);
    const valueEl = trigger.firstChild, st = { sel, wrap, trigger, list, holder, search };
    let opts = [], active = -1;
    [sel, trigger, list].forEach(n => mem(n, 'st', st));
    const optOf = d => mem(d, 'o');   // an option element of the list -> its <option>
    const visible = () => opts.filter(d => !d.hidden && !isDisabled(d));
    const placeholder = () => sel.querySelector('option[value=""]')?.textContent.trim() || data(sel, 'placeholder', 'Select…');
    const copy = o => [...o.childNodes].map(n => n.cloneNode(true));   // an option as it is written: its text and its markup
    const content = o => {   // ... and with a side note (<small>) the text in a span of its own, which gives way with an ellipsis, the note after it at the right end
      const c = copy(o); if (!o.querySelector(':scope > small')) return c;
      const t = el('span', 'g-select__text'); t.append(...c); return [t, ...t.querySelectorAll(':scope > small')];
    };

    const url = sel.getAttribute('data-load-list'); let seq = 0, timer = 0;   /* remote options: the server filters, the kit only draws */
    function build() {   // the options are read from the <select> each time it opens
      holder.innerHTML = ''; opts = [];
      $$('option', sel).forEach((o, i) => {
        if (o.hidden || (o.value === '' && !(url && search))) return;
        const d = attrs(el('div'), { id: id + '-o' + i, role: 'option', tabindex: -1 });
        if (o.value === '') d.textContent = data(sel, 'clear-label', '—'); else d.append(...content(o)); if (o.disabled) d.setAttribute('aria-disabled', 'true');
        mem(d, 'o', o); mem(d, 'label', o.textContent.toLowerCase());
        holder.appendChild(d); opts.push(d);
      });
      paint();
    }
    function paint() {   // the trigger text and the selected marks
      const on = $$('option', sel).filter(o => o.selected && o.value !== ''), ph = !on.length;
      if (ph || on.length > 2) valueEl.textContent = ph ? placeholder() : on.length + ' ' + data(sel, 'selected-label', 'selected');
      else valueEl.replaceChildren(...(on.length > 1 ? on.flatMap((o, i) => i ? [', ', ...copy(o)] : copy(o)) : content(on[0])));   /* two of a multi-select: their notes stay inline */
      valueEl.classList.toggle('is-placeholder', ph);
      opts.forEach(d => aria(d, 'selected', optOf(d).selected && !ph));
    }
    function setActive(d) {
      opts.forEach(o => o.classList.remove('is-active'));
      active = d ? opts.indexOf(d) : -1;
      if (!d) { trigger.removeAttribute('aria-activedescendant'); return; }
      d.classList.add('is-active'); trigger.setAttribute('aria-activedescendant', d.id); d.scrollIntoView({ block: 'nearest' });
    }
    const fp = floatPanel(trigger, list, { onClose: () => { wrap.classList.remove('is-open'); setActive(null); } });
    const isOpen = () => fp.isOpen(), close = focus => fp.close(focus);
    function open() {
      if (sel.disabled || isOpen()) return;
      build(); fp.open(); wrap.classList.add('is-open');
      if (search) { search.value = ''; url ? load('') : filter(); setTimeout(() => search.focus(), 30); }
      if (!multi) setActive(opts.find(d => optOf(d).selected && d.getAttribute('aria-selected') === 'true') || visible()[0]);
    }
    function choose(d) {
      if (isDisabled(d)) return;
      optOf(d).selected = multi ? !optOf(d).selected : true; paint();   /* by option, not by value: values may repeat */
      if (!multi) close(true);
      commit(sel);
    }
    function load(q) {   // replace the options by the server's list, keeping the empty one and the chosen one
      const n = ++seq, done = () => { if (n === seq) busy(list, false); };   /* the busy line along the list while the server answers (it shows when that is slow); a newer request keeps it */
      busy(list, true);
      fetch(url + (url.includes('?') ? '&' : '?') + 'value=' + encodeURIComponent(q)).then(r => r.json()).then(rows => {
        done();
        if (n !== seq || !isOpen()) return;
        const empty = sel.querySelector('option[value=""]'), cur = sel.value;
        sel.replaceChildren(...(empty ? [empty] : []));
        const seen = new Set(['']);
        const add = (text, value) => { if (seen.has(value)) return; seen.add(value); sel.appendChild(new Option(text, value, false, value === cur)); };
        (rows || []).forEach(r => add(String(r[0]), String(r[1] ?? r[0])));
        if (cur && !seen.has(cur)) { const o = new Option(cur, cur, true, true); sel.appendChild(o); }
        sel.value = cur; build(); setActive(visible()[0]);
      }).catch(done);
    }
    function filter() {
      if (url) { clearTimeout(timer); timer = setTimeout(() => load((search.value || '').trim()), 200); return; }
      const q = (search.value || '').toLowerCase().trim();
      opts.forEach(d => { d.hidden = !!q && !mem(d, 'label').includes(q); });
      const n = opts.filter(d => !d.hidden).length, none = holder.querySelector('.g-select__empty');
      if (!n && !none) holder.appendChild(el('div', 'g-select__empty', 'No matches')); else if (n && none) none.remove();
      setActive(visible()[0]);
    }
    function move(dir) {
      const v = visible(); if (!v.length) return;
      const i = v.indexOf(opts[active]);
      setActive(v[i < 0 ? (dir > 0 ? 0 : v.length - 1) : (i + dir + v.length) % v.length]);
    }
    function typeahead(ch, o) {   // a letter jumps to the first option that starts with it
      const hit = opts.find(d => mem(d, 'label').charAt(0) === ch && !isDisabled(d)); if (!hit) return;
      if (o || multi) setActive(hit); else { optOf(hit).selected = true; paint(); fire(sel, 'change'); }
    }
    function onKey(e) {
      const o = isOpen(), k = e.key, onTrigger = e.target === trigger;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); o ? move(k === 'ArrowDown' ? 1 : -1) : open(); }
      else if ((k === 'Enter' || k === ' ') && (o ? k === 'Enter' || onTrigger : onTrigger)) { e.preventDefault(); if (!o) open(); else if (opts[active]) choose(opts[active]); }
      else if (k === 'Tab') close(false);
      else if (o && onTrigger && (k === 'Home' || k === 'End')) { e.preventDefault(); const v = visible(); setActive(v[k === 'Home' ? 0 : v.length - 1]); }
      else if (!search && k.length === 1 && (!multi || o) && !e.metaKey && !e.ctrlKey) typeahead(k.toLowerCase(), o);
    }
    Object.assign(st, { open, close, choose, filter, paint, setActive, onKey, isOpen });
    if (search) ['input', 'change'].forEach(t => search.addEventListener(t, e => { e.stopPropagation(); if (t === 'input') filter(); }));   /* the filter text is not a field of the form: its events stay here, so a form that submits on input does not see it */
    trigger.disabled = sel.disabled;
    build();
    /* options changed by a script (a count in them, another list): the trigger follows at once, an open list is built again with the same option active.
       A list from the server builds itself (load) */
    if (window.MutationObserver) new MutationObserver(() => {
      if (!isOpen()) { paint(); return; }
      if (url) return;
      const was = opts[active] && optOf(opts[active]);
      build(); if (search) filter(); setActive(opts.find(d => optOf(d) === was) || null);
    }).observe(sel, { childList: true, subtree: true, characterData: true });
  }
  (() => {   // delegated select events
    const stOf = (node, q) => { const n = node.closest(q); return n && mem(n, 'st'); };
    document.addEventListener('click', e => {
      const t = e.target; if (!t.closest) return;
      let st = stOf(t, '.g-select__trigger');
      if (st) { st.isOpen() ? st.close(true) : st.open(); return; }
      const opt = t.closest('[role="option"]'); st = opt && stOf(opt, '[role="listbox"]'); if (st) { st.choose(opt); return; }
      const c = t.closest('label')?.control, s = c && mem(c, 'st');   // a <label for> of the hidden <select> focuses the trigger
      if (s && !t.closest('.g-select') && !t.closest('a[href]')) { e.preventDefault(); s.trigger.focus(); }   // a link inside the label is a link: it is followed
    });
    on('keydown', '.g-select__trigger, .g-select__search', (e, n) => (stOf(n, '.g-select__trigger') || stOf(n, '[role="listbox"]'))?.onKey(e));
    document.addEventListener('change', e => { const st = mem(e.target, 'st'); if (st && st.sel === e.target) st.paint(); });
    on('pointerover', '[role="listbox"]', (e, l) => {   // the highlight follows the pointer
      const o = e.target.closest('[role="option"]'); if (o && !isDisabled(o)) mem(l, 'st')?.setActive(o);
    });
    on('pointerout', '[role="listbox"]', (e, l) => {   // ... and never gets stuck when it leaves the options
      const st = mem(l, 'st');
      if (st && st.holder.contains(e.target) && !(e.relatedTarget && st.holder.contains(e.relatedTarget))) st.setActive(null);
    });
  })();
  document.addEventListener('reset', e => {   // a form reset: repaint the custom controls once the browser has reset the values
    const f = e.target; setTimeout(() => { $$('select[data-g-select], [data-g-file]', f).forEach(n => { if (mem(n, 'st')) mem(n, 'st').paint(); if (mem(n, 'f')) mem(n, 'f').reset(); }); }, 0);
  });

  /* ---------- Tabs: one delegated click / keydown handler; the roles and ids are (re)written from the DOM whenever it is needed ---------- */
  function tabsOf(list) { return [...list.children].filter(c => c.getAttribute('role') === 'tab' || c.tagName === 'BUTTON'); }
  function initTabs(list) {   // idempotent wiring of roles / ids / panels; run at idle, on first touch, or by Glass.init
    const tabs = tabsOf(list), n = mem(list, 'n') || mem(list, 'n', ++uid);
    /* panels: role="tabpanel" siblings of the tablist, matched to the tabs by order (or by aria-controls when given) */
    const panels = [...list.parentNode.children].filter(c => c.getAttribute('role') === 'tabpanel');
    owns(list, 'data-g-ready');
    tabs.forEach((t, i) => {
      if (t.getAttribute('role') !== 'tab') owns(t, 'role').setAttribute('role', 'tab');
      owns(t, 'tabindex');
      if (!t.id) owns(t, 'id').id = 'g-tab-' + n + '-' + i;
      const p = (t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'))) || (panels.length === tabs.length ? panels[i] : null);
      mem(t, 'panel', p);
      if (p) { if (!p.id) owns(p, 'id').id = 'g-panel-' + n + '-' + i; owns(t, 'aria-controls').setAttribute('aria-controls', p.id); owns(p, 'aria-labelledby').setAttribute('aria-labelledby', t.id); }
    });
    selectTab(list, tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0], false, true);
    list.setAttribute('data-g-ready', '');   // from here on JS owns the panels (before: CSS shows the first one)
  }
  function selectTab(list, t, focus, silent) {
    const tabs = tabsOf(list);
    tabs.forEach(x => {
      const on = x === t; aria(x, 'selected', on); x.tabIndex = on ? 0 : -1;
      if (mem(x, 'panel')) mem(x, 'panel').hidden = !on;
    });
    if (focus) t.focus();
    if (!silent) fire(list, 'g:tabchange', { tab: t, index: tabs.indexOf(t) });
  }
  on('click', '[role="tablist"] > *', (e, t) => {
    const list = t.parentNode; if (!list.hasAttribute('data-g-ready')) initTabs(list);
    if (tabsOf(list).includes(t)) selectTab(list, t, false);
  });
  on('keydown', '[role="tablist"] > *', (e, t) => {
    const list = t.parentNode, tabs = tabsOf(list), i = tabs.indexOf(t); if (i < 0) return;
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!list.hasAttribute('data-g-ready')) initTabs(list);
    if (k) { e.preventDefault(); selectTab(list, tabs[(i + k + tabs.length) % tabs.length], true); }
    else if (e.key === 'Home') { e.preventDefault(); selectTab(list, tabs[0], true); }
    else if (e.key === 'End') { e.preventDefault(); selectTab(list, tabs[tabs.length - 1], true); }
  });

  /* ---------- Delegated behaviour: toggle button, removable button, dialog helpers (no per-element setup) ---------- */
  on('click', '[data-g-toggle]', (e, p) => { aria(p, 'pressed', p.getAttribute('aria-pressed') !== 'true'); p.dispatchEvent(new Event('change')); });   // `change` does not bubble: only a listener on the button hears it, a form's submit-on-change does not
  on('click', '[data-g-remove]', (e, x) => { fire(x, 'g:remove'); x.remove(); });
  /* Dialogs: <button command="show-modal" commandfor="dlg">, <button command="close" commandfor="dlg" value="ok">, <dialog closedby="any"> are native (focus returns by itself).
     Left for JS: the accessible name from the heading, the zoom-from-the-button origin, and a fallback for browsers without invoker commands / closedby. */
  function initDialog(d) {
    if (d.hasAttribute('aria-label') || d.hasAttribute('aria-labelledby')) return;
    const h = d.querySelector('h1,h2,h3'); if (h) { h.id = h.id || 'g-dlg-' + (++uid); d.setAttribute('aria-labelledby', h.id); }
  }
  document.addEventListener('command', e => {
    if (e.command !== 'show-modal' || !e.source) return;
    const d = e.target, o = e.source;
    requestAnimationFrame(() => { const dr = d.getBoundingClientRect(), r = o.getBoundingClientRect(); d.style.transformOrigin = Math.round(r.left + r.width / 2 - dr.left) + 'px ' + Math.round(r.top + r.height / 2 - dr.top) + 'px'; });
  }, true);/* the command event does not bubble */
  /* iOS: focusing a field scrolls the page to it and leaves it scrolled after the keyboard closes, even when the page is made not to scroll (body { overflow: hidden }):
     the sticky bar stays, the content slides under it. A page that does not scroll is put back. */
  const unscroll = () => { const s = document.scrollingElement; if (s && s.scrollTop && getComputedStyle(document.body).overflow === 'hidden') s.scrollTop = 0; };
  document.addEventListener('focusout', () => setTimeout(unscroll, 100));
  if (window.visualViewport) visualViewport.addEventListener('resize', unscroll);
  if (!('command' in HTMLButtonElement.prototype)) document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[commandfor]'), d = b && document.getElementById(b.getAttribute('commandfor')); if (!d || !d.showModal) return;
    const c = b.getAttribute('command'); if (c === 'show-modal') d.showModal(); else if (c === 'close') d.close(b.value); else if (c === 'request-close') d.requestClose ? d.requestClose(b.value) : d.close(b.value);
  });
  if (!('closedBy' in HTMLDialogElement.prototype)) document.addEventListener('click', e => { const d = e.target; if (d.localName === 'dialog' && d.open && d.getAttribute('closedby') === 'any') d.close(); });

  /* ---------- Slider fill ---------- */
  function initSlider(s) { const min = +s.min || 0, max = s.max === '' ? 100 : +s.max; owns(s, 'style').style.setProperty('--p', ((s.value - min) / (max - min) * 100) + '%'); }
  on('input', 'input[type="range"]', (e, s) => { initSlider(s); });

  /* ---------- Tooltip: one glass element in <body> (or the open <dialog> / popover), positioned next to the element ---------- */
  (() => {
    let tip, cur, prev, timer;
    function host(t) { return t.closest('dialog[open], [popover]:popover-open') || document.body; }
    function show(t) {
      clearTimeout(timer); cur = t;
      if (!tip) { tip = document.createElement('div'); tip.className = 'g-tooltip'; tip.setAttribute('role', 'tooltip'); tip.setAttribute('popover', 'manual'); }
      const h = host(t); if (tip.parentNode !== h) h.appendChild(tip);
      tip.textContent = t.getAttribute('data-g-tip'); tip.id = tip.id || 'g-tooltip'; t.setAttribute('aria-describedby', tip.id);
      tip.setAttribute('data-pos', t.getAttribute('data-tip-position') === 'bottom' ? 'bottom' : 'top');   // CSS flips it when there is no room
      if (prev && prev !== t) prev.style.removeProperty('anchor-name');
      t.style.setProperty('anchor-name', '--g-tip'); prev = t;
      if (tip.showPopover && !tip.matches(':popover-open')) tip.showPopover();
    }
    function hide() { if (!tip) return; if (cur) cur.removeAttribute('aria-describedby'); cur = null; if (tip.hidePopover && tip.matches(':popover-open')) tip.hidePopover(); }
    /* <button title="Duplicate project">: the native title of any element inside .g-root is taken over (moved to data-g-tip, so the browser does not show its own tip).
       Icon-only elements keep their accessible name through aria-label. Without JS the native title still works. */
    const SEL = '.g-root [title], [data-g-tip]';
    function take(t) {
      if (!t.hasAttribute('title') || t.tagName === 'IFRAME' || t.closest('svg')) return;
      markHint(t);
      const v = t.getAttribute('title');
      if (v) { t.setAttribute('data-g-tip', v); if (!t.hasAttribute('aria-label') && !t.textContent.trim()) t.setAttribute('aria-label', v); }
      t.removeAttribute('title');
    }
    function find(e) { const t = e.target.closest && e.target.closest(SEL); if (t) take(t); return t && t.hasAttribute('data-g-tip') ? t : null; }
    document.addEventListener('mouseover', e => { const t = find(e); if (t && t !== cur) show(t); });
    document.addEventListener('mouseout', e => { const t = find(e); if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hide(); });
    /* a quick flick can skip the mouseout (the element under the pointer changes or goes away first, a disabled button sends none): the tip must not outlive the pointer */
    document.addEventListener('pointermove', e => { if (cur && e.pointerType !== 'touch' && !(e.target.closest && cur.contains(e.target)) && !(tip && tip.contains(e.target))) hide(); }, true);
    document.documentElement.addEventListener('pointerleave', hide);
    window.addEventListener('blur', hide);
    document.addEventListener('focusin', e => { const t = find(e); if (t && e.target.matches(':focus-visible')) show(t); });
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', hide, true);
  })();

  /* ---------- Motion: Glass.animate(el, name) replays an effect; data-g-anim-loop="ms" replays it on a timer; g-anim-ripple starts at the pointer ---------- */
  function animate(el, name, o) {
    const cls = 'g-anim-' + name; o = o || {};
    if (o.x != null) { el.style.setProperty('--x', o.x + 'px'); el.style.setProperty('--y', o.y + 'px'); }
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  function animName(el) { for (let i = 0; i < el.classList.length; i++) { const m = /^g-anim-([a-z]+)$/.exec(el.classList[i]); if (m) return m[1]; } return null; }
  on('pointerdown', '.g-anim-ripple', (e, el) => {
    const r = el.getBoundingClientRect(); animate(el, 'ripple', { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  function initAnimLoop(el) {
    const name = animName(el), ms = +el.getAttribute('data-g-anim-loop') || 2400; if (!name) return;
    setInterval(() => { if (!document.hidden) animate(el, name); }, ms);
  }

  /* Long list labels and table cells end with an ellipsis (CSS); show the full text as a native tooltip only when it is cut */
  on('mouseover', '.g-list > li > :is(span, a), td, [role="option"]', (e, l) => {
    if (!l.title && l.scrollWidth > l.clientWidth) { l.setAttribute('data-no-hint', ''); l.title = l.textContent; }   /* a cut label is no "?" field: the tip alone */
  });

  /* initX(el) only prepares the markup / ARIA once (no listeners); the behaviour is delegated on `document` (see on) and reads its state from the DOM or from mem(). */
  /* "Show K more": the button lives in .g-more right after the list */
  function moreSet(list, open) {
    const n = num(list, 'data-g-more', 5), items = [...list.children], btn = list.nextElementSibling.querySelector('button');
    const rest = items.length - n, tpl = data(list, 'more-label', 'Show {n} more'), less = data(list, 'less-label', 'Show less');
    items.forEach((li, i) => { li.hidden = !open && i >= n; });
    aria(btn, 'expanded', open);
    btn.setAttribute('data-icon', 'chevron-down'); btn.textContent = open ? less : tpl.replace('{n}', rest);
  }
  /* The width that the text of the nodes takes in one line (the widest of them), in px: the one measure behind data-g-fit and the ruler's width. A node that is not shown measures 0 */
  const fitRange = document.createRange();
  function textWidth(nodes) {
    let w = 0;
    nodes.forEach(n => { fitRange.selectNodeContents(n); w = Math.max(w, fitRange.getBoundingClientRect().width); });
    return w;
  }
  /* data-g-fit on a .g-list, or on a box with lists in it (a result made of several lists): the columns are as wide as the longest text of all the rows, measured, not counted in characters
     (sets --g-text-w; follows rows that are added, removed or changed, and fonts that load late; a list that is shown later is measured when it is shown) */
  function initFit(box) {
    const sel = (box.classList.contains('g-list') ? ':scope > li' : '.g-list > li') + ':not(.g-morph-ghost) > :is(span, a)';   /* a row that fades out (Glass.morph) is not measured */
    let ro = null;
    const fit = () => {
      const w = textWidth($$(sel, box)), v = (Math.ceil(w) + 1) + 'px';
      if (w) { if (box.style.getPropertyValue('--g-text-w') !== v) box.style.setProperty('--g-text-w', v); if (ro) { ro.disconnect(); ro = null; } }
      else if (!ro && window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(box); }
    };
    fit();
    /* a row that fades out coming or going changes nothing: every measure lays the page out, and a morph takes away its faded rows at the end */
    const faded = n => n.nodeType === 1 && n.classList.contains('g-morph-ghost');
    const mo = new MutationObserver(recs => { if (recs.some(r => r.type !== 'childList' || [...r.addedNodes, ...r.removedNodes].some(n => !faded(n)))) fit(); });
    mo.observe(box, { childList: true, characterData: true, subtree: true });
    box._gFit = () => { mo.takeRecords(); fit(); };   /* Glass.morph: the new width is set before it reads where the rows end up */
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(fit);   /* fonts still on their way: measured again when they are in (the getter of ready alone costs ~10 ms) */
  }
  function initMore(list) {
    const n = num(list, 'data-g-more', 5);
    if (list.children.length <= n) return;
    if (!list.id) owns(list, 'id').id = 'g-list-' + (++uid);
    const wrap = part(el('div', 'g-more')), btn = el('button'); btn.type = 'button'; btn.setAttribute('aria-controls', list.id);
    wrap.appendChild(btn); list.parentNode.insertBefore(wrap, list.nextSibling);
    moreSet(list, false);
  }
  on('click', '.g-more > button', (e, b) => {
    const list = b.parentNode.previousElementSibling;
    if (!list || !list.hasAttribute('data-g-more')) return;
    const open = b.getAttribute('aria-expanded') !== 'true'; moreSet(list, open); fire(list, 'g:more', { expanded: open });
  });

  /* text clamped to N lines with an inline more / less pill; ONE ResizeObserver shows / hides the pill */
  const clampRO = window.ResizeObserver ? new ResizeObserver(es => { es.forEach(x => { clampCheck(x.target); }); }) : null;
  function clampCheck(c) {
    const text = c.querySelector('.g-clamp__text'), btn = c.querySelector('.g-clamp__btn'); if (!text || !btn || c.classList.contains('is-open')) return;
    btn.hidden = !(text.scrollHeight > text.clientHeight + 1);
  }
  function initClamp(c) {
    const text = c.querySelector('.g-clamp__text'), btn = c.querySelector('.g-clamp__btn'); if (!text || !btn) return;
    owns(c, 'style').style.setProperty('--lines', num(c, 'data-g-clamp', 3));
    if (!text.id) owns(text, 'id').id = 'g-clamp-' + (++uid);
    owns(btn, 'aria-controls', 'aria-expanded'); btn.setAttribute('aria-controls', text.id); aria(btn, 'expanded', false); btn.textContent = data(c, 'more-label', 'more');
    if (clampRO) clampRO.observe(c); clampCheck(c);
  }
  on('click', '.g-clamp__btn', (e, btn) => {
    const c = btn.closest('.g-clamp'); if (!c) return;
    const open = !c.classList.contains('is-open'), text = c.querySelector('.g-clamp__text');
    if (text && !matchMedia('(prefers-reduced-motion: reduce)').matches) {   /* animate the height between the clamped and the full text */
      const from = text.getBoundingClientRect().height; c.classList.toggle('is-open', open);
      const to = open ? text.scrollHeight : num(c, 'data-g-clamp', 3) * parseFloat(getComputedStyle(text).lineHeight);
      text.style.maxHeight = from + 'px'; text.offsetHeight; text.style.maxHeight = to + 'px';
      const done = () => { text.style.maxHeight = ''; text.removeEventListener('transitionend', done); if (!open) clampCheck(c); };
      text.addEventListener('transitionend', done); setTimeout(done, 600);
    } else { c.classList.toggle('is-open', open); if (!open) clampCheck(c); }
    aria(btn, 'expanded', open); btn.textContent = open ? data(c, 'less-label', 'less') : data(c, 'more-label', 'more');
    fire(c, 'g:more', { expanded: open });
  });

  /* sortable columns: <th aria-sort="none"><button>Name</button></th> */
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  function initSort(t) { $$('thead th > button', t).forEach(b => { const th = b.parentNode; if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none'); }); }
  on('click', 'thead th > button', (e, b) => {
    const th = b.parentNode, t = th.closest('table'), body = t && t.tBodies[0]; if (!body) return;
    const idx = th.cellIndex, dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    $$('thead th', t).forEach(x => { if (x.querySelector('button')) x.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', dir);
    function key(r) { const c = r.cells[idx]; return c.hasAttribute('data-sort') ? c.getAttribute('data-sort') : c.textContent.trim(); }
    [...body.rows].sort((a, b2) => (dir === 'ascending' ? 1 : -1) * collator.compare(key(a), key(b2))).forEach(r => { body.appendChild(r); });
    fire(t, 'g:sort', { column: idx, direction: dir });
  });

  /* selectable rows: <table data-g-selectable[="multiple"]>, optional selection status in the <tfoot> (<output> with the count, <button data-g-clear>) */
  function pickedRows(t) { return $$('tbody tr', t).filter(x => x.getAttribute('aria-selected') === 'true'); }
  function tableSync(t) {
    const n = t.tFoot && t.tFoot.querySelector('output'), c = t.tFoot && t.tFoot.querySelector('[data-g-clear]'), sel = pickedRows(t);
    if (n) n.textContent = sel.length; if (c) c.disabled = !sel.length;
    return sel;
  }
  function initTable(t) {   // idempotent (Glass.init runs it again for rows added later)
    $$('tbody tr', t).forEach(r => { owns(r, 'tabindex').tabIndex = 0; if (!r.hasAttribute('aria-selected')) aria(r, 'selected', false); });
    tableSync(t);
  }
  function tableToggle(r) {
    const t = r.closest('table'), on = r.getAttribute('aria-selected') !== 'true';
    if (t.getAttribute('data-g-selectable') !== 'multiple') $$('tbody tr', t).forEach(x => { aria(x, 'selected', false); });
    aria(r, 'selected', on); fire(t, 'g:select', { rows: tableSync(t) });
  }
  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    const r = t.closest('table[data-g-selectable] tbody tr');
    if (r && !t.closest('a,button,input,select')) { tableToggle(r); return; }
    const clr = t.closest('[data-g-clear]'), tb = clr && clr.closest('table[data-g-selectable]');
    if (tb) { $$('tbody tr', tb).forEach(x => { aria(x, 'selected', false); }); fire(tb, 'g:select', { rows: tableSync(tb) }); }
  });
  on('keydown', 'table[data-g-selectable] tbody tr', (e, r) => {
    if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tableToggle(r); }
  });

  /* ---------- Pager: <nav data-g-pager data-total data-size data-page>; the page lives in data-page ---------- */
  function pageWindow(page, pages) {   // the page numbers to show; 0 is a gap (…)
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1), a = [1];
    if (from > 2) a.push(0);
    for (let i = from; i <= to; i++) a.push(i);
    if (to < pages - 1) a.push(0);
    return a.concat(pages);
  }
  function pagerRender(g) {
    const total = +g.getAttribute('data-total') || 0, size = +g.getAttribute('data-size') || 10, page = +g.getAttribute('data-page') || 1, pages = Math.max(1, Math.ceil(total / size));
    const range = g.querySelector('.g-pager__range') || g.appendChild(el('span', 'g-pager__range')), box = g.querySelector('.g-pager__pages') || g.appendChild(el('span', 'g-pager__pages'));
    const btn = (label, html, p, extra = '') => '<button class="g-pager__btn" type="button" data-p="' + p + '" aria-label="' + label + '"' + extra + '>' + html + '</button>';
    range.textContent = (total ? (page - 1) * size + 1 : 0) + '–' + Math.min(total, page * size) + ' of ' + total;
    box.innerHTML = btn('Previous page', '', page - 1, ' data-icon="chevron-left"' + (page <= 1 ? ' disabled' : ''))
      + pageWindow(page, pages).map(n => n ? btn('Page ' + n, n, n, n === page ? ' aria-current="page"' : '') : '<span aria-hidden="true">…</span>').join('')
      + btn('Next page', '', page + 1, ' data-icon="chevron-right"' + (page >= pages ? ' disabled' : ''));
  }
  on('click', '.g-pager__btn', (e, b) => {
    const g = b.closest('[data-g-pager]'); if (!g || b.disabled) return;
    const page = +b.getAttribute('data-p'); g.setAttribute('data-page', page); pagerRender(g);
    const nb = g.querySelector('[aria-current="page"]'); if (nb) nb.focus();
    fire(g, 'g:page', { page, size: +g.getAttribute('data-size') || 10 });
  });

  function initRing(r) { r.style.setProperty('--value', r.getAttribute('aria-valuenow')); }/* fallback only: CSS reads aria-valuenow itself via attr() */

  /* ---------- Toast ---------- */
  function toastHost(pos) {
    const cls = 'g-toasts' + (pos === 'bottom' ? ' g-toasts--bottom' : '');
    let h = document.querySelector('.g-toasts' + (pos === 'bottom' ? '.g-toasts--bottom' : ':not(.g-toasts--bottom)'));
    if (!h) { h = el('div', cls); h.setAttribute('role', 'region'); h.setAttribute('aria-label', 'Notifications'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }
  function toast(o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    const v = o.variant || 'info', t = el('div', 'g-toast' + (v !== 'info' ? ' g-toast--' + v : ''));
    t.setAttribute('role', v === 'danger' ? 'alert' : 'status');
    t.innerHTML = '<div class="g-toast__icon" data-icon="' + (ICONS[v] || ICONS.info) + '"></div>' +
      '<div class="g-toast__main"><p class="g-toast__title"></p><p class="g-toast__text"></p></div>' +
      '<button class="g-toast__close" type="button" data-icon="x" aria-label="Dismiss"></button>';
    t.querySelector('.g-toast__title').textContent = o.title || '';
    const tx = t.querySelector('.g-toast__text'); if (o.text) tx.textContent = o.text; else tx.remove();
    const host = toastHost(o.position);
    let timer;
    function dismiss() { clearTimeout(timer); if (!t.parentNode) return; t.hidden = true; if (t.getAnimations().length) t.addEventListener('transitionend', () => { t.remove(); }, { once: true }); else t.remove(); }
    mem(t, 'dismiss', dismiss); mem(t, 'pause', hold => { clearTimeout(timer); if (!hold && o.duration !== 0) timer = setTimeout(dismiss, 1800); });
    host.appendChild(t);
    if (o.duration !== 0) timer = setTimeout(dismiss, o.duration || 4500);
    return { dismiss, el: t };
  }

  on('click', '.g-toast__close', (e, b) => { const d = mem(b.closest('.g-toast'), 'dismiss'); if (d) d(); });
  [['pointerover', true], ['pointerout', false]].forEach(x => {   // the pointer over a toast holds its timer
    on(x[0], '.g-toast', (e, t) => { const pause = mem(t, 'pause'); if (pause && !(e.relatedTarget && t.contains(e.relatedTarget))) pause(x[1]); });
  });

  /* ---------- Auto navigation ----------
   * <nav><a href="/">Brand</a><ul data-g-nav-auto data-sections=".sec[id]"></ul></nav>
   * Builds links from page sections (default selector [data-g-section]). A section's title comes from
   * data-title, then data-g-section, then its first heading. Highlights the section in view. Links that do
   * not fit move into a "More" menu; on a narrow screen everything moves there and the button shows
   * the current section. New or renamed sections are picked up automatically. */
  /* mouse hover opens a panel (no focus move); it closes shortly after the pointer leaves all the nodes */
  function hoverIntent(nodes, enter, leave) {
    let timer; const mouse = e => !e.pointerType || e.pointerType === 'mouse';
    nodes.forEach(n => {
      n.addEventListener('pointerenter', e => { if (mouse(e)) { clearTimeout(timer); enter(); } });
      n.addEventListener('pointerleave', e => { if (mouse(e)) { clearTimeout(timer); timer = setTimeout(leave, 180); } });
    });
  }
  function navAuto(ul) {
    if (mem(ul, 'nav')) return mem(ul, 'nav');
    const nav = ul.closest('nav'), sel = ul.getAttribute('data-sections') || '[data-g-section]';
    let items = [], sig = null, more, btn, label, menu, fp, shown = 0, activeId = '', byHover = false;
    const titleOf = s => (s.getAttribute('data-title') || s.getAttribute('data-g-section') || (s.querySelector('h1,h2,h3') || {}).textContent || s.id).trim();
    const isOpen = () => fp && fp.isOpen();
    const closeMenu = focus => { if (isOpen()) fp.close(focus); };
    const showMenu = () => { fp.open(); more.classList.add('is-open'); };

    function buildLinks(secs) {
      ul.innerHTML = '';
      items = secs.map(s => {
        const li = el('li'), a = el('a'); a.href = '#' + s.id; a.textContent = titleOf(s); li.appendChild(a); ul.appendChild(li);
        return { sec: s, li, a, id: s.id, title: a.textContent };
      });
    }
    function buildMore() {   // the "More" item: a button and its menu
      more = el('li', 'g-nav__more'); btn = el('button', 'g-nav__morebtn'); label = el('span', null, 'More'); menu = el('div'); byHover = false;
      attrs(btn, { type: 'button', 'aria-haspopup': 'true', 'data-icon-end': 'chevron-down' }); aria(btn, 'expanded', false); btn.appendChild(label);
      menu.setAttribute('role', 'menu'); more.appendChild(btn); ul.appendChild(more);
      fp = floatPanel(btn, menu, { anchor: nav, align: 'end', menu: true, items: true, onClose: () => { byHover = false; more.classList.remove('is-open'); } });
      mem(btn, 'toggle', () => {   /* a click on a hover-opened menu pins it open; the click itself is delegated (.g-nav__morebtn) */
        if (byHover) byHover = false; else if (isOpen()) closeMenu(true); else { showMenu(); menu.querySelector('a')?.focus(); }
      });
      hoverIntent([btn, menu], () => { if (!isOpen()) { showMenu(); byHover = true; } }, () => { if (byHover) closeMenu(false); });
    }
    function build() {   // (re)builds the links when the sections or their titles change
      const secs = $$(sel); secs.forEach((s, i) => { if (!s.id) s.id = 'g-sec-' + (i + 1); });
      const nsig = secs.map(s => s.id + '|' + titleOf(s)).join('~');
      if (nsig === sig) return; sig = nsig;
      buildLinks(secs); buildMore(); layout(); spy();
    }
    function fit() {   // how many links fit before "More"
      const gap = parseFloat(getComputedStyle(ul).columnGap) || 0, avail = ul.clientWidth, w = items.map(i => i.li.offsetWidth);
      if (w.reduce((a, b) => a + b, 0) + gap * (items.length - 1) <= avail) return items.length;
      more.hidden = false;
      let used = more.offsetWidth, n = 0;
      while (n < items.length && used + gap + w[n] <= avail) used += gap + w[n++];
      return n;
    }
    function layout() {
      if (!items.length) return;
      closeMenu(false); items.forEach(i => { i.li.hidden = false; }); more.hidden = true;
      shown = fit(); items.forEach((i, k) => { i.li.hidden = k >= shown; });
      menu.innerHTML = '';
      items.slice(shown).forEach(i => { const a = attrs(el('a'), { role: 'menuitem', tabindex: -1, href: '#' + i.id, 'data-id': i.id }); a.textContent = i.title; menu.appendChild(a); });
      paint();
    }
    function paint() {   // the current section: aria-current on its link, and on the "More" button when it sits inside the menu
      items.forEach(i => { if (i.id === activeId) i.a.setAttribute('aria-current', 'page'); else i.a.removeAttribute('aria-current'); });
      $$('a', menu).forEach(a => aria(a, 'current', a.getAttribute('data-id') === activeId));
      const idx = items.findIndex(i => i.id === activeId);
      aria(btn, 'current', idx >= shown && idx > -1);
      label.textContent = shown === 0 && idx > -1 ? items[idx].title : 'More';
    }
    function spy() {   // the section in view
      if (!items.length) return;
      const y = nav.getBoundingClientRect().bottom + 40; let cur = items[0];
      items.forEach(i => { if (i.sec.getBoundingClientRect().top <= y) cur = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = items[items.length - 1];
      if (cur.id !== activeId) { activeId = cur.id; paint(); }
    }
    let ticking = false;
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; spy(); }); } }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(nav); else window.addEventListener('resize', layout);
    document.fonts?.ready.then(layout);
    build();
    return mem(ul, 'nav', { refresh: build });
  }

  on('click', '.g-nav__morebtn', (e, b) => { const toggle = mem(b, 'toggle'); if (toggle) toggle(); });

  /* ---------- Popover panel: the native popover attribute (<button popovertarget="p"> + <aside popover id="p">) ----------
   * The browser does the toggling, the top layer, the outside click and Esc. We only report open / close as g:popoveropen / g:popoverclose. */
  document.addEventListener('toggle', e => {
    if (e.target.matches && e.target.matches('[popover]')) fire(e.target, e.newState === 'open' ? 'g:popoveropen' : 'g:popoverclose');
  }, true);

  /* ---------- File upload: initFile builds the list once; its state sits in mem(w, 'f'); the events are delegated below ---------- */
  const fileKey = f => f.name + '|' + f.size + '|' + f.lastModified;
  const fileSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  function setFiles(inp, files) {   // a FileList cannot be edited: build a new one; false when the browser refuses
    try { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); inp.files = dt.files; return true; } catch { return false; }
  }
  function fileItem(f, pc, bad) {   // one row of the list: name, size, progress bar, remove button
    const hasP = typeof pc === 'number', li = el('li', 'g-file__item' + (bad ? ' is-error' : '') + (hasP && !bad ? ' has-progress' : '') + (hasP && pc >= 100 ? ' is-done' : ''));
    const main = el('div', 'g-file__main'), row = el('div', 'g-file__row'), name = el('span', 'g-file__fname'), size = el('span', 'g-file__size');
    name.textContent = f.name;
    size.textContent = bad ? 'Too large · ' + fileSize(f.size) : hasP && pc < 100 ? Math.round(pc) + '% · ' + fileSize(f.size) : fileSize(f.size);
    row.append(name, size); main.appendChild(row);
    if (hasP && !bad) { const bar = el('progress', 'g-file__bar'); bar.max = 100; bar.value = Math.min(100, pc); main.appendChild(bar); }
    li.setAttribute('data-icon', 'file');
    li.append(main, attrs(el('button', 'g-file__remove'), { type: 'button', 'data-icon': 'x', 'aria-label': 'Remove ' + f.name }));
    return li;
  }
  function initFile(w) {
    const inp = w.querySelector('input[type="file"]'), list = w.querySelector('.g-file__list'), nameEl = w.querySelector('.g-file__name'); if (!inp) return;
    const empty = nameEl ? nameEl.textContent : '', max = parseFloat(w.getAttribute('data-max-size')) * 1048576 || 0;
    const prog = {}; let kept = [];   /* progress by file key, so it survives the list being rebuilt; kept = files chosen so far (multiple) */
    const files = () => [...(inp.files || [])];
    function render() {
      const fs = files(); let tooBig = false;
      if (nameEl) { nameEl.textContent = !fs.length ? empty : fs.length === 1 ? fs[0].name : fs.length + ' files'; nameEl.classList.toggle('has-file', !!fs.length); }
      if (!list) return;
      list.innerHTML = ''; list.hidden = !fs.length;
      fs.forEach(f => { const bad = max && f.size > max; if (bad) tooBig = true; list.appendChild(fileItem(f, prog[fileKey(f)], bad)); });
      inp.setCustomValidity(tooBig ? 'A file is larger than ' + (max / 1048576) + ' MB' : '');
    }
    mem(w, 'f', {
      render,
      reset() { kept = []; render(); },
      progress(f, pct) { if (typeof f === 'number') f = files()[f]; if (f) { prog[fileKey(f)] = pct; render(); } },
      remove(i) { if (!setFiles(inp, files().filter((x, k) => k !== i))) inp.value = ''; kept = files(); render(); fire(inp, 'change'); },
      change() {   /* multiple: every new pick or drop is added to the files already chosen (duplicates skipped) */
        if (inp.multiple) {
          const seen = new Set(), mx = num(w, 'data-max-files', 0);
          let merged = kept.concat(files()).filter(f => !seen.has(fileKey(f)) && seen.add(fileKey(f)));
          if (mx > 0) merged = merged.slice(0, mx);
          setFiles(inp, merged); kept = merged;
        }
        render();
      }
    });
    render();
  }
  (() => {   // delegated file events
    const fileOf = n => mem(n.closest('[data-g-file]'), 'f');
    on('change', 'input[type="file"]', (e, i) => fileOf(i)?.change());
    on('click', '.g-file__remove', (e, b) => { const li = b.closest('li'); fileOf(b)?.remove([...li.parentNode.children].indexOf(li)); });
    ['dragenter', 'dragover'].forEach(t => on(t, '.g-file__drop', (e, d) => d.classList.add('is-drag')));
    ['dragleave', 'drop'].forEach(t => on(t, '.g-file__drop', (e, d) => d.classList.remove('is-drag')));
  })();

  /* number field with − / + buttons (data-step on the buttons) */
  const limits = inp => ({ v: parseFloat(inp.value), mn: parseFloat(inp.min), mx: parseFloat(inp.max) });   // NaN when not set
  function numSync(w) {   // disables − / + at the ends of the range
    const inp = w.querySelector('input'); if (!inp) return;
    const { v, mn, mx } = limits(inp);
    $$('[data-step]', w).forEach(b => { const d = +b.getAttribute('data-step'); b.disabled = inp.disabled || (d < 0 && !isNaN(mn) && v <= mn) || (d > 0 && !isNaN(mx) && v >= mx); });
  }
  on('click', '[data-g-number] [data-step]', (e, b) => {
    const w = b.closest('[data-g-number]'), inp = w.querySelector('input'); if (!inp) return;
    if (inp.value === '') inp.value = '0';   /* an empty field counts as 0, so + gives 1 */
    try { (+b.getAttribute('data-step') > 0 ? inp.stepUp : inp.stepDown).call(inp); } catch {}
    const { v, mn, mx } = limits(inp);
    if (!isNaN(mn) && v < mn) inp.value = inp.min; else if (!isNaN(mx) && v > mx) inp.value = inp.max;
    commit(inp); numSync(w);
  });
  ['input', 'change'].forEach(t => { on(t, '[data-g-number]', (e, w) => { if (e.target.matches('input')) numSync(w); }); });

  /* date / time inputs open their picker on a click anywhere in the field */
  document.addEventListener('click', e => {
    const i = e.target; if (i.matches && i.matches('input[type="date"], input[type="time"], input[type="datetime-local"], input[type="month"]') && i.showPicker && !i.readOnly && !i.disabled) { try { i.showPicker(); } catch (x) {} }
  });

  /* colour field: swatch (native picker) + hex text input */
  function colorParts(n) { const w = n.closest && n.closest('[data-g-color]'); return w && { c: w.querySelector('input[type="color"]'), t: w.querySelector('input:not([type="color"])'), sw: w.querySelector('.g-color__swatch') }; }
  function colorNorm(v) { v = (v || '').trim(); if (v.charAt(0) !== '#') v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).replace(/./g, '$&$&'); return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null; }
  function initColor(w) { const p = colorParts(w); if (p && p.c && p.t) { p.t.value = p.c.value.toUpperCase(); owns(p.sw, 'style').style.setProperty('--c', p.c.value); } }
  document.addEventListener('input', e => {
    const p = colorParts(e.target); if (!p || !p.c || !p.t) return;
    if (e.target === p.c) { p.t.value = p.c.value.toUpperCase(); p.sw.style.setProperty('--c', p.c.value); p.t.removeAttribute('aria-invalid'); fire(p.t, 'input'); }
    else if (e.target === p.t) { const v = colorNorm(p.t.value); if (v) { p.c.value = v; p.sw.style.setProperty('--c', v); p.t.removeAttribute('aria-invalid'); } else p.t.setAttribute('aria-invalid', 'true'); }
  });
  document.addEventListener('focusout', e => {
    const p = colorParts(e.target); if (!p || !p.c || e.target !== p.t) return;
    const v = colorNorm(p.t.value); p.t.value = (v || p.c.value).toUpperCase(); p.t.removeAttribute('aria-invalid'); p.sw.style.setProperty('--c', p.c.value);
  });
  function initPassword(b) { owns(b, 'aria-pressed', 'aria-label'); aria(b, 'pressed', false); b.setAttribute('aria-label', b.getAttribute('aria-label') || 'Show password'); }
  on('click', '[data-g-password]', (e, b) => {
    const inp = b.parentNode.querySelector('input'); if (!inp) return;
    const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
    aria(b, 'pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); inp.focus();
  });
  /* clear cross: <button class="g-input-end" data-icon="x" data-g-clear-input> next to the input; visible only while the field has a value */
  const clearInput = b => b.parentNode.querySelector('input, textarea');
  function clearSync(b) { const i = clearInput(b); b.hidden = !i || !i.value; }
  function initClearInput(b) { if (!b.hasAttribute('type')) owns(b, 'type').type = 'button'; if (!b.hasAttribute('aria-label')) owns(b, 'aria-label').setAttribute('aria-label', 'Clear'); clearSync(b); }
  on('input', '.g-input-wrap > :is(input, textarea)', (e, i) => { const b = i.parentNode.querySelector('[data-g-clear-input]'); if (b) clearSync(b); });
  on('change', '.g-input-wrap > :is(input, textarea)', (e, i) => { const b = i.parentNode.querySelector('[data-g-clear-input]'); if (b) clearSync(b); });
  /* a script that sets input.value does not fire `input`: the cross follows the property itself, so a field filled by code shows its cross at once */
  (function () {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (!d || !d.set || d.set.__gClear) return;
    const set = function (v) { d.set.call(this, v); const w = this.parentNode; if (w && w.classList && w.classList.contains('g-input-wrap')) { const b = w.querySelector('[data-g-clear-input]'); if (b) clearSync(b); } };
    set.__gClear = true;
    Object.defineProperty(HTMLInputElement.prototype, 'value', { get: d.get, set, configurable: true, enumerable: d.enumerable });
  })();
  on('click', '[data-g-clear-input]', (e, b) => { const i = clearInput(b); if (!i) return; i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); clearSync(b); });
  /* every text field of a .g-field gets the clear cross by default (shown only while it has a value). Opt out: data-g-no-clear on the input or any ancestor.
     Readonly / disabled fields have it too, but CSS hides it while the field is not writable (a script may lift readonly later). Left alone: fields that already have an end control (password, stepper, colour, own cross), and inputs outside a .g-field. */
  function initAutoClear(i) {
    if (i.closest('[data-g-no-clear], [role="listbox"], [role="menu"]')) return;
    let w = i.parentNode; if (!w || !w.classList) return;
    if (w.classList.contains('g-input-wrap')) { if (w.querySelector('.g-input-end, [data-g-clear-input], [data-g-number], [data-g-color]') || w.matches('[data-g-number], [data-g-color]')) return; }
    else if (w.classList.contains('g-field')) { const n = wrapper(document.createElement('span')); n.className = 'g-input-wrap'; w.insertBefore(n, i); n.appendChild(i); w = n; }
    else return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'g-input-end'; b.setAttribute('data-icon', 'x'); b.setAttribute('data-g-clear-input', ''); b.setAttribute('aria-label', 'Clear');
    i.after(part(b)); initClearInput(b);
  }
  function initAnimRandom(w) { const max = +w.getAttribute('data-g-anim-random') || 800; [...w.children].forEach(c => { c.style.setProperty('--g-anim-delay', (Math.random() * max / 1000).toFixed(2) + 's'); }); }

  /* selector -> initialiser; each runs once per element (see mount) */
  const MOUNTS = [
    ['[data-g-fit]', initFit],
    ['dialog', initDialog],
    ['[data-g-file]', initFile], ['[data-g-number]', numSync],
    ['[data-g-color]', initColor], ['[data-g-password]', initPassword], ['[data-g-clear-input]', initClearInput],
    ['.g-root input:not([type]), .g-root input:is([type="text"], [type="search"], [type="email"], [type="url"], [type="tel"])', initAutoClear], ['select[data-g-select]', initSelect],
    ['[data-g-menu]', initMenu], ['[role="tablist"]', initTabs], ['input[type="range"]', initSlider],
    ['table[data-g-selectable]', initTable], ['table', initSort], ['[data-g-more]', initMore], ['[data-g-pager]', pagerRender],
    ['[data-g-anim-loop]', initAnimLoop], ['[data-g-anim-random]', initAnimRandom], ['[data-g-clamp]', initClamp], ['[data-g-ruler]', n => ruler(n)], ['[data-ruler]', rulerOf]
  ];
  if (!(window.CSS && CSS.supports && CSS.supports('width', 'attr(x type(<length>))'))) MOUNTS.push(['[role="progressbar"][aria-valuenow]', initRing]);
  /* The "?" marker (data-hint) by default on every element whose title becomes a tooltip, so the tooltip can be found. Left out where a marker
     would only get in the way: icon-only controls (their title is their name), navigation, tabs, menus, summaries, abbreviations, inline text,
     void / replaced elements (no ::before), and anything with data-no-hint. */
  function hintable(t) {
    if (t.hasAttribute('data-hint') || t.hasAttribute('data-no-hint') || !t.closest('.g-root')) return false;
    if (/^(ABBR|IFRAME|IMG|INPUT|TEXTAREA|SELECT|SVG|BR|HR)$/i.test(t.tagName) || t.closest('svg, nav, [role="tablist"], [role="menu"], [role="menuitem"], [role="tab"], summary')) return false;
    if (t.tagName === 'BUTTON' && [...t.textContent.trim()].length <= 3) return false;   /* a round / square button with one glyph (a mark, a symbol): the marker would not fit in it */
    return !!t.textContent.trim() || t.classList.contains('g-input-wrap');
  }
  function boxed(t) { const d = getComputedStyle(t).display; return d !== 'inline' && d !== 'contents' && d !== 'none'; }
  function markHint(t) { if (hintable(t) && boxed(t)) t.setAttribute('data-hint', ''); }
  /* all the display values are read first and the markers written after, so the page is styled once, not once per marker */
  function hints(root) { $$('[title], [data-g-tip]', root).filter(hintable).filter(boxed).forEach(t => { t.setAttribute('data-hint', ''); }); }
  function tail(root) {   // cosmetic / a11y extras, never needed for first paint
    hints(root);
    $$('svg:not([role]):not([aria-label]):not([aria-labelledby]):not([aria-hidden])', root).forEach(s => { if (!s.querySelector('title')) s.setAttribute('aria-hidden', 'true'); });
    $$('[data-g-nav-auto]', root).forEach(u => { if (mem(u, 'nav')) mem(u, 'nav').refresh(); else navAuto(u); });
  }
  function init(root) {   // synchronous: Glass.init(root) for markup added later
    MOUNTS.forEach(m => { mount(m[0], m[1], root); });
    $$('table[data-g-selectable]', root).forEach(initTable);   // rows added later
    tail(root);
  }
  /* Passive start: nothing runs while the page loads. After first paint the mounts run one by one in idle time;
     if the user touches a component before that, it (and its ancestors) is mounted right then. */
  const idle = window.requestIdleCallback || (f => { setTimeout(() => { f(); }, 1); });
  let allMounts = '';/* one selector for every mount: most events hit nothing and cost a single closest() */
  function mount1(n, m) { if (once(n, m[0])) m[1](n); }
  function lazy(e) {
    const t = e.target; if (!t.closest) return;
    if (!allMounts) allMounts = MOUNTS.map(m => m[0]).join(',');
    for (let n = t.closest(allMounts); n; n = n.parentElement && n.parentElement.closest(allMounts))
      MOUNTS.forEach(m => { if (n.matches(m[0])) mount1(n, m); });
  }
  /* .g-list rows that are added (or revealed with "Show more") after load slide in one after another; the rows already on the page do not move.
     The observer only marks them (data-g-new, --g-i = place in this batch); the animation itself is CSS.
     Put data-g-no-enter on a container to switch this off inside it and mark the rows yourself. */
  function newRows() {
    if (!window.MutationObserver || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const done = e => { e.target.removeAttribute('data-g-new'); };
    /* a tab that is not shown draws nothing: its new rows do not come in (they would when it is shown again), and the ones coming in are put in place */
    document.addEventListener('visibilitychange', () => { if (document.hidden) document.getAnimations().forEach(a => { if (a.animationName === 'g-slide-in') a.finish(); }); });
    new MutationObserver(recs => {
      if (document.hidden) return;
      const n = new Map();
      function mark(li) {
        if (li.closest('[data-g-no-enter], [data-g-morph]')) return;   /* a container that plays its own entrance (e.g. only the rows that really changed; a box glass-morph.js watches) */
        const l = li.parentNode, i = n.get(l) || 0; n.set(l, i + 1);
        li.style.setProperty('--g-i', i); li.setAttribute('data-g-new', ''); li.addEventListener('animationend', done, { once: true });
      }
      recs.forEach(r => {
        if (r.type === 'attributes') { if (r.oldValue !== null && !r.target.hidden && r.target.matches('.g-list > li')) mark(r.target); return; }
        [...r.addedNodes].forEach(x => {
          if (x.nodeType !== 1) return;
          if (x.matches('.g-list > li')) mark(x); else $$('.g-list > li', x).forEach(mark);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  }
  /* a [data-g-fit] that is added to the page later is set up at once (a result written by a script needs no Glass.init); one in a box that
     glass-morph.js watches is measured by that box's update, in the one layout of its reads */
  const morphed = n => { const m = global.Glass && global.Glass.morph; return !!(m && m.watching && m.watching(n)); };
  function fitLate() {
    if (!window.MutationObserver) return;
    const one = n => { if (!morphed(n)) mount1(n, ['[data-g-fit]', initFit]); };
    new MutationObserver(recs => recs.forEach(r => [...r.addedNodes].forEach(x => {
      if (x.nodeType !== 1) return;
      if (x.matches('[data-g-fit]')) one(x);
      if (x.firstElementChild) $$('[data-g-fit]', x).forEach(one);
    }))).observe(document.documentElement, { childList: true, subtree: true });
  }
  /* Table columns fit their box (every table of a .g-root; data-no-fit, data-wrap and data-scroll-body leave it alone). A table that fits shows its columns as the browser sizes them.
     One that is wider than its box is cut the fair way (one that fits keeps the proportions of its columns): a column that needs less than its equal share keeps all of its width (an address, a count, a flag),
     the room that is left is shared between the wide columns (a URL, a title) in proportion to the width they ask for, and what does not fit ends with an ellipsis.
     It is a <colgroup> with percentages and table-layout: fixed, so it follows the box; it is made again when the box is resized, rows come or go, the fonts load. */
  const FIT_T = '.g-root table:not([data-scroll-body], [data-no-fit], [data-wrap])';
  function tableFit(t) {
    if (!t.isConnected || !t.parentElement || !t.tBodies[0] || t.closest('[data-no-fit], [data-wrap]')) return;
    /* the cells of a row that the table lays out: not the ghosts of cells that go (glass-morph puts them in the row, out of the flow, while they fade) */
    const cells = r => [...r.cells].filter(c => !c.classList.contains('g-morph-ghost'));
    const row = [...t.tBodies[0].rows].find(r => cells(r).length > 1 && !cells(r).some(c => c.colSpan > 1)); if (!row) return;
    const old = t.querySelector(':scope > colgroup[data-g-fit]'); if (old) old.remove();
    t.style.tableLayout = '';
    const cs = getComputedStyle(t.parentElement), avail = t.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;
    t.setAttribute('data-g-fit-measure', '');   /* CSS: as wide as the content asks, no cell is cut (not glass-morph's data-g-measure: the same name on <main> invalidated every cell under it) */
    const w = cells(row).map(c => c.getBoundingClientRect().width);
    t.removeAttribute('data-g-fit-measure');
    const need = w.reduce((a, b) => a + b, 0), out = w.slice();   /* it fits: the columns keep their proportions and share the spare room (no equal split by a wide colspan header) */
    let free = avail, rest = need <= avail + 1 ? [] : w.map((_, i) => i);
    for (; rest.length;) {
      const share = free / rest.length, small = rest.filter(i => w[i] <= share);
      if (!small.length) break;
      small.forEach(i => { out[i] = w[i]; free -= w[i]; }); rest = rest.filter(i => !small.includes(i));
      if (!rest.length) break;
    }
    const sum = rest.reduce((a, i) => a + w[i], 0); if (sum) rest.forEach(i => { out[i] = Math.max(free * w[i] / sum, 40); });
    const cg = part(document.createElement('colgroup')); cg.setAttribute('data-g-fit', '');   /* the kit's part: a watched page does not bring it in */
    const tot = out.reduce((a, b) => a + b, 0);
    out.forEach(x => { const c = document.createElement('col'); c.style.width = (x / tot * 100).toFixed(3) + '%'; cg.appendChild(c); });
    t.insertBefore(cg, t.firstChild); t.style.tableLayout = 'fixed';
  }
  function fitTables() {
    const todo = new Set(); let raf = 0;
    const later = t => { todo.add(t); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const l = [...todo]; todo.clear(); l.forEach(tableFit); }); };
    const ro = window.ResizeObserver ? new ResizeObserver(es => es.forEach(e => { const t = e.target.querySelector(':scope > table'); if (t) later(t); })) : null;
    const seen = new WeakSet();
    const one = t => {
      if (!t.matches(FIT_T)) return;
      if (!seen.has(t)) {
        seen.add(t);
        if (ro) ro.observe(t.parentElement);
        if (window.MutationObserver) new MutationObserver(recs => { if (recs.some(r => ![...r.addedNodes, ...r.removedNodes].every(n => n.nodeName === 'COLGROUP'))) later(t); }).observe(t, { childList: true, subtree: true, characterData: true });
      }
      later(t);
    };
    $$('table').forEach(one);
    if (window.MutationObserver) new MutationObserver(recs => recs.forEach(r => [...r.addedNodes].forEach(x => {
      if (x.nodeType !== 1) return;
      if (x.nodeName === 'TABLE') one(x); else if (x.firstElementChild) $$('table', x).forEach(one);
    }))).observe(document.documentElement, { childList: true, subtree: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { $$('table').forEach(one); });
  }
  function start() {
    addressForms();   /* first: its snapshot of <main> is the markup as it came, before anything here builds its parts */
    fitLate(); newRows(); busyForms(); fitTables();
    hints(document);   // the "?" markers take room in their elements: add them before the first paint, so nothing shifts when they would appear later
    ['pointerover', 'pointerdown', 'keydown', 'focusin', 'click'].forEach(t => { document.addEventListener(t, lazy, true); });
    requestAnimationFrame(() => {
      let i = 0;
      (function step(dl) {
        while (i < MOUNTS.length) { mount(MOUNTS[i][0], MOUNTS[i][1]); i++; if (dl && dl.timeRemaining && dl.timeRemaining() < 3) break; }
        if (i < MOUNTS.length) idle(step, { timeout: 500 }); else idle(() => { tail(); }, { timeout: 1000 });
      })();
    });
  }
  /* Glass.setProgress(el, 0..100): a <progress> gets its value; any other element (a role=progressbar ring) gets the --value variable and the progressbar role */
  function setProgress(p, v) {
    v = Math.max(0, Math.min(100, +v));
    if (p.tagName === 'PROGRESS') { p.max = 100; p.value = v; return; }
    p.style.setProperty('--value', v);
    p.setAttribute('role', 'progressbar'); p.setAttribute('aria-valuemin', '0'); p.setAttribute('aria-valuemax', '100'); p.setAttribute('aria-valuenow', v);
  }
  function validate(field) { // sets aria-invalid on the control of a .g-field from its validity (true = red, false = green)
    const c = field.querySelector('input,textarea,select'); if (!c) return true;
    const bad = !c.validity.valid; c.setAttribute('aria-invalid', bad ? 'true' : 'false');   /* validity, not checkValidity(): that fires invalid, which the kit handles (below) */
    const m = field.querySelector('small[role="alert"]'); if (m && bad && c.validationMessage && !m.hasAttribute('data-custom')) m.textContent = c.validationMessage;
    return !bad;
  }

  /* Field checks, built in (a text <input>/<textarea> inside a .g-field):
       pattern="…" data-error="Message"   checked on every keystroke and when the field is left; wrong -> red control and the message in red under it
       required [data-error-required="…"]  an empty field is not an error until it is left (or the form is submitted); then "Fill in the field" (or the text) appears
                                          under it, and goes as soon as typing starts
     The message replaces the hint (a <small role="alert"> is added to the field when it has none). The browser's own bubble is not shown. */
  const CHK = '.g-root :is(input, textarea):is([pattern], [data-g-validate], [required]):not([type="checkbox"], [type="radio"], [type="file"], [type="hidden"])';
  function chkMsg(c) {
    const f = c.closest('.g-field'); if (!f) return null;
    let m = f.querySelector(':scope > small[role="alert"]');
    if (!m) { m = document.createElement('small'); m.setAttribute('role', 'alert'); f.appendChild(m); }
    return m;
  }
  function fieldCheck(c, strict) { // strict: an empty required field counts as an error (it was left, or the form was submitted)
    const m = chkMsg(c); if (!m) return;
    const bad = t => { c.setAttribute('aria-invalid', 'true'); m.setAttribute('data-custom', ''); m.textContent = t; };
    if (!c.value) { if (strict && c.required) bad(c.getAttribute('data-error-required') || 'Fill in the field'); else c.removeAttribute('aria-invalid'); return; }
    if (c.hasAttribute('pattern') || c.hasAttribute('data-g-validate')) {
      if (!c.validity.valid) bad(c.getAttribute('data-error') || c.title || c.validationMessage); else c.setAttribute('aria-invalid', 'false');   /* not checkValidity(): it fires invalid again, and the invalid handler below calls this - Safari ran out of stack (RangeError), Chrome cut it after ~40 */
    } else c.removeAttribute('aria-invalid');
  }
  document.addEventListener('focusout', e => { const c = e.target; if (c.matches && c.matches(CHK)) fieldCheck(c, true); });
  document.addEventListener('input', e => { const c = e.target; if (c.matches && c.matches(CHK)) fieldCheck(c, false); });
  let invalidTimer;
  document.addEventListener('invalid', e => { // form submit with a wrong field: our message instead of the browser bubble, focus on the first one
    const c = e.target; if (!c.matches || !c.matches(CHK)) return;
    e.preventDefault(); fieldCheck(c, true);
    clearTimeout(invalidTimer); invalidTimer = setTimeout(() => { const f = c.form && c.form.querySelector('[aria-invalid="true"]'); if (f) f.focus(); }, 0);
  }, true);

  function fileProgress(sel, file, pct) { const w = typeof sel === 'string' ? document.querySelector(sel) : sel; if (w && mem(w, 'f')) mem(w, 'f').progress(file, pct); }

  /* ---------- Ruler: a section index inside a scrolling box ----------
   <div style="overflow:auto"> … <h3 data-ruler="Food">…</h3> … </div>  -> the [data-ruler] elements alone switch it on for their nearest scrolling ancestor (data-g-ruler on a box asks for it explicitly): a hairline + name per [data-ruler] element, as tall as the section's share of the scroll height (re-read when the box or its content changes)
   Glass.ruler(box, [{ label, from, to, title? (the spoken name), weight? (the share of the ruler's height; by default the section's length, a root of it makes a few huge sections not crowd out the small ones) }, …])  -> the sections given by hand, from / to in px of the scrollable height (for virtual lists, where the sections are not in the DOM); Glass.ruler(box) returns the ruler
   A click on the name scrolls to the start of the section (reduced motion: is there at once), a click lower to the same share of it (data-ruler-offset="n": px kept above the target, default half a gap). Fires `g:ruler` on the box with { index, id }.
   Every mark is a link to its section: <a href="#id">, the id being the element's own (an element without one gets one made of the name; sections given by hand take { id } or one made of the label). A click puts it into the address (a new history entry), and an address with #id opens that section when the page loads and on back / forward. */
  function slug(t) { return String(t).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section'; }
  function freeId(base, taken) { let id = base, n = 2; while (taken(id)) id = base + '-' + n++; return id; }
  function ruler(box, list) {
    box.setAttribute('data-g-ruler', box.getAttribute('data-g-ruler') || '');
    let r = mem(box, 'ruler');
    if (!r) r = mem(box, 'ruler', makeRuler(box));
    if (list) r.set(list);
    return r;
  }
  function makeRuler(box) {
    const root = el('div', 'g-ruler'), track = el('div', 'g-ruler__track');
    // the box is an element that scrolls, or the page itself (nothing scrolls inside the page): then the ruler is fixed at the right edge of the window, under a fixed or sticky bar
    const page = box === document.scrollingElement || box === document.documentElement || box === document.body;
    const sTop = () => page ? scrollY : box.scrollTop, sHeight = () => page ? document.documentElement.scrollHeight : box.scrollHeight, cHeight = () => page ? innerHeight : box.clientHeight;
    let lead = 0;   // where the top of the view is, in px from the top of the ruler's track: the content lands there after a jump
    let list = [], manual = false, segs = [], h = 1, gap = 16, timer = 0, now = -1, shown = [], eff = [];
    attrs(root, { role: 'navigation', 'aria-label': box.getAttribute('aria-label') || 'Sections' });
    root.appendChild(track);
    if (page) { root.classList.add('g-ruler--page'); document.body.appendChild(root); } else box.insertBefore(root, box.firstChild);
    function anchors() {   // the sections written in the markup
      const top = page ? -scrollY : box.getBoundingClientRect().top - box.scrollTop, all = $$('[data-ruler]', page ? document : box);
      return all.map((a, i) => {
        const y = a.getBoundingClientRect().top - top, next = all[i + 1];
        return { label: a.getAttribute('data-ruler') || (a.hasAttribute('data-ruler-auto') ? '' : a.id) || a.textContent.trim() || a.id, id: a.id, el: a, from: y, to: next ? next.getBoundingClientRect().top - top : sHeight() };
      });
    }
    function build() {
      if (!manual) {
        const next = anchors();
        if (next.length === list.length && next.every((s, i) => s.label === list[i].label)) { list = next; place(); return; }   // same names: only the places moved, the marks stay (no redraw)
        list = next;
        list.forEach(s => { if (!s.id) { s.id = s.el.id = freeId(slug(s.label), n => document.getElementById(n)); s.el.setAttribute('data-ruler-auto', ''); } });   // an element without an id gets one: it is the section's link (#id)
      } else {
        const used = {}; list.forEach(s => { if (s.id) used[s.id] = 1; });
        list.forEach(s => { if (!s.id) s.id = freeId(slug(s.label), n => used[n]); used[s.id] = 1; });
      }
      track.textContent = ''; now = -1; segs = list.map((s, i) => { const n = el('a', 'g-ruler__seg'); n.href = '#' + encodeURIComponent(s.id); n.textContent = s.label; n.setAttribute('aria-label', s.title || s.label); n.setAttribute('data-i', i); track.appendChild(n); return n; });
      place();
    }
    const maxW = parseFloat(getComputedStyle(box).getPropertyValue('--g-ruler-w')) || 96;   // the width in the stylesheet is the widest the ruler gets
    function fitWidth() {   // as wide as the longest name, but not over the width of the stylesheet
      const w = textWidth(segs.filter(n => !n.hidden));
      const fit = w ? Math.min(maxW, Math.ceil(w) + 1) : maxW;
      if (parseFloat(box.style.getPropertyValue('--g-ruler-w')) !== fit) box.style.setProperty('--g-ruler-w', fit + 'px');
    }
    function place() {
      fitWidth();
      const cs = getComputedStyle(box), t = getComputedStyle(track);
      gap = parseFloat(t.marginRight) || 0;
      if (page) {
        const bar = [...document.body.children].find(n => /^(NAV|HEADER)$/.test(n.tagName) && /fixed|sticky/.test(getComputedStyle(n).position)), top = (bar ? bar.getBoundingClientRect().bottom : 0) + gap;
        h = Math.max(1, innerHeight - top - gap); lead = top;
        root.style.setProperty('--g-ruler-top', top + 'px');
        root.style.setProperty('--g-ruler-h', h + 'px');
      } else {
        h = Math.max(1, box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)); lead = gap / 2;   // a sticky item stops at the box's padding, so the track runs exactly along the content, from its top padding edge to the bottom one
        root.style.setProperty('--g-ruler-h', h + 'px');
        root.style.setProperty('--g-ruler-x', (box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(t.width) || 0) - gap) + 'px');
        if (/flex|grid/.test(cs.display)) { root.style.marginRight = '-' + (parseFloat(cs.columnGap) || 0) + 'px'; root.style.marginBottom = '-' + (parseFloat(cs.rowGap) || 0) + 'px'; }
      }
      const total = sHeight() || 1;
      // each mark is as tall as its section's share, but never under one text line plus a gap (22 px): the short ones take it and the long ones give up the same amount.
      // When even that does not fit (hundreds of sections), only the marks that are at least 22 px apart are drawn; a hidden section belongs to the mark before it
      const MIN = 22, weighed = list.some(s => s.weight != null), wsum = list.reduce((a, s) => a + (weighed ? s.weight || 0 : Math.max(0, s.to - s.from)), 0) || 1;
      const raw = list.map(s => (weighed ? s.weight || 0 : Math.max(0, s.to - s.from)) / (weighed ? wsum : total) * h);   // with weights the marks are as tall as the weights say, not as the sections are long
      const ys = []; let acc = weighed || !list.length ? 0 : list[0].from / total * h; raw.forEach(v => { ys.push(acc); acc += v; });
      let need = raw.reduce((a, v) => a + Math.max(0, MIN - v), 0), spare = raw.reduce((a, v) => a + Math.max(0, v - MIN), 0);
      shown = list.map(() => true);
      if (need > spare) { let last = -MIN; list.forEach((s, i) => { if (ys[i] - last >= MIN) last = ys[i]; else shown[i] = false; }); }
      eff = list.map(s => ({ from: s.from, to: s.to }));
      let p = -1; list.forEach((s, i) => { if (shown[i]) { p = i; } else if (p >= 0) eff[p].to = Math.max(eff[p].to, s.to); });
      const rawSum = (i, j) => { let v = 0; for (let n = i; n <= j; n++) v += raw[n]; return v; };
      let nextShown = list.length; const hs = list.map(() => 0);
      for (let i = list.length - 1; i >= 0; i--) { if (shown[i]) { hs[i] = rawSum(i, nextShown - 1); nextShown = i; } }
      need = hs.reduce((a, v, i) => a + (shown[i] ? Math.max(0, MIN - v) : 0), 0); spare = hs.reduce((a, v) => a + Math.max(0, v - MIN), 0);
      const k = spare > need ? 1 - need / spare : 0;
      let y = ys.length ? ys[0] : 0;
      list.forEach((s, i) => { segs[i].hidden = !shown[i]; if (!shown[i]) return; const v = hs[i] < MIN ? MIN : MIN + (hs[i] - MIN) * k; segs[i].style.top = y + 'px'; segs[i].style.height = v + 'px'; y += v; });
      mark();
    }
    function mark() {   // the section at the top of the view (the last one when the box is scrolled to its end) is the current one
      const at = sTop() + lead + 1, end = sTop() + cHeight() >= sHeight() - 1;
      let cur = -1;
      if (list.length) { cur = end && sTop() > 0 ? list.length - 1 : 0; if (!end || !sTop()) list.forEach((s, i) => { if (s.from <= at) cur = i; }); }
      while (cur > 0 && shown[cur] === false) cur--;   // a section without a mark of its own is lit through the mark before it
      if (cur !== now) { if (segs[now]) segs[now].removeAttribute('aria-current'); if (segs[cur]) segs[cur].setAttribute('aria-current', 'true'); now = cur; }
    }
    function later() { clearTimeout(timer); timer = setTimeout(manual ? place : build, 30); }
    function jump(i, y, own, smooth) {   // y: the click's distance from the top of the section's mark, in px; own: the section itself, not the group of hidden ones that its mark stands for; smooth: it scrolls there (a click, back / forward), else it is there at once (the page opens on it)
      const s = own ? list[i] : eff[i] || list[i], k = segs[i].getBoundingClientRect().height || 1, offset = num(box, 'data-ruler-offset', lead);
      const at = y <= 14 ? s.from : s.from + Math.min(.999, y / k) * (s.to - s.from);
      (page ? window : box).scrollTo({ top: Math.max(0, at - offset), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
      fire(box, 'g:ruler', { index: i, id: list[i].id });
    }
    function indexOfHash() { let h = location.hash.slice(1); try { h = decodeURIComponent(h); } catch (e) {} return h ? list.findIndex(s => s.id === h) : -1; }
    function go(i, y) {   // a click on a mark: jump and put the section's id into the address
      jump(i, y, false, true); const h = '#' + encodeURIComponent(list[i].id);
      if (location.hash !== h && history.pushState) history.pushState(null, '', h);
    }
    if (window.ResizeObserver) { const ro = new ResizeObserver(later); ro.observe(page ? document.body : box); [...(page ? document.body : box).children].forEach(c => { if (c !== root) ro.observe(c); }); }
    if (window.MutationObserver) new MutationObserver(recs => { if (!manual && recs.some(r => !root.contains(r.target))) later(); }).observe(page ? document.body : box, { childList: true, subtree: true, characterData: true });
    (page ? window : box).addEventListener('scroll', mark, { passive: true });
    addEventListener('resize', later); addEventListener('load', later);
    addEventListener('hashchange', () => { const i = indexOfHash(); if (i >= 0) jump(i, 0, true, true); });
    let opened = false;   // the address of the page names a section: it is shown once, when the sections are known
    function openByHash() {
      if (opened || !list.length) return; opened = true;
      const i = indexOfHash(); if (i < 0) return;
      let moved = false; const stop = () => { moved = true; };
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, stop, { once: true, passive: true, capture: true }));
      const again = () => { if (moved || indexOfHash() !== i) return; (manual ? place : build)(); jump(i, 0, true); };   // the page settles (fonts, images) and moves the section: aim again, unless the reader has taken over
      setTimeout(() => { jump(i, 0, true); setTimeout(again, 500); setTimeout(again, 1500); }, 0);
    }
    build(); openByHash();
    return { set(l) { manual = true; list = l; build(); openByHash(); }, refresh: later, jump, go };
  }
  function rulerOf(a) {   // a [data-ruler] element anywhere: the nearest scrolling ancestor gets the ruler
    for (let p = a.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (mem(p, 'ruler') || p.hasAttribute('data-g-ruler')) return ruler(p);
      const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return ruler(p);
    }
    return ruler(document.scrollingElement || document.documentElement);   // nothing in between scrolls: the page does
  }
  on('click', '.g-ruler__seg', (e, n) => { const q = n.closest('.g-ruler'), b = q.parentNode === document.body ? (document.scrollingElement || document.documentElement) : q.parentNode, r = mem(b, 'ruler'); if (r) { e.preventDefault(); r.go(+n.getAttribute('data-i'), e.clientY - n.getBoundingClientRect().top); } });

  /* Busy box: Glass.busy(box, true) the moment its new content is asked for (the click, the submit); Glass.busy(box, false), or Glass.morph into the box,
   * when all of it is there. Glass.busy(box, promise): until the promise settles (returns the promise).
   * The rest is the kit's: an answer that comes within --g-busy-box-delay changes nothing on the screen; a slower one gets a thin line that fades in and runs
   * along the top edge of the box (the old content stays as it is; an empty box also gets a few placeholder lines) and fades out when the box is done.
   * aria-busy="true" is on the box from the start, [data-g-busy] only while the line is on the screen.
   * A wait in steps is one line: a box that starts waiting where a line is, or was a moment ago (it is still fading out), goes on with that line - with no
   * new delay and no gap (the form's request, then the request its answer starts, then a map that loads its tiles). */
  /* A form waits on the box its answer goes to (data-g-busy-for="#sel") while that box shows something, else on its own card. data-g-no-busy: no line */
  function formBox(form) {
    let t = null;
    try { t = form.getAttribute('data-g-busy-for') && document.querySelector(form.getAttribute('data-g-busy-for')); } catch (_) { /* not a selector */ }
    if (t && (t.children.length || t.textContent.trim())) return t;
    return form.closest('article, aside, dialog, .g-panel') || form;
  }
  function busy(el, on) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el || !el.setAttribute) return on;
    if (on && typeof on.then === 'function') { const p = on, off = () => hold(el, p, false); hold(el, p, true); p.then(off, off); return p; }
    if (el.tagName === 'FORM') {   /* a form: the line goes on its box (formBox), and goes away from that same box */
      const b = el._gBusyBox;
      if (!on) { el._gBusyBox = null; if (b) busyEnd(b); return; }
      if (el.hasAttribute('data-g-no-busy') || (b && WAITS.has(b))) return;   /* already waiting (a box that Glass.morph has filled is not) */
      el = el._gBusyBox = formBox(el);
    }
    if (on) busyStart(el); else busyEnd(el);
  }
  const WAITS = new Map();   /* box -> its wait: { t0: when it was asked for, timer: until the line shows, bar: the line once it shows } */
  let ended = [];            /* the waits that ended a moment ago, while their line fades out: { t0, rect, bar, shown, at, fade } */
  const msVar = (el, name, def) => { const v = getComputedStyle(el).getPropertyValue(name).trim(), n = parseFloat(v); return isNaN(n) ? def : /ms$/.test(v) ? n : n * 1000; };   /* "300ms", or ".3s" from a minifier */
  const meets = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top <= b.bottom && b.top <= a.bottom;
  function busyStart(el) {
    if (WAITS.has(el)) return;
    WAITS.forEach((w, b) => { if (!b.isConnected) busyEnd(b); });   /* a box that left the page waiting (its content replaced with it) waits no more */
    const now = performance.now(), r = el.getBoundingClientRect();
    ended = ended.filter(e => now - e.at < e.fade);
    /* the same wait going on in the same place: a box that waits, or did a moment ago, where this one is (a box around it, in it, the old content it replaces) */
    let prev = null;
    WAITS.forEach((w, b) => { if (!prev && meets(b.getBoundingClientRect(), r)) prev = { t0: w.t0, shown: !!w.bar, bar: null }; });
    for (let i = ended.length; !prev && i--;) if (meets(ended[i].rect, r)) prev = ended[i];
    const w = { t0: prev ? prev.t0 : now, timer: 0, bar: null };
    WAITS.set(el, w);
    el.setAttribute('aria-busy', 'true');
    if (prev && prev.shown) {   /* its line is on the screen: this box goes on with it, from where its fade-out has got to */
      let from = 1;
      if (prev.bar && prev.bar.isConnected && prev.bar.parentNode !== el) { from = +getComputedStyle(prev.bar).opacity; prev.bar.remove(); }
      prev.bar = null;
      return busyShow(el, w, from);
    }
    const left = w.t0 + msVar(el, '--g-busy-box-delay', 300) - now;
    if (left <= 0) busyShow(el, w); else w.timer = setTimeout(() => busyShow(el, w), left);
  }
  function busyShow(el, w, from) {
    w.timer = 0;
    const empty = !el.children.length && !el.textContent.trim();
    el.removeAttribute('data-g-busy-out');
    el.setAttribute('data-g-busy', empty ? 'empty' : '');
    let bar = el.querySelector(':scope > .g-busy-bar');
    if (bar) { bar._gOut = null; bar.classList.remove('g-busy-out'); }   /* it was fading out of this box: it comes back from where it got to */
    else {
      bar = document.createElement('i'); bar.className = 'g-busy-bar'; bar.setAttribute('aria-hidden', 'true');
      bar.setAttribute('data-g-part', '');   /* a morph into the box leaves it to fade out */
      /* every line keeps one beat (a running time of the page): one that takes over from another goes on from where that one was */
      bar.style.setProperty('--g-busy-at', -(performance.now() % msVar(el, '--g-busy-run', 1600)) + 'ms');
      if (from != null) bar.style.opacity = from;   /* instead of fading in from nothing (@starting-style) */
      el.prepend(bar);
      if (from != null) { getComputedStyle(bar).opacity; bar.style.opacity = ''; }
    }
    w.bar = bar;
    if (empty) { const ph = document.createElement('div'); ph.className = 'g-busy-lines'; ph.setAttribute('aria-hidden', 'true'); ph.setAttribute('data-g-part', ''); ph.innerHTML = '<i></i><i></i><i></i>'; el.append(ph); }
  }
  function busyEnd(el) {
    const w = WAITS.get(el);
    if (!w) return;
    WAITS.delete(el);
    clearTimeout(w.timer);
    el.removeAttribute('data-g-busy'); el.removeAttribute('aria-busy');
    [...el.children].forEach(x => { if (/(^|\s)g-busy-lines(\s|$)/.test(x.className)) x.remove(); });   /* the content takes their place */
    const bar = w.bar && w.bar.parentNode === el ? w.bar : null, now = performance.now(), fade = msVar(el, '--g-busy-fade', 400);
    ended = ended.filter(e => now - e.at < e.fade);
    ended.push({ t0: w.t0, rect: el.getBoundingClientRect(), bar, shown: !!w.bar, at: now, fade });
    if (!bar) return;
    el.setAttribute('data-g-busy-out', '');   /* keeps the box the line is placed by while it fades out */
    bar.classList.add('g-busy-out');
    const out = bar._gOut = {};
    setTimeout(() => { if (bar._gOut !== out) return; bar.remove(); if (!WAITS.has(el)) el.removeAttribute('data-g-busy-out'); }, fade);
  }
  /* The line of a form is on while anything of it is on its way: the requests of each of its submits (busyForms), the kit's own load of its answer
     (Address: 'load', 'post'). It goes off when the last of them is in, not when one of them is: a submit sent again while the first one is on its way
     (typing in a live form; a page that aborts its older request and sends a newer one) left the newer answer with no line. */
  const holds = new WeakMap();   /* form (or box: Glass.busy(box, promise)) -> what holds its line */
  function hold(form, key, on) {
    let s = holds.get(form);
    if (!s) holds.set(form, s = new Set());
    if (on) { s.add(key); busy(form, true); }
    else if (s.delete(key) && !s.size) busy(form, false);
  }
  /* Every form waits for the server with the busy line, nothing to set up: from its submit until the requests that submit started (fetch, XMLHttpRequest)
     are answered; a form the browser sends itself, until the next page. A quick answer shows nothing (the line comes after --g-busy-box-delay).
     A form sent by a script with no submit event (form.submit(), a request of its own): Glass.busy(form, true / false) */
  function busyForms() {
    let watch = null;   /* the form whose submit is running now: what is requested meanwhile is its answer */
    const done = w => hold(w.form, w, false);
    const end = w => { if (--w.n <= 0 && !w.open) done(w); };
    const take = () => { const w = watch; if (w) w.n++; return w; };
    if (window.XMLHttpRequest) {
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function () { const w = take(); if (w) this.addEventListener('loadend', () => setTimeout(() => end(w)), { once: true }); return send.apply(this, arguments); };
    }
    if (window.fetch) {
      const f = window.fetch;
      window.fetch = function () { const w = take(), p = f.apply(this, arguments); if (w) p.then(() => {}, () => {}).then(() => setTimeout(() => end(w))); return p; };
    }
    document.addEventListener('submit', e => {   /* capture: before the page's own handlers, which start the requests */
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute('data-g-no-busy')) return;
      const w = watch = { form, n: 0, open: true };
      hold(form, w, true);
      setTimeout(() => {   /* the submit and its handlers are over */
        if (watch === w) watch = null;
        w.open = false;
        if (w.n) return;
        const blank = ((e.submitter && e.submitter.getAttribute('formtarget')) || form.target) === '_blank';
        if (e.defaultPrevented || blank) done(w);   /* handled by the page with no request (or one the line cannot see), or opened elsewhere: nothing to wait for */
        else setTimeout(() => done(w), 30000);   /* the browser sends it: the next page ends it; an answer that is a download leaves this page as it is */
      });
    }, true);
    addEventListener('pageshow', e => { if (e.persisted) $$('form').forEach(f => { holds.delete(f); busy(f, false); }); });   /* back to a page kept in memory: it waits for nothing */
  }

  /* ---------- Address: a GET form and the address of the page are one state ----------
   * A <form method="get"> whose action names this page keeps its fields in the address and gets its answer without leaving the page. Nothing to set up. The form
   * of <main>, or else one elsewhere (the search box in the header):
   *   action="/find-words/{word}"  the field `word` is a path segment (/find-words/апельсин); every other field goes into the query, in the order of the form.
   *                                A field at its default is left out: an empty text, an unchecked box, the first option of a select, the first radio of a group.
   *                                data-default="v" on a field (a select, a text, a hidden one) names its default when the server's is another: at v it is left out,
   *                                and an address that does not name it puts v back.
   *   typing                       a form with no submit button answers as it is filled in: the address follows every keystroke (the first one of an edit adds
   *                                a history entry, the next ones replace it), a choice (select, box, a step of a number) is an entry of its own. A form with a
   *                                submit button (a slow or not idempotent action: ping, a random pick) waits for it: each submit is an entry and is asked
   *                                anew. The clear cross of a field is one more button: the answer with that field empty comes at once. Back / forward
   *                                and an address opened by a link put the fields back.
   *   answer                       GET of the same address with the header X-G-Fetch: 1 (the server may answer with just <title> and <main>): after a pause in
   *                                typing, at once for a choice or a submit. What differs from the last answer is morphed in (Glass.morph): the smallest elements with an id
   *                                that hold the change, so the rest of <main> and what other scripts put there stay as they are. <title>, canonical and
   *                                description follow; the scripts that came in run. A change outside every element with an id, an error or an answer that is not
   *                                HTML: the page is loaded the usual way. Back to an address seen before: no request.
   *                                When the user changed the form (typed, chose, cleared, sent) the request also says X-G-Form: <its id>: the form on the
   *                                page is what the answer would draw, so the server may send it back empty as <form id="..." data-g-same>, with only its
   *                                <output> elements (results, put in by id) and hidden fields (put in by name). Not after a link or back / forward.
   *                                A page that works the answer out itself (a filter over what it already holds) cancels g:answer { url } on the form, which comes
   *                                before each answer, at once on every keystroke: nothing is asked, the page shows it (from the fields), the address is kept here.
   *   links                        a click on a link to an address of this form is followed in place. A value a script puts into a field (a tile that puts its
   *                                name into the box) and announces with `change` is a choice, an entry of its own.
   *   POST                         a <form method="post"> whose action names this page is sent in the background as well (with X-G-Fetch: 1), and its answer is
   *                                morphed in the same way; a change outside every element with an id morphs <main> as a whole. What is typed, the focus and
   *                                the scroll stay; the address stays. An error or an answer that is not HTML (a file): the browser sends the form itself.
   * Left alone: a form with no action, data-g-url="off" on it, and a form whose submit a script of the page cancels (from that submit on).
   * After an answer is on the page, document gets g:navigate { url, title } (analytics). */
  function addressForms() {
    const DELAY = 350;   /* ms of quiet in typing before the request */
    const TEXT = /^(text|search|email|tel|url|number|password)$/;
    const cache = new Map();   /* address -> Promise of { url, html } */
    const theirs = new WeakSet();   /* forms whose submit a script of the page cancelled: that script runs them */
    let form = null, tpl = null, live = true, snap = null, ctl = null, timer = 0, editing = false, applying = false, shown = '', pending = '', restored = '';
    const here = () => location.pathname + location.search;
    const enc = v => encodeURIComponent(v);
    const dec = v => { try { return decodeURIComponent(v); } catch (_) { return v; } };
    const isText = e => e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && TEXT.test(e.type));
    const fieldsOf = f => [...f.elements].filter(e => e.name && !e.disabled && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/^(submit|button|reset|image|file)$/.test(e.type));
    const radios = e => fieldsOf(form).filter(r => r.type === 'radio' && r.name === e.name);
    /* action="/section/{a}/{b}" -> { base: '/section', vars: ['a', 'b'] } (the base as the address carries it, percent-encoded); null: another site, or a {name} that is not a whole trailing segment */
    function template(f) {
      const vars = [], a = (f.getAttribute('action') || '').trim().replace(/\{([^{}/]+)\}/g, (_, n) => '__g' + (vars.push(n) - 1) + '__');
      if (!a) return null;   /* no action: the form does not say what address it stands for (such a form is usually run by a script of the page) */
      let u; try { u = new URL(a, location.href); } catch (_) { return null; }
      if (u.origin !== location.origin) return null;
      const segs = u.pathname.split('/'), isVar = s => /^__g\d+__$/.test(s), at = segs.findIndex(isVar);
      if (segs.some((s, i) => at < 0 || i < at ? s.indexOf('__g') !== -1 : !isVar(s))) return null;
      return { base: (at < 0 ? segs : segs.slice(0, at)).join('/').replace(/\/$/, ''), vars: at < 0 ? [] : segs.slice(at).map(s => vars[+s.slice(3, -2)]) };
    }
    /* the template of f when it is a form of this page sent with `method` ('get' | 'post'): its action names this page (a POST form: in <main>), not opted out, not run by a script of the page */
    function pageForm(f, method) {
      if (theirs.has(f) || (f.getAttribute('method') || 'get').toLowerCase() !== method || f.getAttribute('data-g-url') === 'off' || (f.target && f.target !== '_self') || (method === 'post' && !f.closest('main'))) return null;
      const t = template(f), p = location.pathname;
      return t && (!t.base || p === t.base || p.startsWith(t.base + '/')) ? t : null;
    }
    function bind() {
      form = tpl = null;
      for (const f of [...$$('main form'), ...$$('form')]) {   /* the form of <main> first */
        const t = pageForm(f, 'get');
        if (t) {
          form = f; tpl = t;
          live = ![...f.elements].some(e => e.type === 'submit' || e.type === 'image');   /* a <button> with no type is a submit button */
          return true;
        }
      }
      return false;
    }
    const ready = () => (form && form.isConnected) || bind();
    function atDefault(e) {
      const d = e.getAttribute('data-default');   /* the server's default, when it is not the kit's (a select whose default is not its first option) */
      if (d !== null && e.type !== 'checkbox' && e.type !== 'radio' && !e.multiple) return e.value === d;
      if (e.type === 'checkbox') return !e.checked;
      if (e.type === 'radio') return !e.checked || radios(e)[0] === e;
      if (e.tagName === 'SELECT') return e.selectedIndex <= 0;
      return e.value === '';
    }
    /* the address of what the form holds now */
    function address() {
      const path = [], q = [];
      for (const e of fieldsOf(form)) {
        if (e.tagName === 'SELECT' && e.multiple) { [...e.selectedOptions].forEach(o => q.push([e.name, o.value])); continue; }
        if (atDefault(e)) continue;
        const i = tpl.vars.indexOf(e.name);
        if (i !== -1 && path[i] === undefined && e.value.indexOf('/') === -1) path[i] = e.value;   /* a slash cannot stand in a segment: that value goes into the query */
        else q.push([e.name, e.value]);
      }
      let url = tpl.base, i = 0;
      for (; i < tpl.vars.length && path[i] !== undefined; i++) url += '/' + enc(path[i]);
      for (; i < tpl.vars.length; i++) if (path[i] !== undefined) q.push([tpl.vars[i], path[i]]);   /* a segment after a missing one: into the query */
      return (url || '/') + (q.length ? '?' + q.map(([k, v]) => enc(k) + '=' + enc(v)).join('&') : '');
    }
    /* an address of this form -> Map name -> [values]; null: not an address of this form */
    function read(href) {
      const u = new URL(href, location.href), p = u.pathname.replace(/\/$/, '');
      if (u.origin !== location.origin || (tpl.base && p !== tpl.base && !p.startsWith(tpl.base + '/'))) return null;
      const segs = p.slice(tpl.base.length).split('/').filter(Boolean), m = new Map();
      if (segs.length > tpl.vars.length) return null;
      const add = (k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      segs.forEach((s, i) => add(tpl.vars[i], dec(s)));
      u.searchParams.forEach((v, k) => add(k, v));
      return m;
    }
    /* the fields take the values; a field the values do not name goes back to its default */
    function fill(values) {
      applying = true;
      const seen = new Map(), changed = new Set();
      for (const e of fieldsOf(form)) {
        const vs = values.get(e.name) || [];
        if (e.type === 'checkbox' || e.type === 'radio') {
          const on = vs.length ? vs.includes(e.value) : e.type === 'radio' && radios(e)[0] === e;
          if (e.checked !== on) { e.checked = on; changed.add(e); }
        } else if (e.tagName === 'SELECT') {
          const opts = [...e.options];
          if (e.multiple) opts.forEach(o => { const on = vs.includes(o.value); if (o.selected !== on) { o.selected = on; changed.add(e); } });
          else { const want = vs.length ? vs[0] : e.getAttribute('data-default'), i = Math.max(0, opts.findIndex(o => o.value === want)); if (e.selectedIndex !== i) { e.selectedIndex = i; changed.add(e); } }
        } else {
          const n = seen.get(e.name) || 0, v = vs[n] !== undefined ? vs[n] : (e.getAttribute('data-default') || '');
          seen.set(e.name, n + 1);
          if (e.value !== v) { e.value = v; changed.add(e); }
        }
      }
      changed.forEach(commit);   /* the kit's select, stepper and cross, and the page, see the new values */
      applying = false;
    }
    /* the fields, kept in the history entry: back to an address this form cannot read (an old format, a default the server picked) still restores them */
    const remember = () => Object.assign({}, history.state && typeof history.state === 'object' ? history.state : null, { gForm: [...new FormData(form)].filter(p => typeof p[1] === 'string') });
    const toMap = pairs => pairs.reduce((m, [k, v]) => (m.has(k) ? m.get(k).push(v) : m.set(k, [v]), m), new Map());
    function write(push) {
      const url = address();
      history[push && url !== here() ? 'pushState' : 'replaceState'](remember(), '', url);
      return url;
    }
    /* mine: the user changed this form (typed, chose, cleared, sent): it stands as the answer would draw it, so the request names it (X-G-Form: its id)
       and the server may send it back as <form id="..." data-g-same></form>, "as you have it". Not after a link or back / forward: the kit only
       puts the values in then, the server draws the rest of the form (the tab that is chosen) */
    function fetchPage(url, signal, mine) {
      const key = (mine && form.id ? 'mine|' : '') + url;
      if (cache.has(key)) return cache.get(key);
      const headers = { 'X-G-Fetch': '1' };
      if (mine && form.id) headers['X-G-Form'] = form.id;
      const p = fetch(url, { headers, signal, credentials: 'same-origin' }).then(res => {
        const u = new URL(res.url);
        if (res.status >= 500 || u.origin !== location.origin || !/html/i.test(res.headers.get('content-type') || '')) return null;
        return res.text().then(html => ({ url: u.pathname + u.search, html }));
      });
      cache.set(key, p);
      /* an answer with the whole form is as good for back / forward (the plain address); one with the form left out is not (the form is drawn by it then) */
      p.then(r => { if (!r) cache.delete(key); else if (key !== url && !/\bdata-g-same\b/.test(r.html)) cache.set(url, p); }, () => cache.delete(key));
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return p;
    }
    /* outermost descendants with an id */
    function regions(root) {
      const out = [];
      (function walk(n) { for (const c of n.children) { if (c.id) out.push(c); else walk(c); } })(root);
      return out;
    }
    /* an element as markup to compare two answers by: the values of the fields are the user's, not the answer's; cut: the regions inside are empty */
    function flat(el, cut) {
      const c = el.cloneNode(true);
      if (cut) regions(c).forEach(r => { const p = document.createElement(r.tagName); p.id = r.id; r.replaceWith(p); });
      $$('input', c).forEach(i => { i.removeAttribute('value'); i.removeAttribute('checked'); });
      $$('option', c).forEach(o => o.removeAttribute('selected'));
      $$('textarea', c).forEach(t => { t.textContent = ''; });
      $$('script', c).forEach(s => s.removeAttribute('type'));
      return c.outerHTML;
    }
    /* a and b: one element in the last answer and in the new one. true when they differ only inside elements with an id; the new ones of those go to out */
    function differ(a, b, out) {
      if (flat(a) === flat(b)) return true;
      if (flat(a, true) !== flat(b, true)) return false;
      const x = regions(a), y = regions(b);
      x.forEach((e, i) => { if (!differ(e, y[i], out)) out.push(y[i]); });
      return true;
    }
    function runScripts(list) {   /* a script that came with markup does not run: a new one with the same source and attributes does, in order */
      return list.reduce((p, s) => p.then(() => {
        const n = document.createElement('script');
        [...s.attributes].forEach(a => n.setAttribute(a.name, a.value));
        if (!s.src) { n.textContent = s.textContent; document.head.appendChild(n); n.remove(); return; }
        n.async = false;
        return new Promise(done => { n.onload = n.onerror = done; document.head.appendChild(n); });
      }), Promise.resolve());
    }
    /* the answer onto the page; false when it cannot be placed. sent: the POST form whose answer it is - it cannot be asked again the usual way, so a change
       outside every element with an id morphs <main> as a whole, and that form stays as it is (what is typed in it, the kit's parts of its fields) */
    function apply(html, sent) {
      const doc = new DOMParser().parseFromString(html, 'text/html'), main = document.querySelector('main');
      const next = main && ((main.id && doc.getElementById(main.id)) || doc.querySelector('main'));
      if (!snap || !next || next.tagName !== 'MAIN') return false;
      const morph = global.Glass && global.Glass.morph;
      if (!morph) return false;   /* no glass-morph.js: the answer cannot be patched in (what is typed, the focus): the page the usual way */
      /* what the server sends back as "as you have it" (data-g-same with an id: the form that asked) is the last answer's again, so it is no change
         and the page's own stays as it is; its markup as the server would draw it now is not known: the next answer that sends it in full redraws it */
      /* it may still carry what is the server's in it: its results (<output>, by id) and its hidden fields (by name), they are put in */
      const parts = [];
      const same = $$('[data-g-same][id]', next).map(e => {
        parts.push(...$$('output[id], input[type="hidden"][name]', e).map(x => [e.id, x]));
        const was = snap.querySelector('#' + CSS.escape(e.id)) || document.getElementById(e.id);
        if (was) e.replaceWith(was.cloneNode(true));
        return e.id;
      });
      /* the hidden fields of this form are the server's in a whole answer too (a morph leaves what a field holds to the user): a link to the bare
         address empties them (a field the address does not name is at its default), the server's defaults come back with the answer */
      const whole = form && form.id && !same.includes(form.id) && next.querySelector('form#' + CSS.escape(form.id));
      if (whole) parts.push(...$$('input[type="hidden"][name]', whole).map(x => [form.id, x]));
      let out = [];
      if (!differ(snap, next, out)) { if (!sent) return false; out = [next]; }   /* a change in <main> outside every element with an id */
      const live = out.map(n => [n === next ? main : document.getElementById(n.id), n]);
      if (live.some(([l]) => !l || !main.contains(l))) return false;
      if (same.length) live.splice(0, live.length, ...live.filter(([l]) => !same.includes(l.id)));   /* the form itself, if it is one of the regions, is not patched at all */
      snap = next.cloneNode(true);
      same.forEach(id => { const e = snap.querySelector('#' + CSS.escape(id)); if (e) { const u = document.createElement(e.tagName); u.id = id; u.setAttribute('data-g-same', ''); e.replaceWith(u); } });   /* not known: an empty one, the next full answer differs from it */
      const t = doc.querySelector('title');
      if (t) document.title = t.textContent;
      [['link[rel=canonical]', 'href'], ['meta[name=description]', 'content']].forEach(([s, a]) => { const o = document.head.querySelector(s), n = doc.querySelector(s); if (o && n) o.setAttribute(a, n.getAttribute(a)); });
      live.forEach(([l, n]) => {
        const run = $$('script', n).filter(s => (!s.type || /javascript|module/i.test(s.type)) && !s.closest('[data-g-part]'));   /* a script's part is not put in (glass-morph): nor is its script run */
        morph(l, n, sent || same.length ? { keep: e => e === sent || (!!e.id && same.includes(e.id)) } : undefined).then(() => { init(l); return runScripts(run); });   /* a form sent back as it is stays as it is, inside a region that changes too */
      });
      let wrote = false;
      parts.forEach(([id, x]) => {
        const f = document.getElementById(id);
        if (!f) return;
        if (x.tagName === 'OUTPUT') { const o = f.querySelector('#' + CSS.escape(x.id)); if (o && o.innerHTML !== x.innerHTML) morph(o, x.innerHTML); return; }
        const h = [...f.querySelectorAll('input[type="hidden"]')].find(i => i.name === x.name);
        if (h && h.value !== x.value) { h.value = x.value; wrote = wrote || f === form; }
      });
      return wrote ? 'fields' : true;   /* 'fields': the server wrote hidden fields of this form */
    }
    const go = () => location.replace(here());   /* what cannot be done in place: the page the usual way */
    /* true when the page shows the answer to url itself: it cancelled g:answer */
    function own(url) {
      if (form.dispatchEvent(new CustomEvent('g:answer', { bubbles: true, cancelable: true, detail: { url: new URL(url, location.href).href } }))) return false;
      clearTimeout(timer);
      if (ctl) { ctl.abort(); ctl = null; pending = ''; }
      shown = url;
      hold(form, 'load', false);
      fire(document, 'g:navigate', { url: location.href, title: document.title });
      return true;
    }
    /* fresh: asked anew even when this address is on the screen or seen before (the submit button of a form: a random pick, a ping); told: g:answer has been sent */
    function load(url, fresh, told, mine) {
      clearTimeout(timer);
      if (url === pending) return;
      if (ctl) { ctl.abort(); ctl = null; pending = ''; }
      if (url === shown && !fresh) { hold(form, 'load', false); return; }
      if (!told && own(url)) return;
      if (fresh) { cache.delete(url); cache.delete('mine|' + url); }
      const c = ctl = new AbortController();
      pending = url;
      hold(form, 'load', true);
      fetchPage(url, c.signal, mine).then(r => {
        if (ctl !== c) return;   /* a newer one is on its way */
        ctl = null; pending = '';
        const put = r && apply(r.html);
        if (!put) return go();
        shown = url;
        if (r.url !== url && here() === url) { history.replaceState(history.state, '', r.url); shown = r.url; }   /* the server put the address right (a redirect) */
        if (put === 'fields' && here() === shown) history.replaceState(remember(), '');   /* what the server wrote into hidden fields: back to this address puts it back too */
        hold(form, 'load', false);
        fire(document, 'g:navigate', { url: new URL(shown, location.href).href, title: document.title });
      }, () => { if (ctl === c) { ctl = null; pending = ''; go(); } });
    }
    const schedule = url => { clearTimeout(timer); if (url === shown || !own(url)) timer = setTimeout(() => load(url, false, true, true), DELAY); };   /* the page's own answer: at once */
    /* A POST form of this page is sent in the background too: what is typed, the focus and the scroll stay. The address stays (an answer that redirects
       to this page puts the new address into the history; one that redirects elsewhere is loaded there); a newer submit of the form cancels the older
       one. An error, an answer that is not HTML (a file): the browser sends the form itself, as it would without the kit. */
    const posts = new WeakMap(), passing = new WeakSet();   /* form -> the AbortController of its request on the way; a form the browser is sending itself (while its submit runs) */
    function post(f, by) {
      if (posts.has(f)) posts.get(f).abort();
      const c = new AbortController(); posts.set(f, c);
      by = by && by.form === f ? by : null;
      const data = by ? new FormData(f, by) : new FormData(f);
      const body = (f.enctype || '').toLowerCase() === 'multipart/form-data' ? data : new URLSearchParams([...data].filter(p => typeof p[1] === 'string'));
      const native = () => { if (posts.get(f) !== c) return; posts.delete(f); hold(f, 'post', false); passing.add(f); try { if (by) f.requestSubmit(by); else f.requestSubmit(); } finally { passing.delete(f); } };
      hold(f, 'post', true);
      fetch(f.action, { method: 'POST', body, headers: { 'X-G-Fetch': '1' }, signal: c.signal, credentials: 'same-origin' }).then(res => {
        const u = new URL(res.url), to = u.pathname + u.search;
        if (posts.get(f) !== c) return;
        if (res.status >= 500 || u.origin !== location.origin || !/html/i.test(res.headers.get('content-type') || '')) return native();
        if (res.redirected && u.pathname !== location.pathname) { posts.delete(f); return location.assign(to); }   /* a GET: safe to ask again */
        return res.text().then(html => {
          if (posts.get(f) !== c) return;
          posts.delete(f);
          if (res.redirected && to !== here()) history.pushState(null, '', to);
          if (!apply(html, f)) return native();
          hold(f, 'post', false);
          fire(document, 'g:navigate', { url: location.href, title: document.title });
        });
      }).catch(err => { if (err && err.name !== 'AbortError') native(); });
    }
    const ours = e => !applying && ready() && e.target.form === form && e.target.name;

    const hasGet = bind();
    if (!hasGet && !$$('main form').some(f => pageForm(f, 'post'))) return;
    const main = document.querySelector('main');
    /* the markup of <main> as the server sent it: taken before anything here builds its parts, it is what the first answer is compared with */
    snap = main && main.cloneNode(true);
    shown = here();
    if (hasGet) history.replaceState(remember(), '');
    if (snap) {   /* back to the first address: its answer is the page as it came */
      const d = document.implementation.createHTMLDocument(document.title);
      ['link[rel=canonical]', 'meta[name=description]'].forEach(s => { const n = document.head.querySelector(s); if (n) d.head.appendChild(n.cloneNode(true)); });
      d.body.appendChild(snap.cloneNode(true));
      cache.set(shown, Promise.resolve({ url: shown, html: d.documentElement.outerHTML }));
    }
    document.addEventListener('input', e => {
      if (!live || !ours(e) || !isText(e.target)) return;   /* a box or a select: its change */
      const url = write(!editing);
      editing = true;
      schedule(url);
    });
    document.addEventListener('change', e => {
      if (!live || !ours(e)) return;
      const url = write(!isText(e.target) || !e.isTrusted);   /* a choice is an entry (a value a script put in too); the end of an edit is the entry the edit made */
      editing = false;
      load(url, false, false, true);
    });
    document.addEventListener('focusout', e => { if (ours(e) && isText(e.target)) editing = false; });
    /* the clear cross of a field is one more button of the form: at once, the answer with that field empty (with a submit button: asked anew, as the button does) */
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-g-clear-input]'), i = b && clearInput(b);
      if (!i || !ours({ target: i })) return;
      editing = false;
      load(write(true), !live, false, true);
    });
    /* on window, last: a script of the page that cancels the submit runs this form itself, and from then on it is left to that script */
    addEventListener('submit', e => {
      const f = e.target;
      if (ready() && f === form) {
        if (e.defaultPrevented) {
          theirs.add(form); form = null;
          clearTimeout(timer); if (ctl) { ctl.abort(); ctl = null; pending = ''; }
          return;
        }
        e.preventDefault();
        const url = write(!live || (e.isTrusted && !editing));   /* in a live form a submit sent by a script (submit on change) is not the end of an edit */
        if (e.isTrusted) editing = false;
        const again = !live && ((e.isTrusted && !!e.submitter) || url !== restored);   /* a submit a script sends (no button: requestSubmit() or a submit event) for the fields back / forward put back (submit on change) is not a new pick */
        restored = '';
        load(url, again, false, true);
        return;
      }
      if (!(f instanceof HTMLFormElement) || passing.has(f) || !snap || !pageForm(f, 'post')) return;
      if (e.defaultPrevented) { theirs.add(f); return; }
      e.preventDefault();
      post(f, e.submitter);
    });
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !ready()) return;
      /* a link inside a shadow root (a widget on the page) is seen from here as its host: the click's own path has the link */
      const a = (e.composedPath ? e.composedPath().find(n => n.tagName === 'A' && n.hasAttribute && n.hasAttribute('href')) : null) || (e.target.closest && e.target.closest('a[href]'));
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      if (u.hash && u.pathname + u.search === here()) return;   /* an anchor on this page */
      const values = read(u.href), names = new Set(fieldsOf(form).map(f => f.name));
      if (!values || [...values.keys()].some(k => !names.has(k))) return;   /* it carries something this form does not hold */
      e.preventDefault();
      fill(values);
      editing = false;
      load(write(true));
    });
    addEventListener('popstate', e => {
      if (!ready()) return;
      const url = here();
      if (url === shown && !pending) return;   /* only the fragment changed */
      const st = e.state && e.state.gForm, values = st ? toMap(st) : read(location.href);
      if (!values) return location.reload();
      fill(values);
      editing = false;
      restored = url;
      load(url);
    });
  }

  /* Theme: Glass.setTheme('light' | 'dark' | 'auto'); sets data-theme on <html> and follows the system in 'auto' */
  const themeMq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;

  let themeMode = 'dark';
  function applyTheme() { const t = themeMode === 'auto' ? (themeMq && themeMq.matches ? 'light' : 'dark') : themeMode; document.documentElement.setAttribute('data-theme', t); fire(document, 'g:themechange', { theme: t, mode: themeMode }); }
  function setTheme(m) { themeMode = m === 'light' || m === 'auto' ? m : 'dark'; applyTheme(); }
  if (themeMq && themeMq.addEventListener) themeMq.addEventListener('change', () => { if (themeMode === 'auto') applyTheme(); });
  if (!document.documentElement.hasAttribute('data-theme')) document.documentElement.setAttribute('data-theme', 'dark');/* default: dark */
  function popBy(sel) { return document.querySelector(sel); }
  /* glass-morph.js (Glass.morph, Glass.watch) may be on the page before or after this file: both add to one Glass */
  global.Glass = Object.assign(global.Glass || {}, {
    init, animate, busy, fileProgress, ruler, setTheme, toast, setProgress, validate, nav: navAuto,
    fit: box => { if (box._gFit) box._gFit(); else mount1(box, ['[data-g-fit]', initFit]); },   /* measure a [data-g-fit] box now (glass-morph.js, in the reads of an update) */
    fitTable: t => { if (t.matches(FIT_T)) tableFit(t); },   /* the columns of a table fit its box now (glass-morph.js, in the reads of an update) */
    /* for glass-morph.js: the kit's parts that run by themselves (their own animations, built and changed by the kit): not content to animate */
    morphSkip: (global.Glass && global.Glass.morphSkip ? global.Glass.morphSkip + ', ' : '') +   /* what the page set before (ads, other scripts' widgets) stays */
      '.g-select, .g-tooltip, .g-toasts, .g-more, .g-clamp__btn, .g-ruler, .g-input-wrap, .g-busy-bar, .g-busy-lines, [data-g-pager], [data-g-file], ' +
      '[data-g-nav-auto], [data-g-liquid], [data-g-anim-loop], [data-g-anim-random], [role="alert"]',
    popover: { open(sel) { const p = popBy(sel); if (p && p.showPopover) p.showPopover(); }, close(sel) { const p = popBy(sel); if (p && p.hidePopover) p.hidePopover(); } },
    mount(sel, fn) { MOUNTS.push([sel, fn]); allMounts = ''; mount(sel, fn); }   /* for plugins such as glass-ui-liquid.js */
  });
  /* Animated backgrounds (the gradient and the liquid, both in glass-ui-liquid.js) share ONE timer and one speed. 20 fps; it does not run while the tab is hidden, reduced motion is on or nothing wants frames
     Glass.scene.add(fn): fn(dt) gets the seconds since the last frame, already times the speed; return true when it drew something. Returns a function that unsubscribes
     Glass.scene.speed(k): 1 = calm, 0 = still */
  const scene = (() => {
    const subs = new Set(), mq = matchMedia('(prefers-reduced-motion: reduce)');
    let k = 1, last = 0, timer = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    function tick() {
      timer = 0;
      if (!subs.size || document.hidden || mq.matches) return;
      const now = performance.now(), dt = Math.min((now - last) / 1000, .25); last = now;
      let busy = false;
      if (k) subs.forEach(f => { if (f(dt * k)) busy = true; });
      timer = setTimeout(tick, busy ? 50 : 500);
    }
    function run() { if (!timer && subs.size && !document.hidden && !mq.matches) { last = performance.now(); timer = setTimeout(tick, 50); } }
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : run());
    mq.addEventListener('change', () => mq.matches ? stop() : run());
    return { add(f) { subs.add(f); run(); return () => subs.delete(f); }, speed(v) { k = Math.max(0, +v || 0); } };
  })();
  global.Glass.scene = scene;

  /* Touch hover. A finger on an element is a mouse over it: the element and its ancestors get [data-g-hover] (the kit's :hover rules have a twin with it) and the page gets
     mouseover / mouseenter (and mouseout / mouseleave when the finger leaves or lifts), so hover handlers of the page (a preview, a highlight) run on a touch screen too.
     The finger is not captured by the element it went down on: sliding it moves the hover. Lifted on the touched clickable thing: a click, as usual.
     Lifted off it (or the touch became a scroll): no click. Safari's own mouse events after a tap are swallowed: they came late, and a hover handler changing the page
     made iOS cancel the click. Off for a page: <html data-g-touch-hover="off"> */
  (() => {
    const off = () => document.documentElement.getAttribute('data-g-touch-hover') === 'off';
    const CLICKABLE = 'a[href], button, summary, label, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], input:is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"])';
    let zone = null, kill = false, quietTill = 0, upAt = 0;
    const chain = (el, rel) => { const a = []; for (; el && el.nodeType === 1; el = el.parentElement) if (!(rel && rel.nodeType === 1 && el.contains(rel))) a.push(el); return a; };
    const fire = (el, type, rel, e) => el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseover' || type === 'mouseout', cancelable: true, view: window,
      clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, relatedTarget: rel && rel.nodeType === 1 ? rel : null }));
    function zoneOf(el) {   // what the finger presses: a control, or the outermost box of a run of cursor:pointer (a word of a list with a click handler); none: plain content
      const c = el.closest(CLICKABLE); if (c) return c;
      if (el.closest('input, textarea, [contenteditable]') || getComputedStyle(el).cursor !== 'pointer') return null;
      while (el.parentElement && el.parentElement !== document.body && getComputedStyle(el.parentElement).cursor === 'pointer') el = el.parentElement;
      return el;
    }
    const touch = e => e.pointerType === 'touch' && e.isPrimary && !off();
    addEventListener('pointerdown', e => {
      if (!touch(e)) return;
      const t = e.target; if (t.hasPointerCapture && t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
      kill = false; quietTill = Infinity; if (zone) zone.removeAttribute('data-g-touch');
      zone = t.nodeType === 1 ? zoneOf(t) : null; if (zone) zone.setAttribute('data-g-touch', '');
    }, true);
    addEventListener('pointerover', e => {
      if (!touch(e) || e.target.nodeType !== 1) return;
      const add = chain(e.target, e.relatedTarget); add.forEach(n => n.setAttribute('data-g-hover', ''));
      fire(e.target, 'mouseover', e.relatedTarget, e); add.reverse().forEach(n => fire(n, 'mouseenter', e.relatedTarget, e));
    }, true);
    addEventListener('pointerout', e => {
      if (!touch(e) || e.target.nodeType !== 1) return;
      const gone = chain(e.target, e.relatedTarget); gone.forEach(n => n.removeAttribute('data-g-hover'));
      fire(e.target, 'mouseout', e.relatedTarget, e); gone.forEach(n => fire(n, 'mouseleave', e.relatedTarget, e));
    }, true);
    const end = e => {
      if (!touch(e)) return;
      upAt = performance.now(); quietTill = upAt + 800;
      const at = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY);
      kill = e.type !== 'pointerup' || !!(zone && !(at && zone.contains(at)));
      if (zone) { zone.removeAttribute('data-g-touch'); zone = null; }
      document.querySelectorAll('[data-g-hover]').forEach(n => n.removeAttribute('data-g-hover'));   // a hover a lost pointerout left behind
    };
    addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
    ['mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove'].forEach(t => addEventListener(t, e => {
      if (e.isTrusted && performance.now() < quietTill) e.stopImmediatePropagation();
    }, true));
    addEventListener('click', e => {
      if (kill && e.isTrusted && performance.now() - upAt < 800) { kill = false; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  })();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
