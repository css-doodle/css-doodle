import test from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../../src/generator/glsl-math-transformer.js';

const transform = (code, { expect = null, type = false, ...opts } = {}) => {
    const e = compile(code, opts);
    return type ? e.type : e.code(expect);
};

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

test('only a number or π touching a value starts a product; other values side by side are reported', () => {
    const report = code => {
        const messages = [];
        return [transform(code, { warn: m => messages.push(m) }), messages.length];
    };
    assert.deepEqual(report('t r'), ['t', 1]);
    assert.deepEqual(report('r 9'), ['r', 1]);
    assert.deepEqual(report('(r + 1)(t + 1)'), ['(r + 1.0)', 1]);
    assert.deepEqual(report('sin(t) cos(t)'), ['sin(t)', 1]);
    assert.deepEqual(report('x + b c'), ['(x + b)', 1]);
    assert.deepEqual(report('2sin(t) + 2πt'), ['((2.0 * sin(t)) + ((2.0 * PI) * t))', 0]);
    assert.deepEqual(report('2 sin(t)'), ['2.0', 1]);
    assert.deepEqual(report('2 t'), ['2.0', 1]);
    assert.deepEqual(report('2 (t + 1)'), ['2.0', 1]);
    assert.deepEqual(report('2π t'), ['(2.0 * PI)', 1]);
    assert.deepEqual(report('r -2'), ['r', 1]);
    // a space separates call arguments, but not inside a group
    assert.deepEqual(report('hsl(h .75 .65)'), ['hsl(h, .75, .65)', 0]);
    assert.deepEqual(report('max(a b) + 1'), ['(max(a, b) + 1.0)', 0]);
    assert.deepEqual(report('hsl((a b), 1, 2)')[1], 1);
});

test('** is power, right-associative, on floats and vectors', () => {
    assert.equal(transform('x ** y'), 'pow(x, y)');
    assert.equal(transform('x ** 5'), 'pow(x, 5.0)');
    assert.equal(transform('1 + x ** .5'), '(1.0 + pow(x, .5))');
    assert.equal(transform('2 ** 3 ** 2'), 'pow(2.0, (3.0 * 3.0))');
    assert.equal(transform('uv ** y'), 'pow(uv, vec2(y))');
    // pow() is undefined for a negative base, so a whole exponent from 2 to 4 multiplies
    assert.equal(transform('x ** 2'), '(x * x)');
    assert.equal(transform('du ** 2 + dv ** 2'), '((du * du) + (dv * dv))');
    assert.equal(transform('x ** 4 * 3'), '((x * x * x * x) * 3.0)');
    assert.equal(transform('uv ** 2'), '(uv * uv)');
    // a sign and an implicit product bind before the power, as in §8
    assert.equal(transform('-2 ** 2'), '(-2.0 * -2.0)');
    assert.equal(transform('2x ** 2'), '((2.0 * x) * (2.0 * x))');
    assert.equal(transform('x ** 2', { type: true }), 'float');
    assert.equal(transform('x ^ 2'), '(int(x) ^ 2)');
});

test('what the grammar cannot place is reported once, with a hint', () => {
    const report = code => {
        const messages = [];
        return [transform(code, { warn: m => messages.push(m) }), messages];
    };
    assert.deepEqual(report('x > 1 ? 1 : 0'), ['(x > 1.0)', ['"x > 1 ? 1 : 0": there is no ?:; write match(test, a, b)']]);
    assert.deepEqual(report('50%'), ['50.0', ['"50%": % needs a value after it']]);
    assert.deepEqual(report('x and'), ['x', ['"x and": && needs a value after it']]);
    assert.deepEqual(report('x * * 2'), ['(x * 0.0)', ['"x * * 2": unexpected *']]);
    assert.deepEqual(report('a : b'), ['a', ['"a : b": unexpected :']]);
    assert.deepEqual(report('x ! y'), ['x', ['"x ! y": unexpected !']]);
    assert.deepEqual(report('x) * 2'), ['x', ['"x) * 2": unexpected )']]);
    // nothing to report
    assert.deepEqual(report('max(x, 1) * (y + 2)'), ['(max(x, 1.0) * (y + 2.0))', []]);
});

test('xor is not an operator; != between two conditions is', () => {
    const messages = [];
    assert.equal(transform('x < .5 xor y < .5', { warn: m => messages.push(m) }), '(x < .5)');
    assert.deepEqual(messages, ['"x < .5 xor y < .5": there is no xor; write != between the two conditions']);
    assert.equal(transform('x < .5 != y < .5'), '(float((x < .5)) != float((y < .5)))');
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
    // an exponent is a float literal already
    assert.equal(transform('1e3'), '1e3');
    assert.equal(transform('2E-2 * x'), '(2E-2 * x)');
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
    // the last swizzle of a chain decides
    assert.equal(transform('v.xy.x', { type: true, types: { v: 'vec3' } }), 'float');
    assert.equal(transform('vec2(1).yx.x', { type: true }), 'float');
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
    assert.equal(transform('mat3(1, 0, 0, 0, 1, 0, 0, 0, 1)', { type: true }), 'mat3');
    assert.equal(transform('mat3(vec3(1), vec3(2), vec3(3))', { type: true }), 'mat3');
    assert.equal(transform('mat4(1)', { type: true }), 'mat4');
    assert.equal(transform('m*v', { types: { m: 'mat3', v: 'vec3' }, type: true }), 'vec3');
    assert.equal(transform('m*m', { types: { m: 'mat4' }, type: true }), 'mat4');
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

test('ramp() mixes its stops, each segment linear and at least a pixel wide', () => {
    assert.equal(transform('ramp(x, 0, 1)', { expect: 'float' }),
        'mix(0.0, 1.0, clamp((x - 0.0) / max(1.0 - 0.0, fwidth(x) + 1e-5), 0.0, 1.0))');
    assert.equal(transform('ramp(x, #fff)'), 'vec3(1.0, 1.0, 1.0)');
    assert.equal(transform('ramp(x)', { expect: 'float' }), '0.0');
    // the widest stop value is the type, and every stop takes it
    assert.equal(transform('ramp(x, 0, 1)', { type: true }), 'float');
    assert.equal(transform('ramp(x, #000 .5, #fff)', { type: true }), 'vec3');
    assert.equal(transform('ramp(x, vec4(1), 0)', { type: true }), 'vec4');
    assert.match(transform('ramp(x, vec4(1), 0)'), /^mix\(vec4\(1\.0\), vec4\(0\.0\), /);
    assert.match(transform('ramp(x, 1 - x, 0)', { expect: 'float' }), /^mix\(\(1\.0 - x\), 0\.0, /);
    assert.match(transform('ramp(x, 2t .5, 0)', { expect: 'float' }), /^mix\(\(2\.0 \* t\), 0\.0, clamp\(\(x - 0\.5\)/);
});

test('ramp() places its stops as CSS does', () => {
    const segments = code => [...transform(code, { expect: 'float' }).matchAll(/\(x - (\S+)\) \/ max\((\S+) - /g)]
        .map(m => m[1] + ' ' + m[2]);
    // the first defaults to 0, the last to 1, missing ones spread evenly
    assert.deepEqual(segments('ramp(x, 0, 1, 0)'), ['0.0 0.5', '0.5 1.0']);
    assert.deepEqual(segments('ramp(x, 0 .2, 1, 0 .9, 1)'), ['0.2 0.55', '0.55 0.9', '0.9 1.0']);
    assert.deepEqual(segments('ramp(x, 0, 1, 0, 1)'), ['0.0 0.3333333333333333', '0.3333333333333333 0.6666666666666667', '0.6666666666666667 1.0']);
    // a position never goes back, and a repeated one is a hard edge
    assert.deepEqual(segments('ramp(x, 1 .5, 0 .2)'), ['0.5 0.5']);
    assert.deepEqual(segments('ramp(x, #f80 .28, #068 .28, #015 .83)'), ['0.28 0.28', '0.28 0.83']);
    assert.deepEqual(segments('ramp(x, 0 -.1, 1)'), ['-0.1 1.0']);
});

test('ramp() reports positions that are not one number, and leaves them out', () => {
    const run = code => {
        const messages = [];
        return [transform(code, { expect: 'float', warn: m => messages.push(m) }), messages];
    };
    let [out, messages] = run('ramp(x, 0, 1 p, 0)');
    assert.match(out, /^mix\(mix\(0\.0, 1\.0, .*\(x - 0\.5\) \/ max\(1\.0 - 0\.5, /);
    assert.deepEqual(messages, ['"ramp(x, 0, 1 p, 0)": ramp() positions must be numbers']);
    [out, messages] = run('ramp(x, 0 .2 .5, 1)');
    assert.match(out, /\(x - 0\.2\) \/ max\(1\.0 - 0\.2, /);
    assert.deepEqual(messages, ['"ramp(x, 0 .2 .5, 1)": a ramp() stop takes one position']);
    // elsewhere a space still separates arguments
    assert.equal(transform('hsl(h .75 .65)'), 'hsl(h, .75, .65)');
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
    transform('a + b.x + c(d) + e', { names: { __proto__: null, a: 'cssd1' }, types: { e: 'float' }, unknown: n => { seen.push(n); } });
    assert.deepEqual(seen, ['b', 'd']);
});

test('an underscore is part of a name', () => {
    assert.equal(transform('u_time * 2'), '(u_time * 2.0)');
    assert.equal(transform('my_var_2 + _x'), '(my_var_2 + _x)');
    assert.equal(transform('a_b.x', { types: { a_b: 'vec2' } }), 'a_b.x');
});

test('a name ending in a digit keeps its swizzle', () => {
    const names = { __proto__: null, uv2: 'cssd1' };
    assert.equal(transform('uv2.x', { names, types: { cssd1: 'vec2' } }), 'cssd1.x');
    assert.equal(transform('p2.yx * 2', { types: { p2: 'vec2' } }), '(p2.yx * 2.0)');
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
    // #rgba and #rrggbbaa are vec4 literals; other lengths stay as written
    assert.equal(transform('#f008'), 'vec4(1.0, 0.0, 0.0, 0.5333333333333333)');
    assert.equal(transform('#ff000080 * .5'), '(vec4(1.0, 0.0, 0.0, 0.5019607843137255) * .5)');
    assert.equal(transform('#fffef'), '#fffef');
});

test('unknown may answer with a color, which is a vec3 or vec4 literal', () => {
    const colors = { __proto__: null, red: [1, 0, 0], glass: [0, 0, 1, 0.5] };
    const unknown = n => colors[n];
    assert.equal(transform('red', { unknown }), 'vec3(1.0, 0.0, 0.0)');
    assert.equal(transform('mix(red, glass, .5)', { unknown }), 'mix(vec3(1.0, 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.5), .5)');
    assert.equal(transform('red.g + glass.a', { unknown }), '(vec3(1.0, 0.0, 0.0).g + vec4(0.0, 0.0, 1.0, 0.5).a)');
    assert.equal(transform('red', { unknown, type: true }), 'vec3');
    // a mapped name wins over a color of the same spelling
    assert.equal(transform('red', { unknown, names: { __proto__: null, red: 'cssd1' } }), 'cssd1');
});

test('shape(d, size) is the mask of the shape and size statements', () => {
    assert.equal(transform('shape(d, .5)'), 'cssd_shape(d, .5)');
    assert.equal(transform('shape(length(uv))'), 'cssd_shape(length(uv), 1.0)');
    assert.equal(transform('mix(a, b, shape(d, .5))', { types: { a: 'vec3', b: 'vec3' } }), 'mix(a, b, cssd_shape(d, .5))');
    assert.equal(transform('shape(d, .5)', { type: true }), 'float');
});
