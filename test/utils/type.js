import test from 'node:test';
import assert from 'node:assert/strict';

import { getValue } from '../../src/utils/type.js';

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
