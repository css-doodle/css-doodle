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
  compare('!x', '!x');
  compare('~x', '~int(x)');
  compare('-~x', '-~int(x)');
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
