import test from 'node:test';
import assert from 'node:assert/strict';

import { expandColorMatrices } from '../../src/generator/color-matrix.js';

const block = (name, value = []) => ({ type: 'block', name, value });
const statement = (name, value) => ({ type: 'statement', name, value });

test('direct channels children expand with identity defaults and pass-through attributes', () => {
    let root = block('filter', [block('channels', [
        statement('in', 'SourceGraphic'),
        statement('result', 'tinted'),
        statement('g', 'g - .5r'),
        statement('B', '2 * B + .2'),
    ])]);
    assert.deepEqual(expandColorMatrices(root), block('filter', [block('feColorMatrix', [
        statement('in', 'SourceGraphic'),
        statement('result', 'tinted'),
        statement('type', 'matrix'),
        statement('values', '1 0 0 0 0 -0.5 1 0 0 0 0 0 2 0 0.2 0 0 0 1 0'),
    ])]));
});

test('invalid channel declarations warn and keep identity; later duplicates win', () => {
    let warnings = [];
    let root = block('filter', [block('channels', [
        statement('r', 'b'),
        statement('r', 'g'),
        statement('g', 'r * b'),
        statement('b', ''),
        block('animate'),
    ])]);
    expandColorMatrices(root, message => warnings.push(message));
    assert.equal(root.value[0].value.at(-1).value,
        '0 1 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
    assert.deepEqual(warnings, [
        'channels g: invalid expression "r * b"; keeping identity',
        'channels b: invalid expression ""; keeping identity',
    ]);
});

test('channels blocks outside a filter root or below another element stay unchanged', () => {
    let standalone = block('svg', [block('channels', [statement('r', 'b')])]);
    let nested = block('filter', [block('g', [block('channels', [statement('r', 'b')])])]);
    assert.deepEqual(expandColorMatrices(standalone), standalone);
    assert.deepEqual(expandColorMatrices(nested), nested);
});
