import test from 'node:test';
import assert from 'node:assert/strict';

import parseVar from '../../src/parser/parse-var.js';

test('only well-formed var(--name) reads', () => {
    assert.deepEqual(parseVar(''), []);
    assert.deepEqual(parseVar('var'), []);
    assert.deepEqual(parseVar('var('), []);
    assert.deepEqual(parseVar('var()'), []);
    assert.deepEqual(parseVar('var(--)'), []);
    assert.deepEqual(parseVar('var(---)'), []);
    assert.deepEqual(parseVar('var(abc)'), []);
    assert.deepEqual(parseVar('var(-abc)'), []);
    assert.deepEqual(parseVar('var(--abc)'), [{ name: '--abc' }]);
    assert.deepEqual(parseVar('var(--abc-d)'), [{ name: '--abc-d' }]);
    assert.deepEqual(parseVar('var(--abc--d)'), [{ name: '--abc--d' }]);
});

test('fallback values nest', () => {
    assert.deepEqual(parseVar('var(--a, var(--b))'), [
        { name: '--a', fallback: [{ name: '--b' }] },
    ]);
    assert.deepEqual(parseVar('var(--a, var(--b), var(--c))'), [
        { name: '--a', fallback: [{ name: '--b' }, { name: '--c' }] },
    ]);
    assert.deepEqual(parseVar('var(--a, var(--b, var(--c))'), [
        { name: '--a', fallback: [{ name: '--b', fallback: [{ name: '--c' }] }] },
    ]);
});

test('comma-separated vars, stray commas and invalid entries', () => {
    assert.deepEqual(parseVar('var(--a), var(--b)'), [{ name: '--a' }, { name: '--b' }]);
    assert.deepEqual(parseVar('var(--a),, var(--b)'), [{ name: '--a' }, { name: '--b' }]);
    assert.deepEqual(parseVar('var(--a), var(abc)'), [{ name: '--a' }]);
    assert.deepEqual(parseVar('var(--a), var(--b,,var(--c), d)'), [
        { name: '--a' },
        { name: '--b', fallback: [{ name: '--c' }] },
    ]);
});
