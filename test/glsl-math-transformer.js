import test from 'node:test';
import transform from '../src/generator/glsl-math-transformer.js';
import compare from './_compare.js';

compare.use(transform);

test('basic arithmetic', () => {
  compare('x * y', '(x * y)');
  compare('x + 1', '(x + 1.0)');
  compare('(x - y) / 2', '((x - y) / 2.0)');
});

test('modulo operator', () => {
  compare('x % 10', 'mod(x, 10.0)');
  compare('(x + 1) % y', 'mod((x + 1.0), y)');
});

test('bitwise operators (automatic int casting)', () => {
  compare('x << 1', '(int(x) << 1)');
  compare('x >> y', '(int(x) >> int(y))');
  compare('x & 255', '(int(x) & 255)');
  compare('x | y', '(int(x) | int(y))');
  compare('x ^ y', '(int(x) ^ int(y))');
});

test('functions', () => {
  compare('sin(x)', 'sin(x)');
  compare('int(x)', 'int(x)');
  compare('int(x * 2)', 'int((x * 2.0))');
});

test('mixed types', () => {
  compare('(x & 1) * 0.5', '(float((int(x) & 1)) * 0.5)');
});

test('function calls as bitwise operands are int-cast', () => {
  compare('mod(x, 4) ^ mod(y, 4)', '(int(mod(x, 4.0)) ^ int(mod(y, 4.0)))');
  compare('floor(x) & 1', '(int(floor(x)) & 1)');
  compare('float(x) >> 1', '(int(x) >> 1)');
});

test('boolean logic', () => {
  compare('x > y', '(x > y)');
  compare('x == y', '(x == y)');
  compare('(x > y) & 1', '(int((x > y)) & 1)');
});

test('single = treated as ==', () => {
  compare('x = y', '(x == y)');
  compare('x % 2 = 0', '(mod(x, 2.0) == 0.0)');
  compare('x % y = 0', '(mod(x, y) == 0.0)');
  compare('(x + 1) % 3 = 0', '(mod((x + 1.0), 3.0) == 0.0)');
});

test('unicode comparison operators', () => {
  compare('x ≤ 5', '(x <= 5.0)');
  compare('x ≥ 5', '(x >= 5.0)');
  compare('x ≠ 0', '(x != 0.0)');
  compare('x ≥ 1 && x ≤ 10', '(bool((x >= 1.0)) && bool((x <= 10.0)))');
});

test('word operators: and / or', () => {
  compare('x and y', '(bool(x) && bool(y))');
  compare('x or y', '(bool(x) || bool(y))');
  compare('x > 1 and y > 1', '(bool((x > 1.0)) && bool((y > 1.0)))');
  compare('x > 1 or y < 0', '(bool((x > 1.0)) || bool((y < 0.0)))');
  compare('x > 0 and x < 10', '(bool((x > 0.0)) && bool((x < 10.0)))');
});

test('word operator: not', () => {
  compare('not x', '!bool(x)');
  compare('not not x', '!!bool(x)');
  compare('not x and y', '(!bool(x) && bool(y))');
  compare('not (x and y)', '!bool((bool(x) && bool(y)))');
  compare('not x or not y', '(!bool(x) || !bool(y))');
});

test('word operator precedence and mixing', () => {
  compare('a and b and c', '(bool((bool(a) && bool(b))) && bool(c))');
  compare('x and y or z', '(bool((bool(x) && bool(y))) || bool(z))');
  compare('x or y and z', '(bool(x) || bool((bool(y) && bool(z))))');
  compare(
    'x > 1 and y > 1 or z = 0',
    '(bool((bool((x > 1.0)) && bool((y > 1.0)))) || bool((z == 0.0)))'
  );
  compare(
    'mod(x, 2) = 0 and mod(y, 2) = 0',
    '(bool((mod(x, 2.0) == 0.0)) && bool((mod(y, 2.0) == 0.0)))'
  );
  compare(['x and y', { expect: 'bool' }], 'bool((bool(x) && bool(y)))');
});

test('word operators are not merged with following numbers', () => {
  compare('x and 1', '(bool(x) && bool(1.0))');
  compare('x or 0', '(bool(x) || bool(0.0))');
  compare('not 1', '!bool(1.0)');
});

test('not applies to a whole comparison (CSS media-query reading)', () => {
  compare('not x = 1', '!bool((x == 1.0))');
  compare('not x > 1', '!bool((x > 1.0))');
  compare('not x > 1 and y > 1', '(!bool((x > 1.0)) && bool((y > 1.0)))');
});

test('word operators are case-insensitive like the rest of the DSL', () => {
  compare('x > 1 AND y > 1', '(bool((x > 1.0)) && bool((y > 1.0)))');
  compare('x Or y', '(bool(x) || bool(y))');
  compare('NOT x', '!bool(x)');
});

test('dangling word operators degrade to the left side, not invalid GLSL', () => {
  compare(['x and', { expect: 'bool' }], 'bool(x)');
  compare(['x > 1 or', { expect: 'bool' }], 'bool((x > 1.0))');
  compare(['not', { expect: 'bool' }], 'bool(0.0)');
});

test('operator precedence', () => {
  compare('x + y * z', '(x + (y * z))');
  compare('(x + y) * z', '((x + y) * z)');
  compare('x | y & z', '(int(x) | (int(y) & int(z)))');
  compare('x & y == z', '(int(x) & int((y == z)))');
});

test('complex nesting', () => {
  compare(
    '((x + 1) * 2) >> (y % 3)',
    '(int(((x + 1.0) * 2.0)) >> int(mod(y, 3.0)))'
  );
  compare('(x > 0.5) * y', '(float((x > 0.5)) * y)');
});

test('unary operators', () => {
  compare('-x', '-x');
  compare('-(x + y)', '-(x + y)');
  compare('!x', '!bool(x)');
  compare('~x', '~int(x)');
  compare('-~x', '-~int(x)');
});

test('chained comparisons desugar to &&', () => {
  compare('1 < x < 5', '(bool((1.0 < x)) && (x < 5.0))');
  compare('1 <= x < 5', '(bool((1.0 <= x)) && (x < 5.0))');
  compare('a < b < c < d', '((bool((a < b)) && (b < c)) && (c < d))');
  compare(['x > y > 0', { expect: 'bool' }], '(bool((x > y)) && (y > 0.0))');
});

test('bool coercion at root', () => {
  compare(['x', { expect: 'bool' }], 'bool(x)');
  compare(['(x)', { expect: 'bool' }], 'bool(x)');
  compare(['sin(x)', { expect: 'bool' }], 'bool(sin(x))');
  compare(['atan(y, x)', { expect: 'bool' }], 'bool(atan(y, x))');
  compare(['-x', { expect: 'bool' }], 'bool(-x)');
  compare(['~x', { expect: 'bool' }], 'bool(~int(x))');
  compare(['!x', { expect: 'bool' }], '!bool(x)');
});

test('edge cases', () => {
  compare('', '');
  compare('1', '1.0');
  compare(['1', { expect: 'int' }], '1');
  compare(['1', { expect: 'bool' }], 'bool(1.0)');
  compare('vec3(x, y, z)', 'vec3(x, y, z)');
  compare('vec2(x * 2, y + 1)', 'vec2((x * 2.0), (y + 1.0))');
});

test('user case 3: very deep nesting', () => {
  let input = '((x*10) ^ (y*10)) % 3 == 0';
  compare(
    input,
    '(mod(float((int((x * 10.0)) ^ int((y * 10.0)))), 3.0) == 0.0)'
  );
});

test('user case 1: complex bitwise logic', () => {
  let input = '((x * y * 7.) >> 4) & 2 == 2';
  compare(
    [input, { expect: 'bool' }],
    'bool(((int(((x * y) * 7.)) >> 4) & int((2.0 == 2.0))))'
  );
});

test('user case 2: simplified pattern', () => {
  let input = 'y > (4 * ((2 * (x & 1)) % 4))';
  compare(
    [input, { expect: 'bool' }],
    'bool((y > (4.0 * mod((2.0 * float((int(x) & 1))), 4.0))))'
  );
});
