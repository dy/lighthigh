'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Lighthigh = require('..');

test('normalizes common lexer token shapes', () => {
	assert.deepEqual(Lighthigh.normalizeTokens([
		{ offset: 4, length: 2, token: 'number' },
		[0, 3, 'keyword'],
		{ from: 3, to: 4, kind: 'space' }
	], 6), [
		{ start: 0, end: 3, type: 'keyword' },
		{ start: 3, end: 4, type: 'space' },
		{ start: 4, end: 6, type: 'number' }
	]);
});

test('rejects malformed and out-of-bounds tokens', () => {
	assert.throws(() => Lighthigh.normalizeTokens([{ start: 0, end: 8, type: 'x' }], 2), /Invalid token/);
	assert.throws(() => Lighthigh.normalizeTokens(null, 2), /iterable/);
});

test('infers semantic and stable dialect colors', () => {
	const palette = { keyword: 'red', string: 'blue' };
	assert.equal(Lighthigh.inferColor('keyword.control', palette), 'red');
	assert.equal(Lighthigh.inferColor('custom-dialect-token', palette), Lighthigh.inferColor('custom-dialect-token', palette));
	assert.match(Lighthigh.inferColor('custom-dialect-token', palette), /^hsl\(/);
});
