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
    let body = fragment.slice(fragment.indexOf('vec4 cssd_scene'), fragment.indexOf('void main'));
    let dist = fragment.slice(fragment.indexOf('float cssd_dist'), fragment.indexOf('vec4 cssd_scene'));
    return { body, dist, fragment, vertex, warnings };
}

test('elements at the top level are joined', () => {
    let { body, warnings } = scene('sphere { r: .2 } box { size: .3; translate: .2 0 0 }');
    assert.deepEqual(warnings, []);
    assert.match(body, /length\(p\) - \.2/);
    assert.match(body, /cssd_op\(cssd\d+, cssd\d+, 0\.0, 1\.0, 1\.0\)/);
});

test('a scene without shapes draws nothing', () => {
    assert.deepEqual(scene('fill: red;').warnings, ['@scene draws nothing: add a shape such as sphere { r: .3 }']);
});

test('sizes are attributes', () => {
    assert.match(scene('box { size: .1 .2 .3 }').body, /cssd_box\(p, vec3\(\.1, ?\.2, ?\.3\) \* 0\.5 - 0\.0\) - 0\.0/);
    assert.match(scene('cylinder { r: .1; height: .4 }').body, /cssd_cylinder\(p, \.1 - 0\.0, \.4 \* 0\.5 - 0\.0\) - 0\.0/);
    assert.match(scene('cone { r: .2 .1; height: .3 }').body, /cssd_cone\(p, \.3 \* 0\.5, \.2, \.1\)/);
    assert.match(scene('capsule { from: 0 0 0; to: 0 .3 0; r: .05 .01 }').body, /cssd_capsule\(p, vec3\(0\.0, 0\.0, 0\.0\), vec3\(0\.0, \.3, 0\.0\), vec2\(\.05, \.01\)\)/);
    assert.match(scene('torus { r: .3 .05 }').body, /length\(p\.xz\) - \.3, p\.y\)\) - \.05/);
});

test('shapes take no parentheses', () => {
    assert.deepEqual(scene('sphere(.2);').warnings, ['unexpected sphere(.2): write sphere { … }', 'unknown shape sphere(.2)']);
});

test('groups join their shapes with smooth', () => {
    let join = code => scene(code).body.match(/cssd_op\(cssd\d+, cssd\d+, ([^,]+), ([^)]+)\)/).slice(1).join(' ');
    assert.equal(join('union { smooth: .1; sphere { r: .2 } sphere { r: .1 } }'), '.1 1.0, 1.0');
    assert.equal(join('subtract { box { size: .4 } sphere { r: .2 } }'), '0.0 -1.0, 1.0');
    assert.equal(join('intersect { box { size: .4 } sphere { r: .3 } }'), '0.0 -1.0, -1.0');
});

test('the distance alone joins with min and max', () => {
    let { dist } = scene('subtract { union { box { size: .4 } sphere { r: .3 } } sphere { r: .2; fill: red } }');
    assert.match(dist, /= min\(cssd\d+, cssd\d+\);/);
    assert.match(dist, /= max\(cssd\d+, -cssd\d+\);/);
    assert.doesNotMatch(dist, /vec4|cssd_op/);
    assert.match(scene('union { smooth: .1; sphere { r: .2 } box { size: .2 } }').dist, /cssd_smin\(cssd\d+, cssd\d+, \.1, 1\.0, 1\.0\)/);
});

test('commands apply top to bottom', () => {
    let { body } = scene('box { size: .2; rotate: 30deg; translate: .3 0 0 }');
    assert.ok(body.indexOf('- vec3(.3, 0.0, 0.0)') < body.indexOf('cssd_rotate('));
});

test('round keeps the outer size, grow inflates', () => {
    assert.match(scene('box { size: .4; round: .02 }').body, /cssd_box\(p, vec3\(\.4\) \* 0\.5 - \.02\) - \.02/);
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
    let fills = [...body.matchAll(/vec4\(cssd(\d+), (length|cssd_box)/g)].map(m => m[1]);
    assert.notEqual(fills[0], fills[1]);
});

test('*N and *XxY make copies with n, N, nx and ny', () => {
    let { body, warnings } = scene('box*5x3 { size: .05; translate: nx * .1, ny * .1, n / N }');
    assert.deepEqual(warnings, []);
    assert.match(body, /for \(int (cssd\d+) = 0; \1 < 15; \1\+\+\)/);
    assert.match(body, /= float\(cssd\d+ % 5 \+ 1\), cssd\d+ = float\(cssd\d+ \/ 5 \+ 1\)/);
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
    assert.equal(body.match(/length\(cssd\d+\) - \.1/g).length, 4);
});

test('a copy block of bodies writes each copy out and draws what the loop draws', () => {
    let rands = code => scene(code).body.match(/rand\(vec2\([^)]*\)[^,]*, [\d.]+\)/g);
    assert.deepEqual(rands('sphere*2 { r: rand() }'), ['rand(vec2((0.0 * 31.0 + cssd5), 1.0)']);
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
    assert.match(scene('sphere;').fragment, /float cssd_d = 2\.0/);
    assert.match(scene('perspective: 4; sphere;').fragment, /float cssd_d = 4\.0/);
    assert.match(scene('perspective: none; sphere;').fragment, /float cssd_d = 0\.0/);
});

test('the model is measured once per vertex, not per pixel', () => {
    let { vertex, fragment } = scene('sphere { r: .2 }');
    assert.match(vertex, /cssd_vhi = vec3\(cssd_reach\(cssd_x\), cssd_reach\(cssd_y\), cssd_reach\(cssd_z\)\)/);
    assert.match(fragment, /flat in vec3 cssd_vhi, cssd_vlo;/);
    assert.doesNotMatch(fragment, /cssd_reach/);
});

test('the fit reads a scaled shape at its full size', () => {
    let { vertex, dist } = scene('sphere { r: .2; scale: 2 1 1 }');
    assert.match(dist, /= p \/ (cssd\d+);[^]*\*= min\(abs\(\1\.x\), min\(abs\(\1\.y\), abs\(\1\.z\)\)\);/);
    assert.match(vertex, /= p \* cssd\d+;\nvec3 cssd\d+ = normalize\(cssd\d+\) \* length\(p\);/);
    assert.doesNotMatch(vertex, /cssd_dist/);
});

test('the fit reads an sdf at full strength, except inside an intersect', () => {
    let fit = code => scene(code).vertex.match(/float cssd_fit[^]*?return/)[0];
    let union = fit('sdf { d: (length(p) - .2 - .1 * rand()) * .5 } box { size: .2 }');
    assert.equal(union.match(/rand\(vec2\(0\.0, 1\.0\)/g).length, 2);
    assert.match(union, /= cssd\d+ > 0\.1 \? cssd\d+ \/ cssd\d+ : cssd\d+;/);
    assert.doesNotMatch(fit('intersect { box { size: .2 } sdf { d: p.y * .7 } }'), /\? /);
    assert.doesNotMatch(scene('sdf { d: (length(p) - .2) * .5 }').dist, /\? /);
});

test('unknown shapes are reported', () => {
    assert.deepEqual(scene('cube { size: .2 }').warnings, ['unknown shape cube']);
    assert.deepEqual(scene('difference { box; sphere { r: .1 } }').warnings, ['unknown shape difference']);
});
