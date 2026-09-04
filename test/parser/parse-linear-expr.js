import test from 'node:test';
import assert from 'node:assert/strict';

import parseLinearExpr from '../../src/parser/parse-linear-expr.js';

test('an+b expressions', () => {
    assert.deepEqual(parseLinearExpr('2n + 3'), { a: 2, b: 3 });
    assert.deepEqual(parseLinearExpr('2n - 3'), { a: 2, b: -3 });
    assert.deepEqual(parseLinearExpr('2n'), { a: 2, b: 0 });
    assert.deepEqual(parseLinearExpr('2'), { a: 0, b: 2 });
    assert.deepEqual(parseLinearExpr('-10n + 3'), { a: -10, b: 3 });
    assert.deepEqual(parseLinearExpr('2n + 3n + 5'), { a: 5, b: 5 });
    assert.deepEqual(parseLinearExpr(''), { a: 0, b: 0 });
});

test('invalid input reports an error', () => {
    assert.deepEqual(parseLinearExpr('2n 3'), { a: 0, b: 0, error: 'Syntax error' });
    assert.deepEqual(parseLinearExpr('2n * 3'), { a: 0, b: 0, error: 'Unexpected *' });
});
