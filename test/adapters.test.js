'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Prism = require('prismjs');
const adapters = require('../adapters');

const render = (source, tokens) => tokens.map(t => [t.type, source.slice(t.start, t.end)]);

test('Prism adapter handles empty input, final boundaries, A → A and A → B without carrying offsets', () => {
  const cases = [
    ['', []], ['a', []], ['1', [['number', '1']]], ['1', [['number', '1']]],
    ['const x=', [['keyword', 'const'], ['operator', '=']]],
    ['const x=1', [['keyword', 'const'], ['operator', '='], ['number', '1']]],
    ['const x=1\n', [['keyword', 'const'], ['operator', '='], ['number', '1']]],
    ['1', [['number', '1']]]
  ];
  for (const [source, expected] of cases) {
    const tokens = adapters.prism(Prism.tokenize(source, Prism.languages.js));
    assert.deepEqual(render(source, tokens), expected);
  }
});

test('Prism adapter preserves nested leaf types, unstyled gaps and UTF-16 offsets', () => {
  const source = '😀<a href="x">कृष्ण</a>';
  const tokens = adapters.prism(Prism.tokenize(source, Prism.languages.html));
  assert.deepEqual(render(source, tokens), [
    ['punctuation', '<'], ['tag', 'a'], ['tag', ' '], ['attr-name', 'href'], ['punctuation', '='],
    ['punctuation', '"'], ['attr-value', 'x'], ['punctuation', '"'], ['punctuation', '>'],
    ['punctuation', '</'], ['tag', 'a'], ['punctuation', '>']
  ]);
  assert.equal(tokens[0].start, 2);
  assert.equal(tokens.at(-1).end, source.length);
  assert.deepEqual(adapters.prism([{ type: 'outer', content: ['a', { type: 'inner', content: 'b' }, 'c'] }]), [
    { start: 0, end: 1, type: 'outer' }, { start: 1, end: 2, type: 'inner' }, { start: 2, end: 3, type: 'outer' }
  ]);
});

test('Shiki adapter preserves real theme colors and source offsets across CRLF and Unicode', async () => {
  const { createHighlighter } = await import('shiki');
  const highlighter = await createHighlighter({ themes: ['github-light', 'nord'], langs: ['javascript'] });
  try {
    for (const source of ['', '1', '1', 'const x=', 'const x=1', 'const x=1\n', 'const x="😀"\r\n// कृष्ण', '1']) {
      for (const themeName of ['github-light', 'nord']) {
        const result = highlighter.codeToTokens(source, { lang: 'javascript', theme: themeName });
        const { tokens, theme } = adapters.shiki(result);
        assert.deepEqual(tokens.map(t => ({ content: source.slice(t.start, t.end), offset: t.start, color: theme[t.type] })), result.tokens.flat().filter(t => t.content.length).map(t => ({ content: t.content, offset: t.offset, color: t.color || result.fg })));
        if (!source) assert.deepEqual({ tokens, theme }, { tokens: [], theme: {} });
        if (source === 'const x=1') assert.equal(theme[tokens[0].type], themeName === 'github-light' ? '#D73A49' : '#81A1C1');
      }
    }
  } finally { highlighter.dispose(); }
});

test('Shiki adapter deduplicates colors, skips empty tokens, and uses foreground fallback', () => {
  assert.deepEqual(adapters.shiki({ fg: 'red', tokens: [[{ content: '', offset: 0 }, { content: 'a', offset: 0 }, { content: 'b', offset: 1, color: 'red' }]] }), {
    tokens: [{ start: 0, end: 1, type: 'color-0' }, { start: 1, end: 2, type: 'color-0' }], theme: { 'color-0': 'red' }
  });
  assert.deepEqual(adapters.shiki({ tokens: [[{ content: 'x', offset: 0 }]] }), { tokens: [], theme: {} });
});

test('adapters reject malformed input without carrying partial state into the next call', () => {
  for (const input of [null, [null], [{ type: 'number', content: '1' }, null]]) {
    assert.throws(() => adapters.prism(input), TypeError);
    assert.deepEqual(adapters.prism([{ type: 'number', content: '2' }]), [{ start: 0, end: 1, type: 'number' }]);
  }
  for (const input of [null, {}, { tokens: [[null]] }, { tokens: [[{ content: '1', offset: 0, color: 'red' }, null]] }]) {
    assert.throws(() => adapters.shiki(input), TypeError);
    assert.deepEqual(adapters.shiki({ tokens: [[{ content: '2', offset: 0, color: 'blue' }]] }), {
      tokens: [{ start: 0, end: 1, type: 'color-0' }], theme: { 'color-0': 'blue' }
    });
  }
  for (const input of [null, {}, { _emitter: { rootNode: { children: [123] } } }]) {
    assert.throws(() => adapters.hljs(input), TypeError);
  }
  for (const input of [[null, () => {}, {}], [{}, null, {}], [{}, () => {}, null]]) {
    assert.throws(() => adapters.lezer(...input), TypeError);
  }
});

test('hljs adapter handles emitter trees, nested scopes, and HTML strings with entities', () => {
  const source = 'function greet(x) { return "<ok>"; }';
  const emitterResult = {
    _emitter: {
      rootNode: {
        children: [
          { scope: 'keyword', children: ['function'] },
          ' ',
          { scope: 'title.function', children: ['greet'] },
          '(x) { ',
          { scope: 'keyword', children: ['return'] },
          ' ',
          { scope: 'string', children: ['"<ok>"'] },
          '; }'
        ]
      }
    }
  };
  const expected = [
    ['keyword', 'function'],
    ['function', 'greet'],
    ['keyword', 'return'],
    ['string', '"<ok>"']
  ];
  assert.deepEqual(render(source, adapters.hljs(emitterResult)), expected);

  const htmlResult = {
    value: '<span class="hljs-keyword">function</span> <span class="hljs-title function_">greet</span>(x) { <span class="hljs-keyword">return</span> <span class="hljs-string">&quot;&lt;ok&gt;&quot;</span>; }'
  };
  assert.deepEqual(render(source, adapters.hljs(htmlResult)), expected);
  assert.deepEqual(render(source, adapters.hljs(htmlResult.value)), expected);
});

test('lezer adapter normalizes tok- classes and function modifiers', () => {
  const source = 'const greet = (x) => x';
  const mockTree = {};
  const mockHighlighter = {};
  const mockHighlightTree = (tree, highlighter, put) => {
    assert.equal(tree, mockTree);
    assert.equal(highlighter, mockHighlighter);
    put(0, 5, 'tok-keyword');
    put(6, 11, 'tok-variableName tok-function tok-definition');
    put(15, 16, 'tok-variableName');
  };
  const tokens = adapters.lezer(mockTree, mockHighlightTree, mockHighlighter);
  assert.deepEqual(render(source, tokens), [
    ['keyword', 'const'],
    ['function', 'greet'],
    ['variable', 'x']
  ]);
});
