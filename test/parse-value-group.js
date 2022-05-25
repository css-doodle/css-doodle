import test from 'ava';

import parseValueGroup from '../src/parser/parse-value-group.js';
import compare from './_compare.js';

test('basic value group', t => {

  compare.use(parseValueGroup);

  compare(t, undefined, []);

  compare(t, '', []);

  compare(t, 'a', ['a']);

  compare(t, 'a, b', ['a', 'b']);

  compare(t, 'a, b, c', ['a', 'b', 'c']);

  compare(t, 'a, b-c', ['a', 'b-c']);

  compare(t, 'a, var(--a,b)', ['a', 'var(--a,b)']);

  compare(t, 'a b', ['a', 'b']);

  compare(t, 'a @p(a, b)', ['a', '@p(a,b)']);

  compare(t, 'a "hello world"', ['a', '"hello world"']);

  compare(t, 'a, "hello, world"', ['a', '"hello, world"']);

  compare(t, 'a, , @p(a,b)', ['a', '', '@p(a,b)']);

  compare(t, '10px calc(10px / 5)', ['10px', 'calc(10px / 5)']);

});


test('no space option', t => {

  compare.use(input => {
    return parseValueGroup(input, { noSpace: true });
  });

  compare(t, 'a b', ['a b']);

  compare(t, 'a  b', ['a b']);

  compare(t, 'a "hello, world"', ['a "hello, world"']);

  compare(t, 'a,b', ['a', 'b']);

  compare(t, 'a, b', ['a', 'b']);

});


test('grid value', t => {

  compare.use(input => {
    return parseValueGroup(input, { symbol: '/', noSpace: true });
  });

  compare(t, '5 / 100%', ['5', '100%']);

  compare(t, '5/100%', ['5', '100%']);

  compare(t, '5 / calc(100% / 5)', ['5', 'calc(100% / 5)']);

  compare(t, '5x10 / @r(100px)', ['5x10', '@r(100px)']);

});

