# Notes from using the kit on sanstv.ru

Proposals found while moving /find_words and /anagram to the kit. Each one is handled on the site for now in `themes/glass/site.css`; none of it is in the kit.

## 1. A search field inside `<nav>`
`<nav><a>..</a><ul>..</ul><div><form><button data-icon="search"></button><input type="search"></form> ..buttons..</div></nav>`
The kit has no narrow-screen rule for it: `nav > div` is `flex: none`, so on a phone the field pushes the bar wider than the viewport. The site hides the `<ul>` and lets the form take the free width at <= 600px. Done in the kit: a `<nav>` with a direct `.g-input-wrap` child is a grid (home | title | field | links | buttons) where the field is the main cell (`minmax(80px, 1fr)`). Still open: hiding the `<ul>` on narrow screens (the site does it).

## 2. A multi-column list with sub-headings
`<ol><h4>Letters: 5</h4><li>..</li>..</ol>` as a grid of `repeat(auto-fill, minmax(11em, 1fr))` where the heading spans all columns (`grid-column: 1 / -1`). There is no list like this in the kit; the site defines `ol.list`. Proposal: a `.g-list` variant for it.

## 3. Links in free-form text
Links are styled only inside `p, small, blockquote, dd, td, li`. Server-rendered messages are often a bare `<div>` or `<center>` with a link in it, and those links get the browser colour (blue / purple when visited). The site sets `color: inherit` and an underline for them. Proposal: also style `a` in `div`/`span` inside `.g-root` that has no `role`, `data-*` or `g-` class, or document the expected markup.

## 4. A notice block
`.info` / `.error` blocks (a rounded panel with text, red text for errors) are defined on the site. Proposal: a native-element or `role="status"` / `role="alert"` style in the kit.

## 5. Icons missing from `glass-icons.css`
Added to the kit (`shuffle`, `shield`, `users`, `flame`); the site now uses them instead of the replacements (`lock`, `user`, `activity`).
