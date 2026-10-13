<div align="center">

# Glass UI

**A glass look for the web.** One stylesheet, one small script, plain HTML.<br>
No dependencies, no build step.

[Live demo](https://sanprojects.github.io/glass-ui/) · [npm](https://www.npmjs.com/package/glass-ui-css) · MIT

[<img src="docs/hero.webp" alt="Glass UI demo page" width="100%">](https://sanprojects.github.io/glass-ui/)

</div>

Translucent, blurred panels over a photo, gradient or colour field. Themed through CSS tokens: dark by default, light optional.

## Quick start

```sh
npm i glass-ui-css
```

```html
<link rel="stylesheet" href="glass-ui.min.css">
<link rel="stylesheet" href="glass-icons.min.css">
<link rel="stylesheet" href="glass-ui-light.min.css"> <!-- optional light theme -->
<script src="glass-ui.min.js" defer></script>

<body class="g-root g-scene">
  <button data-variant="primary" data-icon="play">Play</button>
</body>
```

Native elements (`button`, `input`, `table`, `dialog`, `nav`, `article`…) are styled inside `.g-root`. Variants and states are attributes: `data-variant`, `data-size`, `aria-*`. The [live demo](https://sanprojects.github.io/glass-ui/) shows every component with its markup.

## Components

### [Buttons and icons](https://sanprojects.github.io/glass-ui/#buttons)

Primary, glass, light, outline, recessed, plain (an icon or text without a pad: `data-variant="plain"`) and danger variants, three sizes, icon-only and block buttons, toggle and removable chips, plus a Lucide icon pack added with `data-icon`.

<img src="docs/buttons.webp" alt="Buttons and icons" width="100%">

### [Forms](https://sanprojects.github.io/glass-ui/#forms)

Recessed fields with icons and validation states, number stepper, date, time and colour pickers, file drop zone, select with search and multi-select, checkboxes, radios, switches and sliders. All are plain form controls, so they submit and validate natively.

A form is an adaptive grid: any container that holds `.g-field` children lays them out in columns of equal width, never narrower than an input (200px), with one gap between them. The labels, controls and hints of one line share their rows (subgrid), so the controls stand on one line. A lone field takes the whole row. A field without a label (a button: `<div class="g-field"><button>Go</button></div>`) stands at the height of the controls beside it, and in a grid too narrow to put anything beside it becomes a row of its own.


<img src="docs/forms-1.webp" alt="Form controls" width="100%">

<img src="docs/forms-2.webp" alt="Form controls" width="100%">

### [Navigation](https://sanprojects.github.io/glass-ui/#navigation)

A floating `<nav>` bar that builds its links from page sections and folds the overflow into a More menu, plus pill and underline tabs with arrow-key support.

<img src="docs/navigation.webp" alt="Navigation bar and tabs" width="100%">

### [Data and content](https://sanprojects.github.io/glass-ui/#data)

Cards (static and fully clickable), badges, progress bars, ring and spinner, a sortable table with row selection and pagination, numbered and bulleted lists.

<img src="docs/data-1.webp" alt="Cards, badges, progress and table" width="100%">

<img src="docs/data-2.webp" alt="Cards, badges, progress and table" width="100%">

### [Overlays](https://sanprojects.github.io/glass-ui/#overlays)

A dialog on the native `<dialog>` element (focus trap, Esc to close), tooltips, menus and toasts triggered from JavaScript.

<img src="docs/overlays.webp" alt="Dialog over blurred page" width="100%">

### [Layout](https://sanprojects.github.io/glass-ui/#layout)

An app shell with a tool panel, a workspace and an inspector. The inspector uses the stronger glass; below 900 px the panels stack.

<img src="docs/layout.webp" alt="Three-panel app shell" width="100%">

**Ruler**: a section index for a long scrolling box. Put `data-ruler="Name"` on the elements that start a section (without a value the name is the element's `id`, else its text): the nearest scrolling box (a block or flex container) gets the ruler by itself (`data-g-ruler` on a box asks for it explicitly): a hairline with the name under it appears at the right edge, left of the scroll bar, as tall as the section's share of the scroll height; the section in view is lit; a click jumps there. Every mark is a link to its section (`#id`, the id of the marked element, or one made of the name): a click puts it into the address, and an address with `#id` opens that section on load and on back / forward. It floats over the content and does not move it; to keep the content clear of it add `padding-inline-end: calc(var(--g-ruler-w) + 2 * var(--g-gap))` to the box. The standard scroll bar stays. When nothing around the marked elements scrolls, the page does: the ruler is then fixed at the right edge of the window, under a fixed or sticky `<nav>` / `<header>`. For virtual lists pass the sections by hand: `Glass.ruler(box, [{ label, from, to }])` (px of the scrollable height).

### [Motion](https://sanprojects.github.io/glass-ui/#motion)

Seven effects you add with a single class: appear, shimmer, ripple, pulse, highlight, rotate and zoom. Each plays once; add `g-anim--loop` to repeat, `--g-anim-delay` to stagger a list, or call `Glass.animate(el, 'highlight')` from JavaScript.

<img src="docs/motion.webp" alt="Motion effects" width="100%">

**Morph.** `Glass.morph('#result', html)` swaps the content of a box for new content and animates only the difference: rows that are gone slide out, new rows slide in (the ones on the screen only), a changed text lights up, and a number that changed turns its digits like an odometer. It works for any elements, not only lists. Elements that are in both versions stay the same nodes, so focus, scroll and typed values survive. Pair rows with `data-key` (a list row of words: `<li data-key="word">`); without it an element is paired by its text. Returns a Promise. Tune it with `--g-morph-leave`, `--g-morph-enter`, `--g-morph-stagger`, `--g-morph-reel`.

### Appearance

<table>
<tr>
<td width="34%" valign="top"><img src="docs/appearance.webp" alt="Appearance panel" width="100%"></td>
<td valign="top">

An optional settings panel (`glass-appearance.css` / `.js`) that the demo uses to restyle the page live:

- **Theme**: dark, light or auto
- **Background**: a scene from the set, or your own image
- **Accent colour** and **liquid colour**
- **Liquid speed**: still, calm, mid, lively
- **Glass blur** and **glass opacity**
- **Reset** to defaults

</td>
</tr>
</table>

Also in the demo, without screenshots here:

- **[Type](https://sanprojects.github.io/glass-ui/#type)**: styles for `h1`…`small` and `g-prose`, with a font and language switcher.
- **Empty state**: `<div class="g-empty" data-icon="search"><h4>Title</h4><p>Hint</p></div>`, a centred icon with a title and a hint, for a search with no results.
- **Message**: `<div class="g-alert" data-icon="triangle-alert" data-tone="warning" role="status">Text with <b>emphasis</b>.</div>`, an icon and a text inside the page; `data-tone` is `warning`, `danger` or `success`, no tone is neutral.
- **[Tokens](https://sanprojects.github.io/glass-ui/#tokens)**: `--g-accent`, `--g-fill`, `--g-blur`, `--g-radius-*` and more; override on `:root` or any container to retheme a region.

## Files

| File | Purpose |
|---|---|
| `glass-ui.css` / `.js` | the kit |
| `glass-icons.css` | icon pack, used as `data-icon="name"` |
| `glass-ui-light.css` | light theme: `Glass.setTheme('light' \| 'dark' \| 'auto')` |
| `glass-ui-liquid.js` | optional animated background |
| `glass-appearance.css` / `.js` | optional settings panel used by the demo |

Each file also ships as `.min.css` / `.min.js`.

## Good to know

- **Spacing** is one rhythm owned by the parent (`gap`), children carry no outer margin: `--g-gap` (16px) between neighbours, `--g-gap-inner` (8px) inside one component, `--g-inset` (16px) a control's side padding, `--g-pad` (24px) container padding. Documented exceptions: optical alignment of icons, the card media bleed, menu separators and `.g-prose`. `test/spacing.test.mjs` measures the gaps in the demo and fails on off-rhythm values.
- **Type scale** is seven steps: `--g-fs-caption` 12, `-footnote` 13, `-subhead` 15 (controls), `-body` 17 (running text), `-title3` 20, `-title1` 28, `-title-lg` 34. Use the tokens, not px values; sizes in `em` (inline code, math) stay relative to their text.
- **Fonts** are not shipped. The kit uses `Manrope` if you load it, otherwise the system font. Set `--g-font` to use your own.
- **Icons** are a subset of [Lucide](https://lucide.dev) (ISC licence, © Lucide Contributors), generated into `glass-icons.css`. Add your own as described in that file.
- **Browsers:** current evergreen browsers.

## Tests

```sh
npm i
npx playwright install chromium
npm test
```

## Licence

MIT
