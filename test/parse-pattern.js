import test from 'node:test';

import parsePattern from '../src/parser/parse-pattern.js';
import compare from './_compare.js';

compare.use(parsePattern);

test('edge cased', () => {
  compare('match()) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: [],
  }]);

  compare('match(1)) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['1'],
  }]);

  compare('a,,,{}', [{
    type: 'block',
    name: 'a',
    value: [],
    args: [],
  }]);

  compare('a, a {}', [{
    type: 'block',
    name: 'a',
    value: [],
    args: [],
  }]);
});

test('statement', () => {
  compare('color: red', [{
    type: 'statement',
    name: 'color',
    value: 'red'
  }]);

  compare('color: red;', [{
    type: 'statement',
    name: 'color',
    value: 'red'
  }]);
});

test('block', () => {
  compare('match {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: [],
  }]);
  compare('match(x>y) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['x>y'],
  }]);
  compare('match(x>y, 2*x-y == 0) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['x>y', '2*x-y == 0'],
  }]);
  compare('a, b {}', [{
    type: 'block',
    name: 'a',
    value: [],
    args: [],
  }, {
    type: 'block',
    name: 'b',
    value: [],
    args: [],
  }]);
  compare('match(2), match {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['2'],
  }, {
    type: 'block',
    name: 'match',
    value: [],
    args: [],
  }]);
});

test('statement and block',  () => {
  let input = `
    color: red;
    match(x>y) {
      color: blue;
    }
  `;

  compare(input, [{
    type: 'statement',
    name: 'color',
    value: 'red'
  }, {
    type: 'block',
    name: 'match',
    args: ['x>y'],
    value: [{
      type: 'statement',
      name: 'color',
      value: 'blue'
    }],

  }]);
});
