import test from 'node:test';
import assert from 'node:assert/strict';

import { getValue, removeParens } from '../../src/lib/type.js';

test('getValue handles nil and reads one level of `value`', () => {
    // typeof null is 'object': the `'value' in v` check used to throw
    assert.equal(getValue(null), '');
    assert.equal(getValue(undefined), '');
    assert.equal(getValue({ value: null }), '');
    assert.equal(getValue({ type: 'text', value: 'red' }), 'red');
    // nothing nests values, so one level is the contract
    assert.deepEqual(getValue({ value: { value: 'red' } }), { value: 'red' });
    assert.deepEqual(getValue([1, 2]), [1, 2]);
    assert.equal(getValue(0), 0);
    assert.equal(getValue(''), '');
});

test('removeParens unwraps one outer pair only', () => {
    assert.equal(removeParens('(a: 1; b: 2)'), 'a: 1; b: 2');
    assert.equal(removeParens('((1, 2))'), '(1, 2)');
    // a value that merely starts and ends with a group keeps both
    assert.equal(removeParens('(red), (blue)'), '(red), (blue)');
    assert.equal(removeParens('background: rgb(0, 0, 255)'), 'background: rgb(0, 0, 255)');
    assert.equal(removeParens(''), '');
});
