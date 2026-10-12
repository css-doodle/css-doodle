import test from 'node:test';
import assert from 'node:assert/strict';

import draw from '../../src/generator/scene.js';

const extra = {
    getRgbaColor: v => /^(#[0-9a-f]{3,8}|red|white)$/i.test(v) ? [1, 0, 0, 1] : null,
};

// the compiled scene function and the warnings it produced
function scene(code) {
    let warnings = [];
    let { fragment, vertex } = draw(code, extra, message => warnings.push(message));
    let body = fragment.slice(fragment.indexOf('vec4 g_scene'), fragment.indexOf('void main'));
    let dist = fragment.slice(fragment.indexOf('float g_dist'), fragment.indexOf('vec4 g_scene'));
    return { body, dist, fragment, vertex, warnings };
}

test('elements at the top level are joined', () => {
    let { body, warnings } = scene('sphere { r: .2 } box { size: .3; translate: .2 0 0 }');
    assert.deepEqual(warnings, []);
    assert.match(body, /length\(p\) - \.2/);
    assert.match(body, /g_op\(g_\d+, g_\d+, 0\.0, 1\.0, 1\.0\)/);
});

test('a scene without shapes draws nothing', () => {
    assert.deepEqual(scene('fill: red;').warnings, ['@scene draws nothing: add a shape such as sphere { r: .3 }']);
});

test('sizes are attributes', () => {
    assert.match(scene('box { size: .1 .2 .3 }').body, /g_box\(p, vec3\(\.1, ?\.2, ?\.3\) \* 0\.5 - 0\.0\) - 0\.0/);
    assert.match(scene('cylinder { r: .1; height: .4 }').body, /g_cylinder\(p, \.1 - 0\.0, \.4 \* 0\.5 - 0\.0\) - 0\.0/);
    assert.match(scene('cone { r: .2 .1; height: .3 }').body, /g_cone\(p, \.3 \* 0\.5, \.2, \.1\)/);
    assert.match(scene('capsule { from: 0 0 0; to: 0 .3 0; r: .05 .01 }').body, /g_capsule\(p, vec3\(0\.0, 0\.0, 0\.0\), vec3\(0\.0, \.3, 0\.0\), vec2\(\.05, \.01\)\)/);
    assert.match(scene('torus { r: .3 .05 }').body, /length\(p\.xz\) - \.3, p\.y\)\) - \.05/);
});

test('shapes take no parentheses', () => {
    assert.deepEqual(scene('sphere(.2);').warnings, ['unexpected sphere(.2): write sphere { … }', 'unknown shape sphere(.2)']);
});

test('groups join their shapes with smooth', () => {
    let join = code => scene(code).body.match(/g_op\(g_\d+, g_\d+, ([^,]+), ([^)]+)\)/).slice(1).join(' ');
    assert.equal(join('union { smooth: .1; sphere { r: .2 } sphere { r: .1 } }'), '.1 1.0, 1.0');
    assert.equal(join('subtract { box { size: .4 } sphere { r: .2 } }'), '0.0 -1.0, 1.0');
    assert.equal(join('intersect { box { size: .4 } sphere { r: .3 } }'), '0.0 -1.0, -1.0');
});

test('the distance alone joins with min and max', () => {
    let { dist } = scene('subtract { union { box { size: .4 } sphere { r: .3 } } sphere { r: .2; fill: red } }');
    assert.match(dist, /= min\(g_\d+, g_\d+\);/);
    assert.match(dist, /= max\(g_\d+, -g_\d+\);/);
    assert.doesNotMatch(dist, /vec4|g_op/);
    assert.match(scene('union { smooth: .1; sphere { r: .2 } box { size: .2 } }').dist, /g_smin\(g_\d+, g_\d+, \.1, 1\.0, 1\.0\)/);
});

test('commands apply top to bottom', () => {
    let { body } = scene('box { size: .2; rotate: 30deg; translate: .3 0 0 }');
    assert.ok(body.indexOf('- vec3(.3, 0.0, 0.0)') < body.indexOf('g_rotate('));
});

test('round keeps the outer size, grow inflates', () => {
    assert.match(scene('box { size: .4; round: .02 }').body, /g_box\(p, vec3\(\.4\) \* 0\.5 - \.02\) - \.02/);
    assert.match(scene('box { size: .4; grow: .02 }').body, /\.w -= \.02;/);
});

test('attributes a shape does not take are reported', () => {
    assert.deepEqual(scene('sphere { r: .2; round: .02; colr: red }').warnings, ['sphere has no round', 'sphere has no colr']);
    assert.deepEqual(scene('sphere { smooth: .1 }').warnings, ['sphere has no smooth']);
    assert.deepEqual(scene('box { sphere { r: .1 } }').warnings, ['box cannot hold shapes; put them in a union']);
    assert.deepEqual(scene('leg: box; leg { sphere { r: .1 } }').warnings, ['leg cannot hold shapes; put them in a union']);
});

test('fill colors a group and the shapes in it without their own', () => {
    let { body } = scene('union { fill: red; sphere { r: .1 } box { size: .1; fill: #fff } }');
    let fills = [...body.matchAll(/vec4\(g_(\d+), (length|g_box)/g)].map(m => m[1]);
    assert.notEqual(fills[0], fills[1]);
});

test('*N and *XxY make copies with n, N, nx and ny', () => {
    let { body, warnings } = scene('box*5x3 { size: .05; translate: nx * .1, ny * .1, n / N }');
    assert.deepEqual(warnings, []);
    assert.match(body, /for \(int (g_\d+) = 0; \1 < 15; \1\+\+\)/);
    assert.match(body, /= float\(g_\d+ % 5 \+ 1\), g_\d+ = float\(g_\d+ \/ 5 \+ 1\)/);
    assert.deepEqual(scene('sphere*0;').warnings, ['unexpected sphere*0']);
    assert.deepEqual(scene('sphere*two;').warnings, ['unexpected sphere*two']);
});

test('repeat takes a spacing only', () => {
    assert.deepEqual(scene('sphere { r: .05; repeat: .2 0 .2 }').warnings, []);
    assert.deepEqual(scene('sphere { r: .05; repeat: .2 0 .2, 5 1 5 }').warnings, ['repeat takes a spacing only; for a counted grid write box*5x5']);
});

test('polygon takes points and a depth', () => {
    let { body, warnings } = scene('polygon { points: 0 0, 0 .4, .2 0; depth: .1 }');
    assert.deepEqual(warnings, []);
    assert.match(body, /vec2\[3\]\(vec2\(0\.0, 0\.0\), vec2\(0\.0, \.4\), vec2\(\.2, 0\.0\)\)/);
    assert.match(body, /abs\(p\.z\) - \.1 \* 0\.5/);
    assert.deepEqual(scene('polygon { points: 0 0, 1 1 }').warnings, ['polygon needs points: x y, x y, x y, …']);
});

test('sdf takes a distance in d', () => {
    assert.match(scene('sdf { d: length(p) - .3 }').body, /length\(p\) - \.3/);
    assert.deepEqual(scene('sdf { r: .3 }').warnings, ['sdf has no r', 'sdf needs a distance in d']);
});

test('mirror evaluates every reflection', () => {
    let { body } = scene('sphere { r: .1; mirror: x z }');
    assert.equal(body.match(/length\(g_\d+\) - \.1/g).length, 4);
});

test('a copy block of bodies writes each copy out and draws what the loop draws', () => {
    let rands = code => scene(code).body.match(/rand\(vec2\([^)]*\)[^,]*, [\d.]+\)/g);
    assert.deepEqual(rands('sphere*2 { r: rand() }'), ['rand(vec2((0.0 * 31.0 + g_5), 1.0)']);
    assert.deepEqual(rands('sphere*2 { { r: rand() } { r: rand() } }'), [
        'rand(vec2((0.0 * 31.0 + 1.0), 1.0)',
        'rand(vec2((0.0 * 31.0 + 2.0), 1.0)',
    ]);
    let { body, warnings } = scene('sphere*2 { { r: .1; colr: red } { r: .2; colr: red } }');
    assert.doesNotMatch(body, /for \(/);
    assert.match(body, /length\(p\) - \.1[^]*length\(p\) - \.2/);
    assert.deepEqual(warnings, ['sphere has no colr']);
});

test('outside copies the scene is one copy', () => {
    let { body, warnings } = scene('sphere { r: n * nx * ny * N * .2 }');
    assert.deepEqual(warnings, []);
    assert.match(body, /length\(p\) - \(\(\(\(1\.0 \* 1\.0\) \* 1\.0\) \* 1\.0\) \* \.2\)/);
});

test('named shapes, with or without rows', () => {
    assert.deepEqual(scene('leg2: capsule { from: 0 0 0; to: 0 .2 0; r: .02 } leg2 { translate: .1 0 0 }').warnings, []);
    assert.deepEqual(scene('cap: union { sphere { r: .2 } box { size: .1 } } cap;').warnings, []);
    assert.deepEqual(scene('a: a { scale: 2 } a;').warnings, ['a uses itself']);
    assert.deepEqual(scene('leg: capsule { r: .1 } leg { r: .2 }').warnings, ['leg has no r']);
});

test('named shapes nothing draws are still checked', () => {
    assert.deepEqual(scene('a: sphere { r: .1 } b: sphere { r: .2 } a;').warnings, []);
    assert.deepEqual(scene('a: sphere { colr: red } sphere { r: .2 }').warnings, ['sphere has no colr']);
});

test('perspective sets the camera distance, none makes it parallel', () => {
    assert.match(scene('sphere;').fragment, /float g_d = 2\.0/);
    assert.match(scene('perspective: 4; sphere;').fragment, /float g_d = 4\.0/);
    assert.match(scene('perspective: none; sphere;').fragment, /float g_d = 0\.0/);
});

test('the model is measured once per vertex, not per pixel', () => {
    let { vertex, fragment } = scene('sphere { r: .2 }');
    assert.match(vertex, /g_vhi = vec3\(g_reach\(g_x\), g_reach\(g_y\), g_reach\(g_z\)\)/);
    assert.match(fragment, /flat in vec3 g_vhi, g_vlo;/);
    assert.doesNotMatch(fragment, /g_reach/);
});

test('the fit reads a scaled shape at its full size', () => {
    let { vertex, dist } = scene('sphere { r: .2; scale: 2 1 1 }');
    assert.match(dist, /= p \/ (g_\d+);[^]*\*= min\(abs\(\1\.x\), min\(abs\(\1\.y\), abs\(\1\.z\)\)\);/);
    assert.match(vertex, /= p \* g_\d+;\nvec3 g_\d+ = normalize\(g_\d+\) \* length\(p\);/);
    assert.doesNotMatch(vertex, /g_dist/);
});

test('the fit reads an sdf at full strength, except inside an intersect', () => {
    let fit = code => scene(code).vertex.match(/float g_fit[^]*?return/)[0];
    let union = fit('sdf { d: (length(p) - .2 - .1 * rand()) * .5 } box { size: .2 }');
    assert.equal(union.match(/rand\(vec2\(0\.0, 1\.0\)/g).length, 2);
    assert.match(union, /= g_\d+ > 0\.1 \? g_\d+ \/ g_\d+ : g_\d+;/);
    assert.doesNotMatch(fit('intersect { box { size: .2 } sdf { d: p.y * .7 } }'), /\? /);
    assert.doesNotMatch(scene('sdf { d: (length(p) - .2) * .5 }').dist, /\? /);
});

test('unknown shapes are reported', () => {
    assert.deepEqual(scene('cube { size: .2 }').warnings, ['unknown shape cube']);
    assert.deepEqual(scene('difference { box; sphere { r: .1 } }').warnings, ['unknown shape difference']);
});

test('a copy block adds to the rows and shapes around it', () => {
    let { body, warnings } = scene('box*2 { size: .3; translate: n 0 0; { fill: red } { fill: white; scale: 2 } }');
    assert.deepEqual(warnings, []);
    assert.equal(body.match(/g_box\(g_\d+, vec3\(\.3\)/g).length, 2);
    assert.match(body, /p - vec3\(1\.0, 0\.0, 0\.0\)[^]*p \/ g_\d+;\nvec3 g_\d+ = g_\d+ - vec3\(2\.0, 0\.0, 0\.0\)/);
    assert.equal(scene('union*2 { sphere { r: .1 } { translate: .5 0 0 } { translate: -.5 0 0 } }').body.match(/length\(g_\d+\) - \.1/g).length, 2);
});

test('r is read only where a shape takes it', () => {
    let { body, warnings } = scene('box { r: rand() } sphere { r: rand() } ellipsoid { r: rand() .2 .1 }');
    assert.deepEqual(warnings, ['box has no r']);
    assert.match(body, /length\(p\) - rand\(vec2\(0\.0, 1\.0\)/);
    assert.match(body, /g_ellipsoid\(p, vec3\(rand\(vec2\(0\.0, 2\.0\)[^;]*, \.2, \.1\)\)/);
    assert.equal(body.match(/rand\(/g).length, 2);
});

test('the last definition of a name wins', () => {
    let { body, warnings } = scene('a: sphere { r: .2 } a: box; a { }');
    assert.deepEqual(warnings, []);
    assert.match(body, /g_box\(/);
    assert.doesNotMatch(body, /length\(p\)/);
});
