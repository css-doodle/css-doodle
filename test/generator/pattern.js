import test from 'node:test';
import assert from 'node:assert/strict';

import draw from '../../src/generator/pattern.js';

// emulates the browser's parse-or-null getRgbaColor: values the CSS
// engine would accept as colors resolve (to red, for easy assertions),
// anything else returns null and compiles as a shader expression
function isCssColor(v) {
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
    if (/^(red|black|white|tan|transparent)$/i.test(v)) return true;
    if (/^(rgb|rgba|hsla)\(\s*[\d.,%\s/]+\)$/i.test(v)) return true;
    if (/^hsl\([^)]*%[^)]*\)$/i.test(v)) return true;
    return false;
}
const extra = {
    getRgbaColor: v => isCssColor(v) ? { r: 255, g: 0, b: 0, a: 1 } : null,
};

const shader = code => draw(code, extra);
const lines = code => shader(code).split('\n').map(l => l.trim());

// the `if (bool(...))` line a match() condition compiles to; the
// prelude's own ifs (escape bailouts, etc.) never contain bool(
const condition = code => lines(code).find(l => l.startsWith('if (') && l.includes('bool(')) || '';

// the `color = ...;` assignment inside getColor
const color = code => lines(code).find(l => l.startsWith('color = ')) || '';

const main = code => shader(code).slice(shader(code).indexOf('void main()'));

// --- match() conditions ---

test('match with nested commas in a function call', () => {
    assert.equal(condition('match(atan(y, x) > 3) { fill: red }'), 'if (bool((atan(y, x) > 3.0))) {');
});

test('match AND-joins multiple arguments', () => {
    assert.equal(
        condition('match(x>y, 2*x-y == 0) { fill: red }'),
        'if (bool((x > y)) && bool((((2.0 * x) - y) == 0.0))) {'
    );
});

test('match with no arguments emits no if block', () => {
    assert.equal(condition('match() { fill: red }'), '');
    assert.equal(condition('match(   ) { fill: red }'), '');
});

test('nested match blocks are emitted recursively', () => {
    assert.match(
        shader('match(x>3) { match(y>3) { fill: red } }'),
        /if \(bool\(\(x > 3\.0\)\)\) \{[\s\S]*if \(bool\(\(y > 3\.0\)\)\) \{[\s\S]*color = vec4/
    );
});

test('and/or/not keywords read like media queries', () => {
    assert.equal(condition('match(x > 1 and y > 1) { fill: red }'),
        'if (bool((bool((x > 1.0)) && bool((y > 1.0))))) {');
    assert.equal(condition('match(x > 3 or y > 3) { fill: red }'),
        'if (bool((bool((x > 3.0)) || bool((y > 3.0))))) {');
    assert.equal(condition('match(not (x > 3)) { fill: red }'), 'if (!bool((x > 3.0))) {');
});

test('a non-comparison root is bool-coerced', () => {
    assert.equal(condition('match(x) { fill: red }'), 'if (bool(x)) {');
    assert.equal(condition('match(sin(x)) { fill: red }'), 'if (bool(sin(x))) {');
    assert.equal(condition('match(int(x)) { fill: red }'), 'if (bool(int(x))) {');
});

test('variables inside match blocks are scoped and need no -- prefix', () => {
    assert.ok(shader('match(x > 1) { c: x/X; fill: hsl(c, 0.5, 0.5) }').includes('hsl((x / X), 0.5, 0.5)'));
    // and they do not leak into the outer scope
    assert.match(shader('match(x > 1) { c: 9.0; } match(c > 1) { fill: red }'), /if \(bool\(\(c > 1\.0\)\)\)/);
});

// --- built-in variables ---

test('dr and da: distance and angle from the grid center', () => {
    let s = shader('match(dr < 3) { fill: red }');
    assert.match(s, /float dr = length\(vec2\(dx, dy\)\);/);
    assert.match(s, /float da = atan\(dy, dx\);/);
    assert.match(s, /const float PI = 3\.14159/);
    assert.equal(condition('match(dr < 3) { fill: red }'), 'if (bool((dr < 3.0))) {');
    assert.equal(condition('match(da > 0) { fill: red }'), 'if (bool((da > 0.0))) {');
    assert.equal(
        condition('match(da > -PI/4 && da < PI/4) { fill: red }'),
        'if (bool((bool((da > (-PI / 4.0))) && bool((da < (PI / 4.0)))))) {'
    );
});

test('dc and dm: chebyshev and manhattan distance', () => {
    let s = shader('match(dc < 2) { fill: red }');
    assert.match(s, /float dc = max\(abs\(dx\), abs\(dy\)\);/);
    assert.match(s, /float dm = abs\(dx\) \+ abs\(dy\);/);
    assert.equal(condition('match(dc < 2) { fill: red }'), 'if (bool((dc < 2.0))) {');
    assert.equal(condition('match(dm < 3) { fill: red }'), 'if (bool((dm < 3.0))) {');
});

test('db: distance to the grid boundary', () => {
    let s = shader('match(db == 0) { fill: red }');
    assert.match(s, /float db = min\(min\(x - 1\.0, v\.x - x\), min\(y - 1\.0, v\.y - y\)\);/);
    assert.equal(condition('match(db == 0) { fill: red }'), 'if (bool((db == 0.0))) {');
    assert.equal(condition('match(db < 2) { fill: red }'), 'if (bool((db < 2.0))) {');
    assert.equal(
        condition('match(int(db) % 2 == 0) { fill: red }'),
        'if (bool((mod(float(int(db)), 2.0) == 0.0))) {'
    );
});

test('du and dv: coordinates inside the cell', () => {
    let s = shader('match(du > 0) { fill: red }');
    assert.match(s, /float du = fract\(uv\.x \* v\.x\) - 0\.5;/);
    assert.match(s, /float dv = fract\(\(1\.0 - uv\.y\) \* v\.y\) - 0\.5;/);
    // composes with ngon() for per-cell polygon masks
    assert.equal(condition('match(ngon(du, dv, 6) < 0.4) { fill: red }'), 'if (bool((ngon(du, dv, 6.0) < 0.4))) {');
    // a bare `du` is not a CSS color, so it compiles as an expression
    assert.equal(color('fill: du'), 'color = vec4(vec3(du), 1.0);');
});

test('dx and dy: cell index centered on the grid', () => {
    let s = shader('match(dx > 0) { fill: red }');
    assert.match(s, /float dx = x - \(v\.x \+ 1\.0\) \* 0\.5;/);
    assert.match(s, /float dy = y - \(v\.y \+ 1\.0\) \* 0\.5;/);
    assert.equal(
        condition('match(dx*dx + dy*dy < 4) { fill: red }'),
        'if (bool((((dx * dx) + (dy * dy)) < 4.0))) {'
    );
    assert.equal(
        condition('match(max(abs(dx), abs(dy)) < 2) { fill: red }'),
        'if (bool((max(abs(dx), abs(dy)) < 2.0))) {'
    );
});

// --- fill ---

test('static colors stay byte-identical', () => {
    assert.equal(color('fill: red'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: #f00'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: rgb(10, 20, 30)'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
});

test('a single color-valued expression wraps in vec4(vec3(...), 1.0)', () => {
    assert.equal(color('fill: hsl(da, 0.8, 0.5)'), 'color = vec4(vec3(hsl(da, 0.8, 0.5)), 1.0);');
    assert.equal(color('fill: dr/10'), 'color = vec4(vec3((dr / 10.0)), 1.0);');
});

test('three or four top-level commas become channels, nested commas do not', () => {
    assert.equal(color('fill: x/X, y/Y, 0.5'), 'color = vec4((x / X), (y / Y), 0.5, 1.0);');
    assert.equal(color('fill: x/X, y/Y, t, 0.6'), 'color = vec4((x / X), (y / Y), t, 0.6);');
    assert.equal(color('fill: vec3(x/X, y/Y, t)'), 'color = vec4(vec3(vec3((x / X), (y / Y), t)), 1.0);');
});

test('invalid channel counts and empty fills are dropped', () => {
    assert.equal(color('fill: x/X, y/Y'), '');
    assert.equal(color('fill: x/X, y/Y, 0.5, 1, 0.2'), '');
    assert.equal(color('fill: ;'), '');
});

test('fill substitutes pattern variables, in any declaration order', () => {
    assert.equal(color('--c: hsv(i/I, 1, 1); fill: c'), 'color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);');
    assert.equal(color('fill: c; --c: hsv(i/I, 1, 1)'), 'color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);');
});

test('fill through a variable keeps CSS colors static', () => {
    assert.equal(color('--c: red; fill: c'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('--c: #f00; fill: c'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('--c: 1, 0, 0; fill: c'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
});

test('CSS color functions stay static; unitless hsl()/hsv() mean the shader helpers', () => {
    assert.equal(color('fill: hsla(210, 50%, 50%, 0.5)'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(120, 50%, 50%)'), 'color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(x/X, 0.5, 0.5)'), 'color = vec4(vec3(hsl((x / X), 0.5, 0.5)), 1.0);');
    // anything the CSS engine rejects compiles as an expression
    assert.equal(color('fill: rgb(x*20, 0, 0)'), 'color = vec4(vec3(rgb((x * 20.0), 0.0, 0.0)), 1.0);');
});

// --- shape and size ---

test('size scales the mask radius per cell', () => {
    let s = shader('shape: circle; size: x/X; fill: #000');
    assert.match(s, /float size = \(x \/ X\);/);
    assert.match(s, /float radius = 0\.5 \* size;/);
});

test('size without an explicit shape uses a square mask', () => {
    assert.match(shader('size: rand(i); fill: #000'), /float dsq = max\(abs\(cellUV\.x\), abs\(cellUV\.y\)\);/);
});

test('size expressions coerce to float', () => {
    assert.match(shader('shape: circle; size: x > 2; fill: #000'), /float size = float\(\(x > 2\.0\)\);/);
});

test('no shape and no size leaves the mask untouched', () => {
    let s = shader('fill: #000');
    assert.doesNotMatch(s, /cellUV/);
    assert.match(s, /float size = 1\.0;/);
});

test('an explicit non-mask shape never gets a square mask', () => {
    assert.doesNotMatch(shader('shape: none; size: 0.5; fill: red'), /float dsq/);
});

test('shape inside a match block applies the matching mask', () => {
    // no top-level shape/size, so any mask must come from the block
    assert.match(shader('match(x > 2) { shape: square; fill: red }'),
        /float dsq = max\(abs\(cellUV\.x\), abs\(cellUV\.y\)\);/);
    assert.match(shader('match(x > 2) { shape: circle; fill: red }'), /float dist = length\(cellUV\);/);
    // any other value resets the mask to the full cell (the second
    // occurrence, after the `float shapeMask = 1.0;` declaration)
    let none = shader('match(x > 2) { shape: none; fill: red }');
    assert.doesNotMatch(none, /cellUV/);
    assert.ok((none.match(/shapeMask = 1\.0;/g) || []).length >= 2, none);
});

test('in-block shape and size are order-free and apply once', () => {
    // size lands inside the if and before the mask that reads it
    for (let code of [
        'match(x > 1) { size: 0.5; shape: circle; fill: red }',
        'match(x > 1) { shape: circle; size: 0.5; fill: red }',
    ]) {
        let s = shader(code);
        let ifIdx = s.indexOf('if (bool((x > 1.0)))');
        let sizeIdx = s.indexOf('size = 0.5;');
        let maskIdx = s.indexOf('float dist = length(cellUV);');
        assert.ok(ifIdx > -1 && ifIdx < sizeIdx && sizeIdx < maskIdx, `${code}\n${s}`);
    }
    // duplicate shapes collapse to the last one instead of redeclaring locals
    let dup = shader('match(x > 1) { shape: circle; shape: square; fill: red }');
    assert.equal((dup.match(/vec2 cellUV/g) || []).length, 1);
    assert.match(dup, /float dsq/);
});

test('in-block size without a shape re-applies the effective mask', () => {
    let s = shader('shape: circle; match(x > 1) { size: 0.5; fill: red }');
    assert.equal((s.match(/float dist = length\(cellUV\);/g) || []).length, 2);
});

// --- prelude and uniforms ---

test('u_time is only wired up when the pattern reads t', () => {
    // no `t` anywhere: getColor receives 0.0, leaving uTime unreferenced
    assert.match(main('fill: hsl(dr/10, 0.7, 0.5)'), /v\.y, 0\.0, uv/);
    assert.match(main('fill: hsl(i/I + t*0.1, 0.7, 0.5)'), /v\.y, u_time, uv/);
    assert.match(main('shape: circle; size: 0.5 + 0.4*sin(t); fill: #000'), /v\.y, u_time, uv/);
});

test('rand/noise/hsl built-ins are declared in the prelude', () => {
    let s = shader('fill: #000');
    for (let sig of [
        'float rand(float a, float b)',
        'float rand(float n)',
        'float noise(float a, float b)',
        'vec3 hsl(float h, float s, float l)',
        'vec3 hsv(float h, float s, float v)',
    ]) {
        assert.ok(s.includes(sig), 'missing prelude helper: ' + sig);
    }
    // GLSL ES reserves identifiers containing consecutive underscores
    assert.doesNotMatch(s, /__/);
});

test('fbm() and voronoi() built-ins are available', () => {
    let s = shader('grid:40; fill: fbm(x/8, y/8)');
    assert.ok(s.includes('float fbm(float px, float py)'));
    assert.ok(s.includes('float voronoi(float px, float py)'));
    assert.equal(condition('match(voronoi(x, y) > 0.3) { fill: red }'), 'if (bool((voronoi(x, y) > 0.3))) {');
});

test('noise() and voronoi() lattices are offset by the seed like rand', () => {
    let s = shader('fill: noise(x, y)');
    assert.ok(s.includes('vec2 ip = floor(p) + u_seed.x * 71.0;'), 'noise() lattice is not seed-offset');
    assert.ok(s.includes('ip = floor(p) + u_seed.x * 71.0, fp = fract(p);'), 'voronoi() lattice is not seed-offset');
});

test('escape() and the math/geometry built-ins are available', () => {
    let s = shader('grid:1; fill: escape(0, 0, uv.x, uv.y)');
    for (let sig of [
        'float escape(float zx, float zy, float cx, float cy)',
        'float rotx(float px, float py, float a)',
        'float roty(float px, float py, float a)',
        'float smin(float a, float b, float k)',
        'float ngon(float px, float py, float n)',
        'float dither(float fx, float fy)',
        'float gcd(float a, float b)',
        'float prime(float fn)',
        'float spiral(float dx, float dy)',
        'float digitsum(float fn, float fb)',
        'float digitsum(float fn)',
        'float collatz(float fn)',
    ]) {
        assert.ok(s.includes(sig), 'missing prelude helper: ' + sig);
    }
});

test('integer helpers run at highp with clamped conversions', () => {
    let s = shader('fill: #000');
    assert.ok(s.includes('precision highp int;'));
    assert.ok(s.includes('int cssd_int(float f)'));
});

test('variable names with regex metacharacters do not crash generation', () => {
    assert.equal(typeof shader('a[: 1; fill: x'), 'string');
});
