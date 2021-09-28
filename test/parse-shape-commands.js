import test from 'ava';

import parseShapeCommands from '../src/parser/parse-shape-commands';
import compare from './_compare';
compare.use(parseShapeCommands);

test('single statement', t => {

  compare(t, 'split: 10', { split: '10' });

  compare(t, 'split: 10;', { split: '10' });

  compare(t, 'split: 10;;;', { split: '10' });

});

test('multiple statements', t => {

  compare(t, `
    a: 10;
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

  compare(t, `
    a: 10;
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

  compare(t, `
    a: 10;
    b: 10
  `, {
    a: '10',
    b: '10'
  });

});

test('ignore comments', t => {

  compare(t, `
    /* comments */
    a: 10;
    /* comments */
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

});

test('complex forms', t => {

  compare(t, 'a: b:c;', { a: 'b:c' });

  compare(t, 'a: seq(1, 2);', { a: 'seq(1,2)' });

  compare(t, 'a: seq(1, 2); a: hello', { a: 'hello' });

  compare(t, 'a: seq(1, 2);; a: hello', { a: 'hello' });

  compare(t, ':hello', {});

  compare(t, 'r: 2^sin.cos(2t);', {r: '2^sin.cos(2t)'});

  compare(t, '', {});

});

test('negative variable', t => {

  compare(t, '-: 10', {'-': '10'});

  compare(t, '-x: 10', { x: '-1 * (10)' });

  compare(t, '-x: sin(t)', { x: '-1 * (sin(t))' });

  compare(t, '-x: sin(t)+5', { x: '-1 * (sin(t)+5)' });

  compare(t, '--x: 10', { '--x': '10' });

  compare(t, '-fill-rule: evenodd', { 'fill-rule': 'evenodd' });

});
