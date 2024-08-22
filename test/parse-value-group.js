import it  from 'node:test';
import parseValueGroup from '../src/parser/parse-value-group.js';

import compare from './_compare.js';

it('basic value group', () => {

  compare.use(parseValueGroup);

  compare(undefined, []);

  compare('', []);

  compare('a', ['a']);

  compare('a, b', ['a', 'b']);

  compare('a, b, c', ['a', 'b', 'c']);

  compare('a, b-c', ['a', 'b-c']);

  compare('a, var(--a,b)', ['a', 'var(--a,b)']);

  compare('a b', ['a', 'b']);

  compare('a @p(a, b)', ['a', '@p(a,b)']);

  compare('a "hello world"', ['a', '"hello world"']);

  compare('a, "hello, world"', ['a', '"hello, world"']);

  compare('a, , @p(a,b)', ['a', '', '@p(a,b)']);

  compare('10px calc(10px / 5)', ['10px', 'calc(10px / 5)']);

});


it('no space option', () => {

  compare.use(input => {
    return parseValueGroup(input, { noSpace: true });
  });

  compare('a b', ['a b']);

  compare('a  b', ['a b']);

  compare('a "hello, world"', ['a "hello, world"']);

  compare('a,b', ['a', 'b']);

  compare('a, b', ['a', 'b']);

});


it('grid value', () => {

  compare.use(input => {
    return parseValueGroup(input, { symbol: '/', noSpace: true });
  });

  compare('5 / 100%', ['5', '100%']);

  compare('5/100%', ['5', '100%']);

  compare('5 / calc(100% / 5)', ['5', 'calc(100% / 5)']);

  compare('5x10 / @r(100px)', ['5x10', '@r(100px)']);

});

it('space as separator', () => {

  compare.use(input => {
    return parseValueGroup(input, { symbol: ' ' });
  });

  compare('5  100%', ['5', '100%']);
  compare('5,100%', ['5,100%']);
  compare('5, 100% 5', ['5,100%', '5']);
  compare('5, 100% 5 8', ['5,100%', '5', '8']);

});

it('verbose option', () => {

  compare.use(input => {
    return parseValueGroup(input, { symbol: ['v', 'h'], noSpace: true, verbose: true });
  });

  compare('v 10 h -10 v 5', [
    { group: 'v', value: '10' },
    { group: 'h', value: '-10' },
    { group: 'v', value: '5' },
  ]);

});
