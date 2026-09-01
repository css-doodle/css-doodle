import test from 'node:test';
import assert from 'node:assert/strict';

import { getValue } from '../src/utils/type.js';

test('getValue handles nil and boxed values', () => {
  // typeof null is 'object': the 'value' in v check used to throw
  assert.equal(getValue(null), '');
  assert.equal(getValue(undefined), '');
  assert.equal(getValue({ value: null }), '');
  assert.equal(getValue({ value: { value: 'red' } }), 'red');
  assert.equal(getValue(0), 0);
  assert.equal(getValue(''), '');
});
