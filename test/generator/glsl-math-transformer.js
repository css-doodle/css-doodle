import test from 'node:test';
import assert from 'node:assert/strict';

import transform from '../../src/generator/glsl-math-transformer.js';

test('arithmetic: integers become floats, every operation is parenthesized', () => {
    assert.equal(transform('x * y'), '(x * y)');
    assert.equal(transform('x + 1'), '(x + 1.0)');
    assert.equal(transform('(x - y) / 2'), '((x - y) / 2.0)');
    assert.equal(transform('x + y * z'), '(x + (y * z))');
    assert.equal(transform('(x + y) * z'), '((x + y) * z)');
});

test('modulo becomes mod()', () => {
    assert.equal(transform('x % 10'), 'mod(x, 10.0)');
    assert.equal(transform('(x + 1) % y'), 'mod((x + 1.0), y)');
});

test('bitwise operands are cast to int, results back to float when mixed', () => {
    assert.equal(transform('x << 1'), '(int(x) << 1)');
    assert.equal(transform('x >> y'), '(int(x) >> int(y))');
    assert.equal(transform('x & 255'), '(int(x) & 255)');
    assert.equal(transform('x | y'), '(int(x) | int(y))');
    assert.equal(transform('x ^ y'), '(int(x) ^ int(y))');
    assert.equal(transform('(x & 1) * 0.5'), '(float((int(x) & 1)) * 0.5)');
    assert.equal(transform('x | y & z'), '(int(x) | (int(y) & int(z)))');
    assert.equal(transform('x & y == z'), '(int(x) & int((y == z)))');
    // function calls as operands too
    assert.equal(transform('mod(x, 4) ^ mod(y, 4)'), '(int(mod(x, 4.0)) ^ int(mod(y, 4.0)))');
    assert.equal(transform('floor(x) & 1'), '(int(floor(x)) & 1)');
    assert.equal(transform('float(x) >> 1'), '(int(x) >> 1)');
});

test('function calls', () => {
    assert.equal(transform('sin(x)'), 'sin(x)');
    assert.equal(transform('int(x)'), 'int(x)');
    assert.equal(transform('int(x * 2)'), 'int((x * 2.0))');
    assert.equal(transform('vec3(x, y, z)'), 'vec3(x, y, z)');
    assert.equal(transform('vec2(x * 2, y + 1)'), 'vec2((x * 2.0), (y + 1.0))');
});

test('comparisons, a single = reads as ==', () => {
    assert.equal(transform('x > y'), '(x > y)');
    assert.equal(transform('x == y'), '(x == y)');
    assert.equal(transform('(x > y) & 1'), '(int((x > y)) & 1)');
    assert.equal(transform('x = y'), '(x == y)');
    assert.equal(transform('x % 2 = 0'), '(mod(x, 2.0) == 0.0)');
    assert.equal(transform('x % y = 0'), '(mod(x, y) == 0.0)');
    assert.equal(transform('(x + 1) % 3 = 0'), '(mod((x + 1.0), 3.0) == 0.0)');
});

test('unicode comparison operators', () => {
    assert.equal(transform('x ≤ 5'), '(x <= 5.0)');
    assert.equal(transform('x ≥ 5'), '(x >= 5.0)');
    assert.equal(transform('x ≠ 0'), '(x != 0.0)');
    assert.equal(transform('x ≥ 1 && x ≤ 10'), '((x >= 1.0) && (x <= 10.0))');
});

test('word operators and, or, not', () => {
    assert.equal(transform('x and y'), '(bool(x) && bool(y))');
    assert.equal(transform('x or y'), '(bool(x) || bool(y))');
    assert.equal(transform('x > 1 and y > 1'), '((x > 1.0) && (y > 1.0))');
    assert.equal(transform('x > 1 or y < 0'), '((x > 1.0) || (y < 0.0))');
    assert.equal(transform('x > 0 and x < 10'), '((x > 0.0) && (x < 10.0))');
    assert.equal(transform('not x'), '!bool(x)');
    assert.equal(transform('not not x'), '!!bool(x)');
    assert.equal(transform('not x and y'), '(!bool(x) && bool(y))');
    assert.equal(transform('not (x and y)'), '!(bool(x) && bool(y))');
    assert.equal(transform('not x or not y'), '(!bool(x) || !bool(y))');
});

test('word operator precedence: and binds tighter than or', () => {
    assert.equal(transform('a and b and c'), '((bool(a) && bool(b)) && bool(c))');
    assert.equal(transform('x and y or z'), '((bool(x) && bool(y)) || bool(z))');
    assert.equal(transform('x or y and z'), '(bool(x) || (bool(y) && bool(z)))');
    assert.equal(
        transform('x > 1 and y > 1 or z = 0'),
        '(((x > 1.0) && (y > 1.0)) || (z == 0.0))'
    );
    assert.equal(
        transform('mod(x, 2) = 0 and mod(y, 2) = 0'),
        '((mod(x, 2.0) == 0.0) && (mod(y, 2.0) == 0.0))'
    );
    assert.equal(transform('x and y', { expect: 'bool' }), '(bool(x) && bool(y))');
});

test('word operators are not merged with a following number', () => {
    assert.equal(transform('x and 1'), '(bool(x) && bool(1.0))');
    assert.equal(transform('x or 0'), '(bool(x) || bool(0.0))');
    assert.equal(transform('not 1'), '!bool(1.0)');
});

test('not applies to a whole comparison, as in media queries', () => {
    assert.equal(transform('not x = 1'), '!(x == 1.0)');
    assert.equal(transform('not x > 1'), '!(x > 1.0)');
    assert.equal(transform('not x > 1 and y > 1'), '(!(x > 1.0) && (y > 1.0))');
});

test('word operators are case-insensitive like the rest of the DSL', () => {
    assert.equal(transform('x > 1 AND y > 1'), '((x > 1.0) && (y > 1.0))');
    assert.equal(transform('x Or y'), '(bool(x) || bool(y))');
    assert.equal(transform('NOT x'), '!bool(x)');
});

test('dangling word operators degrade to the left side, not invalid GLSL', () => {
    assert.equal(transform('x and', { expect: 'bool' }), 'bool(x)');
    assert.equal(transform('x > 1 or', { expect: 'bool' }), '(x > 1.0)');
    assert.equal(transform('not', { expect: 'bool' }), 'bool(0.0)');
});

test('unary operators', () => {
    assert.equal(transform('-x'), '-x');
    assert.equal(transform('-(x + y)'), '-(x + y)');
    assert.equal(transform('!x'), '!bool(x)');
    assert.equal(transform('~x'), '~int(x)');
    assert.equal(transform('-~x'), '-~int(x)');
});

test('chained comparisons desugar to &&', () => {
    assert.equal(transform('1 < x < 5'), '((1.0 < x) && (x < 5.0))');
    assert.equal(transform('1 <= x < 5'), '((1.0 <= x) && (x < 5.0))');
    assert.equal(transform('a < b < c < d'), '(((a < b) && (b < c)) && (c < d))');
    assert.equal(transform('x > y > 0', { expect: 'bool' }), '((x > y) && (y > 0.0))');
    assert.equal(transform('1 < x < 5', { expect: 'float' }), 'float(((1.0 < x) && (x < 5.0)))');
});

test('a value is cast only when its type differs from the expected one', () => {
    assert.equal(transform('x > 1', { expect: 'bool' }), '(x > 1.0)');
    assert.equal(transform('x > 1', { expect: 'float' }), 'float((x > 1.0))');
    assert.equal(transform('x > 1', { expect: 'int' }), 'int((x > 1.0))');
    assert.equal(transform('x and y', { expect: 'float' }), 'float((bool(x) && bool(y)))');
    assert.equal(transform('~x', { expect: 'float' }), 'float(~int(x))');
    assert.equal(transform('~x + 1'), '(float(~int(x)) + 1.0)');
    assert.equal(transform('!x', { expect: 'float' }), 'float(!bool(x))');
});

test('expect: bool coerces the root', () => {
    assert.equal(transform('x', { expect: 'bool' }), 'bool(x)');
    assert.equal(transform('(x)', { expect: 'bool' }), 'bool(x)');
    assert.equal(transform('sin(x)', { expect: 'bool' }), 'bool(sin(x))');
    assert.equal(transform('atan(y, x)', { expect: 'bool' }), 'bool(atan(y, x))');
    assert.equal(transform('-x', { expect: 'bool' }), 'bool(-x)');
    assert.equal(transform('~x', { expect: 'bool' }), 'bool(~int(x))');
    assert.equal(transform('!x', { expect: 'bool' }), '!bool(x)');
});

test('empty input and lone numbers', () => {
    assert.equal(transform(''), '');
    assert.equal(transform('1'), '1.0');
    assert.equal(transform('1', { expect: 'int' }), '1');
    assert.equal(transform('1', { expect: 'bool' }), 'bool(1.0)');
});

test('deeply nested real-world expressions', () => {
    assert.equal(
        transform('((x*10) ^ (y*10)) % 3 == 0'),
        '(mod(float((int((x * 10.0)) ^ int((y * 10.0)))), 3.0) == 0.0)'
    );
    assert.equal(
        transform('((x + 1) * 2) >> (y % 3)'),
        '(int(((x + 1.0) * 2.0)) >> int(mod(y, 3.0)))'
    );
    assert.equal(transform('(x > 0.5) * y'), '(float((x > 0.5)) * y)');
    assert.equal(
        transform('((x * y * 7.) >> 4) & 2 == 2', { expect: 'bool' }),
        'bool(((int(((x * y) * 7.)) >> 4) & int((2.0 == 2.0))))'
    );
    assert.equal(
        transform('y > (4 * ((2 * (x & 1)) % 4))', { expect: 'bool' }),
        '(y > (4.0 * mod((2.0 * float((int(x) & 1))), 4.0)))'
    );
});

// --- swizzles and types ---

test('a swizzle after a call or a parenthesized value is kept', () => {
    assert.equal(transform('vec2(1, 2).yx', { expect: 'float' }), 'vec2(1.0, 2.0).yx');
    assert.equal(transform('(z).x * 2', { expect: 'float' }), '(z.x * 2.0)');
    assert.equal(transform('abs(z).y', { expect: 'bool' }), 'bool(abs(z).y)');
    assert.equal(transform('(-p).x * 2'), '(-p.x * 2.0)');
});

test('cond() is a ternary chain: first test that holds, trailing default, else 0', () => {
    assert.equal(transform('cond(dr < 2, 1, 0)', { expect: 'float' }), '((dr < 2.0) ? 1.0 : 0.0)');
    assert.equal(transform('cond(x > 4, .8, dr < 3, .5, .3)', { expect: 'float' }),
        '((x > 4.0) ? .8 : ((dr < 3.0) ? .5 : .3))');
    // an even count has no default and falls back to 0
    assert.equal(transform('cond(x > 1, 5)', { expect: 'float' }), '((x > 1.0) ? 5.0 : 0.0)');
    assert.equal(transform('cond(7)', { expect: 'float' }), '7.0');
    assert.equal(transform('cond()', { expect: 'float' }), '0.0');
    // the values take the type the caller expects, the tests are always bool
    assert.equal(transform('cond(x, 1, 0)', { expect: 'bool' }), '(bool(x) ? bool(1.0) : bool(0.0))');
    assert.equal(transform('cond(x > 1, 2, 3) + 1', { expect: 'float' }), '(((x > 1.0) ? 2.0 : 3.0) + 1.0)');
    // vector branches pass through, and a swizzle applies to the result
    assert.equal(transform('cond(a, vec2(1), vec2(0)).x', { expect: 'float' }), '(bool(a) ? vec2(1.0) : vec2(0.0)).x');
});

test('#rgb and #rrggbb are vec3 literals', () => {
    assert.equal(transform('#fff'), 'vec3(1.0, 1.0, 1.0)');
    // the tokenizer splits a color at letter/digit boundaries; every split is glued back
    assert.equal(transform('#00f + 1'), '(vec3(0.0, 0.0, 1.0) + 1.0)');
    assert.equal(transform('#0f0'), 'vec3(0.0, 1.0, 0.0)');
    assert.equal(transform('#a1b2c3'), 'vec3(0.6313725490196078, 0.6980392156862745, 0.7647058823529411)');
    assert.equal(transform('#FF8000 * .5'), '(vec3(1.0, 0.5019607843137255, 0.0) * .5)');
    assert.equal(transform('cond(dr < 2, #fff, #000)', { expect: 'float' }),
        '((dr < 2.0) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0))');
    // other lengths are not colors and stay as written
    assert.equal(transform('#fffe'), '#fffe');
});
