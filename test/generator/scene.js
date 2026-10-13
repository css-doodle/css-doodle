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
    let { body, warnings } = scene('sphere { r: .2 } box { size: .3; move: .2 0 0 }');
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

test('angles are degrees, and turn converts', () => {
    let { body, fragment } = scene('box { rotate: 90 } sphere { rotate: y .25turn; twist: 30 } view: 30 20');
    assert.match(body, /g_rotate\(p, vec3\(0\.0, 0\.0, 1\.0\), radians\(90\.0\)\)/);
    assert.match(body, /radians\(\(\.25 \* 360\.0\)\)/);
    assert.match(body, /rot\(p\.xz, -radians\(30\.0\) \* p\.y\)/);
    assert.match(fragment, /g_x = g_rotate\(vec3\(1\.0, 0\.0, 0\.0\), vec3\(0\.0, 1\.0, 0\.0\), radians\(30\.0\)\)/);
});

test('commands apply top to bottom', () => {
    let { body } = scene('box { size: .2; rotate: 30deg; move: .3 0 0 }');
    assert.ok(body.indexOf('- vec3(.3, 0.0, 0.0)') < body.indexOf('g_rotate('));
});

test('round and frame keep the outer size, grow inflates', () => {
    assert.match(scene('box { size: .4; round: .02 }').body, /g_box\(p, vec3\(\.4\) \* 0\.5 - \.02\) - \.02/);
    assert.match(scene('box { size: .4; grow: .02 }').body, /\.w -= \.02;/);
    // frame keeps a band inside the surface
    assert.match(scene('box { size: .4; frame: .02 }').body, /(g_\d+)\.w = max\(\1\.w, -\1\.w - \.02\);/);
});

test('attributes a shape does not take are reported', () => {
    assert.deepEqual(scene('sphere { r: .2; round: .02; colr: red }').warnings, ['sphere has no round', 'sphere has no colr']);
    assert.deepEqual(scene('sphere { smooth: .1 }').warnings, ['sphere has no smooth']);
    assert.deepEqual(scene('box { sphere { r: .1 } }').warnings, ['box cannot hold shapes; put them in a union']);
    assert.deepEqual(scene('box#leg; #leg { sphere { r: .1 } }').warnings, ['box cannot hold shapes; put them in a union']);
});

test('fill colors a group and the shapes in it without their own', () => {
    let { body } = scene('union { fill: red; sphere { r: .1 } box { size: .1; fill: #fff } }');
    let fills = [...body.matchAll(/vec4\(g_(\d+), (length|g_box)/g)].map(m => m[1]);
    assert.notEqual(fills[0], fills[1]);
});

test('*N and *XxY make copies with n, N, nx and ny', () => {
    let { body, warnings } = scene('box*5x3 { size: .05; move: nx * .1, ny * .1, n / N }');
    assert.deepEqual(warnings, []);
    assert.match(body, /for \(int (g_\d+) = 0; \1 < 15; \1\+\+\)/);
    assert.match(body, /= float\(g_\d+ % 5 \+ 1\), g_\d+ = float\(g_\d+ \/ 5 \+ 1\)/);
    // no copies draw nothing, as in @shape
    assert.deepEqual(scene('sphere*0; box;').warnings, []);
    assert.doesNotMatch(scene('sphere*0; box;').body, /length\(|for \(/);
    assert.deepEqual(scene('sphere*two;').warnings, ['unexpected sphere*two', 'unknown shape sphere*two']);
});

test('repeat takes a spacing only', () => {
    assert.deepEqual(scene('sphere { r: .05; repeat: .2 0 .2 }').warnings, []);
    assert.deepEqual(scene('sphere { r: .05; repeat: .2 0 .2, 5 1 5 }').warnings, ['repeat takes a spacing only; for a counted grid write box*5x5']);
});

test('polygon takes points and a depth', () => {
    let { body, fragment, warnings } = scene('polygon { points: 0 0, 0 .4, .2 0; depth: .1 }');
    assert.deepEqual(warnings, []);
    assert.match(fragment, /const vec2 g_c0\[\] = vec2\[4\]\(vec2\(0\.0, 0\.0\), vec2\(0\.0, \.4\), vec2\(\.2, 0\.0\), vec2\(0\.0, 0\.0\)\);/);
    assert.match(body, /for \(int i = 0; i < 3; i\+\+\) \{\s*vec2 a = g_c0\[i\]/);
    assert.match(scene('polygon { k: .4; points: 0 0, 0 k, .2 0 }').body, /vec2 g_\d+\[4\] = vec2\[4\]\(vec2\(0\.0, 0\.0\), vec2\(0\.0, g_\d+\)/);
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

test('#id names a shape instead of drawing it, #id draws it with more rows', () => {
    assert.deepEqual(scene('capsule#leg2 { from: 0 0 0; to: 0 .2 0; r: .02 } #leg2 { move: .1 0 0 }').warnings, []);
    assert.deepEqual(scene('union#cap { sphere { r: .2 } box { size: .1 } } #cap;').warnings, []);
    assert.deepEqual(scene('union#a { #a { scale: 2 } } #a;').warnings, ['#a uses itself']);
    assert.deepEqual(scene('#nope;').warnings, ['unknown shape #nope', '@scene draws nothing: add a shape such as sphere { r: .3 }']);
    // an attribute given at #id replaces the shape's own
    let { body, warnings } = scene('capsule#leg { r: .1 } #leg { r: .2 }');
    assert.deepEqual(warnings, []);
    assert.match(body, /vec2\(\.2, \.2\)/);
    assert.doesNotMatch(scene('sphere#a { r: .1 }').body, /length\(p\)/);
});

test('named shapes nothing draws are still checked', () => {
    assert.deepEqual(scene('sphere#a { r: .1 } sphere#b { r: .2 } #a;').warnings, []);
    assert.deepEqual(scene('sphere#a { colr: red } sphere { r: .2 }').warnings, ['sphere has no colr']);
});

test('perspective sets the camera distance, none makes it parallel', () => {
    assert.match(scene('sphere;').fragment, /float g_d = 2\.0/);
    assert.match(scene('perspective: 4; sphere;').fragment, /float g_d = 4\.0/);
    assert.match(scene('perspective: none; sphere;').fragment, /float g_d = 0\.0/);
});

test('the model is measured once per vertex, not per pixel', () => {
    let { vertex, fragment } = scene('sphere { r: .2 }');
    assert.match(vertex, /g_vhi = max\(g_vhi, vec3\(g_reach\(g_x\), g_reach\(g_y\), g_reach\(g_z\)\)\)/);
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

test('the fit reads a twisted shape turned all the way round y, since far probes would turn by any angle', () => {
    let { vertex, dist } = scene('box { size: .2; move: .8 0 0; twist: 10 }');
    let fit = vertex.match(/float g_fit[^]*?return/)[0];
    assert.match(fit, /for \(int (g_\d+) = 0; \1 < 16; \1\+\+\) \{\nvec3 (g_\d+) = p;\n\2\.xz = rot\(p\.xz, float\(\1\) \* PI \/ 8\.0\);/);
    assert.match(fit, /g_box\(/);
    assert.match(dist, /\.xz = rot\(p\.xz, -radians\(10\.0\) \* p\.y\);/);
});

test('a moving model fits over its first 2π seconds and where it is now', () => {
    assert.match(scene('sphere { r: .2; move: sin(t) 0 0 }').vertex, /i <= 32; i\+\+\) \{\n\s*if \(i > 0\) t = float\(i - 1\) \* PI \/ 16\.0;/);
    assert.match(scene('sphere { r: .2 }').vertex, /i <= 0; i\+\+/);
});

test('copies that read none of n, nx and ny and do not blend are drawn once', () => {
    let loops = code => scene(code).dist.match(/< \d+; g_\d+\+\+/g);
    assert.deepEqual(loops('polygon*10 { bud 3; depth: .2; rotate: y 100t }'), ['< 1; g_4++']);
    assert.deepEqual(loops('polygon*10 { bud 3; depth: .2; rotate: y (100t + n * 18) }'), ['< 10; g_4++']);
    assert.deepEqual(loops('sphere*3x2 { r: .1; move: 0 ny 0 }'), ['< 6; g_4++']);
    assert.deepEqual(loops('sphere*5 { r: .1; move: rand() 0 0 }'), ['< 5; g_4++']);
    assert.deepEqual(loops('sphere*5 { r: .1; smooth: .1 }'), ['< 5; g_4++']);
});

test('a turning view fits at the same times as the model, so the camera holds still', () => {
    let { vertex } = scene('view: 30t; box { size: 1 .2 .2 }');
    assert.match(vertex, /if \(i > 0\) t = float\(i - 1\) \* PI \/ 16\.0;\s*vec3 g_x = g_rotate\(vec3\(1\.0, 0\.0, 0\.0\), vec3\(0\.0, 1\.0, 0\.0\), radians\(\(30\.0 \* t\)\)\);/);
});

test('a polygon takes a @shape body as its outline, holes and all', () => {
    let { body, fragment, warnings } = scene('polygon { heart; depth: .2 }');
    assert.deepEqual(warnings, []);
    assert.match(fragment, /const vec2 g_c0\[\] = vec2\[181\]\(/);
    assert.match(fragment, /const ivec2 g_c1\[\] = ivec2\[13\]\(ivec2\(0, 14\),ivec2\(14, 28\),/);
    assert.match(fragment, /const vec3 g_c2\[\] = vec3\[13\]\(/);
    assert.match(body, /if \(h \* h >= g_\d+\) continue;/);
    let ring = scene('polygon { subtract { circle; circle { scale: .5 } } depth: .2 }').fragment;
    assert.match(ring, /ivec2\(168, 171\),ivec2\(172, 182\)/);
    assert.match(scene('polygon { union { circle*8 { scale: .3; move: 0 .6; rotate: n * 45 } } depth: .1 }').fragment, /vec2\[258\]/);
    assert.match(scene('polygon { heart; points: 64; depth: .2 }').fragment, /const vec2 g_c0\[\] = vec2\[65\]/);
    assert.match(scene('polygon { heart; points: 1000 }').fragment, /const vec2 g_c0\[\] = vec2\[257\]/);
    assert.deepEqual(scene('polygon { cirle; depth: .2 }').warnings, ['unknown shape cirle']);
});

test('unknown shapes are reported', () => {
    assert.deepEqual(scene('cube { size: .2 }').warnings, ['unknown shape cube']);
    assert.deepEqual(scene('difference { box; sphere { r: .1 } }').warnings, ['unknown shape difference']);
});

test('a copy block adds to the rows and shapes around it', () => {
    let { body, warnings } = scene('box*2 { size: .3; move: n 0 0; { fill: red } { fill: white; scale: 2 } }');
    assert.deepEqual(warnings, []);
    assert.equal(body.match(/g_box\(g_\d+, vec3\(\.3\)/g).length, 2);
    assert.match(body, /p - vec3\(1\.0, 0\.0, 0\.0\)[^]*p \/ g_\d+;\nvec3 g_\d+ = g_\d+ - vec3\(2\.0, 0\.0, 0\.0\)/);
    assert.equal(scene('union*2 { sphere { r: .1 } { move: .5 0 0 } { move: -.5 0 0 } }').body.match(/length\(g_\d+\) - \.1/g).length, 2);
});

test('r is read only where a shape takes it', () => {
    let { body, warnings } = scene('box { r: rand() } sphere { r: rand() } ellipsoid { r: rand() .2 .1 }');
    assert.deepEqual(warnings, ['box has no r']);
    assert.match(body, /length\(p\) - rand\(vec2\(0\.0, 1\.0\)/);
    assert.match(body, /g_ellipsoid\(p, vec3\(rand\(vec2\(0\.0, 2\.0\)[^;]*, \.2, \.1\)\)/);
    assert.equal(body.match(/rand\(/g).length, 2);
});

test('the last definition of a name wins', () => {
    let { body, warnings } = scene('sphere#a { r: .2 } box#a; #a { }');
    assert.deepEqual(warnings, []);
    assert.match(body, /g_box\(/);
    assert.doesNotMatch(body, /length\(p\)/);
});

test('any other name is a variable, seen by the rows and shapes of its block', () => {
    let { body, warnings } = scene('union { k: .2; sphere { r: k } box { size: k } }');
    assert.deepEqual(warnings, []);
    assert.match(body, /float (g_\d+) = \.2;[^]*length\(p\) - \1/);
    // per copy, with n
    assert.match(scene('sphere*3 { k: n * .1; r: k }').body, /for \([^]*float (g_\d+) = \(g_\d+ \* \.1\);[^]*length\(p\) - \1/);
    // a variable nothing reads is reported, as is an attribute where it does not belong
    assert.deepEqual(scene('k: 3; sphere;').warnings, ['nothing reads k']);
    assert.deepEqual(scene('sphere { d: .1; r: d * 2 }').warnings, []);
    // `2k` reads k, and `2t` reads the time
    assert.match(scene('k: .1; sphere { r: 2k }').body, /float (g_\d+) = \.1;[^]*\(2\.0 \* \1\)/);
    assert.match(scene('sphere { r: .2 + .1 * sin(2t) }').fragment, /t = u_time;/);
    // p is a point, also outside any move
    assert.match(scene('sdf { q: abs(p) - .2; d: length(max(q, 0.0)) }').body, /vec3 g_\d+ = \(abs\(p\) - \.2\);/);
});

test('#id rows need no ; before a block, and the count may come first', () => {
    let { body, warnings } = scene('sphere*2#s { r: .1; move: n 0 0 } box#b { size: .1 } #b #b { move: 0 .3 0 } #s;');
    assert.deepEqual(warnings, []);
    assert.equal(body.match(/g_box\(/g).length, 2);
    assert.match(body, /for \(int g_\d+ = 0; g_\d+ < 2;/);
});
