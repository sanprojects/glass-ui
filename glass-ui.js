/*!
 * Glass UI — vanilla JS for glass-ui.css. No dependencies.
 * Passive: the page is drawn by CSS alone. After first paint the script prepares markup that needs it (builds the select / pager / "more" parts, fills ARIA) in idle time,
 * or on the first pointer / key / focus on a component. ALL behaviour is handled by delegated listeners on `document`, with the state kept in the DOM,
 * so elements added later work the same. Call Glass.init(root) after inserting markup that has to be built (select, pager, more, number, color, file, menu).
 * Markup is plain HTML: native elements, ARIA roles and data- attributes (see glass-ui.css).
 *
 *   <select data-g-select multiple>   -> multi-select: list stays open, toggles options, shows "A, B" or "3 selected"
 *   <select data-g-select>            -> glass dropdown (add data-searchable for a combobox filter)
 *   <button class="g-input-end" data-g-password>  -> show/hide password (inside .g-input-wrap next to the <input type=password>)
 *   <div class="g-input-wrap g-stepper" data-g-number> -> number field with − / + buttons (data-step="-1" / "1")
 *   <div class="g-input-wrap g-color" data-g-color>    -> colour field: swatch (native picker) + hex text input
 *   <div class="g-file" data-g-file>   -> file upload: dropzone with a file list (add class g-file--field for a compact one-row version; data-max-size="10" in MB; `multiple` on the input accumulates files across picks, data-max-files caps the count)
 *   Glass.fileProgress('#uploader', fileOrIndex, 0..100)  -> show per-file upload progress (bar turns green at 100)
 *   <button data-g-menu="#m" data-g-align="end"> + <div role="menu" id="m"> -> dropdown menu: buttons or links, <hr>; arrow keys, Esc, outside click
 *   <div role="tablist"><button>…</button>…</div> <div role="tabpanel">…</div>…  -> tabs / segmented control; roles, ids, aria-controls and hidden are filled in
 *   <button data-g-open="#dlg">       -> opens <dialog id="dlg">
 *   <button data-g-close>             -> closes its dialog (value = button value)
 *   <input type="range">              -> fill is updated automatically
 *   <th aria-sort="none"><button>Name …</button></th> -> sortable column (text, or numeric via data-sort on the cells)
 *   <div class="g-clamp" data-g-clamp="3"><div class="g-clamp__text">…</div><button class="g-clamp__btn" hidden>more</button></div> -> text clamped to 3 lines with an inline more / less pill (hidden when the text fits)
 *   <ol class="g-list" data-g-more="6">  -> shows 6 items and a "Show K more" / "Show less" button (data-more-label="Show {n} more")
 *   <table data-g-selectable> -> row selection
 *   <nav data-g-pager data-total="24" data-size="4" data-page="1"> -> pager
 *   <button data-size="sm" data-g-remove>Berlin</button>  -> removable chip: draws a × and removes itself on click (g:remove)
 *   <button data-size="sm" data-g-toggle aria-pressed="false">Design</button>  -> toggle chip
 *   <button popovertarget="p"> + <aside popover id="p"> -> native popover panel (top layer, closes on outside click / Esc)
 *   title="…" on any element inside .g-root -> glass tooltip (data-tip-position="bottom" to show it below)
 *   data-icon="play" / data-icon-end="chevron-down" / data-icon="heart" on any element -> icon from glass-icons.css (Lucide subset, CSS masks; no JS involved)
 *   Glass.toast({ title, text, variant, duration })
 */
(function (global) {
  'use strict';
  var uid = 0;
  /* toast icon per variant: names from glass-icons.css */
  var ICONS = { info: 'info', success: 'check', warning: 'triangle-alert', danger: 'x' };

  /* element that an attribute such as data-g-menu="#id" points to */
  function target(el, attr) { return document.querySelector(el.getAttribute(attr)); }
  function toArray(x) { return Array.prototype.slice.call(x); }
  function $$(sel, root) { return toArray((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function once(node, key) { if (node.__g && node.__g[key]) return false; (node.__g = node.__g || {})[key] = 1; return true; }
  function fire(el, type, detail) { el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: detail })); }
  /* aria(el, 'expanded' | 'selected' | 'pressed' | 'current', bool) */
  function aria(el, name, on) { el.setAttribute('aria-' + name, on ? 'true' : 'false'); }
  /* mount(selector, fn, root): runs fn once for every matching element (safe to call again after new markup is added) */
  function mount(sel, fn, root) { $$(sel, root).forEach(function (n) { if (once(n, sel)) fn(n); }); }
  /* ---------- Floating panel: shared by select, menu and nav "More" ----------
   * Moves the panel to <body> (or the enclosing <dialog>) so its blur sees the real page, places it under (or over) the trigger.
   * Every open panel sits in one registry; ONE global listener each handles scroll / resize (re-place), outside press and Esc (close), arrow keys (menus).
   * o: { anchor, align: 'center' | 'start' | 'end', matchWidth, maxHeight: px, menu: arrow-key menu, items: close on item click, focusBack, onClose } */
  var floats = [];
  function floatPanel(trigger, panel, o) {
    o = o || {};
    function place() {
      var r = (o.anchor || trigger).getBoundingClientRect(), below = innerHeight - r.bottom - 16, above = r.top - 16, up = below < 220 && above > below, room = Math.max(120, up ? above : below), al = o.align || 'center';
      panel.classList.toggle('is-up', up);
      if (o.matchWidth) panel.style.width = r.width + 'px';
      var w = panel.offsetWidth, x = al === 'end' ? r.right - w : r.left;
      panel.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
      panel.style.maxHeight = Math.min(o.maxHeight || 280, room - 10) + 'px';
      panel.style.transformOrigin = (up ? 'bottom ' : 'top ') + (al === 'end' ? 'right' : al === 'start' ? 'left' : 'center');
      if (up) { panel.style.top = 'auto'; panel.style.bottom = (innerHeight - r.top + 10) + 'px'; } else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom + 10) + 'px'; }
    }
    var f = {
      trigger: trigger, panel: panel, o: o, place: place,
      isOpen: function () { return floats.indexOf(f) >= 0; },
      open: function () {
        if (f.isOpen()) return; floats.push(f);
        (trigger.closest('dialog, [popover]') || document.body).appendChild(panel);
        place(); panel.classList.add('is-open'); aria(trigger, 'expanded', true);
      },
      close: function (focus) {
        var i = floats.indexOf(f); if (i < 0) return; floats.splice(i, 1);
        panel.classList.remove('is-open'); aria(trigger, 'expanded', false); if (o.onClose) o.onClose();
        if (focus) trigger.focus();
      }
    };
    return f;
  }
  function placeAll() { floats.forEach(function (f) { f.place(); }); }
  addEventListener('scroll', placeAll, true); addEventListener('resize', placeAll);
  document.addEventListener('mousedown', function (e) {
    var t = e.target; if (!t.closest) return;
    var opt = t.closest('[role="option"]'); if (opt && opt.closest('[role="listbox"]').__st) e.preventDefault();   // keep the focus where it is
    floats.slice().forEach(function (f) { if (!f.trigger.contains(t) && !f.panel.contains(t)) f.close(false); });
  });
  /* the items of a menu: its buttons and links (or anything with role="menuitem") */
  function menuItems(panel) { return toArray(panel.children).filter(function (c) { return /^(BUTTON|A)$/.test(c.tagName) || c.getAttribute('role') === 'menuitem'; }); }
  function enabled(i) { return i.getAttribute('aria-disabled') !== 'true' && !i.disabled; }
  /* Esc closes the top panel (focus back on the trigger); in a menu Arrow / Home / End move between the items and Tab closes */
  document.addEventListener('keydown', function (e) {
    var k = e.key, top = floats[floats.length - 1];
    if (k === 'Escape' && top) { e.preventDefault(); e.stopPropagation(); top.close(true); return; }
    var f = floats.filter(function (x) { return x.o.menu && x.panel.contains(document.activeElement); })[0]; if (!f) return;
    var items = menuItems(f.panel).filter(enabled), n = items.indexOf(document.activeElement);
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (items.length) items[n < 0 ? (k === 'ArrowDown' ? 0 : items.length - 1) : (n + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (k === 'Home' && items.length) { e.preventDefault(); items[0].focus(); }
    else if (k === 'End' && items.length) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (k === 'Tab') f.close(false);
  });
  document.addEventListener('click', function (e) {   // a click on a menu item closes its menu
    var t = e.target; if (!t.closest) return;
    floats.slice().forEach(function (f) { if (f.o.items && f.panel.contains(t)) { var i = t.closest('button, a, [role="menuitem"]'); if (i && i.parentNode === f.panel) f.close(!!f.o.focusBack); } });
  });

  /* <button data-g-menu="#m" data-g-align="end"> + <div role="menu" id="m"> with buttons or links and <hr> separators */
  function initMenu(trigger) {
    var panel = target(trigger, 'data-g-menu'); if (!panel) return;
    var id = panel.id || (panel.id = 'g-menu-' + (++uid));
    trigger.__fp = floatPanel(trigger, panel, { align: trigger.getAttribute('data-g-align') || 'start', maxHeight: 420, menu: true, items: true, focusBack: true });
    panel.setAttribute('role', 'menu'); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-controls', id); aria(trigger, 'expanded', false);
    menuItems(panel).forEach(function (i) { if (!i.hasAttribute('role')) i.setAttribute('role', 'menuitem'); i.tabIndex = -1; });
    $$('hr', panel).forEach(function (i) { i.setAttribute('role', 'separator'); });
  }
  function openMenu(fp, last) {
    if (fp.isOpen()) return; fp.open();
    var items = menuItems(fp.panel).filter(enabled), f = last ? items[items.length - 1] : items[0]; if (f) f.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-g-menu]'), fp = t && t.__fp;
    if (fp) fp.isOpen() ? fp.close(true) : openMenu(fp);
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target.closest && e.target.closest('[data-g-menu]'), fp = t && t.__fp;
    if (fp && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openMenu(fp, e.key === 'ArrowUp'); }
  });

  /* ---------- Select / combobox: initSelect builds the parts once (state lives in st); all events are delegated below ---------- */
  function initSelect(sel) {
    var searchable = sel.hasAttribute('data-searchable'), multi = sel.multiple;
    var id = 'g-sel-' + (++uid);
    var wrap = el('div', 'g-select');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');

    var trigger = el('button', 'g-select__trigger', '<span class="g-select__value"></span>'); trigger.setAttribute('data-icon-end', 'chevron-down');
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    aria(trigger, 'expanded', false);
    trigger.setAttribute('aria-controls', id);
    var lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    if (lab) { if (!lab.id) lab.id = id + '-lbl'; trigger.setAttribute('aria-labelledby', lab.id); }
    var list = el('div'); list.id = id; list.setAttribute('role', 'listbox'); if (multi) list.setAttribute('aria-multiselectable', 'true');
    var search = null;
    if (searchable) {
      search = el('input', 'g-select__search'); search.type = 'search'; search.placeholder = sel.getAttribute('data-search-placeholder') || 'Search…';
      search.setAttribute('aria-label', 'Filter options'); list.appendChild(search);
    }
    var holder = el('div'); list.appendChild(holder);
    wrap.appendChild(trigger); wrap.appendChild(list);
    var valueEl = trigger.firstChild, opts = [], active = -1;
    var st = { sel: sel, wrap: wrap, trigger: trigger, list: list, holder: holder, search: search };
    sel.__st = trigger.__st = list.__st = st;

    function build() {
      holder.innerHTML = ''; opts = [];
      $$('option', sel).forEach(function (o, i) {
        if (o.hidden || o.value === '') return;
        var d = el('div'); d.textContent = o.textContent; d.id = id + '-o' + i; d.setAttribute('role', 'option'); d.tabIndex = -1;
        if (o.disabled) d.setAttribute('aria-disabled', 'true');
        d.__o = o; d.__label = o.textContent.toLowerCase();
        holder.appendChild(d); opts.push(d);
      });
      paint();
    }
    function phText() { var o = sel.querySelector('option[value=""]'); return (o && o.textContent.trim()) || sel.getAttribute('data-placeholder') || 'Select…'; }
    function paint() {
      if (multi) {
        var on = $$('option', sel).filter(function (o) { return o.selected && o.value !== ''; });
        valueEl.textContent = !on.length ? phText()
          : on.length > 2 ? on.length + ' ' + (sel.getAttribute('data-selected-label') || 'selected')
          : on.map(function (o) { return o.textContent; }).join(', ');
        valueEl.classList.toggle('is-placeholder', !on.length);
        opts.forEach(function (d) { aria(d, 'selected', d.__o.selected); });
        return;
      }
      var cur = sel.options[sel.selectedIndex], ph = !cur || cur.value === '';
      valueEl.textContent = ph ? phText() : cur.textContent;
      valueEl.classList.toggle('is-placeholder', ph);
      opts.forEach(function (d) { aria(d, 'selected', d.__o.selected && !ph); });
    }
    function visible() { return opts.filter(function (d) { return !d.hidden && d.getAttribute('aria-disabled') !== 'true'; }); }
    function setActive(d) {
      opts.forEach(function (o) { o.classList.remove('is-active'); });
      if (!d) { active = -1; trigger.removeAttribute('aria-activedescendant'); return; }
      d.classList.add('is-active'); active = opts.indexOf(d);
      trigger.setAttribute('aria-activedescendant', d.id); d.scrollIntoView({ block: 'nearest' });
    }
    var fp = floatPanel(trigger, list, { matchWidth: true, maxHeight: 280, onClose: function () { wrap.classList.remove('is-open'); setActive(null); } });
    function isOpen() { return fp.isOpen(); }
    function open() {
      if (sel.disabled || isOpen()) return;
      build(); fp.open(); wrap.classList.add('is-open');   // the options are read from the <select> each time it opens
      if (search) { search.value = ''; filter(); setTimeout(function () { search.focus(); }, 30); }
      if (!multi) setActive(opts.filter(function (d) { return d.__o.selected && d.getAttribute('aria-selected') === 'true'; })[0] || visible()[0]);
    }
    function close(focus) { fp.close(focus); }
    function choose(d) {
      if (d.getAttribute('aria-disabled') === 'true') return;
      if (multi) { d.__o.selected = !d.__o.selected; paint(); fire(sel, 'input'); fire(sel, 'change'); return; }
      d.__o.selected = true; paint(); close(true); /* by option, not by value: values may repeat */
      fire(sel, 'input'); fire(sel, 'change');
    }
    function filter() {
      var q = (search.value || '').toLowerCase().trim(), n = 0;
      opts.forEach(function (d) { d.hidden = !!q && d.__label.indexOf(q) < 0; if (!d.hidden) n++; });
      var e = holder.querySelector('.g-select__empty');
      if (!n && !e) holder.appendChild(el('div', 'g-select__empty', 'No matches')); else if (n && e) e.remove();
      setActive(visible()[0]);
    }
    function move(dir) {
      var v = visible(); if (!v.length) return;
      var i = v.indexOf(opts[active]); i = i < 0 ? (dir > 0 ? 0 : v.length - 1) : (i + dir + v.length) % v.length; setActive(v[i]);
    }
    function onKey(e) {
      var o = isOpen();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!o) open(); else move(e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.key === 'Enter' || e.key === ' ') && (o && (e.key === 'Enter' || e.target === trigger))) { e.preventDefault(); if (opts[active]) choose(opts[active]); }
      else if ((e.key === 'Enter' || e.key === ' ') && !o && e.target === trigger) { e.preventDefault(); open(); }
      else if (e.key === 'Tab') close(false);
      else if (e.key === 'Home' && o && e.target === trigger) { e.preventDefault(); setActive(visible()[0]); }
      else if (e.key === 'End' && o && e.target === trigger) { e.preventDefault(); var v = visible(); setActive(v[v.length - 1]); }
      else if (!searchable && e.key.length === 1 && (!multi || o) && !e.metaKey && !e.ctrlKey) {
        var ch = e.key.toLowerCase(), hit = opts.filter(function (d) { return d.__label.charAt(0) === ch && d.getAttribute('aria-disabled') !== 'true'; })[0];
        if (hit) { if (o || multi) setActive(hit); else { hit.__o.selected = true; paint(); fire(sel, 'change'); } }
      }
    }
    st.open = open; st.close = close; st.choose = choose; st.filter = filter; st.paint = paint; st.setActive = setActive; st.onKey = onKey; st.isOpen = isOpen;
    trigger.disabled = sel.disabled;
    build();
  }
  (function () {   // delegated select events
    function stOf(node, q) { var n = node.closest && node.closest(q); return n && n.__st; }
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return;
      var st = stOf(t, '.g-select__trigger');
      if (st) { st.isOpen() ? st.close(true) : st.open(); return; }
      var opt = t.closest('[role="option"]'); st = opt && stOf(opt, '[role="listbox"]'); if (st) { st.choose(opt); return; }
      var lab = t.closest('label'), c = lab && lab.control; if (c && c.__st && !t.closest('.g-select')) { e.preventDefault(); c.__st.trigger.focus(); }
    });
    document.addEventListener('keydown', function (e) {
      var st = stOf(e.target, '.g-select__trigger') || (e.target.matches && e.target.matches('.g-select__search') && stOf(e.target, '[role="listbox"]')); if (st) st.onKey(e);
    });
    document.addEventListener('input', function (e) { var st = e.target.matches && e.target.matches('.g-select__search') && stOf(e.target, '[role="listbox"]'); if (st) st.filter(); });
    document.addEventListener('change', function (e) { var st = e.target.__st; if (st && st.sel === e.target) st.paint(); });
    document.addEventListener('pointerover', function (e) {   // the highlight follows the pointer
      var l = e.target.closest && e.target.closest('[role="listbox"]'), st = l && l.__st; if (!st) return;
      var o = e.target.closest('[role="option"]'); if (o && o.getAttribute('aria-disabled') !== 'true') st.setActive(o);
    });
    document.addEventListener('pointerout', function (e) {   // ... and never gets stuck when it leaves the options
      var l = e.target.closest && e.target.closest('[role="listbox"]'), st = l && l.__st;
      if (st && st.holder.contains(e.target) && !(e.relatedTarget && st.holder.contains(e.relatedTarget))) st.setActive(null);
    });
  })();
  document.addEventListener('reset', function (e) {   // a form reset: repaint the custom controls once the browser has reset the values
    var f = e.target; setTimeout(function () { $$('select[data-g-select], [data-g-file]', f).forEach(function (n) { if (n.__st) n.__st.paint(); if (n.__f) n.__f.reset(); }); }, 0);
  });

  /* ---------- Tabs: one delegated click / keydown handler; the roles and ids are (re)written from the DOM whenever it is needed ---------- */
  function tabsOf(list) { return toArray(list.children).filter(function (c) { return c.getAttribute('role') === 'tab' || c.tagName === 'BUTTON'; }); }
  function initTabs(list) {   // idempotent wiring of roles / ids / panels; run at idle, on first touch, or by Glass.init
    var tabs = tabsOf(list), n = list.__n = list.__n || ++uid;
    /* panels: role="tabpanel" siblings of the tablist, matched to the tabs by order (or by aria-controls when given) */
    var panels = toArray(list.parentNode.children).filter(function (c) { return c.getAttribute('role') === 'tabpanel'; });
    tabs.forEach(function (t, i) {
      t.setAttribute('role', 'tab');
      if (!t.id) t.id = 'g-tab-' + n + '-' + i;
      var p = (t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'))) || (panels.length === tabs.length ? panels[i] : null);
      t.__panel = p;
      if (p) { if (!p.id) p.id = 'g-panel-' + n + '-' + i; t.setAttribute('aria-controls', p.id); p.setAttribute('aria-labelledby', t.id); }
    });
    selectTab(list, tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0], false, true);
    list.setAttribute('data-g-ready', '');   // from here on JS owns the panels (before: CSS shows the first one)
  }
  function selectTab(list, t, focus, silent) {
    var tabs = tabsOf(list);
    tabs.forEach(function (x) {
      var on = x === t; aria(x, 'selected', on); x.tabIndex = on ? 0 : -1;
      if (x.__panel) x.__panel.hidden = !on;
    });
    if (focus) t.focus();
    if (!silent) fire(list, 'g:tabchange', { tab: t, index: tabs.indexOf(t) });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[role="tablist"] > *'); if (!t) return;
    var list = t.parentNode; if (!list.hasAttribute('data-g-ready')) initTabs(list);
    if (tabsOf(list).indexOf(t) >= 0) selectTab(list, t, false);
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target.closest && e.target.closest('[role="tablist"] > *'); if (!t) return;
    var list = t.parentNode, tabs = tabsOf(list), i = tabs.indexOf(t); if (i < 0) return;
    var k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!list.hasAttribute('data-g-ready')) initTabs(list);
    if (k) { e.preventDefault(); selectTab(list, tabs[(i + k + tabs.length) % tabs.length], true); }
    else if (e.key === 'Home') { e.preventDefault(); selectTab(list, tabs[0], true); }
    else if (e.key === 'End') { e.preventDefault(); selectTab(list, tabs[tabs.length - 1], true); }
  });

  /* ---------- Delegated behaviour: dialog, toggle button, removable button (no per-element setup) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var o = t.closest('[data-g-open]');
    if (o) { var d = target(o, 'data-g-open'); if (d && d.showModal) { d.__opener = o; if (!d.hasAttribute('aria-label') && !d.hasAttribute('aria-labelledby')) { var h = d.querySelector('h1,h2,h3'); if (h) { h.id = h.id || 'g-dlg-' + (++uid); d.setAttribute('aria-labelledby', h.id); } } d.showModal(); } return; }
    var c = t.closest('[data-g-close]'), dlg = c && c.closest('dialog');
    if (dlg) { dlg.close(c.value || 'close'); return; }
    if (t.localName === 'dialog' && t.open) { t.close('dismiss'); return; }   // backdrop click
    var p = t.closest('[data-g-toggle]'); if (p) { aria(p, 'pressed', p.getAttribute('aria-pressed') !== 'true'); return; }
    var x = t.closest('[data-g-remove]'); if (x) { fire(x, 'g:remove'); x.remove(); }
  });
  document.addEventListener('close', function (e) { var d = e.target; if (d.__opener) d.__opener.focus(); }, true);

  /* ---------- Slider fill ---------- */
  function initSlider(s) {
    function set() { var min = +s.min || 0, max = s.max === '' ? 100 : +s.max; s.style.setProperty('--p', ((s.value - min) / (max - min) * 100) + '%'); }
    set();
  }
  document.addEventListener('input', function (e) { var s = e.target; if (s.type === 'range') initSlider(s); });

  /* ---------- Selectable table ---------- */
  /* ---------- Tooltip: one glass element in <body> (or the open <dialog> / popover), positioned next to the element ---------- */
  (function () {
    var tip, cur, timer;
    function host(t) { return t.closest('dialog[open], [popover]:popover-open') || document.body; }
    function show(t) {
      clearTimeout(timer); cur = t;
      if (!tip) { tip = document.createElement('div'); tip.className = 'g-tooltip'; tip.setAttribute('role', 'tooltip'); }
      var h = host(t); if (tip.parentNode !== h) h.appendChild(tip);
      tip.textContent = t.getAttribute('data-g-tip'); tip.id = tip.id || 'g-tooltip'; t.setAttribute('aria-describedby', tip.id);
      var r = t.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight, gap = 10;
      var below = t.getAttribute('data-tip-position') === 'bottom' || r.top - hh - gap < 8;
      if (below && r.bottom + hh + gap > innerHeight - 8 && r.top - hh - gap >= 8) below = false;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = below ? r.bottom + gap : r.top - hh - gap, origin = below ? 'top center' : 'bottom center';
      tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.transformOrigin = origin;
      requestAnimationFrame(function () { tip.classList.add('is-open'); });
    }
    function hide() { if (!tip) return; if (cur) cur.removeAttribute('aria-describedby'); cur = null; tip.classList.remove('is-open'); }
    /* <button title="Duplicate project">: the native title of any element inside .g-root is taken over (moved to data-g-tip, so the browser does not show its own tip).
       Icon-only elements keep their accessible name through aria-label. Without JS the native title still works. */
    var SEL = '.g-root [title], [data-g-tip]';
    function take(t) {
      if (!t.hasAttribute('title') || t.tagName === 'IFRAME' || t.closest('svg')) return;
      var v = t.getAttribute('title');
      if (v) { t.setAttribute('data-g-tip', v); if (!t.hasAttribute('aria-label') && !t.textContent.trim()) t.setAttribute('aria-label', v); }
      t.removeAttribute('title');
    }
    function find(e) { var t = e.target.closest && e.target.closest(SEL); if (t) take(t); return t && t.hasAttribute('data-g-tip') ? t : null; }
    document.addEventListener('mouseover', function (e) { var t = find(e); if (t && t !== cur) show(t); });
    document.addEventListener('mouseout', function (e) { var t = find(e); if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hide(); });
    document.addEventListener('focusin', function (e) { var t = find(e); if (t && e.target.matches(':focus-visible')) show(t); });
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', hide, true);
  })();

  /* ---------- Motion: Glass.animate(el, name) replays an effect; data-g-anim-loop="ms" replays it on a timer; g-anim-ripple starts at the pointer ---------- */
  function animate(el, name, o) {
    var cls = 'g-anim-' + name; o = o || {};
    if (o.x != null) { el.style.setProperty('--x', o.x + 'px'); el.style.setProperty('--y', o.y + 'px'); }
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  function animName(el) { for (var i = 0; i < el.classList.length; i++) { var m = /^g-anim-([a-z]+)$/.exec(el.classList[i]); if (m) return m[1]; } return null; }
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('.g-anim-ripple'); if (!el) return;
    var r = el.getBoundingClientRect(); animate(el, 'ripple', { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  function initAnimLoop(el) {
    var name = animName(el), ms = +el.getAttribute('data-g-anim-loop') || 2400; if (!name) return;
    setInterval(function () { if (!document.hidden) animate(el, name); }, ms);
  }

  /* Long list labels end with an ellipsis (CSS); show the full text as a native tooltip only when it is cut */
  document.addEventListener('mouseover', function (e) {
    var l = e.target.closest && e.target.closest('.g-list > li > span');
    if (l && !l.title && l.scrollWidth > l.clientWidth) l.title = l.textContent;
  });

  /* initX(el) only prepares the markup / ARIA once (no listeners); the behaviour is delegated on `document` and reads its state from the DOM. */
  /* "Show K more": the button lives in .g-more right after the list */
  function moreSet(list, open) {
    var n = parseInt(list.getAttribute('data-g-more'), 10) || 5, items = toArray(list.children), btn = list.nextElementSibling.querySelector('button');
    var rest = items.length - n, tpl = list.getAttribute('data-more-label') || 'Show {n} more', less = list.getAttribute('data-less-label') || 'Show less';
    items.forEach(function (li, i) { li.hidden = !open && i >= n; });
    aria(btn, 'expanded', open);
    btn.setAttribute('data-icon', 'chevron-down'); btn.textContent = open ? less : tpl.replace('{n}', rest);
  }
  function initMore(list) {
    var n = parseInt(list.getAttribute('data-g-more'), 10) || 5;
    if (list.children.length <= n) return;
    if (!list.id) list.id = 'g-list-' + (++uid);
    var wrap = el('div', 'g-more'), btn = el('button'); btn.type = 'button'; btn.setAttribute('aria-controls', list.id);
    wrap.appendChild(btn); list.parentNode.insertBefore(wrap, list.nextSibling);
    moreSet(list, false);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.g-more > button'), list = b && b.parentNode.previousElementSibling;
    if (!list || !list.hasAttribute('data-g-more')) return;
    var open = b.getAttribute('aria-expanded') !== 'true'; moreSet(list, open); fire(list, 'g:more', { expanded: open });
  });

  /* text clamped to N lines with an inline more / less pill; ONE ResizeObserver shows / hides the pill */
  var clampRO = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (x) { clampCheck(x.target); }); }) : null;
  function clampCheck(c) {
    var text = c.querySelector('.g-clamp__text'), btn = c.querySelector('.g-clamp__btn'); if (!text || !btn || c.classList.contains('is-open')) return;
    btn.hidden = !(text.scrollHeight > text.clientHeight + 1);
  }
  function initClamp(c) {
    var text = c.querySelector('.g-clamp__text'), btn = c.querySelector('.g-clamp__btn'); if (!text || !btn) return;
    c.style.setProperty('--lines', parseInt(c.getAttribute('data-g-clamp'), 10) || 3);
    if (!text.id) text.id = 'g-clamp-' + (++uid);
    btn.setAttribute('aria-controls', text.id); aria(btn, 'expanded', false); btn.textContent = c.getAttribute('data-more-label') || 'more';
    if (clampRO) clampRO.observe(c); clampCheck(c);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.g-clamp__btn'), c = btn && btn.closest('.g-clamp'); if (!c) return;
    var open = !c.classList.contains('is-open'); c.classList.toggle('is-open', open);
    aria(btn, 'expanded', open); btn.textContent = open ? (c.getAttribute('data-less-label') || 'less') : (c.getAttribute('data-more-label') || 'more'); if (!open) clampCheck(c);
    fire(c, 'g:more', { expanded: open });
  });

  /* sortable columns: <th aria-sort="none"><button>Name</button></th> */
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  function initSort(t) { $$('thead th > button', t).forEach(function (b) { var th = b.parentNode; if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none'); }); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('thead th > button'), th = b && b.parentNode, t = th && th.closest('table'), body = t && t.tBodies[0]; if (!body) return;
    var idx = th.cellIndex, dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    $$('thead th', t).forEach(function (x) { if (x.querySelector('button')) x.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', dir);
    function key(r) { var c = r.cells[idx]; return c.hasAttribute('data-sort') ? c.getAttribute('data-sort') : c.textContent.trim(); }
    toArray(body.rows).sort(function (a, b2) { return (dir === 'ascending' ? 1 : -1) * collator.compare(key(a), key(b2)); }).forEach(function (r) { body.appendChild(r); });
    fire(t, 'g:sort', { column: idx, direction: dir });
  });

  /* selectable rows: <table data-g-selectable[="multiple"]>, optional selection status in the <tfoot> (<output> with the count, <button data-g-clear>) */
  function pickedRows(t) { return $$('tbody tr', t).filter(function (x) { return x.getAttribute('aria-selected') === 'true'; }); }
  function tableSync(t) {
    var n = t.tFoot && t.tFoot.querySelector('output'), c = t.tFoot && t.tFoot.querySelector('[data-g-clear]'), sel = pickedRows(t);
    if (n) n.textContent = sel.length; if (c) c.disabled = !sel.length;
    return sel;
  }
  function initTable(t) {   // idempotent (Glass.init runs it again for rows added later)
    $$('tbody tr', t).forEach(function (r) { r.tabIndex = 0; if (!r.hasAttribute('aria-selected')) aria(r, 'selected', false); });
    tableSync(t);
  }
  function tableToggle(r) {
    var t = r.closest('table'), on = r.getAttribute('aria-selected') !== 'true';
    if (t.getAttribute('data-g-selectable') !== 'multiple') $$('tbody tr', t).forEach(function (x) { aria(x, 'selected', false); });
    aria(r, 'selected', on); fire(t, 'g:select', { rows: tableSync(t) });
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var r = t.closest('table[data-g-selectable] tbody tr');
    if (r && !t.closest('a,button,input,select')) { tableToggle(r); return; }
    var clr = t.closest('[data-g-clear]'), tb = clr && clr.closest('table[data-g-selectable]');
    if (tb) { $$('tbody tr', tb).forEach(function (x) { aria(x, 'selected', false); }); fire(tb, 'g:select', { rows: tableSync(tb) }); }
  });
  document.addEventListener('keydown', function (e) {
    var r = e.target.closest && e.target.closest('table[data-g-selectable] tbody tr');
    if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tableToggle(r); }
  });

  /* ---------- Pager: <nav data-g-pager data-total data-size data-page>; the page lives in data-page ---------- */
  function pagerRender(g) {
    var total = +g.getAttribute('data-total') || 0, size = +g.getAttribute('data-size') || 10, page = +g.getAttribute('data-page') || 1, pages = Math.max(1, Math.ceil(total / size));
    var range = g.querySelector('.g-pager__range') || g.appendChild(el('span', 'g-pager__range')), box = g.querySelector('.g-pager__pages') || g.appendChild(el('span', 'g-pager__pages'));
    function btn(label, html, p, extra) { return '<button class="g-pager__btn" type="button" data-p="' + p + '" aria-label="' + label + '"' + (extra || '') + '>' + html + '</button>'; }
    var a = [], i;
    if (pages <= 7) { for (i = 1; i <= pages; i++) a.push(i); }
    else { a = [1]; var s = Math.max(2, page - 1), e = Math.min(pages - 1, page + 1); if (s > 2) a.push(0); for (i = s; i <= e; i++) a.push(i); if (e < pages - 1) a.push(0); a.push(pages); }
    range.textContent = (total ? (page - 1) * size + 1 : 0) + '–' + Math.min(total, page * size) + ' of ' + total;
    box.innerHTML = btn('Previous page', '', page - 1, ' data-icon="chevron-left"' + (page <= 1 ? ' disabled' : '')) + a.map(function (n) {
      return n ? btn('Page ' + n, n, n, n === page ? ' aria-current="page"' : '') : '<span aria-hidden="true">…</span>';
    }).join('') + btn('Next page', '', page + 1, ' data-icon="chevron-right"' + (page >= pages ? ' disabled' : ''));
  }
  function initPager(g) { pagerRender(g); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.g-pager__btn'), g = b && b.closest('[data-g-pager]'); if (!g || b.disabled) return;
    var page = +b.getAttribute('data-p'); g.setAttribute('data-page', page); pagerRender(g);
    var nb = g.querySelector('[aria-current="page"]'); if (nb) nb.focus();
    fire(g, 'g:page', { page: page, size: +g.getAttribute('data-size') || 10 });
  });

  /* ---------- Chips ---------- */
  function initRing(r) { r.style.setProperty('--value', r.getAttribute('aria-valuenow')); }   /* fallback only: CSS reads aria-valuenow itself via attr() */

  /* ---------- Toast ---------- */
  function toastHost(pos) {
    var cls = 'g-toasts' + (pos === 'bottom' ? ' g-toasts--bottom' : ''), h = document.querySelector('.g-toasts' + (pos === 'bottom' ? '.g-toasts--bottom' : ':not(.g-toasts--bottom)'));
    if (!h) { h = el('div', cls); h.setAttribute('role', 'region'); h.setAttribute('aria-label', 'Notifications'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }
  function toast(o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    var v = o.variant || 'info', t = el('div', 'g-toast' + (v !== 'info' ? ' g-toast--' + v : ''));
    t.setAttribute('role', v === 'danger' ? 'alert' : 'status');
    t.innerHTML = '<div class="g-toast__icon" data-icon="' + (ICONS[v] || ICONS.info) + '"></div>' +
      '<div class="g-toast__main"><p class="g-toast__title"></p><p class="g-toast__text"></p></div>' +
      '<button class="g-toast__close" type="button" data-icon="x" aria-label="Dismiss"></button>';
    t.querySelector('.g-toast__title').textContent = o.title || '';
    var tx = t.querySelector('.g-toast__text'); if (o.text) tx.textContent = o.text; else tx.remove();
    var host = toastHost(o.position), timer;
    function dismiss() { clearTimeout(timer); if (!t.parentNode) return; t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 230); }
    t.__dismiss = dismiss; t.__pause = function (on) { clearTimeout(timer); if (!on && o.duration !== 0) timer = setTimeout(dismiss, 1800); };
    host.appendChild(t);
    if (o.duration !== 0) timer = setTimeout(dismiss, o.duration || 4500);
    return { dismiss: dismiss, el: t };
  }


  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.g-toast__close'), t = b && b.closest('.g-toast'); if (t && t.__dismiss) t.__dismiss(); });
  document.addEventListener('pointerover', function (e) { var t = e.target.closest && e.target.closest('.g-toast'); if (t && t.__pause && !(e.relatedTarget && t.contains(e.relatedTarget))) t.__pause(true); });
  document.addEventListener('pointerout', function (e) { var t = e.target.closest && e.target.closest('.g-toast'); if (t && t.__pause && !(e.relatedTarget && t.contains(e.relatedTarget))) t.__pause(false); });

  /* ---------- Auto navigation ----------
   * <nav><a href="/">Brand</a><ul data-g-nav-auto data-sections=".sec[id]"></ul></nav>
   * Builds links from page sections (default selector [data-g-section]). A section's title comes from
   * data-title, then data-g-section, then its first heading. Highlights the section in view. Links that do
   * not fit move into a "More" menu; on a narrow screen everything moves there and the button shows
   * the current section. New or renamed sections are picked up automatically. */
  function navAuto(ul) {
    if (ul.__nav) return ul.__nav;
    var nav = ul.closest('nav'), sel = ul.getAttribute('data-sections') || '[data-g-section]';
    var items = [], sig = null, more, btn, label, menu, shown = 0, activeId = '';
    function titleOf(s) { return (s.getAttribute('data-title') || s.getAttribute('data-g-section') || ((s.querySelector('h1,h2,h3') || {}).textContent || s.id)).trim(); }
    var fp;
    function isOpen() { return fp && fp.isOpen(); }
    function closeMenu(focus) { if (isOpen()) fp.close(focus); }
    function openMenu() { fp.open(); more.classList.add('is-open'); var f = menu.querySelector('a'); if (f) f.focus(); }
    function build() {
      var secs = $$(sel); secs.forEach(function (s, i) { if (!s.id) s.id = 'g-sec-' + (i + 1); });
      var nsig = secs.map(function (s) { return s.id + '|' + titleOf(s); }).join('~');
      if (nsig === sig) return; sig = nsig; ul.innerHTML = '';
      items = secs.map(function (s) {
        var li = el('li'), a = el('a'); a.href = '#' + s.id; a.textContent = titleOf(s); li.appendChild(a); ul.appendChild(li);
        return { sec: s, li: li, a: a, id: s.id, title: a.textContent };
      });
      more = el('li', 'g-nav__more'); btn = el('button', 'g-nav__morebtn'); btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'true'); aria(btn, 'expanded', false);
      label = el('span', null, 'More'); btn.appendChild(label); btn.setAttribute('data-icon-end', 'chevron-down');
      menu = el('div'); menu.setAttribute('role', 'menu'); more.appendChild(btn); ul.appendChild(more);
      fp = floatPanel(btn, menu, { anchor: nav, align: 'end', maxHeight: 420, menu: true, items: true, onClose: function () { more.classList.remove('is-open'); } });
      btn.__toggle = function () { isOpen() ? closeMenu(true) : openMenu(); };   /* clicks are delegated (.g-nav__morebtn) */
      layout(); spy();
    }
    function layout() {
      if (!items.length) return;
      closeMenu(false); items.forEach(function (i) { i.li.hidden = false; }); more.hidden = true;
      var gap = parseFloat(getComputedStyle(ul).columnGap) || 0, avail = ul.clientWidth, w = items.map(function (i) { return i.li.offsetWidth; });
      var total = w.reduce(function (a, b) { return a + b; }, 0) + gap * (items.length - 1);
      shown = items.length;
      if (total > avail) {
        more.hidden = false; var used = more.offsetWidth; shown = 0;
        for (var k = 0; k < items.length; k++) { if (used + gap + w[k] <= avail) { used += gap + w[k]; shown = k + 1; } else break; }
      }
      items.forEach(function (i, k) { i.li.hidden = k >= shown; });
      menu.innerHTML = '';
      items.slice(shown).forEach(function (i) { var a = el('a'); a.setAttribute('role', 'menuitem'); a.tabIndex = -1; a.href = '#' + i.id; a.textContent = i.title; a.setAttribute('data-id', i.id); menu.appendChild(a); });
      paint();
    }
    function paint() {
      items.forEach(function (i) { if (i.id === activeId) i.a.setAttribute('aria-current', 'page'); else i.a.removeAttribute('aria-current'); });
      $$('a', menu).forEach(function (a) { aria(a, 'current', a.getAttribute('data-id') === activeId); });
      var idx = items.map(function (i) { return i.id; }).indexOf(activeId), inMore = idx >= shown && idx > -1;
      aria(btn, 'current', inMore);
      label.textContent = (shown === 0 && idx > -1) ? items[idx].title : 'More';
    }
    function spy() {
      if (!items.length) return;
      var y = nav.getBoundingClientRect().bottom + 40, cur = items[0];
      items.forEach(function (i) { if (i.sec.getBoundingClientRect().top <= y) cur = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = items[items.length - 1];
      if (cur.id !== activeId) { activeId = cur.id; paint(); }
    }
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; spy(); }); } }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(nav); else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    build();
    return (ul.__nav = { refresh: build });
  }


  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.g-nav__morebtn'); if (b && b.__toggle) b.__toggle(); });

  /* ---------- Popover panel: the native popover attribute (<button popovertarget="p"> + <aside popover id="p">) ----------
   * The browser does the toggling, the top layer, the outside click and Esc. We only report open / close as g:popoveropen / g:popoverclose. */
  document.addEventListener('toggle', function (e) {
    if (e.target.matches && e.target.matches('[popover]')) fire(e.target, e.newState === 'open' ? 'g:popoveropen' : 'g:popoverclose');
  }, true);

  /* ---------- Init ---------- */
  function initFile(w) {
    var inp = w.querySelector('input[type="file"]'), list = w.querySelector('.g-file__list'), nameEl = w.querySelector('.g-file__name'); if (!inp) return;
    var empty = nameEl ? nameEl.textContent : '', max = parseFloat(w.getAttribute('data-max-size')) * 1048576 || 0;
    var prog = {}, kept = [];   /* progress by file key, so it survives the list being rebuilt; kept = files chosen so far (multiple) */
    function files(i) { return toArray(i.files || []); }
    function fkey(f) { return f.name + '|' + f.size + '|' + f.lastModified; }
    function fmt(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
    function render() {
      var fs = files(inp), tooBig = false;
      if (nameEl) { nameEl.textContent = !fs.length ? empty : fs.length === 1 ? fs[0].name : fs.length + ' files'; nameEl.classList.toggle('has-file', !!fs.length); }
      if (!list) return;
      list.innerHTML = ''; list.hidden = !fs.length;
      fs.forEach(function (f) {
        var bad = max && f.size > max; if (bad) tooBig = true;
        var pc = prog[fkey(f)], hasP = typeof pc === 'number';
        var li = el('li', 'g-file__item' + (bad ? ' is-error' : '') + (hasP && !bad ? ' has-progress' : '') + (hasP && pc >= 100 ? ' is-done' : ''));
        li.setAttribute('data-icon', 'file');
        var main = el('div', 'g-file__main'), row = el('div', 'g-file__row');
        var n = el('span', 'g-file__fname'); n.textContent = f.name; row.appendChild(n);
        var sz = el('span', 'g-file__size'); sz.textContent = bad ? 'Too large · ' + fmt(f.size) : hasP && pc < 100 ? Math.round(pc) + '% · ' + fmt(f.size) : fmt(f.size); row.appendChild(sz);
        main.appendChild(row);
        if (hasP && !bad) { var bar = el('progress', 'g-file__bar'); bar.max = 100; bar.value = Math.min(100, pc); main.appendChild(bar); }
        li.appendChild(main);
        var rm = el('button', 'g-file__remove'); rm.setAttribute('data-icon', 'x'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + f.name);
        li.appendChild(rm); list.appendChild(li);
      });
      inp.setCustomValidity(tooBig ? 'A file is larger than ' + (max / 1048576) + ' MB' : '');
    }
    w.__f = {
      render: render,
      reset: function () { kept = []; render(); },
      progress: function (f, pct) { var fs = files(inp); if (typeof f === 'number') f = fs[f]; if (f) { prog[fkey(f)] = pct; render(); } },
      remove: function (i) {
        var fs = files(inp);
        try { var dt = new DataTransfer(); fs.forEach(function (x, k) { if (k !== i) dt.items.add(x); }); inp.files = dt.files; } catch (e) { inp.value = ''; }
        kept = files(inp); render(); fire(inp, 'change');
      },
      /* multiple: every new pick or drop is added to the files already chosen (duplicates skipped) */
      change: function () {
        if (inp.multiple) {
          var seen = {}, merged = [];
          kept.concat(files(inp)).forEach(function (f) { var k = fkey(f); if (!seen[k]) { seen[k] = 1; merged.push(f); } });
          var mx = parseInt(w.getAttribute('data-max-files'), 10); if (mx > 0) merged = merged.slice(0, mx);
          try { var dt = new DataTransfer(); merged.forEach(function (f) { dt.items.add(f); }); inp.files = dt.files; } catch (e) {}
          kept = merged;
        }
        render();
      }
    };
    render();
  }
  (function () {   // delegated file events
    function wOf(n) { var w = n.closest && n.closest('[data-g-file]'); return w && w.__f ? w : null; }
    document.addEventListener('change', function (e) { var w = e.target.type === 'file' && wOf(e.target); if (w) w.__f.change(); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.g-file__remove'), w = b && wOf(b); if (!w) return;
      w.__f.remove(toArray(b.closest('li').parentNode.children).indexOf(b.closest('li')));
    });
    ['dragenter', 'dragover'].forEach(function (t) { document.addEventListener(t, function (e) { var d = e.target.closest && e.target.closest('.g-file__drop'); if (d) d.classList.add('is-drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { document.addEventListener(t, function (e) { var d = e.target.closest && e.target.closest('.g-file__drop'); if (d) d.classList.remove('is-drag'); }); });
  })();

  /* number field with − / + buttons (data-step on the buttons) */
  function numSync(w) {
    var inp = w.querySelector('input'); if (!inp) return;
    var v = parseFloat(inp.value), mn = parseFloat(inp.min), mx = parseFloat(inp.max);
    $$('[data-step]', w).forEach(function (b) { var d = +b.getAttribute('data-step'); b.disabled = inp.disabled || (d < 0 && !isNaN(mn) && v <= mn) || (d > 0 && !isNaN(mx) && v >= mx); });
  }
  function initNumber(w) { numSync(w); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-g-number] [data-step]'), w = b && b.closest('[data-g-number]'), inp = w && w.querySelector('input'); if (!inp) return;
    if (inp.value === '') inp.value = inp.min || '0'; else { try { (+b.getAttribute('data-step') > 0 ? inp.stepUp : inp.stepDown).call(inp); } catch (x) {} }
    fire(inp, 'input'); fire(inp, 'change'); numSync(w);
  });
  ['input', 'change'].forEach(function (t) { document.addEventListener(t, function (e) { var w = e.target.closest && e.target.closest('[data-g-number]'); if (w && e.target.matches('input')) numSync(w); }); });

  /* date / time inputs open their picker on a click anywhere in the field */
  document.addEventListener('click', function (e) {
    var i = e.target; if (i.matches && i.matches('input[type="date"], input[type="time"], input[type="datetime-local"], input[type="month"]') && i.showPicker && !i.readOnly && !i.disabled) { try { i.showPicker(); } catch (x) {} }
  });

  /* colour field: swatch (native picker) + hex text input */
  function colorParts(n) { var w = n.closest && n.closest('[data-g-color]'); return w && { c: w.querySelector('input[type="color"]'), t: w.querySelector('input:not([type="color"])'), sw: w.querySelector('.g-color__swatch') }; }
  function colorNorm(v) { v = (v || '').trim(); if (v.charAt(0) !== '#') v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).replace(/./g, '$&$&'); return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null; }
  function initColor(w) { var p = colorParts(w); if (p && p.c && p.t) { p.t.value = p.c.value.toUpperCase(); p.sw.style.setProperty('--c', p.c.value); } }
  document.addEventListener('input', function (e) {
    var p = colorParts(e.target); if (!p || !p.c || !p.t) return;
    if (e.target === p.c) { p.t.value = p.c.value.toUpperCase(); p.sw.style.setProperty('--c', p.c.value); p.t.removeAttribute('aria-invalid'); fire(p.t, 'input'); }
    else if (e.target === p.t) { var v = colorNorm(p.t.value); if (v) { p.c.value = v; p.sw.style.setProperty('--c', v); p.t.removeAttribute('aria-invalid'); } else p.t.setAttribute('aria-invalid', 'true'); }
  });
  document.addEventListener('focusout', function (e) {
    var p = colorParts(e.target); if (!p || !p.c || e.target !== p.t) return;
    var v = colorNorm(p.t.value); p.t.value = (v || p.c.value).toUpperCase(); p.t.removeAttribute('aria-invalid'); p.sw.style.setProperty('--c', p.c.value);
  });
  function initPassword(b) { aria(b, 'pressed', false); b.setAttribute('aria-label', b.getAttribute('aria-label') || 'Show password'); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-g-password]'), inp = b && b.parentNode.querySelector('input'); if (!inp) return;
    var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
    aria(b, 'pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); inp.focus();
  });
  function initAnimRandom(w) { var max = +w.getAttribute('data-g-anim-random') || 800; Array.prototype.forEach.call(w.children, function (c) { c.style.setProperty('--g-anim-delay', (Math.random() * max / 1000).toFixed(2) + 's'); }); }

  /* selector -> initialiser; each runs once per element (see mount) */
  var MOUNTS = [
    ['[data-g-file]', initFile], ['[data-g-number]', initNumber],
    ['[data-g-color]', initColor], ['[data-g-password]', initPassword], ['select[data-g-select]', initSelect],
    ['[data-g-menu]', initMenu], ['[role="tablist"]', initTabs], ['input[type="range"]', initSlider],
    ['table[data-g-selectable]', initTable], ['table', initSort], ['[data-g-more]', initMore], ['[data-g-pager]', initPager],
    ['[data-g-anim-loop]', initAnimLoop], ['[data-g-anim-random]', initAnimRandom], ['[data-g-clamp]', initClamp]
  ];
  if (!(window.CSS && CSS.supports && CSS.supports('width', 'attr(x type(<length>))')) ) MOUNTS.push(['[role="progressbar"][aria-valuenow]', initRing]);
  function tail(root) {   // cosmetic / a11y extras, never needed for first paint
    $$('svg:not([role]):not([aria-label]):not([aria-labelledby]):not([aria-hidden])', root).forEach(function (s) { if (!s.querySelector('title')) s.setAttribute('aria-hidden', 'true'); });
    $$('[data-g-nav-auto]', root).forEach(function (u) { if (u.__nav) u.__nav.refresh(); else navAuto(u); });
  }
  function init(root) {   // synchronous: Glass.init(root) for markup added later
    MOUNTS.forEach(function (m) { mount(m[0], m[1], root); });
    $$('table[data-g-selectable]', root).forEach(initTable);   // rows added later
    tail(root);
  }
  /* Passive start: nothing runs while the page loads. After first paint the mounts run one by one in idle time;
     if the user touches a component before that, it (and its ancestors) is mounted right then. */
  var idle = window.requestIdleCallback || function (f) { setTimeout(function () { f(); }, 1); };
  function lazy(e) {
    for (var n = e.target; n && n.nodeType === 1; n = n.parentElement)
      MOUNTS.forEach(function (m) { if (n.matches(m[0]) && once(n, m[0])) m[1](n); });
  }
  function start() {
    ['pointerover', 'pointerdown', 'keydown', 'focusin', 'click'].forEach(function (t) { document.addEventListener(t, lazy, true); });
    requestAnimationFrame(function () {
      var i = 0;
      (function step(dl) {
        while (i < MOUNTS.length) { mount(MOUNTS[i][0], MOUNTS[i][1]); i++; if (dl && dl.timeRemaining && dl.timeRemaining() < 3) break; }
        if (i < MOUNTS.length) idle(step, { timeout: 500 }); else idle(function () { tail(); }, { timeout: 1000 });
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
    var c = field.querySelector('input,textarea,select'); if (!c) return true;
    var bad = !c.checkValidity(); c.setAttribute('aria-invalid', bad ? 'true' : 'false');
    var m = field.querySelector('small[role="alert"]'); if (m && bad && c.validationMessage && !m.hasAttribute('data-custom')) m.textContent = c.validationMessage;
    return !bad;
  }

  function fileProgress(sel, file, pct) { var w = typeof sel === 'string' ? document.querySelector(sel) : sel; if (w && w.__f) w.__f.progress(file, pct); }
  /* Theme: Glass.setTheme('light' | 'dark' | 'auto'); sets data-theme on <html> and follows the system in 'auto' */
  var themeMq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null, themeMode = 'dark';
  function applyTheme() { var t = themeMode === 'auto' ? (themeMq && themeMq.matches ? 'light' : 'dark') : themeMode; document.documentElement.setAttribute('data-theme', t); fire(document, 'g:themechange', { theme: t, mode: themeMode }); }
  function setTheme(m) { themeMode = m === 'light' || m === 'auto' ? m : 'dark'; applyTheme(); }
  if (themeMq && themeMq.addEventListener) themeMq.addEventListener('change', function () { if (themeMode === 'auto') applyTheme(); });
  if (!document.documentElement.hasAttribute('data-theme')) document.documentElement.setAttribute('data-theme', 'dark');   /* default: dark */
  function popBy(sel) { return document.querySelector(sel); }
  global.Glass = {
    init: init, animate: animate, fileProgress: fileProgress, setTheme: setTheme, toast: toast, setProgress: setProgress, validate: validate, nav: navAuto,
    popover: { open: function (sel) { var p = popBy(sel); if (p && p.showPopover) p.showPopover(); }, close: function (sel) { var p = popBy(sel); if (p && p.hidePopover) p.hidePopover(); } },
    mount: function (sel, fn) { MOUNTS.push([sel, fn]); mount(sel, fn); }   /* for plugins such as glass-ui-liquid.js */
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
