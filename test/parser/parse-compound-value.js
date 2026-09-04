import test from 'node:test';
import assert from 'node:assert/strict';

import parseCompoundValue from '../../src/parser/parse-compound-value.js';

test('a number with an optional unit', () => {
    assert.deepEqual(parseCompoundValue(''), {});
    assert.deepEqual(parseCompoundValue('10'), { value: 10 });
    assert.deepEqual(parseCompoundValue('10em'), { value: 10, unit: 'em' });
    assert.deepEqual(parseCompoundValue('-10.5vw'), { value: -10.5, unit: 'vw' });
    assert.deepEqual(parseCompoundValue('10%'), { value: 10, unit: '%' });
});

test('anything past a plain unit is not a unit', () => {
    assert.deepEqual(parseCompoundValue('-10.5 vw'), { value: -10.5 });
    assert.deepEqual(parseCompoundValue('10%2'), { value: 10 });
    assert.deepEqual(parseCompoundValue('1/sin(t)'), { value: 1 });
});
