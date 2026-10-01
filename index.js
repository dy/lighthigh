'use strict';

var nextId = 0;

/**
 * Paint lexer output with the CSS Custom Highlight API.
 *
 * Lighthigh deliberately does not parse a language. Pass it any lexer that
 * returns offset based tokens and it becomes the small rendering half of a
 * syntax highlighter.
 */
class Lighthigh {
	constructor(options) {
		options = options || {};
		this.document = options.document || globalThis.document;
		this.registry = options.registry || (globalThis.CSS && CSS.highlights);
		this.Highlight = options.Highlight || globalThis.Highlight;
		this.prefix = options.prefix || 'lighthigh-' + (++nextId);
		this.palette = Object.assign({}, defaultPalette, options.theme);
		this.names = new Set();
		this.style = null;

		if (!this.document || !this.registry || !this.Highlight) {
			throw new Error('Lighthigh requires the CSS Custom Highlight API');
		}
	}

	/** Highlight an element without replacing or wrapping its text nodes. */
	highlight(element, lexer, language) {
		if (!element || typeof lexer !== 'function') {
			throw new TypeError('highlight(element, lexer) expects an element and a lexer function');
		}

		this.clear();
		var text = element.textContent || '';
		var output = lexer(text, language);
		var tokens = normalizeTokens(output, text.length);
		var textNodes = collectTextNodes(element, this.document);
		var grouped = new Map();

		tokens.forEach((token) => {
			var range = rangeForOffsets(textNodes, token.start, token.end, this.document);
			if (!range) return;
			var type = safeName(token.type);
			if (!grouped.has(type)) grouped.set(type, []);
			grouped.get(type).push(range);
		});

		grouped.forEach((ranges, type) => {
			var name = this.prefix + '-' + type;
			this.registry.set(name, new this.Highlight(...ranges));
			this.names.add(name);
		});

		this._setTheme(grouped.keys());
		return this;
	}

	clear() {
		this.names.forEach((name) => this.registry.delete(name));
		this.names.clear();
		if (this.style) this.style.remove();
		this.style = null;
		return this;
	}

	dispose() {
		return this.clear();
	}

	_setTheme(types) {
		var css = [];
		for (var type of types) {
			var color = inferColor(type, this.palette);
			css.push('::highlight(' + this.prefix + '-' + type + ') { color: ' + color + '; }');
		}
		if (!css.length) return;
		this.style = this.document.createElement('style');
		this.style.dataset.lighthigh = this.prefix;
		this.style.textContent = css.join('\n');
		(this.document.head || this.document.documentElement).appendChild(this.style);
	}
}

function normalizeTokens(output, sourceLength) {
	if (output && output.tokens) output = output.tokens;
	if (!output || typeof output[Symbol.iterator] !== 'function') {
		throw new TypeError('The lexer must return an iterable of tokens');
	}

	return Array.from(output, function (token) {
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
	var first = nodes.find((entry) => start >= entry.start && start <= entry.end);
	var last = nodes.find((entry) => end > entry.start && end <= entry.end);
	if (!first || !last) return null;
	var range = document.createRange();
	range.setStart(first.node, start - first.start);
	range.setEnd(last.node, end - last.start);
	return range;
}

function safeName(type) {
	return type.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'plain';
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
	if (palette[lower]) return palette[lower];
	var category = Object.keys(palette).find((key) => lower.includes(key));
	if (category) return palette[category];
	var hash = Array.from(lower).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
	return 'hsl(' + (hash % 360) + ' 55% 38%)';
}

module.exports = Lighthigh;
module.exports.normalizeTokens = normalizeTokens;
module.exports.inferColor = inferColor;
