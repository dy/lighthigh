'use strict';

const highlight = require('../index.js');
const { prism } = require('../adapters.js');
const themes = require('../themes.json');
const previousPrism = globalThis.Prism;
globalThis.Prism = { manual: true, disableWorkerMessageHandler: true };
const Prism = require('prismjs');
require('prismjs/components/prism-typescript');
require('prismjs/components/prism-jsx');
require('prismjs/components/prism-tsx');
require('prismjs/components/prism-json');
require('prismjs/components/prism-python');
require('prismjs/components/prism-bash');
require('prismjs/components/prism-sql');
require('prismjs/components/prism-go');
require('prismjs/components/prism-rust');
require('prismjs/components/prism-markdown');
require('prismjs/components/prism-yaml');
if (previousPrism === undefined) delete globalThis.Prism;
else globalThis.Prism = previousPrism;

const selector = '[data-lighthigh], .lighthigh';
const cleanups = new Map();
const defaultTheme = document.currentScript?.dataset.theme || 'github-light';
const supported = () => !!(globalThis.CSS?.highlights && globalThis.Highlight && globalThis.Range);

function tokenize(source, language = 'javascript') {
	const grammar = Prism.languages[language];
	if (!Object.hasOwn(Prism.languages, language) || !grammar || typeof grammar !== 'object') throw new Error('Language not bundled: ' + language);
	return prism(Prism.tokenize(source, grammar));
}

function highlightAll(root = document) {
	if (!supported()) return;
	const matches = [...root.querySelectorAll(selector)];
	if (root.matches?.(selector)) matches.unshift(root);
	const elements = new Set(matches.map(el => el.querySelector('code') || el));
	const ancestors = new Set();
	for (const element of elements) for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		ancestors.add(parent);
		elements.delete(parent);
	}
	// Reconcile previous targets too: a new marked child can replace its parent.
	for (const [element, clear] of cleanups) if (!element.isConnected || !element.closest(selector) || ancestors.has(element) || (root.contains(element) && !elements.has(element))) {
		clear();
		cleanups.delete(element);
	}
	for (const element of elements) {
		const marker = element.closest(selector);
		const language = element.dataset.language || marker.dataset.language ||
			(element.className + ' ' + marker.className).match(/\blanguage-([\w-]+)/)?.[1] || marker.dataset.lighthigh || 'javascript';
		const themeName = element.dataset.theme || marker.dataset.theme || defaultTheme;
		const theme = Object.hasOwn(themes, themeName) ? themes[themeName] : themes['github-light'];
		if (!Object.hasOwn(Prism.languages, language) || typeof Prism.languages[language] !== 'object') {
			cleanups.get(element)?.();
			cleanups.delete(element);
			console.warn('Lighthigh: language not bundled: ' + language);
			continue;
		}
		cleanups.set(element, highlight(element, tokenize, { language, theme: theme.colors }));
		element.style.color = theme.foreground;
		(element.closest('pre') || element).style.backgroundColor = theme.background;
	}
}

function dispose() {
	for (const clear of cleanups.values()) clear();
	cleanups.clear();
}

// Export the same lexer for the live demo; no second implementation to drift.
module.exports = { highlightAll, dispose, tokenize, themes, highlight };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => highlightAll(), { once: true });
else highlightAll();
