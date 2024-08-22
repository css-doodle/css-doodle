import it from 'node:test';

import parseShapeCommands from '../src/parser/parse-shape-commands.js';
import compare from './_compare.js';

compare.use(parseShapeCommands);

it('single statement', () => {

  compare('split: 10', { split: '10' });

  compare('split: 10;', { split: '10' });

  compare('split: 10;;;', { split: '10' });

});

it('multiple statements', () => {

  compare(`
    a: 10;
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

  compare(`
    a: 10;
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

  compare(`
    a: 10;
    b: 10
  `, {
    a: '10',
    b: '10'
  });

});

it('ignore comments', () => {

  compare(`
    /* comments */
    a: 10;
    /* comments */
    b: 10;
  `, {
    a: '10',
    b: '10'
  });

});

it('complex forms', () => {

  compare('a: b:c;', { a: 'b:c' });

  compare('a: seq(1, 2);', { a: 'seq(1,2)' });

  compare('a: seq(1, 2); a: hello', { a: 'hello' });

  compare('a: seq(1, 2);; a: hello', { a: 'hello' });

  compare(':hello', {});

  compare('r: 2^sin.cos(2t);', {r: '2^sin.cos(2t)'});

  compare('', {});

});

it('negative variable', () => {

  compare('-: 10', {'-': '10'});

  compare('-x: 10', { x: '-1 * (10)' });

  compare('-x: sin(t)', { x: '-1 * (sin(t))' });

  compare('-x: sin(t)+5', { x: '-1 * (sin(t)+5)' });

  compare('--x: 10', { '--x': '10' });

  compare('-fill-rule: evenodd', { 'fill-rule': 'evenodd' });

});
