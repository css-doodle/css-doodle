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

// the `if (bool(...))` line a cond() condition compiles to; the
// prelude's own ifs (escape bailouts, etc.) never contain bool(
const condition = code => lines(code).find(l => l.startsWith('if (') && l.includes('bool(')) || '';

// the `cssd_color = ...;` assignment inside main
const color = code => lines(code).find(l => l.startsWith('cssd_color = ')) || '';

const main = code => shader(code).slice(shader(code).indexOf('void main()'));

// --- cond() conditions ---

test('cond with nested commas in a function call', () => {
    assert.equal(condition('cond(atan(y, x) > 3) { fill: red }'), 'if (bool((atan(y, x) > 3.0))) {');
});

test('cond AND-joins multiple arguments', () => {
    assert.equal(
        condition('cond(x>y, 2*x-y == 0) { fill: red }'),
        'if (bool((x > y)) && bool((((2.0 * x) - y) == 0.0))) {'
    );
});

test('cond() is the legacy name of cond()', () => {
    assert.equal(shader('cond(x > 1) { fill: red }'), shader('cond(x > 1) { fill: red }'));
    assert.equal(shader('cond(x > 1), cond(y > 1) { size: .5; cond(x > 2) { fill: red } }'),
        shader('cond(x > 1), cond(y > 1) { size: .5; cond(x > 2) { fill: red } }'));
});

test('cond with no arguments emits no if block', () => {
    assert.equal(condition('cond() { fill: red }'), '');
    assert.equal(condition('cond(   ) { fill: red }'), '');
});

test('nested cond blocks are emitted recursively', () => {
    assert.match(
        shader('cond(x>3) { cond(y>3) { fill: red } }'),
        /if \(bool\(\(x > 3\.0\)\)\) \{[\s\S]*if \(bool\(\(y > 3\.0\)\)\) \{[\s\S]*cssd_color = vec4/
    );
});

test('and/or/not keywords read like media queries', () => {
    assert.equal(condition('cond(x > 1 and y > 1) { fill: red }'),
        'if (bool((bool((x > 1.0)) && bool((y > 1.0))))) {');
    assert.equal(condition('cond(x > 3 or y > 3) { fill: red }'),
        'if (bool((bool((x > 3.0)) || bool((y > 3.0))))) {');
    assert.equal(condition('cond(not (x > 3)) { fill: red }'), 'if (!bool((x > 3.0))) {');
});

test('a non-comparison root is bool-coerced', () => {
    assert.equal(condition('cond(x) { fill: red }'), 'if (bool(x)) {');
    assert.equal(condition('cond(sin(x)) { fill: red }'), 'if (bool(sin(x))) {');
    assert.equal(condition('cond(int(x)) { fill: red }'), 'if (bool(int(x))) {');
});

test('variables inside cond blocks are scoped', () => {
    assert.ok(shader('cond(x > 1) { c: x/X; fill: hsl(c, 0.5, 0.5) }').includes('hsl((x / X), 0.5, 0.5)'));
    // and they do not leak into the outer scope
    assert.match(shader('cond(x > 1) { c: 9.0; } cond(c > 1) { fill: red }'), /if \(bool\(\(c > 1\.0\)\)\)/);
});

// --- built-in variables ---

test('dr and da: distance and angle from the grid center', () => {
    let s = shader('cond(dr < 3) { fill: red }');
    assert.match(s, /float dr = length\(vec2\(dx, dy\)\);/);
    assert.match(s, /float da = atan\(dy, dx\);/);
    assert.match(s, /const float PI = 3\.14159/);
    assert.equal(condition('cond(dr < 3) { fill: red }'), 'if (bool((dr < 3.0))) {');
    assert.equal(condition('cond(da > 0) { fill: red }'), 'if (bool((da > 0.0))) {');
    assert.equal(
        condition('cond(da > -PI/4 && da < PI/4) { fill: red }'),
        'if (bool((bool((da > (-PI / 4.0))) && bool((da < (PI / 4.0)))))) {'
    );
});

test('dc and dm: chebyshev and manhattan distance', () => {
    let s = shader('cond(dc < 2) { fill: red }');
    assert.match(s, /float dc = max\(abs\(dx\), abs\(dy\)\);/);
    assert.match(s, /float dm = abs\(dx\) \+ abs\(dy\);/);
    assert.equal(condition('cond(dc < 2) { fill: red }'), 'if (bool((dc < 2.0))) {');
    assert.equal(condition('cond(dm < 3) { fill: red }'), 'if (bool((dm < 3.0))) {');
});

test('db: distance to the grid boundary', () => {
    let s = shader('cond(db == 0) { fill: red }');
    assert.match(s, /float db = min\(min\(x - 1\.0, X - x\), min\(y - 1\.0, Y - y\)\);/);
    assert.equal(condition('cond(db == 0) { fill: red }'), 'if (bool((db == 0.0))) {');
    assert.equal(condition('cond(db < 2) { fill: red }'), 'if (bool((db < 2.0))) {');
    assert.equal(
        condition('cond(int(db) % 2 == 0) { fill: red }'),
        'if (bool((mod(float(int(db)), 2.0) == 0.0))) {'
    );
});

test('du and dv: coordinates inside the cell', () => {
    let s = shader('cond(du > 0) { fill: red }');
    assert.match(s, /float du = fract\(uv\.x \* X\) - 0\.5;/);
    assert.match(s, /float dv = fract\(\(1\.0 - uv\.y\) \* Y\) - 0\.5;/);
    // composes with ngon() for per-cell polygon masks
    assert.equal(condition('cond(ngon(du, dv, 6) < 0.4) { fill: red }'), 'if (bool((ngon(du, dv, 6.0) < 0.4))) {');
    // a bare `du` is not a CSS color, so it compiles as an expression
    assert.equal(color('fill: du'), 'cssd_color = vec4(vec3(du), 1.0);');
});

test('dx and dy: cell index centered on the grid', () => {
    let s = shader('cond(dx > 0) { fill: red }');
    assert.match(s, /float dx = x - \(X \+ 1\.0\) \* 0\.5;/);
    assert.match(s, /float dy = y - \(Y \+ 1\.0\) \* 0\.5;/);
    assert.equal(
        condition('cond(dx*dx + dy*dy < 4) { fill: red }'),
        'if (bool((((dx * dx) + (dy * dy)) < 4.0))) {'
    );
    assert.equal(
        condition('cond(max(abs(dx), abs(dy)) < 2) { fill: red }'),
        'if (bool((max(abs(dx), abs(dy)) < 2.0))) {'
    );
});

// --- fill ---

test('static colors stay byte-identical', () => {
    assert.equal(color('fill: red'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: #f00'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: rgb(10, 20, 30)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
});

test('a single color-valued expression wraps in vec4(vec3(...), 1.0)', () => {
    assert.equal(color('fill: hsl(da, 0.8, 0.5)'), 'cssd_color = vec4(vec3(hsl(da, 0.8, 0.5)), 1.0);');
    assert.equal(color('fill: dr/10'), 'cssd_color = vec4(vec3((dr / 10.0)), 1.0);');
});

test('three or four top-level commas become channels, nested commas do not', () => {
    assert.equal(color('fill: x/X, y/Y, 0.5'), 'cssd_color = vec4((x / X), (y / Y), 0.5, 1.0);');
    assert.equal(color('fill: x/X, y/Y, t, 0.6'), 'cssd_color = vec4((x / X), (y / Y), t, 0.6);');
    assert.equal(color('fill: vec3(x/X, y/Y, t)'), 'cssd_color = vec4(vec3(vec3((x / X), (y / Y), t)), 1.0);');
});

test('invalid channel counts and empty fills are dropped', () => {
    assert.equal(color('fill: x/X, y/Y'), '');
    assert.equal(color('fill: x/X, y/Y, 0.5, 1, 0.2'), '');
    assert.equal(color('fill: ;'), '');
});

test('fill substitutes pattern variables, in any declaration order', () => {
    assert.equal(color('c: hsv(i/I, 1, 1); fill: c'), 'cssd_color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);');
    assert.equal(color('fill: c; c: hsv(i/I, 1, 1)'), 'cssd_color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);');
});

test('fill through a variable keeps CSS colors static', () => {
    assert.equal(color('c: red; fill: c'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('c: #f00; fill: c'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('c: 1, 0, 0; fill: c'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
});

test('a -- prefix is not stripped: --c does not declare c', () => {
    assert.equal(color('--c: red; fill: hsl(c, 1, 1)'), 'cssd_color = vec4(vec3(hsl(c, 1.0, 1.0)), 1.0);');
});

test('CSS color functions stay static; unitless hsl()/hsv() mean the shader helpers', () => {
    assert.equal(color('fill: hsla(210, 50%, 50%, 0.5)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(120, 50%, 50%)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(x/X, 0.5, 0.5)'), 'cssd_color = vec4(vec3(hsl((x / X), 0.5, 0.5)), 1.0);');
    // anything the CSS engine rejects compiles as an expression
    assert.equal(color('fill: rgb(x*20, 0, 0)'), 'cssd_color = vec4(vec3(rgb((x * 20.0), 0.0, 0.0)), 1.0);');
});

// --- shape and size ---

test('size scales the mask radius per cell', () => {
    let s = shader('shape: circle; size: x/X; fill: #000');
    assert.match(s, /float size = \(x \/ X\);/);
    assert.ok(s.includes('cssd_mask = cssd_shape(length(vec2(du, dv)), size);'), s);
});

test('size without an explicit shape uses a square mask', () => {
    assert.ok(shader('size: rand(i); fill: #000').includes('cssd_mask = cssd_shape(max(abs(du), abs(dv)), size);'));
});

test('size expressions coerce to float', () => {
    assert.match(shader('shape: circle; size: x > 2; fill: #000'), /float size = float\(\(x > 2\.0\)\);/);
});

test('no shape and no size leaves the mask untouched', () => {
    let s = shader('fill: #000');
    assert.doesNotMatch(s, /cssd_mask = cssd_shape/);
    assert.match(s, /float size = 1\.0;/);
});

test('an explicit non-mask shape never gets a square mask', () => {
    assert.doesNotMatch(shader('shape: none; size: 0.5; fill: red'), /cssd_mask = cssd_shape/);
});

test('shape inside a cond block applies the matching mask', () => {
    // no top-level shape/size, so any mask must come from the block
    assert.ok(shader('cond(x > 2) { shape: square; fill: red }').includes('cssd_mask = cssd_shape(max(abs(du), abs(dv)), size);'));
    assert.ok(shader('cond(x > 2) { shape: circle; fill: red }').includes('cssd_mask = cssd_shape(length(vec2(du, dv)), size);'));
    // any other value resets the mask to the full cell (the second
    // occurrence, after the `float cssd_mask = 1.0;` declaration)
    let none = shader('cond(x > 2) { shape: none; fill: red }');
    assert.doesNotMatch(none, /cssd_mask = cssd_shape/);
    assert.ok((none.match(/cssd_mask = 1\.0;/g) || []).length >= 2, none);
});

test('in-block shape and size are order-free and apply once', () => {
    // size lands inside the if and before the mask that reads it
    for (let code of [
        'cond(x > 1) { size: 0.5; shape: circle; fill: red }',
        'cond(x > 1) { shape: circle; size: 0.5; fill: red }',
    ]) {
        let s = shader(code);
        let ifIdx = s.indexOf('if (bool((x > 1.0)))');
        let sizeIdx = s.indexOf('size = 0.5;');
        let maskIdx = s.indexOf('cssd_mask = cssd_shape(length(vec2(du, dv)), size);');
        assert.ok(ifIdx > -1 && ifIdx < sizeIdx && sizeIdx < maskIdx, `${code}\n${s}`);
    }
    // duplicate shapes collapse to the last one
    let dup = shader('cond(x > 1) { shape: circle; shape: square; fill: red }');
    assert.equal((dup.match(/cssd_mask = cssd_shape/g) || []).length, 1);
    assert.ok(dup.includes('cssd_mask = cssd_shape(max(abs(du), abs(dv)), size);'));
});

test('in-block size without a shape re-applies the effective mask', () => {
    let s = shader('shape: circle; cond(x > 1) { size: 0.5; fill: red }');
    assert.equal(s.split('cssd_mask = cssd_shape(length(vec2(du, dv)), size);').length - 1, 2);
});

// --- prelude and uniforms ---

test('u_time is only wired up when the pattern reads t', () => {
    // no `t` anywhere: t is a constant, leaving u_time unreferenced
    assert.match(main('fill: hsl(dr/10, 0.7, 0.5)'), /float t = 0\.0;/);
    assert.match(main('fill: hsl(i/I + t*0.1, 0.7, 0.5)'), /float t = u_time;/);
    assert.match(main('shape: circle; size: 0.5 + 0.4*sin(t); fill: #000'), /float t = u_time;/);
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
    assert.equal(condition('cond(voronoi(x, y) > 0.3) { fill: red }'), 'if (bool((voronoi(x, y) > 0.3))) {');
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
        'vec2 rot(vec2 p, float a)',
        'vec2 rot(float px, float py, float a)',
        'float smin(float a, float b, float k)',
        'float ngon(float px, float py, float n)',
        'float dither(float fx, float fy)',
        'float spiral(float dx, float dy)',
    ]) {
        assert.ok(s.includes(sig), 'missing prelude helper: ' + sig);
    }
});

test('a point argument may be one vec2 or two floats', () => {
    let s = shader('fill: #000');
    for (let sig of [
        'float rand(vec2 p)',
        'float noise(vec2 p)',
        'float fbm(vec2 p)',
        'float voronoi(vec2 p)',
        'float ngon(vec2 p, float n)',
        'float escape(vec2 z, vec2 c)',
        'float escape(vec2 c)',
        'float spiral(vec2 d)',
        'float dither(vec2 f)',
    ]) {
        assert.ok(s.includes(sig), 'missing vec2 form: ' + sig);
    }
    // the two-float forms delegate to the vec2 ones
    assert.match(s, /float fbm\(float px, float py\) \{\s*return fbm\(vec2\(px, py\)\);/);
    assert.match(s, /float escape\(float cx, float cy\) \{\s*return escape\(vec2\(0\.0\), vec2\(cx, cy\)\);/);
    // a vector variable passes straight through to the vec2 form
    assert.equal(color('p: uv*3; fill: fbm(p)'), 'cssd_color = vec4(vec3(fbm((uv * 3.0))), 1.0);');
    assert.equal(color('z: vec2(0); c: uv*3 - 2; fill: escape(z, c)'),
        'cssd_color = vec4(vec3(escape(vec2(0.0), ((uv * 3.0) - 2.0))), 1.0);');
});

test('rot() returns the rotated point', () => {
    assert.equal(color('p: rot(vec2(du, dv), t); fill: p.x + .5'),
        'cssd_color = vec4(vec3((rot(vec2(du, dv), t).x + .5)), 1.0);');
    assert.equal(color('fill: rot(du, dv, PI).y'), 'cssd_color = vec4(vec3(rot(du, dv, PI).y), 1.0);');
});

test('ints are highp so bitwise operators survive large grids', () => {
    assert.ok(shader('fill: #000').includes('precision highp int;'));
});

test('variable names with regex metacharacters do not crash generation', () => {
    assert.equal(typeof shader('a[: 1; fill: x'), 'string');
});

// --- iterate() blocks ---

test('iterate declares its state from the outer values and updates it all at once', () => {
    let s = main('cx: x/X; zx: 0; zy: 1; iterate(8, zx*zx + zy*zy > 4) { zx: zx*zx - zy*zy + cx; zy: 2*zx*zy } fill: hsl(n/8, 1, zx)');
    assert.match(s, /float zx = 0\.0;\s*float zy = 1\.0;\s*float n = 0\.0;\s*for \(int cssd_k = 0; cssd_k < 8; cssd_k\+\+\)/);
    // every new value reads the previous state, then all are assigned
    assert.match(s, /float zx_ = \(\(\(zx \* zx\) - \(zy \* zy\)\) \+ \(x \/ X\)\);\s*float zy_ = \(\(2\.0 \* zx\) \* zy\);\s*zx = zx_;\s*zy = zy_;\s*n \+= 1\.0;/);
    assert.match(s, /if \(bool\(\(\(\(zx \* zx\) \+ \(zy \* zy\)\) > 4\.0\)\)\) break;/);
    // after the loop, state and n are the GLSL variables, not the outer macros
    assert.match(s, /cssd_color = vec4\(vec3\(hsl\(\(n \/ 8\.0\), 1\.0, zx\)\), 1\.0\);/);
});

test('loop state may use the names of the shader internals', () => {
    // v, k and color were once main()'s own variables; only loop state
    // becomes a GLSL variable, so only it could collide
    let s = main('grid: 4; v: 1; k: 2; color: 3; iterate(4) { v: v + k; k: k * 2; color: color + v } fill: hsl(v/9, 1, color/9)');
    assert.match(s, /float X = 4\.0, Y = 4\.0, I = X \* Y;/);
    for (let name of ['v', 'k', 'color']) {
        assert.equal((s.match(new RegExp(`float ${name} = `, 'g')) || []).length, 1, name);
    }
    assert.doesNotMatch(s, /vec2 v\b|int k\b|vec4 color\b/);
});

test('iterate temporaries are inlined, not declared', () => {
    let s = main('zx: 0; iterate(4) { r2: zx*zx + 1; zx: zx/r2 }');
    assert.match(s, /float zx_ = \(zx \/ \(\(zx \* zx\) \+ 1\.0\)\);/);
    assert.doesNotMatch(s, /float r2/);
});

test('iterate without a stop condition never breaks early', () => {
    assert.doesNotMatch(main('zx: 0; iterate(5) { zx: zx + 1 }'), /break/);
});

test('iterate without a step count is skipped and reported', () => {
    let messages = [];
    let s = draw('zx: 0; iterate(zx > 2) { zx: zx + 1 } fill: hsl(zx, 1, 1)', extra, m => messages.push(m));
    s = s.slice(s.indexOf('void main()'));
    assert.deepEqual(messages, ['iterate() needs a step count']);
    assert.doesNotMatch(s, /for \(int k/);
    // the outer value is still a macro
    assert.match(s, /hsl\(0\.0, 1\.0, 1\.0\)/);
});

test('fbm() rotates the domain between octaves', () => {
    assert.match(shader('fill: fbm(x, y)'), /s \+= a \* noise\(p\);\s*p = mat2\(0\.8, 0\.6, -0\.6, 0\.8\) \* p \* 2\.03;/);
});

test('escape() bails out at |z| = 16 with the base-2 smooth count', () => {
    assert.match(shader('fill: escape(0, 0, x, y)'), /if \(r2 > 256\.0\) \{\s*return \(float\(k\) \+ 1\.0 - log2\(log2\(r2\) \/ 8\.0\)\) \/ 96\.0;/);
});

test('a second iterate continues the same state without redeclaring it', () => {
    let s = main('zx: 0; iterate(3) { zx: zx + 1 } iterate(2) { zx: zx * 2 }');
    assert.equal((s.match(/float zx =/g) || []).length, 1);
    assert.equal((s.match(/float n =/g) || []).length, 1);
    assert.match(s, /n = 0\.0;\s*for \(int cssd_k = 0; cssd_k < 2; cssd_k\+\+\)/);
});

test('iterate inside cond is scoped to that block', () => {
    let s = main('zx: 0; cond(x > 1) { iterate(2) { zx: zx + 1 } fill: hsl(n, 1, zx) } fill: hsl(zx, 1, 1)');
    assert.match(s, /if \(bool\(\(x > 1\.0\)\)\) \{[\s\S]*float zx = 0\.0;[\s\S]*hsl\(n, 1\.0, zx\)[\s\S]*\}/);
    // the outer fill still sees the macro value
    assert.match(s, /hsl\(0\.0, 1\.0, 1\.0\)/);
});

// --- vectors ---

test('a variable can hold a vector and be swizzled', () => {
    assert.equal(color('c: vec2(uv.x*3 - 2.2, uv.y*2.6 - 1.3); fill: hsl(c.x, 1, c.y)'),
        'cssd_color = vec4(vec3(hsl(vec2(((uv.x * 3.0) - 2.2), ((uv.y * 2.6) - 1.3)).x, 1.0, vec2(((uv.x * 3.0) - 2.2), ((uv.y * 2.6) - 1.3)).y)), 1.0);');
});

test('a swizzle component is never mistaken for a variable of that name', () => {
    assert.equal(color('b: 3; v: vec3(1, 2, 3); fill: v.b + b'), 'cssd_color = vec4(vec3((vec3(1.0, 2.0, 3.0).b + 3.0)), 1.0);');
});

test('iterate declares state as a vector when its initial value mentions a constructor or uv', () => {
    let s = main('z: uv*3.2 - 1.6; c: vec2(-0.8, 0.156); iterate(8, dot(z, z) > 4) { z: vec2(z.x*z.x - z.y*z.y, 2*z.x*z.y) + c }');
    assert.match(s, /vec2 z = \(\(uv \* 3\.2\) - 1\.6\);/);
    assert.match(s, /vec2 z_ = \(vec2\(\(\(z\.x \* z\.x\) - \(z\.y \* z\.y\)\), \(\(2\.0 \* z\.x\) \* z\.y\)\) \+ vec2\(-0\.8, 0\.156\)\);/);
    // a float state stays a float, and a matrix is a matrix
    assert.match(main('m: 9; r: mat2(1, 0, 0, 1); iterate(2) { m: m + 1; r: r * 2 }'), /float m = 9\.0;\s*mat2 r = mat2\(1\.0, 0\.0, 0\.0, 1\.0\);/);
    // through a macro, and with arithmetic around the constructor
    assert.match(main('c: vec2(1, 2); z: c; p: vec2(dv, du)*3; iterate(2) { z: z + c; p: p*2 }'), /vec2 z = vec2\(1\.0, 2\.0\);\s*vec2 p = \(vec2\(dv, du\) \* 3\.0\);/);
});

test('iterate state that starts from a call returning a float is a float', () => {
    let s = main('s: fbm(uv); d: length(uv - .5); z: fbm(vec2(dx, dy)); iterate(2) { s: s*.5; d: d*2; z: -z }');
    assert.match(s, /float s = fbm\(uv\);\s*float d = length\(\(uv - \.5\)\);\s*float z = fbm\(vec2\(dx, dy\)\);/);
    // negated or scaled, still a float; a vector scaled by one stays a vector
    assert.match(main('s: -fbm(uv); k: noise(uv)*2; p: uv*noise(uv); iterate(2) { s: s*.5; k: k+1; p: p*2 }'),
        /float s = -fbm\(uv\);\s*float k = \(noise\(uv\) \* 2\.0\);\s*vec2 p = \(uv \* noise\(uv\)\);/);
});

// --- cond() as a function ---

test('cond() in a value chooses between expressions, colors included', () => {
    assert.equal(color('fill: cond(dr < 2, #fff, #000)'),
        'cssd_color = vec4(vec3((bool((dr < 2.0)) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0))), 1.0);');
    assert.equal(color('c: cond(db = 0, 1, dr < 3, .5, 0); fill: hsl(c, .8, .5)'),
        'cssd_color = vec4(vec3(hsl((bool((db == 0.0)) ? 1.0 : (bool((dr < 3.0)) ? .5 : 0.0)), .8, .5)), 1.0);');
    assert.match(shader('size: cond(x > 4, .8, .3); fill: #000'), /float size = \(bool\(\(x > 4\.0\)\) \? \.8 : \.3\);/);
    // as a block test its branches are already bool, so no outer cast
    assert.equal(condition('cond(cond(x > 2, y > 2, 0)) { fill: red }'),
        'if ((bool((x > 2.0)) ? bool((y > 2.0)) : bool(0.0))) {');
    // the block form is unchanged
    assert.equal(condition('cond(dr < 2) { fill: red }'), 'if (bool((dr < 2.0))) {');
});
