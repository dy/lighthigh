# lighthigh

Syntax highlighting without a span around every token.

Lighthigh renders offset-based tokens with the [CSS Custom Highlight API]. It
keeps source text nodes intact, adds no token wrappers, and has no runtime
dependencies. Your lexer supplies the languages; Lighthigh supplies the ranges
and colors. Reusing an existing lexer retains its engine and grammar download.

## One script

```html
<pre><code data-lighthigh="javascript">const answer = 42</code></pre>
<script defer src="https://cdn.jsdelivr.net/npm/lighthigh@1" data-theme="github-light"></script>
```

To self-host, copy `site/vendor/auto.min.js` from the package, or build it with
`npm install && npm run build:site`.

The script also recognizes `class="lighthigh"`. Set the language using
`data-lighthigh="css"`, `data-language="css"`, or `class="lighthigh language-css"`.
JavaScript is the default. 14 Prism languages are bundled: JavaScript,
TypeScript, JSX, TSX, CSS, HTML, JSON, Python, Bash, SQL, Go, Rust, Markdown,
and YAML. Unknown languages stay plain text with a console warning. No WebGPU,
remote imports, framework, or additional stylesheet is required.

Set `data-theme` on the script for the default, or on individual blocks to
override it. Unknown theme names fall back to `github-light`. The 18 built-in
palettes are sampled from Shiki themes at build time:

- Light: `github-light`, `github-light-high-contrast`, `solarized-light`,
  `catppuccin-latte`, `rose-pine-dawn`, `one-light`, `vitesse-light`, `ayu-light`,
  `min-light`, `light-plus`, `material-theme-lighter`, `everforest-light`.
- Dark: `github-dark`, `dracula`, `nord`, `tokyo-night`, `monokai`, `catppuccin-mocha`.

These map semantic token categories to colors; they do not reproduce every
TextMate scope. Use the Shiki adapter below for exact grammar-specific colors.
Prism CSS theme files do not style native highlight ranges. Theme fonts and
italics are not applied by Lighthigh.

The script scans once when the DOM is ready. After adding or changing code,
call `LighthighAuto.highlightAll()`, or pass a containing element to scan a
subtree. Rescanning replaces existing ranges and disposes removed blocks.
`LighthighAuto.dispose()` clears all ranges owned by the script.

## Bring a lexer

```sh
npm install lighthigh
```

```js
const highlight = require('lighthigh')
const code = document.querySelector('code')

const clear = highlight(code, lexer, {
  theme: { keyword: '#d73a49', string: '#032f62' }
})

// On unmount:
clear()
```

Accepted token shapes include `{start, end, type}`, `{from, to, kind}`,
`{offset, length, token}`, and `[start, end, type]`. A lexer may also return
`{tokens: iterable}`. Pass tokens directly, or a synchronous `lexer(source, language)` callback.
Set `options.language` to pass a language to the callback. Await async lexers first.

Calling `highlight(element, tokens, options)` again replaces that element’s
ranges and stylesheet. Text nodes and markup stay intact. The returned cleanup
is safe to call repeatedly; an older cleanup won’t erase newer highlights.
Pass `[]` to clear colors, or call the cleanup on unmount. Invalid tokens throw
before replacing existing colors.

No instance to create or retain. The renderer keeps per-element cleanup state
in a WeakMap; native ranges live in the browser’s highlight registry. The
renderer is 1.4 KB minified and gzipped, with no runtime dependencies. The
script including 14 languages and 18 palettes is 23.3 KB gzipped.

## Prism

Use Prism's public `tokenize` API. The adapter flattens nested tokens and keeps
UTF-16 offsets, including gaps and unstyled text.

```js
import highlight from 'lighthigh'
import { prism } from 'lighthigh/adapters.js'
import Prism from 'prismjs'

const code = document.querySelector('code')
highlight(code, source =>
  prism(Prism.tokenize(source, Prism.languages.javascript))
)
```

## Shiki

The adapter accepts a single-theme `codeToTokens()` result and preserves token
foreground colors without generating HTML. Set the result's background and
foreground on your code container if you want its full base palette too.

```js
import highlight from 'lighthigh'
import { shiki } from 'lighthigh/adapters.js'
import { codeToTokens } from 'shiki'

const code = document.querySelector('code')
const result = await codeToTokens(code.textContent, {
  lang: 'javascript', theme: 'github-light'
})
const { tokens, theme } = shiki(result)
highlight(code, tokens, { theme })
```

For asynchronously edited code, apply results only if the source still matches
the text you tokenized. The renderer does not schedule async lexer work.

## Highlight.js

Pass a `highlight.js` result (either its emitter token tree or rendered HTML
string) to `hljs()`. The adapter extracts UTF-16 character offsets and maps
`hljs` scopes to semantic token types without mounting `<span>` elements.

```js
import highlight from 'lighthigh'
import { hljs } from 'lighthigh/adapters.js'
import hljsCore from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'

hljsCore.registerLanguage('javascript', javascript)
const code = document.querySelector('code')
highlight(code, source =>
  hljs(hljsCore.highlight(source, { language: 'javascript' }))
)
```

## Lezer (`@lezer/highlight`)

Pair CodeMirror's incremental `@lezer` parsers with native CSS highlights:

```js
import highlight from 'lighthigh'
import { lezer } from 'lighthigh/adapters.js'
import { parser } from '@lezer/javascript'
import { highlightTree, classHighlighter } from '@lezer/highlight'

const code = document.querySelector('code')
highlight(code, source =>
  lezer(parser.parse(source), highlightTree, classHighlighter)
)
```

## Live editors & frameworks

Because Lighthigh never replaces text nodes or mutates `innerHTML`, it works
directly on `contenteditable="plaintext-only"` elements, `<textarea>` overlays,
and React, Vue, or Sprae components without losing caret position or selection:

```js
const editor = document.querySelector('[contenteditable="plaintext-only"]')
const paint = () => highlight(editor, lexer, { theme: palette })

editor.addEventListener('input', paint)
const clear = paint() // Call clear() on unmount
```

## gpu-lexer

[gpu-lexer](https://github.com/vercel-labs/gpu-lexer) returns compatible offset
tokens directly. It requires WebGPU and a secure browser context; its learned
classifications are approximate. It is optional, and is not bundled here.

```js
import highlight from 'lighthigh'
import { parse } from 'gpu-lexer'

const code = document.querySelector('code')
const tokens = await parse(code.textContent)
highlight(code, tokens)
```

## Custom colors

Pass a semantic color map as `theme`. CSS color values, including custom
properties, work. Unrecognized token types receive a stable generated color.

```js
highlight(code, tokens, {
  theme: { keyword: 'var(--syntax-keyword)', string: '#147d65' }
})
```

For a built-in palette with the renderer-only API:

```js
const palettes = require('lighthigh/themes.json')
highlight(code, tokens, { theme: palettes['rose-pine-dawn'].colors })
```

## Browser support

Foreground highlighting requires Chrome/Edge 105+, Safari/iOS 17.2+, or Firefox
140+. See [MDN's compatibility data](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::highlight#browser_compatibility).
The one-script setup leaves code readable when the API is missing. With the
renderer-only API, feature-detect `CSS.highlights`, `Highlight`, and `Range`
before calling `highlight()`.

Ranges require a live browser DOM and JavaScript. You can tokenize at build
time, then render those tokens in the browser. For colored HTML without
client-side JavaScript, use a highlighter's HTML renderer.

## Website

Run `npm run dev`, then open `http://localhost:4173`. `npm run build:site`
generates the browser bundle and `themes.json`; `npm run build:icons` renders the
raster icons and social card from `site/favicon.svg`. Deploy `index.html`,
`sitemap.xml`, `.nojekyll` and `site/` together. All scripts and fonts are local.

Run `npm test` for library, adapter, and build checks, and `npm run test:site`
for browser interactions, the one-script lifecycle, and responsive screenshots.
Browser checks require Playwright Chromium (`npx playwright install chromium`).
Screenshots are saved to the system temporary directory.

MIT. [ॐ](https://github.com/krishnized/license)

[CSS Custom Highlight API]: https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
