import test from 'node:test';
import assert from 'node:assert/strict';

import parseLinearExpr, { parseLinear } from '../../src/parser/parse-linear-expr.js';

test('an+b expressions', () => {
    assert.deepEqual(parseLinearExpr('2n + 3'), { a: 2, b: 3 });
    assert.deepEqual(parseLinearExpr('2n - 3'), { a: 2, b: -3 });
    assert.deepEqual(parseLinearExpr('2n'), { a: 2, b: 0 });
    assert.deepEqual(parseLinearExpr('2'), { a: 0, b: 2 });
    assert.deepEqual(parseLinearExpr('-10n + 3'), { a: -10, b: 3 });
    assert.deepEqual(parseLinearExpr('2n + 3n + 5'), { a: 5, b: 5 });
    assert.deepEqual(parseLinearExpr(''), { a: 0, b: 0 });
});

test('a negative number after a term subtracts', () => {
    assert.deepEqual(parseLinearExpr('2n -3'), { a: 2, b: -3 });
    assert.deepEqual(parseLinearExpr('2 -3'), { a: 0, b: -1 });
    assert.deepEqual(parseLinearExpr('n -3n'), { a: -2, b: 0 });
    assert.deepEqual(parseLinearExpr('2n - -3'), { a: 2, b: 3 });
    assert.deepEqual(parseLinearExpr('2 * -3'), { a: 0, b: 0, error: 'Syntax error' });
});

test('cached results do not mix up input and names', () => {
    assert.deepEqual(parseLinear('a,b', ['c']).coefficients, [0]);
    assert.deepEqual(parseLinear('a', ['b', 'c']).coefficients, [0, 0]);
});

test('invalid input reports an error', () => {
    assert.deepEqual(parseLinearExpr('2n 3'), { a: 0, b: 0, error: 'Syntax error' });
    assert.deepEqual(parseLinearExpr('2n * 3'), { a: 0, b: 0, error: 'Unexpected *' });
});

const RGBA = ['r', 'g', 'b', 'a'];

test('linear combinations of several names', () => {
    assert.deepEqual(parseLinear('g - .5r', RGBA), {
        coefficients: [-.5, 1, 0, 0], constant: 0,
    });
    assert.deepEqual(parseLinear('g -.5r', RGBA), {
        coefficients: [-.5, 1, 0, 0], constant: 0,
    });
    assert.deepEqual(parseLinear('.2 + 2 * b', RGBA), {
        coefficients: [0, 0, 2, 0], constant: .2,
    });
    assert.deepEqual(parseLinear('-.25r + .5g + b + .8a - .1', RGBA), {
        coefficients: [-.25, .5, 1, .8], constant: -.1,
    });
    assert.deepEqual(parseLinear('r + .5r - .25r', RGBA), {
        coefficients: [1.25, 0, 0, 0], constant: 0,
    });
    assert.deepEqual(parseLinear('1e-10r + .1 + .2', RGBA), {
        coefficients: [1e-10, 0, 0, 0], constant: .1 + .2,
    });
});

test('linear combinations reject anything else', () => {
    for (let [input, error] of [
        ['r * g', 'Unexpected *'],
        ['sin(r)', 'Unexpected sin'],
        ['r / 2', 'Unexpected /'],
        ['50%', 'Unexpected %'],
        ['.5(r + g)', 'Unexpected ('],
        ['r 2', 'Syntax error'],
        ['r2', 'Syntax error'],
        ['2 3', 'Syntax error'],
        ['.5 *', 'Syntax error'],
        ['* r', 'Unexpected *'],
        ['r *', 'Unexpected *'],
        ['r +', 'Syntax error'],
        ['r + + g', 'Unexpected +'],
        ['x + 1', 'Unexpected x'],
        ['1e999', 'Overflow'],
    ]) {
        assert.deepEqual(parseLinear(input, RGBA), {
            coefficients: [0, 0, 0, 0], constant: 0, error,
        }, input);
    }
});
