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

// the `cssd_color = ...;` assignment inside main
const color = code => lines(code).find(l => l.startsWith('cssd_color = ')) || '';

const main = code => shader(code).slice(shader(code).indexOf('void main()'));

// the `if (...)` line a match() condition compiles to: the first if inside
// main, the prelude's own ifs (escape bailouts, etc.) all come before it
const condition = code => main(code).split('\n').map(l => l.trim()).find(l => l.startsWith('if (')) || '';

// --- match() conditions ---

test('match with nested commas in a function call', () => {
    assert.equal(condition('match(atan(y, x) > 3) { fill: red }'), 'if ((atan(y, x) > 3.0)) {');
});

test('match takes one expression', () => {
    let messages = [];
    assert.equal(condition('match(x>y, 2*x-y == 0) { fill: red }'), '');
    draw('match(x>y, 2*x-y == 0) { fill: red }', extra, message => messages.push(message));
    assert.deepEqual(messages, ['match() needs one expression']);
});

test('match with no arguments emits no if block', () => {
    assert.equal(condition('match() { fill: red }'), '');
    assert.equal(condition('match(   ) { fill: red }'), '');
});

test('nested match blocks are emitted recursively', () => {
    assert.match(
        shader('match(x>3) { match(y>3) { fill: red } }'),
        /if \(\(x > 3\.0\)\) \{[\s\S]*if \(\(y > 3\.0\)\) \{[\s\S]*cssd_color = vec4/
    );
});

test('and/or/not keywords read like media queries', () => {
    assert.equal(condition('match(x > 1 and y > 1) { fill: red }'),
        'if (((x > 1.0) && (y > 1.0))) {');
    assert.equal(condition('match(x > 3 or y > 3) { fill: red }'),
        'if (((x > 3.0) || (y > 3.0))) {');
    assert.equal(condition('match(not (x > 3)) { fill: red }'), 'if (!(x > 3.0)) {');
});

test('a non-comparison root is bool-coerced', () => {
    assert.equal(condition('match(x) { fill: red }'), 'if (bool(x)) {');
    assert.equal(condition('match(sin(x)) { fill: red }'), 'if (bool(sin(x))) {');
    assert.equal(condition('match(int(x)) { fill: red }'), 'if (bool(int(x))) {');
    assert.equal(condition('match(uv) { fill: red }'), 'if (any(bvec2(uv))) {');
    assert.equal(condition('match(lessThan(uv, vec2(.5))) { fill: red }'), 'if (any(lessThan(uv, vec2(.5)))) {');
    assert.equal(condition('match(uv == vec2(0)) { fill: red }'), 'if (all(equal(uv, vec2(0.0)))) {');
    assert.equal(condition('match(uv < vec2(1)) { fill: red }'), 'if (all(lessThan(uv, vec2(1.0)))) {');
});

test('variables inside match blocks are scoped', () => {
    assert.match(
        main('match(x > 1) { c: x/X; fill: hsl(c, 0.5, 0.5) }'),
        /if \(\(x > 1\.0\)\) \{\s*float cssd1 = \(x \/ X\);\s*cssd_color = vec4\(hsl\(cssd1, 0\.5, 0\.5\), 1\.0\);/
    );
    // and they do not leak into the outer scope
    let messages = [];
    let s = draw('match(x > 1) { c: 9.0; } match(c > 1) { fill: red }', extra, m => messages.push(m));
    assert.match(s, /if \(\(c > 1\.0\)\)/);
    assert.deepEqual(messages, ['unknown name c']);
});

test('a match block assigns to a variable of an enclosing scope', () => {
    assert.match(
        main('c: 1; match(x > 1) { c: c * 2 } fill: c'),
        /float cssd1 = 1\.0;\s*if \(\(x > 1\.0\)\) \{\s*cssd1 = \(cssd1 \* 2\.0\);\s*\}\s*cssd_color = vec4\(vec3\(cssd1\), 1\.0\);/
    );
    // the assignment keeps the declared type
    assert.match(main('p: uv; match(x > 1) { p: 1 } fill: p.x'), /cssd1 = vec2\(1\.0\);/);
});

test('else blocks follow a match, and may carry a test of their own', () => {
    assert.match(
        main('match(x > 1) { fill: red } else { fill: 0, 0, 0 }'),
        /if \(\(x > 1\.0\)\) \{\s*cssd_color = vec4\(1\.0, 0\.0, 0\.0, 1\.0\);\s*\} else \{\s*cssd_color = vec4\(vec3\(0\.0, 0\.0, 0\.0\), 1\.0\);\s*\}/
    );
    assert.match(
        main('match(x > 1) { fill: red } else match(y > 1) { fill: red } else { fill: 0, 0, 0 }'),
        /if \(\(x > 1\.0\)\) \{[^}]*\} else if \(\(y > 1\.0\)\) \{[^}]*\} else \{[^}]*\}/
    );
    // an else head may list selectors too
    let s = main('match(x > 1) { fill: red } else match(y > 1), match(y < 0) { fill: red } fill: red');
    assert.match(s, /\} else if \(\(y > 1\.0\) \|\| \(y < 0\.0\)\) \{/);
    assert.equal((s.match(/if \(/g) || []).length, 2);
    let messages = [];
    s = draw('else { fill: red }', extra, m => messages.push(m));
    assert.deepEqual(messages, ['else needs a match block before it']);
    assert.doesNotMatch(s.slice(s.indexOf('void main()')), /else/);
});

test('the selectors of one head make one test over one body', () => {
    let s = main('match(x < 3), match(x > 4) { c: 1; fill: red } match(y > 2) { fill: red }');
    assert.match(s, /if \(\(x < 3\.0\) \|\| \(x > 4\.0\)\) \{\s*float cssd1 = 1\.0;/);
    assert.equal((s.match(/if \(/g) || []).length, 2);
});

// --- built-in variables ---

test('dr and da: distance and angle from the grid center', () => {
    let s = shader('match(dr < 3) { fill: red }');
    assert.match(s, /float dr = length\(vec2\(dx, dy\)\);/);
    assert.match(s, /float da = atan\(dy, dx\);/);
    assert.match(s, /const float PI = 3\.14159/);
    assert.equal(condition('match(dr < 3) { fill: red }'), 'if ((dr < 3.0)) {');
    assert.equal(condition('match(da > 0) { fill: red }'), 'if ((da > 0.0)) {');
    assert.equal(
        condition('match(da > -PI/4 && da < PI/4) { fill: red }'),
        'if (((da > (-PI / 4.0)) && (da < (PI / 4.0)))) {'
    );
});

test('dc and dm: chebyshev and manhattan distance', () => {
    let s = shader('match(dc < 2) { fill: red }');
    assert.match(s, /float dc = max\(abs\(dx\), abs\(dy\)\);/);
    assert.match(s, /float dm = abs\(dx\) \+ abs\(dy\);/);
    assert.equal(condition('match(dc < 2) { fill: red }'), 'if ((dc < 2.0)) {');
    assert.equal(condition('match(dm < 3) { fill: red }'), 'if ((dm < 3.0)) {');
});

test('db: distance to the grid boundary', () => {
    let s = shader('match(db == 0) { fill: red }');
    assert.match(s, /float db = min\(min\(x - 1\.0, X - x\), min\(y - 1\.0, Y - y\)\);/);
    assert.equal(condition('match(db == 0) { fill: red }'), 'if ((db == 0.0)) {');
    assert.equal(condition('match(db < 2) { fill: red }'), 'if ((db < 2.0)) {');
    assert.equal(
        condition('match(int(db) % 2 == 0) { fill: red }'),
        'if ((mod(float(int(db)), 2.0) == 0.0)) {'
    );
});

test('pos: centered, aspect-correct canvas position', () => {
    assert.equal(color('fill: length(pos)'), 'cssd_color = vec4(vec3(length(pos)), 1.0);');
    assert.equal(color('fill: pos.x + .5'), 'cssd_color = vec4(vec3((pos.x + .5)), 1.0);');
    assert.match(main('fill: length(pos)'), /vec2 pos = \(gl_FragCoord\.xy - 0\.5 \* u_resolution\.xy\) \/ min\(u_resolution\.x, u_resolution\.y\);/);
    // a user pos shadows the built-in; the wrapper then sees no `pos` to define
    assert.match(main('pos: uv; fill: pos.x'), /vec2 cssd1 = uv;\s*cssd_color = vec4\(vec3\(cssd1\.x\), 1\.0\);/);
    assert.doesNotMatch(main('pos: uv; fill: pos.x'), /\bpos\b/);
});

test('du and dv: coordinates inside the cell', () => {
    let s = shader('match(du > 0) { fill: red }');
    assert.match(s, /float du = fract\(uv\.x \* X\) - 0\.5;/);
    assert.match(s, /float dv = fract\(\(1\.0 - uv\.y\) \* Y\) - 0\.5;/);
    // composes with ngon() for per-cell polygon masks
    assert.equal(condition('match(ngon(du, dv, 6) < 0.4) { fill: red }'), 'if ((ngon(du, dv, 6.0) < 0.4)) {');
    // a bare `du` is not a CSS color, so it compiles as an expression
    assert.equal(color('fill: du'), 'cssd_color = vec4(vec3(du), 1.0);');
});

test('dx and dy: cell index centered on the grid', () => {
    let s = shader('match(dx > 0) { fill: red }');
    assert.match(s, /float dx = x - \(X \+ 1\.0\) \* 0\.5;/);
    assert.match(s, /float dy = y - \(Y \+ 1\.0\) \* 0\.5;/);
    assert.equal(
        condition('match(dx*dx + dy*dy < 4) { fill: red }'),
        'if ((((dx * dx) + (dy * dy)) < 4.0)) {'
    );
    assert.equal(
        condition('match(max(abs(dx), abs(dy)) < 2) { fill: red }'),
        'if ((max(abs(dx), abs(dy)) < 2.0)) {'
    );
});

// --- fill ---

test('static colors stay byte-identical', () => {
    assert.equal(color('fill: red'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: #f00'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: rgb(10, 20, 30)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
});

test('a vec3 expression is a color, a scalar a gray', () => {
    assert.equal(color('fill: hsl(da, 0.8, 0.5)'), 'cssd_color = vec4(hsl(da, 0.8, 0.5), 1.0);');
    assert.equal(color('fill: dr/10'), 'cssd_color = vec4(vec3((dr / 10.0)), 1.0);');
});

test('fill accepts vec2 and bool; other vector types are rejected', () => {
    assert.equal(color('fill: uv'), 'cssd_color = vec4(uv, 0.0, 1.0);');
    assert.equal(color('fill: rot(du, dv, 0)'), 'cssd_color = vec4(rot(du, dv, 0.0), 0.0, 1.0);');
    assert.equal(color('fill: x > 1'), 'cssd_color = vec4(vec3(float((x > 1.0))), 1.0);');
    let messages = [];
    draw('fill: mat2(1)', extra, m => messages.push(m));
    assert.deepEqual(messages, ['fill cannot take a mat2']);
});

test('size and shape reject vectors', () => {
    let messages = [];
    assert.doesNotMatch(main('size: uv; fill: red'), /size = uv;/);
    draw('size: uv; shape: pos; fill: red', extra, m => messages.push(m));
    assert.deepEqual(messages, ['size needs a number', 'shape needs a number']);
});

test('three or four top-level commas become channels, nested commas do not', () => {
    assert.equal(color('fill: x/X, y/Y, 0.5'), 'cssd_color = vec4(vec3((x / X), (y / Y), 0.5), 1.0);');
    assert.equal(color('fill: x/X, y/Y, t, 0.6'), 'cssd_color = vec4((x / X), (y / Y), t, 0.6);');
    assert.equal(color('fill: vec3(x/X, y/Y, t)'), 'cssd_color = vec4(vec3((x / X), (y / Y), t), 1.0);');
});

test('invalid channel counts and empty fills are dropped', () => {
    assert.equal(color('fill: x/X, y/Y'), '');
    assert.equal(color('fill: x/X, y/Y, 0.5, 1, 0.2'), '');
    assert.equal(color('fill: ;'), '');
    // a channel that does not parse to anything drops the fill rather than emit `vec3()`
    assert.equal(color('fill: (;'), '');
    assert.equal(color('fill: 1, (, 1;'), '');
});

test('a variable is declared once, typed by its value, and read by name', () => {
    assert.match(main('c: hsv(i/I, 1, 1); fill: c'), /vec3 cssd1 = hsv\(\(i \/ I\), 1\.0, 1\.0\);\s*cssd_color = vec4\(cssd1, 1\.0\);/);
    assert.equal(color('p: 2; fill: hsl(.16p, .75, .65)'), 'cssd_color = vec4(hsl((.16 * cssd1), .75, .65), 1.0);');
    // however often it is read, its value is computed once
    let s = main('n: fbm(uv * 8); fill: n, n * n, sqrt(n)');
    assert.equal((s.match(/fbm\(/g) || []).length, 1);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1, \(cssd1 \* cssd1\), sqrt\(cssd1\)\), 1\.0\);/);
});

test('declarations are read in source order', () => {
    let messages = [];
    draw('fill: c; c: hsv(i/I, 1, 1)', extra, m => messages.push(m));
    assert.deepEqual(messages, ['unknown name c']);
    // a second declaration of a name assigns to it
    assert.match(main('a: 1; fill: a; a: 2; fill: a'), /float cssd1 = 1\.0;\s*cssd_color = vec4\(vec3\(cssd1\), 1\.0\);\s*cssd1 = 2\.0;/);
});

test('unknown names are reported once each', () => {
    let messages = [];
    draw('fill: hsl(foo, bar, foo); size: baz', extra, m => messages.push(m));
    assert.deepEqual(messages, ['unknown name foo', 'unknown name bar', 'unknown name baz']);
    // built-ins, swizzles, GLSL constants and uniforms are known
    messages = [];
    draw('p: uv.yx; fill: p.x + PI + u_time + size + pos.x, dr, float(true)', extra, m => messages.push(m));
    assert.deepEqual(messages, []);
});

test('invalid and reserved names are reported', () => {
    let messages = [];
    draw('size-2: 3; cssd1: 1; --c: red; repeat(2 as a-b) { } fill: red', extra, m => messages.push(m));
    assert.deepEqual(messages, [
        '"size-2" is not a valid name',
        'names starting with cssd are reserved',
        '"--c" is not a valid name',
        '"a-b" is not a valid name',
    ]);
});

test('variable names inside hex literals are not substituted', () => {
    assert.equal(color('a: .5; fill: #f0a * a'), 'cssd_color = vec4((vec3(1.0, 0.0, 0.6666666666666666) * cssd1), 1.0);');
    assert.equal(color('fab: .5; fill: #FAB * fab'), 'cssd_color = vec4((vec3(1.0, 0.6666666666666666, 0.7333333333333333) * cssd1), 1.0);');
});

test('a variable may hold a CSS color or a channel list', () => {
    assert.match(main('c: red; fill: c'), /vec4 cssd1 = vec4\(1\.0, 0\.0, 0\.0, 1\.0\);\s*cssd_color = cssd1;/);
    assert.match(main('c: 1, 0, 0; fill: c'), /vec3 cssd1 = vec3\(1\.0, 0\.0, 0\.0\);\s*cssd_color = vec4\(cssd1, 1\.0\);/);
    assert.match(main('c: 1, 0, 0, .5; fill: c'), /vec4 cssd1 = vec4\(1\.0, 0\.0, 0\.0, \.5\);\s*cssd_color = cssd1;/);
    // and takes part in arithmetic like any vector
    assert.equal(color('c: red; fill: c * .5'), 'cssd_color = (cssd1 * .5);');
    let messages = [];
    draw('c: 1, 2; fill: red', extra, m => messages.push(m));
    assert.deepEqual(messages, ['a list value needs 3 or 4 items, not 2']);
});

test('CSS color functions stay static; unitless hsl()/hsv() mean the shader helpers', () => {
    assert.equal(color('fill: hsla(210, 50%, 50%, 0.5)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(120, 50%, 50%)'), 'cssd_color = vec4(1.0, 0.0, 0.0, 1.0);');
    assert.equal(color('fill: hsl(x/X, 0.5, 0.5)'), 'cssd_color = vec4(hsl((x / X), 0.5, 0.5), 1.0);');
    // anything the CSS engine rejects compiles as an expression
    assert.equal(color('fill: rgb(x*20, 0, 0)'), 'cssd_color = vec4(vec3(rgb((x * 20.0), 0.0, 0.0)), 1.0);');
});

// --- shape and size ---

// shape and size are state; the mask is computed from them once, at the end
const MASK = /float cssd_mask = cssd_shape\(cssd_dist, size\);\s*if \(cssd_masked\) cssd_color\.a \*= cssd_mask;/;

test('size scales the mask radius per cell', () => {
    let s = main('shape: circle; size: x/X; fill: #000');
    assert.match(s, /cssd_dist = length\(vec2\(du, dv\)\);\s*cssd_masked = true;\s*size = \(x \/ X\);/);
    assert.match(s, MASK);
    assert.equal((s.match(/cssd_shape\(/g) || []).length, 1);
});

test('size without an explicit shape uses a square mask', () => {
    assert.match(main('size: rand(i); fill: #000'), /cssd_dist = max\(abs\(du\), abs\(dv\)\);\s*cssd_masked = true;\s*size = rand\(i\);/);
});

test('size expressions coerce to float', () => {
    assert.match(main('shape: circle; size: x > 2; fill: #000'), /size = float\(\(x > 2\.0\)\);/);
});

test('size expressions support numeric coefficients', () => {
    assert.match(
        main('shape: circle; size: .5 + .5 * sin(dr - 2t); fill: #000'),
        /size = \(\.5 \+ \(\.5 \* sin\(\(dr - \(2\.0 \* t\)\)\)\)\);/
    );
    assert.match(
        main('shape: circle; size: .5 + .5 * sin(dr - 2πt); fill: #000'),
        /size = \(\.5 \+ \(\.5 \* sin\(\(dr - \(\(2\.0 \* PI\) \* t\)\)\)\)\);/
    );
    assert.match(main('shape: circle; size: tπ; fill: #000'), /size = \(t \* PI\);/);
});

test('no shape and no size leaves the mask out', () => {
    let s = main('fill: #000');
    assert.doesNotMatch(s, /cssd_mask|cssd_dist/);
    assert.match(s, /float size = 1\.0;/);
});

test('shape: none turns the mask off', () => {
    let s = main('shape: none; size: 0.5; fill: red');
    assert.match(s, /cssd_masked = false;\s*size = 0\.5;/);
    assert.doesNotMatch(s, /cssd_dist = [a-z]/);
    assert.match(main('shape: circle; match(x > 2) { shape: none; fill: red }'), /if \(\(x > 2\.0\)\) \{\s*cssd_masked = false;/);
});

test('a shape may be a name, a variable or a distance expression', () => {
    assert.match(main('shape: diamond; fill: red'), /cssd_dist = abs\(du\) \+ abs\(dv\);/);
    assert.match(main('shape: ngon(du, dv, 6); size: .8; fill: red'), /cssd_dist = ngon\(du, dv, 6\.0\);\s*cssd_masked = true;\s*size = \.8;/);
    assert.match(main('d: length(vec2(du, dv) - .1); shape: d; fill: red'), /float cssd1 = length\(\(vec2\(du, dv\) - \.1\)\);\s*cssd_dist = cssd1;/);
    // a built-in distance is a shape too
    assert.match(main('shape: dm; fill: red'), /cssd_dist = dm;/);
    // an unknown word is reported like any unknown name
    let messages = [];
    draw('shape: blob; size: .5; fill: red', extra, m => messages.push(m));
    assert.deepEqual(messages, ['unknown name blob']);
});

test('shape inside a match block applies the matching mask', () => {
    // no top-level shape/size, so any mask must come from the block
    assert.match(main('match(x > 2) { shape: square; fill: red }'), /if \(\(x > 2\.0\)\) \{\s*cssd_dist = max\(abs\(du\), abs\(dv\)\);\s*cssd_masked = true;/);
    assert.match(main('match(x > 2) { shape: circle; fill: red }'), /if \(\(x > 2\.0\)\) \{\s*cssd_dist = length\(vec2\(du, dv\)\);\s*cssd_masked = true;/);
    // a size alone masks with a square, inside the block only
    let s = main('match(x > 2) { size: .5; fill: red }');
    assert.match(s, /if \(\(x > 2\.0\)\) \{\s*cssd_dist = max\(abs\(du\), abs\(dv\)\);/);
    assert.equal((s.match(/cssd_dist = [a-z]/g) || []).length, 1);
});

test('in-block shape and size are read by the one mask at the end', () => {
    for (let code of [
        'match(x > 1) { size: 0.5; shape: circle; fill: red }',
        'match(x > 1) { shape: circle; size: 0.5; fill: red }',
    ]) {
        let s = main(code);
        assert.match(s, /if \(\(x > 1\.0\)\) \{[^}]*size = 0\.5;[^}]*\}/, code);
        assert.match(s, /if \(\(x > 1\.0\)\) \{[^}]*cssd_dist = length\(vec2\(du, dv\)\);[^}]*\}/, code);
        assert.equal((s.match(/cssd_shape\(/g) || []).length, 1, code);
    }
    // the last shape written wins
    let dup = main('match(x > 1) { shape: circle; shape: square; fill: red }');
    assert.match(dup, /cssd_dist = length\(vec2\(du, dv\)\);[\s\S]*cssd_dist = max\(abs\(du\), abs\(dv\)\);/);
});

test('in-block size keeps the enclosing shape', () => {
    let s = main('shape: circle; match(x > 1) { size: 0.5; fill: red }');
    assert.equal((s.match(/cssd_dist = [a-z]/g) || []).length, 1);
    assert.match(s, /if \(\(x > 1\.0\)\) \{\s*size = 0\.5;/);
});

// --- prelude and uniforms ---

test('u_time is only wired up when the pattern reads t', () => {
    // no `t` anywhere: t is a constant, leaving u_time unreferenced
    assert.match(main('fill: hsl(dr/10, 0.7, 0.5)'), /float t = 0\.0;/);
    assert.match(main('fill: hsl(i/I + t*0.1, 0.7, 0.5)'), /float t = u_time;/);
    assert.match(main('shape: circle; size: 0.5 + 0.4*sin(t); fill: #000'), /float t = u_time;/);
    // a `.t` swizzle is not the time variable
    assert.match(main('p: vec4(1); fill: p.t'), /float t = 0\.0;/);
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
    assert.equal(condition('match(voronoi(x, y) > 0.3) { fill: red }'), 'if ((voronoi(x, y) > 0.3)) {');
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
    assert.equal(color('p: uv*3; fill: fbm(p)'), 'cssd_color = vec4(vec3(fbm(cssd1)), 1.0);');
    assert.equal(color('z: vec2(0); c: uv*3 - 2; fill: escape(z, c)'),
        'cssd_color = vec4(vec3(escape(cssd1, cssd2)), 1.0);');
});

test('rot() returns the rotated point', () => {
    assert.equal(color('p: rot(vec2(du, dv), t); fill: p.x + .5'),
        'cssd_color = vec4(vec3((cssd1.x + .5)), 1.0);');
    assert.equal(color('fill: rot(du, dv, PI).y'), 'cssd_color = vec4(vec3(rot(du, dv, PI).y), 1.0);');
});

test('ints are highp so bitwise operators survive large grids', () => {
    assert.ok(shader('fill: #000').includes('precision highp int;'));
});

test('variable names with regex metacharacters do not crash generation', () => {
    assert.equal(typeof shader('a[: 1; fill: x'), 'string');
});

// --- repeat() blocks ---
// a state becomes the GLSL variable cssdN, numbered in order of declaration;
// the loop counter takes the next number, then the locals of the body

test('repeat updates existing variables sequentially', () => {
    let s = main('a: 1; b: 2; repeat(1) { a: b; b: a } fill: a, b, 0');
    assert.match(s, /float cssd1 = 1\.0;\s*float cssd2 = 2\.0;\s*for \(float cssd3 = 0\.0; cssd3 < 1\.0; cssd3\+\+\) \{\s*cssd1 = cssd2;\s*cssd2 = cssd1;/);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1, cssd2, 0\.0\), 1\.0\);/);
});

test('repeat names new to the body are loop locals, declared once where they appear', () => {
    let s = main('sum: 0; repeat(4 as k) { value: k*k; sum: sum + value } fill: sum');
    assert.match(s, /float cssd3 = \(cssd2 \* cssd2\);\s*cssd1 = \(cssd1 \+ cssd3\);/);
    assert.equal((s.match(/float cssd3 =/g) || []).length, 1);
    // the local does not leak out
    assert.match(main('repeat(1) { v: 1 } fill: v'), /cssd_color = vec4\(vec3\(v\), 1\.0\);/);
});

test('repeat uses a zero-based named index and checks the stop conditions after the body', () => {
    let s = main('steps: 0; repeat(8 as k, steps > 3) { steps: k + 1 } fill: steps');
    assert.match(s, /for \(float cssd2 = 0\.0; cssd2 < 8\.0; cssd2\+\+\) \{\s*cssd1 = \(cssd2 \+ 1\.0\);\s*if \(\(cssd1 > 3\.0\)\) break;/);
    // several stop conditions all have to hold
    assert.match(main('a: 0; b: 0; repeat(3, a > 1, b > 1) { a: a + 1; b: b + 1 }'), /if \(\(cssd1 > 1\.0\) && \(cssd2 > 1\.0\)\) break;/);
});

test('repeat without a stop condition never breaks early', () => {
    assert.doesNotMatch(main('zx: 0; repeat(5) { zx: zx + 1 }'), /break/);
});

test('repeat without a valid step count is skipped and reported', () => {
    let messages = [];
    let s = draw('zx: 0; repeat(zx > 2) { zx: zx + 1 } fill: hsl(zx, 1, 1)', extra, m => messages.push(m));
    s = s.slice(s.indexOf('void main()'));
    assert.deepEqual(messages, ['repeat() needs a step count']);
    assert.doesNotMatch(s, /for \(float/);
    // the variable keeps its declared value
    assert.match(s, /float cssd1 = 0\.0;\s*cssd_color = vec4\(hsl\(cssd1, 1\.0, 1\.0\), 1\.0\);/);
});

test('fbm() rotates the domain between octaves', () => {
    assert.match(shader('fill: fbm(x, y)'), /s \+= a \* noise\(p\);\s*p = mat2\(0\.8, 0\.6, -0\.6, 0\.8\) \* p \* 2\.03;/);
});

test('escape() bails out at |z| = 16 with the base-2 smooth count', () => {
    assert.match(shader('fill: escape(0, 0, x, y)'), /if \(r2 > 256\.0\) \{\s*return \(float\(k\) \+ 1\.0 - log2\(log2\(r2\) \/ 8\.0\)\) \/ 96\.0;/);
});

test('a second repeat continues the same state without redeclaring it', () => {
    let s = main('zx: 0; repeat(3) { zx: zx + 1 } repeat(2) { zx: zx * 2 } fill: zx');
    assert.equal((s.match(/float cssd1 =/g) || []).length, 1);
    assert.equal((s.match(/for \(float/g) || []).length, 2);
    assert.match(s, /cssd1 = \(cssd1 \* 2\.0\);/);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1\), 1\.0\);/);
});

test('repeat inside match updates the outer state where the match holds', () => {
    let s = main('zx: 0; match(x > 1) { repeat(2) { zx: zx + 1 } fill: hsl(zx, 1, 1) } fill: hsl(zx, 1, 1)');
    assert.match(s, /float cssd1 = 0\.0;\s*if \(\(x > 1\.0\)\) \{\s*for \(float cssd2[^}]*cssd1 = \(cssd1 \+ 1\.0\);[\s\S]*hsl\(cssd1, 1\.0, 1\.0\)[\s\S]*\}/);
    assert.equal((s.match(/hsl\(cssd1, 1\.0, 1\.0\)/g) || []).length, 2);
    // a name new to the block stays inside it
    let messages = [];
    draw('match(x > 1) { repeat(2) { n: 1 } } fill: n', extra, m => messages.push(m));
    assert.deepEqual(messages, ['unknown name n']);
});

test('repeat blocks may nest and read both named indices', () => {
    let s = main('sum: 0; repeat(4 as a) { repeat(3 as b) { sum: sum + a + b } } fill: sum');
    assert.match(s, /float cssd1 = 0\.0;\s*for \(float cssd2 = 0\.0; cssd2 < 4\.0;[^{]*\{\s*for \(float cssd3 = 0\.0; cssd3 < 3\.0;[^{]*\{\s*cssd1 = \(\(cssd1 \+ cssd2\) \+ cssd3\);/);
});

test('a repeat index shadows an outer variable without mutating it, and is read-only', () => {
    let s = main('k: 9; sum: 0; repeat(2 as k) { repeat(1) { sum: sum + k } sum: sum + k } fill: k, sum, 0');
    assert.equal((s.match(/cssd2 = \(cssd2 \+ cssd3\);/g) || []).length, 2);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1, cssd2, 0\.0\), 1\.0\);/);
    let messages = [];
    draw('repeat(2 as k) { k: 1 }', extra, m => messages.push(m));
    assert.deepEqual(messages, ['repeat() index k is read-only']);
});

test('variables may take the names of the shader internals', () => {
    let s = main('x: 0; t: 1; repeat(1) { x: x + 1; t: t*2 } fill: x, t, 0');
    assert.match(s, /float cssd1 = 0\.0;\s*float cssd2 = 1\.0;/);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1, cssd2, 0\.0\), 1\.0\);/);
    assert.match(s, /float t = 0\.0;/);
});

test('repeat reports pattern outputs and allows match blocks in its body', () => {
    let messages = [];
    let s = draw('x: 0; repeat(2) { fill: #000; size: .5; match(x < 1) { x: x + 1 } } fill: x', extra, m => messages.push(m));
    assert.deepEqual(messages, [
        'repeat() does not allow fill',
        'repeat() does not allow size',
    ]);
    assert.match(s.slice(s.indexOf('void main()')), /for \(float cssd2[^}]*if \(\(cssd1 < 1\.0\)\) \{\s*cssd1 = \(cssd1 \+ 1\.0\);\s*\}/);
    messages = [];
    draw('repeat(2) { match(x < 1) { fill: red } }', extra, m => messages.push(m));
    assert.deepEqual(messages, ['repeat() does not allow fill']);
});

test('repeat enforces count and nested work limits', () => {
    let messages = [];
    let s = draw('repeat(1025) { a: 1 } repeat(512) { repeat(512) { b: 1 } }', extra, m => messages.push(m));
    assert.deepEqual(messages, [
        'repeat() step count cannot exceed 1024',
        'nested repeat() work cannot exceed 65536',
    ]);
    assert.equal((s.match(/for \(float/g) || []).length, 1);
});

// --- vectors ---

test('a variable can hold a vector and be swizzled', () => {
    let s = main('c: vec2(uv.x*3 - 2.2, uv.y*2.6 - 1.3); fill: hsl(c.x, 1, c.y)');
    assert.match(s, /vec2 cssd1 = vec2\(\(\(uv\.x \* 3\.0\) - 2\.2\), \(\(uv\.y \* 2\.6\) - 1\.3\)\);/);
    assert.match(s, /cssd_color = vec4\(hsl\(cssd1\.x, 1\.0, cssd1\.y\), 1\.0\);/);
});

test('a swizzle component is never mistaken for a variable of that name', () => {
    assert.equal(color('b: 3; v: vec3(1, 2, 3); fill: v.b + b'), 'cssd_color = vec4(vec3((cssd2.b + cssd1)), 1.0);');
});

test('repeat state keeps vector and matrix types', () => {
    let s = main('z: uv*3.2 - 1.6; c: vec2(-0.8, 0.156); repeat(8, dot(z, z) > 4) { z: z + c }');
    assert.match(s, /vec2 cssd\d+ = \(\(uv \* 3\.2\) - 1\.6\);/);
    let matrix = main('m: 9; r: mat2(1, 0, 0, 1); repeat(2) { m: m + 1; r: r * 2 }');
    assert.match(matrix, /float cssd\d+ = 9\.0;\s*mat2 cssd\d+ = mat2\(1\.0, 0\.0, 0\.0, 1\.0\);/);
    assert.doesNotMatch(matrix, /float\(cssd\d+\)/);
    assert.match(main('c: vec2(1, 2); z: c; p: vec2(dv, du)*3; repeat(2) { z: z + c; p: p*2 }'), /vec2 cssd1 = vec2\(1\.0, 2\.0\);\s*vec2 cssd2 = cssd1;\s*vec2 cssd3 = \(vec2\(dv, du\) \* 3\.0\);/);
});

test('repeat state recognizes float- and vector-returning calls', () => {
    let s = main('s: fbm(uv); d: length(uv - .5); p: rot(uv, 1); c: hsl(0, 1, 1); repeat(2) { s: s*.5; d: d*2; p: p*2; c: c*.5 }');
    assert.match(s, /float cssd\d+ = fbm\(uv\);\s*float cssd\d+ = length\(\(uv - \.5\)\);\s*vec2 cssd\d+ = rot\(uv, 1\.0\);\s*vec3 cssd\d+ = hsl\(0\.0, 1\.0, 1\.0\);/);
    assert.doesNotMatch(s, /float\(cssd\d+\)/);
});

test('repeat type inference uses the expression result, not any nested constructor', () => {
    let s = main('a: max(length(vec2(1)), 1); b: .5*hsl(0, 1, 1); repeat(2) { a: a + 1; b: b*.5 }');
    assert.match(s, /float cssd\d+ = max\(length\(vec2\(1\.0\)\), 1\.0\);/);
    assert.match(s, /vec3 cssd\d+ = \(\.5 \* hsl\(0\.0, 1\.0, 1\.0\)\);/);
});

test('repeat recognizes scaled vector expressions', () => {
    let s = main('p: .5*uv; q: 2*rot(uv, 1); r: 3*vec2(1); repeat(1) { p: p + uv; q: q + uv; r: r + uv }');
    assert.match(s, /vec2 cssd\d+ = \(\.5 \* uv\);/);
    assert.match(s, /vec2 cssd\d+ = \(2\.0 \* rot\(uv, 1\.0\)\);/);
    assert.match(s, /vec2 cssd\d+ = \(3\.0 \* vec2\(1\.0\)\);/);
});

test('repeat does not infer a nested vector helper as the result type', () => {
    let s = main('v: max(length(hsl(0, 1, 1)), 1); repeat(1) { v: v + 1 }');
    assert.match(s, /float cssd\d+ = max\(length\(hsl\(0\.0, 1\.0, 1\.0\)\), 1\.0\);/);
});

test('repeat recognizes vectors on either side of arithmetic and narrowed swizzles', () => {
    let s = main('p: 1 - uv; v: vec3(1); q: v.xy; repeat(2) { p: p*.5; q: q + uv }');
    assert.match(s, /vec2 cssd1 = \(1\.0 - uv\);/);
    assert.match(s, /vec2 cssd3 = cssd2\.xy;/);
});

test('repeat initializes and updates bool state without float casts', () => {
    let s = main('flag: x > 1; repeat(1) { flag: not flag; local: y > 1 }');
    assert.match(s, /bool cssd\d+ = \(x > 1\.0\);/);
    assert.match(s, /cssd\d+ = !cssd\d+;/);
    assert.match(s, /bool cssd\d+ = \(y > 1\.0\);/);
    assert.doesNotMatch(s, /bool cssd\d+ = float\(/);
});

test('fill and size read repeat state by its type', () => {
    let s = main('flag: x > 1; repeat(1) { flag: not flag } fill: flag*.5, 0, 0');
    assert.match(s, /cssd_color = vec4\(vec3\(\(float\(cssd1\) \* \.5\), 0\.0, 0\.0\), 1\.0\);/);
    s = main('p: uv; repeat(1) { p: p*2 } match(x > 1) { size: length(p); fill: p.x, p.y, 0 }');
    assert.match(s, /size = length\(cssd1\);/);
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1\.x, cssd1\.y, 0\.0\), 1\.0\);/);
});

test('the size is set where it is written, so it reads the state so far', () => {
    let s = main('s: 1; repeat(4) { s: s*1.1 } size: s; fill: #000');
    assert.match(s, /float cssd1 = 1\.0;\s*for \(float cssd2[^}]*\}\s*size = cssd1;/);
    // a fill written before the repeat reads the state before it
    s = main('s: 1; fill: s; repeat(4) { s: s*1.1 } match(x > 1) { size: s }');
    assert.match(s, /cssd_color = vec4\(vec3\(cssd1\), 1\.0\);\s*for \(float cssd2[^}]*\}\s*if \(\(x > 1\.0\)\) \{[^}]*size = cssd1;/);
});

test('repeat recognizes bool literals and GLSL vector comparisons', () => {
    let s = main('a: true; b: any(lessThan(uv, vec2(.5))); repeat(1) { a: not a; b: not b }');
    assert.match(s, /bool cssd\d+ = true;/);
    assert.match(s, /bool cssd\d+ = any\(lessThan\(uv, vec2\(\.5\)\)\);/);
});

test('repeat recognizes vector bool results', () => {
    let s = main('a: isnan(uv); b: isinf(vec3(1)); c: bvec2(true); repeat(1) { a: not a; b: b; c: c }');
    assert.match(s, /bvec2 cssd\d+ = isnan\(uv\);/);
    assert.match(s, /bvec3 cssd\d+ = isinf\(vec3\(1\.0\)\);/);
    assert.match(s, /bvec2 cssd\d+ = bvec2\(true\);/);
    assert.match(s, /cssd\d+ = not\(cssd\d+\);/);
});

test('repeat keeps int expressions in the float pattern number model', () => {
    let s = main('a: int(x); repeat(2) { a: a + 1 }');
    assert.match(s, /float cssd\d+ = float\(int\(x\)\);/);
    assert.match(s, /cssd\d+ = \(cssd\d+ \+ 1\.0\);/);
});

// --- match() as a function ---

test('match() in a value chooses between expressions, colors included', () => {
    assert.equal(color('fill: match(dr < 2, #fff, #000)'),
        'cssd_color = vec4(((dr < 2.0) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0)), 1.0);');
    let s = main('c: match(db = 0, 1, dr < 3, .5, 0); fill: hsl(c, .8, .5)');
    assert.match(s, /float cssd1 = \(\(db == 0\.0\) \? 1\.0 : \(\(dr < 3\.0\) \? \.5 : 0\.0\)\);/);
    assert.match(s, /cssd_color = vec4\(hsl\(cssd1, \.8, \.5\), 1\.0\);/);
    assert.match(shader('size: match(x > 4, .8, .3); fill: #000'), /size = \(\(x > 4\.0\) \? \.8 : \.3\);/);
    // as a block test its branches are already bool, so no outer cast
    assert.equal(condition('match(match(x > 2, y > 2, 0)) { fill: red }'),
        'if (((x > 2.0) ? (y > 2.0) : bool(0.0))) {');
    // the block form is unchanged
    assert.equal(condition('match(dr < 2) { fill: red }'), 'if ((dr < 2.0)) {');
});
