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

test('numeric coefficients imply multiplication', () => {
    assert.equal(transform('2t'), '(2.0 * t)');
    assert.equal(transform('2sin(t)'), '(2.0 * sin(t))');
    assert.equal(transform('2(t + 1)'), '(2.0 * (t + 1.0))');
    assert.equal(transform('2π'), '(2.0 * PI)');
    assert.equal(transform('πt'), '(PI * t)');
    assert.equal(transform('2πt'), '((2.0 * PI) * t)');
    assert.equal(transform('tπ'), '(t * PI)');
    assert.equal(transform('sin(t)π'), '(sin(t) * PI)');
    assert.equal(transform('sin(2πt)'), 'sin(((2.0 * PI) * t))');
    assert.equal(
        transform('.5 + .5 * sin(dr - 2t)', { expect: 'float' }),
        '(.5 + (.5 * sin((dr - (2.0 * t)))))'
    );
    assert.equal(transform('2t * 3'), '((2.0 * t) * 3.0)');
    assert.equal(transform('x - 2t.y'), '(x - (2.0 * t.y))');
});

test('a unary minus covers the whole implicit product', () => {
    assert.equal(transform('-2t'), '(-2.0 * t)');
    assert.equal(transform('-πt'), '-(PI * t)');
    assert.equal(transform('- 2t'), '-(2.0 * t)');
    assert.equal(transform('-(2)t'), '-(2.0 * t)');
    assert.equal(transform('cos(- 2πt)'), 'cos(-((2.0 * PI) * t))');
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

test('expression types follow vectors, calls, operators and swizzles', () => {
    assert.equal(transform('1 - uv', { type: true }), 'vec2');
    assert.equal(transform('1 - pos', { type: true }), 'vec2');
    assert.equal(transform('2*vec3(1)', { type: true }), 'vec3');
    assert.equal(transform('max(length(hsl(0, 1, 1)), 1)', { type: true }), 'float');
    assert.equal(transform('v.xy', { type: true, types: { v: 'vec3' } }), 'vec2');
    assert.equal(transform('normalize(vec3(1))', { type: true }), 'vec3');
    assert.equal(transform('true', { type: true }), 'bool');
    assert.equal(transform('any(lessThan(uv, vec2(.5)))', { type: true }), 'bool');
    assert.equal(transform('isnan(uv)', { type: true }), 'bvec2');
    assert.equal(transform('isinf(vec3(1))', { type: true }), 'bvec3');
    assert.equal(transform('bvec2(true)', { type: true }), 'bvec2');
    assert.equal(transform('not flags', { types: { flags: 'bvec2' } }), 'not(flags)');
    assert.equal(transform('int(x)', { expect: 'float' }), 'float(int(x))');
    assert.equal(transform('p*2', { types: { p: 'vec2' } }), '(p * 2.0)');
    assert.equal(transform('m*2', { types: { m: 'mat2' } }), '(m * 2.0)');
    assert.equal(transform('m*p', { types: { m: 'mat2', p: 'vec2' } }), '(m * p)');
    // a name that is not a variable has no type from the prototype
    assert.equal(transform('constructor', { type: true }), 'float');
});

test('bools and ints become floats where a number is wanted, vectors pass as they are', () => {
    assert.equal(transform('hsl(mod(i, 2) == 0, 1, .5)'), 'hsl(float((mod(i, 2.0) == 0.0)), 1.0, .5)');
    assert.equal(transform('max(x & 1, 2)'), 'max(float((int(x) & 1)), 2.0)');
    assert.equal(transform('sin(x > 1)'), 'sin(float((x > 1.0)))');
    assert.equal(transform('vec2(x > 1, 2)'), 'vec2(float((x > 1.0)), 2.0)');
    assert.equal(transform('float(x > 1)'), 'float((x > 1.0))');
    assert.equal(transform('uv * (x > 1)'), '(uv * float((x > 1.0)))');
    assert.equal(transform('length(uv - .5)'), 'length((uv - .5))');
    assert.equal(transform('any(lessThan(uv, vec2(.5)))', { expect: 'bool' }), 'any(lessThan(uv, vec2(.5)))');
    assert.equal(transform('bvec2(true)'), 'bvec2(true)');
    // `not` of a bvec is a bvec
    assert.equal(transform('not flags', { type: true, types: { flags: 'bvec2' } }), 'bvec2');
    assert.equal(transform('not lessThan(uv, vec2(.5))', { expect: 'bvec2' }), 'not(lessThan(uv, vec2(.5)))');
});

test('match() is a ternary chain: first test that holds, trailing default, else 0', () => {
    assert.equal(transform('match(dr < 2, 1, 0)', { expect: 'float' }), '((dr < 2.0) ? 1.0 : 0.0)');
    assert.equal(transform('match(x > 4, .8, dr < 3, .5, .3)', { expect: 'float' }),
        '((x > 4.0) ? .8 : ((dr < 3.0) ? .5 : .3))');
    // an even count has no default and falls back to 0
    assert.equal(transform('match(x > 1, 5)', { expect: 'float' }), '((x > 1.0) ? 5.0 : 0.0)');
    assert.equal(transform('match(7)', { expect: 'float' }), '7.0');
    assert.equal(transform('match()', { expect: 'float' }), '0.0');
    // the values take the type the caller expects, the tests are always bool
    assert.equal(transform('match(x, 1, 0)', { expect: 'bool' }), '(bool(x) ? bool(1.0) : bool(0.0))');
    assert.equal(transform('match(x > 1, 2, 3) + 1', { expect: 'float' }), '(((x > 1.0) ? 2.0 : 3.0) + 1.0)');
    // vector branches pass through, and a swizzle applies to the result
    assert.equal(transform('match(a, vec2(1), vec2(0)).x', { expect: 'float' }), '(bool(a) ? vec2(1.0) : vec2(0.0)).x');
});

test('a bool from a vector or bvec uses any()', () => {
    assert.equal(transform('uv', { expect: 'bool' }), 'any(bvec2(uv))');
    assert.equal(transform('lessThan(uv, vec2(.5))', { expect: 'bool' }), 'any(lessThan(uv, vec2(.5)))');
    assert.equal(transform('isnan(uv) and isinf(uv)', { expect: 'bool' }), '(any(isnan(uv)) && any(isinf(uv)))');
});

test('vector comparisons rewrite to equal/lessThan', () => {
    assert.equal(transform('uv == vec2(0)', { expect: 'bool' }), 'all(equal(uv, vec2(0.0)))');
    assert.equal(transform('uv != vec2(0)', { expect: 'bool' }), 'any(notEqual(uv, vec2(0.0)))');
    assert.equal(transform('uv < vec2(1)', { expect: 'bool' }), 'all(lessThan(uv, vec2(1.0)))');
    assert.equal(transform('uv <= .5', { expect: 'bool' }), 'all(lessThanEqual(uv, vec2(.5)))');
    assert.equal(transform('0 < uv < 1', { expect: 'bool' }), '(all(lessThan(vec2(0.0), uv)) && all(lessThan(uv, vec2(1.0))))');
});

test('float() of a vector is not stripped', () => {
    assert.equal(transform('float(uv)'), 'float(uv)');
    assert.equal(transform('float(x > 1)'), 'float((x > 1.0))');
});

test('names map to GLSL identifiers, swizzles and calls left alone', () => {
    const names = { __proto__: null, p: 'cssd1', rand: 'cssd2' };
    assert.equal(transform('p.x + p', { names, types: { cssd1: 'vec2' } }), '(cssd1.x + cssd1)');
    assert.equal(transform('rand(p)', { names }), 'rand(cssd1)');
    assert.equal(transform('p', { names, type: true, types: { cssd1: 'vec2' } }), 'vec2');
    // a #hex color is never a name
    assert.equal(transform('#abc', { names: { __proto__: null, abc: 'cssd1' } }), 'vec3(0.6666666666666666, 0.7333333333333333, 0.8)');
});

test('unknown is told of the names that are neither mapped nor typed', () => {
    const seen = [];
    transform('a + b.x + c(d) + e', { names: { __proto__: null, a: 'cssd1' }, types: { e: 'float' }, unknown: n => seen.push(n) });
    assert.deepEqual(seen, ['b', 'd']);
});

test('an underscore is part of a name', () => {
    assert.equal(transform('u_time * 2'), '(u_time * 2.0)');
    assert.equal(transform('my_var_2 + _x'), '(my_var_2 + _x)');
    assert.equal(transform('a_b.x', { types: { a_b: 'vec2' } }), 'a_b.x');
});

test('#rgb and #rrggbb are vec3 literals', () => {
    assert.equal(transform('#fff'), 'vec3(1.0, 1.0, 1.0)');
    // the tokenizer splits a color at letter/digit boundaries; every split is glued back
    assert.equal(transform('#00f + 1'), '(vec3(0.0, 0.0, 1.0) + 1.0)');
    assert.equal(transform('#0f0'), 'vec3(0.0, 1.0, 0.0)');
    assert.equal(transform('#a1b2c3'), 'vec3(0.6313725490196078, 0.6980392156862745, 0.7647058823529411)');
    assert.equal(transform('#FF8000 * .5'), '(vec3(1.0, 0.5019607843137255, 0.0) * .5)');
    assert.equal(transform('match(dr < 2, #fff, #000)', { expect: 'float' }),
        '((dr < 2.0) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0))');
    // other lengths are not colors and stay as written
    assert.equal(transform('#fffe'), '#fffe');
});
