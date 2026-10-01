# lighthigh

The small rendering half of a syntax highlighter.

Lighthigh takes offset-based tokens from **any** lexer (including a GPU lexer)
and paints them with the [CSS Custom Highlight API]. It has no grammars, does
not wrap tokens in spans, and does not change the DOM. The lexer owns languages
and dialects; lighthigh owns ranges and theme colors.

```sh
npm install lighthigh
```

```js
const Lighthigh = require('lighthigh')
const highlighter = new Lighthigh({
  theme: { keyword: '#ff7b72', string: '#a5d6ff' }
})

// A GPU lexer adapter only needs to produce these offsets.
highlighter.highlight(document.querySelector('code'), (source, language) =>
  gpuLexer(source, language).map(token => ({
    start: token.offset,
    end: token.offset + token.length,
    type: token.kind
  })),
  'javascript'
)
```

Accepted token shapes include `{start, end, type}`, `{from, to, kind}`,
`{offset, length, token}`, and `[start, end, type]`. A lexer may also return
`{tokens: iterable}`.

## Themes that follow the lexer

Token vocabularies differ between lexers. Lighthigh therefore discovers token
types from each result and generates only the required `::highlight()` rules.
Known semantic names use a compact default palette; dialect-specific names such
as `decorator.builtin` receive a stable color derived from their name. Override
either exact token names or broad semantic names with `theme`.

```js
const highlighter = new Lighthigh({
  theme: {
    comment: 'oklch(60% 0.03 250)',
    'decorator.builtin': 'oklch(70% 0.18 310)'
  }
})
```

Call `clear()` before reusing the page without highlighting, or `dispose()` when
the highlighter is no longer needed. Calling `highlight()` again replaces its
previous ranges and generated stylesheet.

## Why this project exists

Full highlighters already solve parsing well. Lighthigh is intentionally a
zero-markup interoperability layer between experimental or high-throughput
lexers and native browser painting. Because the source DOM remains untouched,
selection, copy/paste, search, accessibility trees, and framework hydration do
not have to understand generated token spans.

The API requires browser support for `CSS.highlights`, `Highlight`, and `Range`.
Feature-detect these APIs if older browsers are in scope.

[CSS Custom Highlight API]: https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
