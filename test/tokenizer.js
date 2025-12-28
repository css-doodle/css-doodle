import test from 'node:test';

import { scan } from '../src/parser/tokenizer.js';
import compare from './_compare.js';

compare.use(input => {
  return Array.from(scan(input)).map(n => {
    let ret = {
      type: n.type,
      value: n.value
    };
    if (n.status) {
      ret.status = n.status;
    }
    return ret;
  });
});

test('basic', () => {

  compare('', []);

  compare('abc p', [
    { type: 'Word', value: 'abc' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'p' },
  ]);

  compare('abc @p', [
    { type: 'Word', value: 'abc' },
    { type: 'Space', value: ' ' },
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'p' },
  ]);

  compare('color: red;', [
    { type: 'Word', value: 'color' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

  compare('@pick(red, blue)', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'pick' },
    { type: 'Symbol', value: '(' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'blue' },
    { type: 'Symbol', value: ')' },
  ]);

  compare('@position: top  right', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'position' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'top'},
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'right' },
  ]);

  compare('content: "hello: world"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'hello' },
    { type: 'Symbol', value: ':' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'world' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare('x, y: red;', [
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'y' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

});

test('escape', () => {

  compare('content: "\\"hello"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '"hello' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare('content: "\\@p"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '@p' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare('content: \\"x"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: '\\' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

});

test('numbers', () => {

  compare('padding: 0 10px', [
    { type: 'Word', value: 'padding' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '0' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'px' },
  ]);

  compare('opacity:.5', [
    { type: 'Word', value: 'opacity' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '.5' },
  ]);

  compare('0.5', [
    { type: 'Number', value: '0.5' },
  ]);

  compare('.5', [
    { type: 'Number', value: '.5' },
  ]);

  compare('.5px', [
    { type: 'Number', value: '.5' },
    { type: 'Word', value: 'px' },
  ]);

  compare('0..5', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: '..' },
    { type: 'Number', value: '5' },
  ]);

  compare('0.5.9', [
    { type: 'Number', value: '0.5' },
    { type: 'Number', value: '.9' },
  ]);

  compare('10e9', [
    { type: 'Number', value: '10e9' },
  ]);
  compare('.5E9px', [
    { type: 'Number', value: '.5E9' },
    { type: 'Word', value: 'px' },
  ]);

  compare('10e+9', [
    { type: 'Number', value: '10e+9' },
  ]);

  compare('10e-9', [
    { type: 'Number', value: '10e-9' },
  ]);

  compare('10e+-9', [
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'e' },
    { type: 'Symbol', value: '+' },
    { type: 'Number', value: '-9' },
  ]);

  compare('0x', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: 'x' },
  ]);

  compare('0x12af', [
    { type: 'Number', value: '0x12af' }
  ]);

  compare('0x12afga', [
    { type: 'Number', value: '0x12af' },
    { type: 'Word', value: 'ga' },
  ]);

  compare('-10', [
    { type: 'Number', value: '-10' }
  ]);

  compare('n-10', [
    { type: 'Word', value: 'n' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '10' },
  ]);

  compare('5-10', [
    { type: 'Number', value: '5' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '10' },
  ]);

  compare('n - 10', [
    { type: 'Word', value: 'n' },
    { type: 'Space', value: ' ' },
    { type: 'Symbol', value: '-' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '10' },
  ]);

  compare('n -10', [
    { type: 'Word', value: 'n' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '-10' },
  ]);

});

test('comments', () => {

  compare('/* color: red', []);
  compare('/* color: red */', []);
  compare('/*/', []);
  compare('/**/', []);
  compare('/***/', []);
  compare(
    `
      /**
       * ignore me
       *
       */

      color:red
    `,
    [
      { type: 'Word', value: 'color' },
      { type: 'Symbol', value: ':' },
      { type: 'Word', value: 'red' },
    ]
  );

  compare(
    `
      /* ignore me */

      color:red

      /* ignore me */

    `,
    [
      { type: 'Word', value: 'color' },
      { type: 'Symbol', value: ':' },
      { type: 'Word', value: 'red' },
    ]
  );

});


test('svg', () => {

  compare('<svg></svg>', [
    { type: 'Symbol', value: '<' },
    { type: 'Word', value: 'svg' },
    { type: 'Symbol', value: '>' },
    { type: 'Symbol', value: '<' },
    { type: 'Symbol', value: '/' },
    { type: 'Word', value: 'svg' },
    { type: 'Symbol', value: '>' }
  ]);

  compare('<circle r="@r(10)" />', [
    { type: 'Symbol', value: '<' },
    { type: 'Word', value: 'circle' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'r' },
    { type: 'Symbol', value: '=' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'r' },
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '10' },
    { type: 'Symbol', value: ')' },
    { type: 'Symbol', value: '"', status: 'close' },
    { type: 'Space', value: ' ' },
    { type: 'Symbol', value: '/' },
    { type: 'Symbol', value: '>' }
  ]);

});

test('dot symbols', () => {
  compare('1 _.1px', [
    { type: 'Number', value: '1' },
    { type: 'Space', value: ' ' },
    { type: 'Symbol', value: '_' },
    { type: 'Number', value: '.1' },
    { type: 'Word', value: 'px' },
  ])
});

test('subtraction after closing parenthesis', () => {
  // Issue: ')-81' was being tokenized as ')' followed by '-81' (negative number)
  // instead of ')' '-' '81' (subtraction operator)

  compare('(1)-2', [
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '1' },
    { type: 'Symbol', value: ')' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '2' },
  ]);

  compare('(1) - 2', [
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '1' },
    { type: 'Symbol', value: ')' },
    { type: 'Space', value: ' ' },
    { type: 'Symbol', value: '-' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '2' },
  ]);

  compare('sin(x)-81', [
    { type: 'Word', value: 'sin' },
    { type: 'Symbol', value: '(' },
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: ')' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '81' },
  ]);

  // Negative number is still valid at the start or after operators
  compare('(-5)', [
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '-5' },
    { type: 'Symbol', value: ')' },
  ]);

  compare('1+(-5)', [
    { type: 'Number', value: '1' },
    { type: 'Symbol', value: '+' },
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '-5' },
    { type: 'Symbol', value: ')' },
  ]);
});
