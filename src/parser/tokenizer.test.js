import ava from 'ava';
import { scan } from './tokenizer';

function compare(fn) {
  return t => {
    fn((code, result, print) => {
      let applied = Array.from(scan(code))
        .map(({ type, value, status }) => {
          let ret = { type, value };
          if (status) ret.status = status;
          return ret;
        });
      if (print) console.log(applied);
      t.deepEqual(result, applied);
    });
  }
}

function test(name, fn) {
  ava(name, compare(fn));
}

for (let m in ava) {
  test[m] = (name, fn) => ava[m](name, compare(fn));
}


test('scanner', t => {

  t('', []);

  t('color: red;', [
    { type: 'Word', value: 'color' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

  t('@pick(red, blue)', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'pick' },
    { type: 'Symbol', value: '(' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'blue' },
    { type: 'Symbol', value: ')' },
  ]);

  t('@position: top  right', [
    { type: 'Symbol', value: '@' },
    { type: 'Word', value: 'position' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'top'},
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'right' },
  ]);

  t('content: "hello: world"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'hello' },
    { type: 'Symbol', value: ':' },
    { type: 'Space', value: ' ' },
    { type: 'Word', value: 'world' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  t('x, y: red;', [
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: ',' },
    { type: 'Word', value: 'y' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: 'red' },
    { type: 'Symbol', value: ';' },
  ]);

});

test('scanner.escape', t => {

  t('content: "\\"hello"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '"hello' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  t('content: "\\@p"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: '@p' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

  t('content: \\"x"', [
    { type: 'Word', value: 'content' },
    { type: 'Symbol', value: ':' },
    { type: 'Word', value: '\\' },
    { type: 'Symbol', value: '"', status: 'open' },
    { type: 'Word', value: 'x' },
    { type: 'Symbol', value: '"', status: 'close' },
  ]);

});

test('scanner.numbers', t => {

  t('padding: 0 10px', [
    { type: 'Word', value: 'padding' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '0' },
    { type: 'Space', value: ' ' },
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'px' },
  ]);

  t('opacity:.5', [
    { type: 'Word', value: 'opacity' },
    { type: 'Symbol', value: ':' },
    { type: 'Number', value: '.5' },
  ]);

  t('0.5', [
    { type: 'Number', value: '0.5' },
  ]);

  t('.5', [
    { type: 'Number', value: '.5' },
  ]);

  t('.5px', [
    { type: 'Number', value: '.5' },
    { type: 'Word', value: 'px' },
  ]);

  t('0..5', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: '..' },
    { type: 'Number', value: '5' },
  ]);

  t('0.5.9', [
    { type: 'Number', value: '0.5' },
    { type: 'Number', value: '.9' },
  ]);

  t('10e9', [
    { type: 'Number', value: '10e9' },
  ]);
  t('.5E9px', [
    { type: 'Number', value: '.5E9' },
    { type: 'Word', value: 'px' },
  ]);

  t('10e+9', [
    { type: 'Number', value: '10e+9' },
  ]);

  t('10e-9', [
    { type: 'Number', value: '10e-9' },
  ]);

  t('10e+-9', [
    { type: 'Number', value: '10' },
    { type: 'Word', value: 'e' },
    { type: 'Symbol', value: '+' },
    { type: 'Symbol', value: '-' },
    { type: 'Number', value: '9' },
  ]);

  t('0x', [
    { type: 'Number', value: '0' },
    { type: 'Word', value: 'x' },
  ]);

  t('0x12af', [
    { type: 'Number', value: '0x12af' }
  ]);

  t('0x12afga', [
    { type: 'Number', value: '0x12af' },
    { type: 'Word', value: 'ga' },
  ]);

});

test('scanner.comments', t => {

  t('/* color: red', []);
  t('/* color: red */', []);
  t('/*/', []);
  t('/**/', []);
  t('/***/', []);
  t(
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

  t(
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


test('scanner.svg', t => {

  t('<svg></svg>', [
    { type: 'Word', value: '<svg></svg>' }
  ]);

  t('<circle r="@r(10)" />', [
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
