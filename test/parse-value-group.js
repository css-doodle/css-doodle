import test from 'ava';

import parseValueGroup from '../src/parser/parse-value-group';
import compare from './_compare';

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
    return parseValueGroup(input, true);
  });

  compare(t, 'a b', ['a b']);

  compare(t, 'a  b', ['a b']);

  compare(t, 'a "hello, world"', ['a "hello, world"']);

  compare(t, 'a,b', ['a', 'b']);

  compare(t, 'a, b', ['a', 'b']);

});
