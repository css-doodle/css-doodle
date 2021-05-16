import test from 'ava';

import { scan } from '../src/parser/tokenizer';
import compare from './_compare';

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

test('basic', t => {

  compare(t, '', []);

  compare(t, 'color: red;', [
    { type: 'Word', value: 'color' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

  compare(t, '@pick(red, blue)', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'pick' },
    { type: 'Symbol', value: '(' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'blue' },
    { type: 'Symbol', value: ')' },
  ]);

  compare(t, '@position: top  right', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'position' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'top'},
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'right' },
  ]);

  compare(t, 'content: "hello: world"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'hello' },
    { type: 'Symbol', value: ':' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'world' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare(t, 'x, y: red;', [
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'y' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

});

test('escape', t => {

  compare(t, 'content: "\\"hello"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '"hello' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare(t, 'content: "\\@p"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '@p' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  compare(t, 'content: \\"x"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: '\\' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

});

test('numbers', t => {

  compare(t, 'padding: 0 10px', [
    { type: 'Word', value: 'padding' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '0' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'px' },
  ]);

  compare(t, 'opacity:.5', [
    { type: 'Word', value: 'opacity' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '.5' },
  ]);

  compare(t, '0.5', [
    { type: 'Number', value: '0.5' },
  ]);

  compare(t, '.5', [
    { type: 'Number', value: '.5' },
  ]);

  compare(t, '.5px', [
    { type: 'Number', value: '.5' },
    { type: 'Word', value: 'px' },
  ]);

  compare(t, '0..5', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: '..' },
    { type: 'Number', value: '5' },
  ]);

  compare(t, '0.5.9', [
    { type: 'Number', value: '0.5' },
    { type: 'Number', value: '.9' },
  ]);

  compare(t, '10e9', [
    { type: 'Number', value: '10e9' },
  ]);
  compare(t, '.5E9px', [
    { type: 'Number', value: '.5E9' },
    { type: 'Word', value: 'px' },
  ]);

  compare(t, '10e+9', [
    { type: 'Number', value: '10e+9' },
  ]);

  compare(t, '10e-9', [
    { type: 'Number', value: '10e-9' },
  ]);

  compare(t, '10e+-9', [
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'e' },
    { type: 'Symbol', value: '+' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '9' },
  ]);

  compare(t, '0x', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: 'x' },
  ]);

  compare(t, '0x12af', [
    { type: 'Number', value: '0x12af' }
  ]);

  compare(t, '0x12afga', [
    { type: 'Number', value: '0x12af' },
    { type: 'Word', value: 'ga' },
  ]);

});

test('comments', t => {

  compare(t, '/* color: red', []);
  compare(t, '/* color: red */', []);
  compare(t, '/*/', []);
  compare(t, '/**/', []);
  compare(t, '/***/', []);
  compare(t,
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

  compare(t,
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


test('svg', t => {

  compare(t, '<svg></svg>', [
    { type: 'Word', value: '<svg></svg>' }
  ]);

  compare(t, '<circle r="@r(10)" />', [
    { type: 'Word', value: '<circle' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'r=' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'r' },
    { type: 'Symbol', value: '(' },
    { type: 'Number', value: '10' },
    { type: 'Symbol', value: ')' },
    { type: 'Symbol', value: '"', status: 'close' },
    { type: 'Word', value: '/>' },
  ]);

});
