'use strict';

var nextId = 0;
var active = new WeakMap();

/** Paint tokens without changing text nodes. Returns an idempotent cleanup. */
function highlight(element, tokens, options) {
	if (!element || element.nodeType !== 1) throw new TypeError('highlight(element, tokens) expects an element');
	options = options || {};
	var document = element.ownerDocument;
	var view = document.defaultView || globalThis;
	var registry = view.CSS && view.CSS.highlights;
	if (!registry || !view.Highlight) throw new Error('Lighthigh requires the CSS Custom Highlight API');

	var text = element.textContent || '';
	if (typeof tokens === 'function') tokens = tokens(text, options.language);
	tokens = normalizeTokens(tokens, text.length);
	var nodes = collectTextNodes(element, document);
	var grouped = new Map();
	for (var token of tokens) {
		var range = rangeForOffsets(nodes, token.start, token.end, document);
		if (!range) continue;
		if (!grouped.has(token.type)) grouped.set(token.type, []);
		grouped.get(token.type).push(range);
	}

	var prefix = 'lighthigh-' + (++nextId);
	var palette = Object.assign({}, defaultPalette, options.theme);
	var entries = [], css = [];
	grouped.forEach((ranges, type) => {
		var name = prefix + '-' + entries.length;
		entries.push([name, new view.Highlight(...ranges)]);
		css.push('::highlight(' + name + ') { color: ' + inferColor(type, palette) + '; }');
	});
	var style = css.length ? document.createElement('style') : null;
	if (style) {
		style.dataset.lighthigh = prefix;
		style.textContent = css.join('\n');
	}

	// Prepare first: invalid tokens must not erase the current highlighting.
	var previous = active.get(element);
	if (previous) previous();
	for (var [name, value] of entries) registry.set(name, value);
	if (style) (document.head || document.documentElement).appendChild(style);
	active.set(element, clear);
	return clear;

	function clear() {
		for (var [name] of entries) registry.delete(name);
		if (style) style.remove();
		if (active.get(element) === clear) active.delete(element);
	}
}

function normalizeTokens(output, sourceLength) {
	if (output && output.tokens) output = output.tokens;
	if (!output || typeof output[Symbol.iterator] !== 'function') {
		throw new TypeError('The lexer must return an iterable of tokens');
	}

	return Array.from(output, function (token) {
		if (!token || typeof token !== 'object') throw new TypeError('Invalid token: expected an object or tuple');
		var start = number(token.start, token.from, token.offset, token[0]);
		var end = number(token.end, token.to, token[1]);
		if (end === undefined && start !== undefined && token.length !== undefined) end = start + token.length;
		var type = token.type || token.kind || token.scope || token.token || token[2];
		if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceLength || !type) {
			throw new TypeError('Invalid token: expected {start, end, type} within the source');
		}
		return { start: start, end: end, type: String(type) };
	}).sort(function (a, b) { return a.start - b.start || a.end - b.end; });
}

function number() {
	for (var i = 0; i < arguments.length; i++) if (arguments[i] !== undefined) return arguments[i];
}

function collectTextNodes(root, document) {
	var nodes = [];
	var walker = document.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
	var offset = 0;
	var node;
	while ((node = walker.nextNode())) {
		nodes.push({ node: node, start: offset, end: offset + node.data.length });
		offset += node.data.length;
	}
	return nodes;
}

function rangeForOffsets(nodes, start, end, document) {
	var first = nodes.find((entry) => start >= entry.start && start < entry.end);
	var last = nodes.find((entry) => end > entry.start && end <= entry.end);
	if (!first || !last) return null;
	var range = document.createRange();
	range.setStart(first.node, start - first.start);
	range.setEnd(last.node, end - last.start);
	return range;
}

var defaultPalette = {
	comment: '#6a737d',
	keyword: '#d73a49',
	operator: '#d73a49',
	string: '#032f62',
	number: '#005cc5',
	constant: '#005cc5',
	function: '#6f42c1',
	type: '#22863a',
	variable: '#e36209',
	property: '#005cc5',
	tag: '#22863a',
	attribute: '#6f42c1'
};

function inferColor(type, palette) {
	var lower = type.toLowerCase();
	if (Object.hasOwn(palette, lower) && palette[lower]) return palette[lower];
	var category = Object.keys(palette).find((key) => lower.includes(key));
	if (category) return palette[category];
	var hash = Array.from(lower).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
	return 'hsl(' + (hash % 360) + ' 55% 38%)';
}

module.exports = highlight;
