'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const highlight = require('..');

// The browser suite also exercises real DOM ranges and nested elements.
function fixture(...parts) {
	const registry = new Map(), styles = new Set();
	const document = {
		defaultView: { CSS: { highlights: registry }, Highlight: class extends Set {
			constructor(...ranges) { super(ranges); }
		} },
		createRange() {
			return {
				setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
				setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; }
			};
		},
		createElement() { return { dataset: {}, remove() { styles.delete(this); } }; },
		head: { appendChild(style) { styles.add(style); } }
	};
	// TreeWalker uses nextNode, not the iterator protocol.
	document.createTreeWalker = element => {
		const nodes = element.nodes.values();
		return { nextNode: () => nodes.next().value };
	};
	const element = {
		nodeType: 1, ownerDocument: document, nodes: parts.map(data => ({ data })),
		get textContent() { return this.nodes.map(node => node.data).join(''); }
	};
	return { element, registry, styles, ranges: () => [...registry.values()].flatMap(group => [...group]), css: () => [...styles].map(style => style.textContent).join('\n') };
}

test('one function accepts tokens, iterables, wrapped tokens, and a synchronous lexer', () => {
	const { element, ranges, styles } = fixture('let 42');
	const tokens = [{ offset: 4, length: 2, token: 'number' }, [0, 3, 'keyword'], { from: 3, to: 4, kind: 'space' }];
	for (const input of [tokens, new Set(tokens), { tokens }, (source, language) => {
		assert.equal(source, 'let 42'); assert.equal(language, 'javascript'); return tokens;
	}]) {
		const clear = highlight(element, input, { language: 'javascript' });
		assert.deepEqual(ranges().map(range => [range.startOffset, range.endOffset]), [[0, 3], [3, 4], [4, 6]]);
		assert.equal(styles.size, 1);
		clear();
		assert.deepEqual(ranges(), []); assert.equal(styles.size, 0);
	}
});

test('empty source, zero tokens, smallest input, and final text-node boundaries', () => {
	for (const parts of [[], [''], ['1'], ['', '1', ''], ['1', '2'], ['12', ''], ['😀', '', 'x']]) {
		const { element, ranges, styles } = fixture(...parts);
		const nodes = element.nodes.slice(), length = element.textContent.length;
		const clear = highlight(element, length ? [[length - 1, length, 'number']] : []);
		assert.equal(ranges().length, length ? 1 : 0);
		if (length) {
			const node = nodes.findLast(node => node.data.length);
			assert.equal(ranges()[0].startContainer, node);
			assert.equal(ranges()[0].endContainer, node);
			assert.equal(ranges()[0].startOffset, node.data.length - 1);
			assert.equal(ranges()[0].endOffset, node.data.length);
		}
		highlight(element, []);
		assert.deepEqual(ranges(), []); assert.equal(styles.size, 0);
		clear(); clear();
		assert.deepEqual(element.nodes, nodes);
	}
});

test('ranges cross split text nodes without replacing them', () => {
	const { element, ranges } = fixture('', 'a', '', '😀', 'b', '');
	highlight(element, [[0, 4, 'string'], [1, 3, 'keyword']]);
	assert.deepEqual(ranges().map(r => [element.nodes.indexOf(r.startContainer), r.startOffset, element.nodes.indexOf(r.endContainer), r.endOffset]), [[1, 0, 4, 1], [3, 0, 3, 2]]);
});

test('A → A → B replaces ranges; stale cleanup cannot erase newer highlights or another block', () => {
	const { element, registry, styles, ranges } = fixture('1');
	const other = { ...element, textContent: '2', nodes: [{ data: '2' }] };
	const clearOther = highlight(other, [[0, 1, 'number']]);
	const first = highlight(element, [[0, 1, 'number']]);
	const second = highlight(element, [[0, 1, 'number']]);
	assert.equal(registry.size, 2); assert.equal(styles.size, 2);
	element.nodes = [{ data: 'let x' }];
	const third = highlight(element, [[0, 3, 'keyword']], { theme: { keyword: 'red' } });
	first(); second(); first();
	assert.equal(registry.size, 2); assert.equal(styles.size, 2);
	assert.deepEqual(ranges().map(r => [r.startContainer.data, r.startOffset, r.endOffset]), [['2', 0, 1], ['let x', 0, 3]]);
	third(); third();
	assert.equal(registry.size, 1); assert.equal(styles.size, 1);
	clearOther(); assert.equal(registry.size, 0); assert.equal(styles.size, 0);
});

test('invalid tokens and lexer errors preserve the last successful highlighting', () => {
	const { element, registry, styles } = fixture('1');
	highlight(element, [[0, 1, 'number']]);
	const original = [...registry], originalStyles = [...styles];
	for (const tokens of [null, undefined, {}, [null], [1], [[-1, 1, 'x']], [[0, 2, 'x']], [[0, 0, 'x']], [[0.5, 1, 'x']], [[0, 1]], [[0, 1, 'x'], [0, 9, 'x']], () => { throw new Error('lexer failed'); }]) {
		assert.throws(() => highlight(element, tokens));
		assert.deepEqual([...registry], original); assert.deepEqual([...styles], originalStyles);
	}
	assert.throws(() => highlight(null, []), /expects an element/);
	delete element.ownerDocument.defaultView.CSS.highlights;
	assert.throws(() => highlight(element, []), /requires/);
	assert.deepEqual([...registry], original);
});

test('exact and semantic colors stay distinct, including names that previously collided', () => {
	const { element, registry, css } = fixture('abcd');
	const tokens = [[0, 1, 'keyword.control'], [1, 2, 'keyword-control'], [2, 3, 'custom'], [3, 4, 'constructor']];
	const theme = { 'keyword.control': 'red', keyword: 'blue' };
	highlight(element, tokens, { theme });
	assert.equal(registry.size, 4);
	const colors = css().match(/color: [^;]+/g);
	assert.deepEqual(colors.slice(0, 2), ['color: red', 'color: blue']);
	assert.match(colors[2], /^color: hsl\(/); assert.match(colors[3], /^color: hsl\(/);
	highlight(element, tokens, { theme });
	assert.deepEqual(css().match(/color: [^;]+/g), colors);
});
