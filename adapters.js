'use strict';

// Prism nests tokens; offsets count UTF-16 code units, including unstyled text.
exports.prism = function prism(stream) {
	var tokens = [], offset = 0;
	function visit(value, type) {
		if (typeof value === 'string') {
			if (value.length && type) tokens.push({ start: offset, end: offset + value.length, type });
			offset += value.length;
		} else if (Array.isArray(value)) value.forEach(item => visit(item, type));
		else visit(value.content, value.type || type);
	}
	visit(stream);
	return tokens;
};

// Shiki has already resolved the theme. Keep its exact foreground colors.
exports.shiki = function shiki(result) {
	var colors = new Map(), theme = {}, tokens = [];
	for (var line of result.tokens) for (var token of line) {
		var color = token.color || result.fg;
		if (!token.content.length || !color) continue;
		if (!colors.has(color)) {
			var name = 'color-' + colors.size;
			colors.set(color, name);
			theme[name] = color;
		}
		tokens.push({ start: token.offset, end: token.offset + token.content.length, type: colors.get(color) });
	}
	return { tokens, theme };
};

var hljsAliases = {
	'title.function': 'function', 'function_': 'function',
	'title.class': 'type', 'class_': 'type', 'title': 'type',
	'built_in': 'builtin', 'literal': 'constant',
	'attr': 'attribute', 'name': 'tag', 'regexp': 'regex'
};

function normalizeHljs(scope) {
	var clean = String(scope).trim().replace(/^hljs-/, '').replace(/\s+hljs-/g, '.').replace(/\s+/g, '.').replace(/_$/g, '');
	return hljsAliases[clean] || hljsAliases[clean.split('.').pop()] || clean;
}

function decodeHtml(html) {
	return html.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g, (m, dec, hex) =>
		dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) :
		m === '&amp;' ? '&' : m === '&lt;' ? '<' : m === '&gt;' ? '>' : m === '&quot;' ? '"' : "'"
	);
}

// Highlight.js: accepts hljs.highlight() results (emitter tree or HTML) or raw HTML strings.
exports.hljs = function hljs(result) {
	var root = result && typeof result === 'object' && (result._emitter?.rootNode || (Array.isArray(result.children) ? result : null));
	if (root && Array.isArray(root.children)) {
		var tokens = [], offset = 0;
		(function visit(node, scope) {
			if (typeof node === 'string') {
				if (node.length && scope) tokens.push({ start: offset, end: offset + node.length, type: normalizeHljs(scope) });
				offset += node.length;
			} else if (Array.isArray(node)) {
				node.forEach(item => visit(item, scope));
			} else if (node && typeof node === 'object' && Array.isArray(node.children)) {
				visit(node.children, node.scope || scope);
			} else {
				throw new TypeError('Invalid highlight.js token node');
			}
		})(root.children);
		return tokens;
	}
	var html = typeof result === 'string' ? result : result && typeof result === 'object' ? result.value : null;
	if (typeof html !== 'string') throw new TypeError('Expected a highlight.js result or HTML string');
	var out = [], stack = [], pos = 0, tag = /<span\s+class="([^"]*)"\s*>|(<\/span>)/g, match, last = 0;
	while ((match = tag.exec(html))) {
		if (match.index > last) {
			var text = decodeHtml(html.slice(last, match.index));
			if (text.length && stack.length) out.push({ start: pos, end: pos + text.length, type: stack[stack.length - 1] });
			pos += text.length;
		}
		if (match[2]) stack.pop();
		else stack.push(normalizeHljs(match[1]));
		last = tag.lastIndex;
	}
	if (last < html.length) {
		var tail = decodeHtml(html.slice(last));
		if (tail.length && stack.length) out.push({ start: pos, end: pos + tail.length, type: stack[stack.length - 1] });
	}
	return out;
};

var lezerAliases = {
	variableName: 'variable', propertyName: 'property',
	typeName: 'type', className: 'type', namespace: 'type',
	tagName: 'tag', attributeName: 'attribute', attributeValue: 'string',
	bool: 'constant', atom: 'constant',
	lineComment: 'comment', blockComment: 'comment', regexp: 'regex'
};

// Lezer (@lezer/highlight): collects offset ranges from highlightTree(tree, highlighter, put).
exports.lezer = function lezer(tree, highlightTree, highlighter) {
	if (!tree || typeof highlightTree !== 'function' || !highlighter) {
		throw new TypeError('lezer(tree, highlightTree, highlighter) requires a tree, highlightTree, and highlighter');
	}
	var tokens = [];
	highlightTree(tree, highlighter, function (start, end, classes) {
		if (end <= start || !classes) return;
		var parts = String(classes).trim().split(/\s+/).map(c => c.replace(/^tok-/, ''));
		var raw = parts.includes('function') ? 'function' : parts[0];
		tokens.push({ start: start, end: end, type: lezerAliases[raw] || raw });
	});
	return tokens;
};
