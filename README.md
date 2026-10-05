# Glass UI

A glass look for the web: one stylesheet, one small script, plain HTML. No dependencies, no build step.

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

Native elements (`button`, `input`, `table`, `dialog`, `nav`, `article`…) are styled inside `.g-root`; variants and states are attributes (`data-variant`, `data-size`, `aria-*`). The [live demo](https://sanprojects.github.io/glass-ui/) (`Glass-UI.html`, rebuilt from `main` on every push) shows every component with its markup.

| File | What |
|---|---|
| `glass-ui.css` / `.js` | the kit |
| `glass-icons.css` | icon pack, used as `data-icon="name"` |
| `glass-ui-light.css` | light theme (`Glass.setTheme('light' \| 'dark' \| 'auto')`) |
| `glass-ui-liquid.js` | optional animated background |
| `glass-appearance.css` / `.js` | optional settings panel used by the demo |

Spacing between neighbours is the `--g-gap` token (14px).

**Fonts.** The kit does not ship fonts. It uses `Manrope` if you load it and falls back to the system font; set `--g-font` to use your own.

**Browsers.** Current evergreen browsers.

**Icons** are a subset of [Lucide](https://lucide.dev) (ISC licence, © Lucide Contributors), generated into `glass-icons.css`. Add your own as described in that file.

## Tests

```sh
npm i
npx playwright install chromium
npm test
```

## Licence

MIT
