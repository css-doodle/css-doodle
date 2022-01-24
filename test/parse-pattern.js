import test from 'ava';

import parsePattern from '../src/parser/parse-pattern';
import compare from './_compare';
compare.use(parsePattern);

test('edge cased', t => {
  compare(t, 'match()) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: [],
  }]);

  compare(t, 'match(1)) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['1'],
  }]);

  compare(t, 'a,,,{}', [{
    type: 'block',
    name: 'a',
    value: [],
    args: [],
  }]);

  compare(t, 'a, a {}', [{
    type: 'block',
    name: 'a',
    value: [],
    args: [],
  }]);
});

test('statement', t => {
  compare(t, 'color: red', [{
    type: 'statement',
    name: 'color',
    value: 'red'
  }]);

  compare(t, 'color: red;', [{
    type: 'statement',
    name: 'color',
    value: 'red'
  }]);
});

test('block', t => {
  compare(t, 'match {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: [],
  }]);
  compare(t, 'match(x>y) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['x>y'],
  }]);
  compare(t, 'match(x>y, 2*x-y == 0) {}', [{
    type: 'block',
    name: 'match',
    value: [],
    args: ['x>y', '2*x-y == 0'],
  }]);
  compare(t, 'a, b {}', [{
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
  compare(t, 'match(2), match {}', [{
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

test('statement and block', t => {
  let input = `
    color: red;
    match(x>y) {
      color: blue;
    }
  `;

  compare(t, input, [{
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
