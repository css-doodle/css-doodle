import test from 'node:test';
import assert from 'node:assert/strict';

import Function from '../../src/core/function.js';
import createRandom from '../../src/core/random.js';

test('@arc: path data of an arc, degrees clockwise from 3 o\'clock', () => {
    const arc = Function.arc();
    // the data continues the current path; d: and path() promote the leading lineto
    assert.equal(arc('r: 40; from: 0; to: 90'), 'L 40 0 A 40 40 0 0 1 0 40');
    // more than a half turn sets the large-arc flag
    assert.equal(arc('r: 40; from: 0; to: 270'), 'L 40 0 A 40 40 0 1 1 0 -40');
    // backwards is counter-clockwise
    assert.equal(arc('r: 40; from: 90; to: 0'), 'L 0 40 A 40 40 0 0 0 40 0');
    // from defaults to 0, to to a full circle, drawn as two arcs
    assert.equal(arc('r: 40'), 'L 40 0 A 40 40 0 1 1 -40 0 A 40 40 0 1 1 40 0');
    assert.equal(arc('r: 40; from: 0; to: 400'), arc('r: 40'));
    // two radii, a center, angle units, tidy numbers
    assert.equal(arc('r: 40 20; from: 0; to: 180; move: 50 50'), 'L 90 50 A 40 20 0 0 1 10 50');
    assert.equal(arc('r: 40; to: .25turn'), arc('r: 40; to: 90'));
    assert.equal(arc('r: 40; from: 30deg; to: -30'), 'L 34.6410161514 20 A 40 40 0 0 0 34.6410161514 -20');
    assert.equal(arc('r: 10; from: 0; to: 120'), 'L 10 0 A 10 10 0 0 1 -5 8.66025403784');
    // every parameter takes arithmetic
    assert.equal(arc('r: 80/2; from: 135; to: 135 + 270 * .7'), 'L -28.2842712475 28.2842712475 A 40 40 0 1 1 32.360679775 -23.5114100917');
    // the path helpers anchor on the leading lineto like on a moveto
    assert.equal(Function.flipH()(arc('r: 10; from: 0; to: 90')), 'L10 0 A10 10 0 0 0 20 10');
    assert.equal(Function.reverse()('L 1 2 A 3 3 0 0 1 4 5 L 6 7 Z'), 'L1 2 L6 7 A3 3 0 0 1 4 5 Z');
});

test('@flipH/@flipV/@flip/@invert: mirror path data around its start point', () => {
    const flipH = Function.flipH(), flipV = Function.flipV();
    const flip = Function.flip(), invert = Function.invert();
    // relative h and v
    assert.equal(flipH('M 0 0 h 5 v 5'), 'M0 0 h-5 v5');
    assert.equal(flipV('M 0 0 h 5 v 5'), 'M0 0 h5 v-5');
    assert.equal(flip('M 0 0 h 5 v 5'), 'M0 0 h-5 v-5');
    assert.equal(invert('M 0 0 h 5 v 5'), 'M0 0 v5 h5');
    // commas split the arguments, every one of them is part of the path
    assert.equal(flipH('M 0', '0 h 5', '5'), 'M0 0 h-5 -5');
    assert.equal(flipH('h1 v1', 'h2 v2'), 'h-1 v1 h-2 v2');
    // lines, curves and arcs
    assert.equal(flipH('M 10 10 l 5 5 c 5 -5 10 5 15 0'), 'M10 10 l-5 5 c-5 -5 -10 5 -15 0');
    assert.equal(flipV('M 0 0 q 5 -5 10 0 t 10 0'), 'M0 0 q5 5 10 0 t10 0');
    assert.equal(invert('M 0 0 c 1 2 3 4 5 6'), 'M0 0 c2 1 4 3 6 5');
    // a reflection negates the arc rotation and toggles the sweep flag,
    // a swap exchanges the radii, a half turn keeps them all
    assert.equal(flipH('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a5 3 -30 0 0 -10 0');
    assert.equal(invert('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a3 5 -30 0 0 0 10');
    assert.equal(flip('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a5 3 30 0 1 -10 0');
    // absolute commands mirror around the start point, which stays put
    assert.equal(flipH('M 10 10 L 15 20 H 30 V 0'), 'M10 10 L5 20 H-10 V0');
    assert.equal(invert('M 10 20 L 15 30 H 30 V 0'), 'M10 20 L20 25 V40 H-10');
    assert.equal(flip('M 10 10 L 15 20 Z'), 'M10 10 L5 0 Z');
    assert.equal(flipH('M 10 10 h 5 M 20 10 h 5'), 'M10 10 h-5 M0 10 h-5');
    assert.equal(flipH('m 1 -2 h -3 v -4 z'), 'm1 -2 h3 v-4 z');
    assert.equal(flipH('M .1 0 L .3 0'), 'M0.1 0 L-0.1 0');
    // flipH then flipV is flip, twice is the identity
    let path = 'M 2 3 l 1 2 c 1 2 3 4 5 6 a 5 3 30 0 1 10 0 H 9 V 1 z';
    assert.equal(flipV(flipH(path)), flip(path));
    assert.equal(invert(invert(path)), 'M2 3 l1 2 c1 2 3 4 5 6 a5 3 30 0 1 10 0 H9 V1 z');
    // anything that is not path data passes through
    assert.equal(flipH('#000', '#fff'), '#000,#fff');
    assert.equal(flipH('M 0 0 a5 5 0 0110 0'), 'M 0 0 a5 5 0 0110 0');
    assert.equal(flipH(''), '');
});

test('@reverse: arguments back to front, path data command by command', () => {
    const reverse = Function.reverse();
    assert.deepEqual(reverse('#000', '#333', '#666'), ['#666', '#333', '#000']);
    // bare command letters are a list, not a path
    assert.deepEqual(reverse('a', 'c', 's'), ['s', 'c', 'a']);
    assert.equal(reverse('h1 v2 h3'), 'h3 v2 h1');
    // the leading moveto and the closing z stay put
    assert.equal(reverse('M 0 0 h 5 v 5'), 'M0 0 v5 h5');
    assert.equal(reverse('M 0 0 h 5 v 5 z'), 'M0 0 v5 h5 z');
    assert.equal(reverse('M 1 1', 'h 5', 'v 5'), 'M1 1 v5 h5');
    assert.equal(reverse('M 0 0'), 'M0 0');
    assert.equal(reverse(''), '');
});

test('a function takes the cell, the env and the call-site position', () => {
    let env = { context: {}, pick: list => list[0] };
    assert.equal(Function.id({ id: 'c-1-2-1' })(), 'c-1-2-1');
    assert.equal(Function.x({ x: 3 })(), '3');
    assert.equal(Function.p({}, env)('a', 'b'), 'a');
    // the call site keys the per-call memory in env.context
    Function.P({}, env, ':7')('a', 'b');
    assert.ok('P-counter:7' in env.context);
});

test('@pn/@pnr are the canonical ordered picks, @pl/@pr and @pick-n the legacy names', () => {
    for (let [legacy, name] of [['pl', 'pn'], ['pr', 'pnr'], ['PL', 'PN'], ['PR', 'PNR'], ['pick-n', 'pn']]) {
        assert.equal(Function[legacy], Function[name], `@${legacy} -> @${name}`);
    }
    let env = { context: {}, extra: [], upextra: [], shuffle: a => a };
    let pn = Function.pn({}, env, ':1'), pnr = Function.pnr({}, env, ':2');
    assert.deepEqual([pn('a', 'b', 'c'), pn('a', 'b', 'c'), pn('a', 'b', 'c'), pn('a', 'b', 'c')], ['a', 'b', 'c', 'a']);
    assert.deepEqual([pnr('a', 'b', 'c'), pnr('a', 'b', 'c'), pnr('a', 'b', 'c'), pnr('a', 'b', 'c')], ['c', 'b', 'a', 'c']);
});

test('@match selects the first matching value', () => {
    let cell = { x: 2, y: 1, z: 1, count: 2, grid: { x: 3, y: 1, z: 1, count: 3 } };
    let match = Function.match(cell, { extra: [] });
    assert.equal(match('x < 2', 'a', 'x == 2', 'b', 'c'), 'b');
    assert.equal(match('x > 2', 'a', 'fallback'), 'fallback');
});

test('@ri: an integer with no arguments too, not a character code', () => {
    let { rand } = createRandom('1');
    let ri = Function.ri({}, { context: {}, rand });
    assert.match(String(ri()), /^[01]$/);
    assert.match(String(ri(10)), /^\d+$/);
    assert.match(String(ri('a', 'c')), /^[a-c]$/);
});

test('@ri: both bounds can come up', () => {
    let { rand } = createRandom('1');
    let ri = Function.ri({}, { context: {}, rand });
    let seen = new Set(Array.from({ length: 200 }, () => ri(0, 1)));
    assert.deepEqual([...seen].sort(), [0, 1]);
    seen = new Set(Array.from({ length: 200 }, () => ri('a', 'c')));
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
});

test('@pn inside an argument keeps a counter per call site', () => {
    // argument composition pushes an empty tuple, which used to turn the key into NaN
    let env = { context: {}, extra: [[]], upextra: [], shuffle: a => a };
    let a = Function.pn({}, env, 1), b = Function.pn({}, env, 2);
    assert.deepEqual([a('x', 'y'), b('p', 'q', 'r'), a('x', 'y'), b('p', 'q', 'r')], ['x', 'p', 'y', 'q']);
    // the same site keyed inside a sequence by its invocation
    env.extra = [[1, 1, 1, 3, 3, 1, 1, 42]];
    Function.pd({}, env, 3)('a', 'b');
    assert.ok('pd-values3:42' in env.context);
});

test('@R: a single bound is the maximum, also next to named arguments', () => {
    let grid = { x: 4, y: 1, z: 1, count: 4 };
    let values = args => {
        let env = { context: {}, extra: [], random: createRandom('1').random };
        return [1, 2, 3, 4].map(x => Number(Function.R({ x, y: 1, grid }, env, 1)(...args)));
    };
    let noise = values(['10']);
    assert.ok(noise.every(n => n >= 0 && n <= 10) && new Set(noise).size > 1);
    assert.deepEqual(values(['10', 'frequency=1']), noise);
    assert.deepEqual(values(['to=10']), noise);
    // no arguments is 0 to 1, as for @r
    assert.deepEqual(values([]), values(['1']));
});

test('@R.t: @R written out for a shape, one site per call, inside the bounds', () => {
    let grid = { x: 4, y: 1, z: 1, count: 4 };
    let env = { context: {}, extra: [], random: createRandom('1').random, seed: '1' };
    let call = (x, site, ...args) => Function.R.t({ x, y: 1, grid }, env, site)(...args);
    assert.match(call(1, 1, '.8', '1.2'), /^noise\(t,[^)]*\)$/);
    // the same site keeps its offsets across cells, another site has its own
    assert.notEqual(call(1, 1), call(2, 1));
    assert.notEqual(call(1, 1), call(1, 2));
    let r = Function.shape({}, env)(`points: 60; unit: none; r: ${call(3, 1, '.8', '1.2')}`);
    let radii = r.slice(8, -1).split(',').map(p => Math.hypot(...p.trim().split(' ').map(parseFloat)));
    assert.ok(radii.every(v => v >= .8 - 1e-9 && v <= 1.2 + 1e-9) && new Set(radii).size > 30);
    // a higher frequency puts more bumps along the outline
    let bumps = frequency => {
        let r = Function.shape({}, env)(`points: 720; unit: none; r: ${call(3, 1, '.8', '1.2', `frequency=${frequency}`)}`);
        let v = r.slice(8, -1).split(',').map(p => Math.hypot(...p.trim().split(' ').map(parseFloat)));
        return v.reduce((sum, x, i) => sum + Math.abs(x - v.at(i - 1)), 0);
    };
    assert.ok(bumps(4) > bumps(1) * 2, `${bumps(4)} vs ${bumps(1)}`);
});

test('@plot keeps one point per cell, round:/edge: only change outlines', () => {
    let cell = { x: 1, y: 1, z: 1, count: 1, grid: { x: 5, y: 1, z: 1, count: 5 } };
    let env = { context: {}, extra: [], seed: '1' };
    assert.equal(Function.plot(cell, env)('points: 5; round: 1').length, 5);
    assert.equal(Function.plot(cell, env)('points: 5; edge: .1sin(9t)').length, 5);
});

test('a trailing % is the percent unit, not the modulo operator', () => {
    assert.equal(Function.i({ count: 7 })('50%'), '57%');
    assert.equal(Function.i({ count: 7 })('%3'), '1');
});

test('@R: inside a sequence the sequence is the grid, even in a 1x1 doodle', () => {
    let grid = { x: 1, y: 1, z: 1, count: 1 };
    let env = { context: {}, extra: [], random: createRandom('1').random };
    let noise = [1, 2, 3, 4, 5].map(n => {
        env.extra = [[n, n, 1, 5, 5, 1, n, 1]];
        return Number(Function.R({ x: 1, y: 1, grid }, env, 1)('100'));
    });
    assert.equal(new Set(noise).size, 5);
});

test('@udx/@udy: cell center minus pointer, in doodle pixels', () => {
    let cell = { x: 1, y: 2, grid: { x: 8, y: 4 } };
    assert.match(Function.udx(cell)(), /0\.0625 \* var\(--cssd-uwidth\) - var\(--cssd-umousex\)/);
    assert.match(Function.udy(cell)(), /0\.375 \* var\(--cssd-uheight\) - var\(--cssd-umousey\)/);
    assert.match(Function.udx(cell)('*1px'), /px/);
});

// the shape family: a cell of an n-cell grid, a point's coordinates, a polygon's vertices, area and point test
let cell = (count, n = 1) => ({ x: n, y: 1, z: 1, count: n, grid: { x: count, y: 1, z: 1, count } });
let xy = p => String(p).split(' ').map(parseFloat);
let verts = p => String(p).slice(8, -1).split(', ').map(xy);
let area = vs => Math.abs(vs.reduce((s, [x, y], i) => s + x * vs[(i + 1) % vs.length][1] - vs[(i + 1) % vs.length][0] * y, 0)) / 2;
let inside = (vs, [x, y]) => {
    let n = 0;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let ax = vs[i][0], ay = vs[i][1], bx = vs[j][0], by = vs[j][1];
        if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) n++;
    }
    return n & 1;
};

test('@plot: the shape follows the grid count', () => {
    let env = { context: {}, extra: [] };
    // the memo used to ignore the count, so a second grid got stale points
    let a = Function.plot(cell(25, 2), env)('r: 1');
    let b = Function.plot(cell(100, 2), env)('r: 1');
    assert.notEqual(String(a), String(b));
    assert.equal(String(Function.plot(cell(25, 2), env)('r: 1')), String(a));
    // with a point count every point is returned
    assert.equal(Function.plot(cell(25), env)('r: 1; points: 25').length, 25);
    // a preset's own split is its outline, not a point count
    let points = [1, 2, 3, 4].map(n => xy(Function.plot(cell(9, n), env)('triangle')));
    assert.equal(new Set(points.map(String)).size, 4);
    // the cells between two corners sit on the edge of the triangle
    let [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = points;
    assert.ok(Math.abs((bx - ax) * (dy - ay) - (by - ay) * (dx - ax)) < 1e-6);
    assert.ok(Math.abs((cx - ax) * (dy - ay) - (cy - ay) * (dx - ax)) < 1e-6);
    assert.notEqual(String(Function.plot(cell(9, 1), env)('circle')), String(Function.plot(cell(9, 2), env)('circle')));
    // @Plot keeps the units, @plot outputs percentages
    assert.match(String(Function.plot(cell(4), env)('r: 1')), /%/);
    assert.doesNotMatch(String(Function.Plot(cell(4), env)('r: 1')), /%/);
});

test('@plot: scatter spreads one point per cell inside the shape', () => {
    let env = { context: {}, extra: [] };
    let points = Array.from({ length: 70 }, (_, i) => String(Function.plot.scatter(cell(70, i + 1), env)('star')));
    assert.equal(new Set(points).size, 70);
    // the same points every time, no randomness
    assert.equal(String(Function.plot.scatter(cell(70, 5), env)('star')), points[4]);
    // top row first
    assert.ok(xy(points[0])[1] < xy(points[69])[1]);
    // inside a circle of radius .5 → within 25%..75%, clear of the edge
    for (let i = 1; i <= 20; i++) {
        let [x, y] = xy(Function.plot.scatter(cell(20, i), env)('r: .5'));
        assert.ok(Math.hypot(x - 50, y - 50) < 25, `${x} ${y}`);
    }
    // `points` returns them all, `split` stays the outline
    let list = Function.plot.scatter(cell(4), env)('points: 30; split: 5');
    assert.equal(list.length, 30);
    // no rotation unless `dir` is given
    assert.ok(!Function.plot.scatter(cell(20, 3), env)('r: .8').extra);
    assert.ok(Function.plot.scatter(cell(20, 3), env)('r: .8; dir: auto').extra);
    // a single point sits at the middle of the shape
    let [cx, cy] = xy(Function.plot.scatter(cell(1), env)('r: 1'));
    assert.ok(Math.abs(cx - 50) < .5 && Math.abs(cy - 50) < .5, `${cx} ${cy}`);
    // `fill: evenodd` leaves the centre of a pentagram empty, as @shape does
    let pentagram = 'split: 5; turn: 2; points: 200';
    let centre = list => list.map(xy).filter(([x, y]) => Math.hypot(x - 50, y - 50) < 15).length;
    assert.ok(centre(Function.plot.scatter(cell(4), env)(pentagram)) > 10);
    assert.equal(centre(Function.plot.scatter(cell(4), env)(pentagram + '; fill: evenodd')), 0);
    // a shape without an inside has no points, and does not hang
    assert.equal(Function.plot.scatter(cell(4), env)('points: 12; x: 0; y: 0').length, 0);
    let start = performance.now();
    assert.equal(Function.plot.scatter(cell(4), env)('points: 8192; x: cos(t); y: 0').length, 0);
    assert.ok(performance.now() - start < 500);
});

test('@tile.voronoi: the box tiled around points scattered inside the shape, preset or formula', () => {
    let env = { context: {}, extra: [] };
    let regions = (shape, n, seed) => Array.from({ length: n }, (_, i) => Function.tile.voronoi(cell(n, i + 1), { context: {}, extra: [], seed })(shape));
    let covered = list => list.reduce((s, t) => s + (String(t) == 'polygon(0 0)' ? 0 : area(verts(t))), 0);
    // a formula is an outline like a preset: four points scattered inside a circle give four tiles covering the box
    let list = regions('r: .5', 4, 'a');
    assert.ok(list.every(t => verts(t).length >= 3) && Math.abs(covered(list) - 10000) < 1e-6);
    for (let i = 1; i <= 4; i++) {
        // each tile holds its @plot.scatter point as the origin, inside the circle
        let point = Function.plot.scatter(cell(4, i), { context: {}, extra: [], seed: 'a' })('r: .5');
        assert.ok(inside(verts(list[i - 1]), xy(point)));
        assert.ok(Math.hypot(...xy(point).map(v => v - 50)) < 25);
        assert.equal(list[i - 1].origin, String(point));
    }
    assert.ok(!Function.plot(cell(4, 2), env)('r: .5').origin);
    // a preset is filled with scattered points, still the whole box
    let heart = regions('heart', 30, 'a');
    assert.ok(Math.abs(covered(heart) - 10000) < 1e-6);
    for (let i = 1; i <= 30; i++) {
        let point = Function.plot.scatter(cell(30, i), { context: {}, extra: [], seed: 'a' })('heart');
        assert.ok(inside(verts(heart[i - 1]), xy(point)));
        assert.equal(heart[i - 1].origin, String(point));
    }
    // `points` sets the count, never a list; cells past it get none
    let few = regions('r: .5; points: 3', 6);
    assert.ok(!Array.isArray(few[0]) && few.slice(0, 3).every(t => verts(t).length >= 3) && Math.abs(covered(few) - 10000) < 1e-6);
    assert.equal(String(few[5]), 'polygon(0 0)');
    let fewer = regions('heart; points: 4', 6);
    assert.ok(!Array.isArray(fewer[0]) && Math.abs(covered(fewer) - 10000) < 1e-6);
    assert.equal(String(fewer[5]), 'polygon(0 0)');
    // `gap` moves shared edges in by half, the box edge stays: a lone tile is still the box
    assert.ok(Math.abs(area(verts(regions('r: .5; gap: 10', 1)[0])) - 10000) < 1e-6);
    let pair = regions('r: .5; points: 2; gap: 10', 2, 'a');
    let [a, b] = pair.map(t => xy(t.origin));
    let half = ([x, y]) => Math.abs((b[0] - a[0]) * (x - (a[0] + b[0]) / 2) + (b[1] - a[1]) * (y - (a[1] + b[1]) / 2)) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    let cuts = verts(pair[0]).filter(([x, y]) => !((x == 0 || x == 100) && (y == 0 || y == 100)));
    assert.ok(cuts.length == 2 && cuts.every(v => Math.abs(half(v) - 5) < 1e-6), JSON.stringify(cuts));
    let gapped = regions('heart; gap: 2', 30, 'a');
    assert.ok(gapped.every((t, i) => area(verts(t)) > 0 && area(verts(t)) < area(verts(heart[i]))) && covered(gapped) < 10000);
    // a filled preset follows the doodle seed, `seed: n` pins one, @plot.scatter too
    let o = (shape, seed) => regions(shape, 30, seed).map(t => t.origin);
    assert.notDeepEqual(o('heart', 'a'), o('heart', 'b'));
    assert.deepEqual(o('heart', 'a'), o('heart', 'a'));
    assert.deepEqual(o('heart; seed: 1', 'a'), o('heart; seed: 1', 'b'));
    assert.notDeepEqual(o('heart; seed: 2', 'a'), o('heart; seed: 1', 'a'));
    assert.notEqual(String(Function.plot.scatter(cell(30, 7), { context: {}, extra: [], seed: 'b' })('heart')), o('heart', 'a')[6]);
    // a formula outline follows it too
    assert.notDeepEqual(o('r: .5', 'a'), o('r: .5', 'b'));
});

test('@tile.hex and @tile.triangle: lattice tiles reaching into the shape, as many as the grid allows', () => {
    let round = v => Math.round(v * 1e6) / 1e6;
    let tiles = (fn, shape, n, seed) => Array.from({ length: n }, (_, i) => fn(cell(n, i + 1), { context: {}, extra: [], seed })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let near = (a, b) => Math.abs(a - b) < 1e-6;
    // hexagons over the box: equal, pointy-top, symmetric about both axes, no more than the grid count
    let hex = tiles(Function.tile.hex, 'square', 64);
    assert.ok(hex.length > 40 && hex.length <= 64, hex.length);
    let whole = hex.filter(t => verts(t).length == 6 && verts(t).every(([x, y]) => x > 0 && x < 100 && y > 0 && y < 100));
    assert.ok(whole.length > 10 && new Set(whole.map(t => round(area(verts(t))))).size == 1);
    let [h0] = whole.map(verts);
    assert.ok(h0.some(([x], i) => near(x, h0[(i + 1) % 6][0])));
    let origins = hex.map(t => xy(t.origin));
    for (let [x, y] of origins) {
        assert.ok(origins.some(([u, v]) => near(u, 100 - x) && near(v, y)) && origins.some(([u, v]) => near(u, x) && near(v, 100 - y)));
    }
    // triangles: equal, the origin is the centroid, every other one points the other way
    let tri = tiles(Function.tile.triangle, 'circle', 100);
    assert.ok(tri.length > 60 && tri.length <= 100, tri.length);
    let full = tri.filter(t => verts(t).length == 3);
    assert.ok(full.length > 40 && new Set(full.map(t => round(area(verts(t))))).size == 1);
    for (let t of full) {
        let vs = verts(t), [ox, oy] = xy(t.origin);
        assert.ok(near(ox, (vs[0][0] + vs[1][0] + vs[2][0]) / 3) && near(oy, (vs[0][1] + vs[1][1] + vs[2][1]) / 3));
    }
    let apex = t => verts(t).filter(v => v[1] < xy(t.origin)[1]).length;
    assert.ok(full.slice(0, 20).some((t, i) => i && apex(t) != apex(full[i - 1])));
    // a tile is kept when its centre or a corner lies inside the shape, so the box is covered without holes
    let outline = String(Function.shape()('heart')).slice(8, -1).split(',').map(xy);
    let heart = tiles(Function.tile.hex, 'heart', 64);
    assert.ok(heart.length > 20 && heart.length <= 64 && heart.every(t => [xy(t.origin), ...verts(t)].some(p => inside(outline, p))));
    assert.ok(heart.some(t => !inside(outline, xy(t.origin))));
    let covered = list => { let vs = list.map(verts); for (let x = 1.37; x < 100; x += 4) for (let y = 1.71; y < 100; y += 4) if (!vs.some(v => inside(v, [x, y]))) return false; return true; };
    assert.ok(covered(hex) && covered(tiles(Function.tile.triangle, 'square', 100)));
    // `gap` shrinks every tile; `points` caps the count
    let gapped = tiles(Function.tile.triangle, 'circle; gap: 2', 100);
    assert.ok(gapped.length == tri.length && gapped.every((t, i) => area(verts(t)) < area(verts(tri[i])) && t.origin == tri[i].origin));
    assert.ok(tiles(Function.tile.hex, 'square; points: 10', 64).length <= 10);
    // a lattice has no randomness: the seed changes nothing
    assert.deepEqual(tiles(Function.tile.hex, 'heart', 30, 'z').map(String), tiles(Function.tile.hex, 'heart', 30).map(String));
});

test('@tile.delaunay: triangles between the points @tile.voronoi scatters', () => {
    let env = seed => ({ context: {}, extra: [], seed });
    let names = p => String(p).slice(8, -1).split(', ');
    let tiles = (shape, n, seed = 'a') => Array.from({ length: n }, (_, i) => Function.tile.delaunay(cell(n, i + 1), env(seed))(shape)).filter(t => String(t) != 'polygon(0 0)');
    let scattered = (shape, n) => new Set(Array.from({ length: n }, (_, i) => String(Function.plot.scatter(cell(n, i + 1), env('a'))(shape))));
    // every tile is a triangle whose corners are the scattered points, about half as many points as cells
    let tris = tiles('circle', 60);
    assert.ok(tris.length > 48 && tris.length <= 60, tris.length);
    let corners = scattered('circle', Math.ceil(60 / 2 + Math.sqrt(60)));
    assert.ok(tris.every(t => names(t).length == 3 && names(t).every(v => corners.has(v))));
    // the origin is the centroid, and no triangle holds another's centroid
    for (let t of tris) {
        let vs = verts(t), [ox, oy] = xy(t.origin);
        assert.ok(Math.abs(ox - (vs[0][0] + vs[1][0] + vs[2][0]) / 3) < 1e-6 && Math.abs(oy - (vs[0][1] + vs[1][1] + vs[2][1]) / 3) < 1e-6);
        assert.ok(!tris.some(u => u !== t && inside(vs, xy(u.origin))));
    }
    // a concave shape keeps no triangle across its notch, where the heart outline starts
    let notch = parseFloat(Function.shape()('heart').split(' ')[1]);
    assert.ok(notch > 10 && !tiles('heart', 110).some(t => { let [x, y] = xy(t.origin); return Math.abs(x - 50) < 3 && y < notch - .5; }));
    // `gap` shrinks every triangle, `points` sets the corner count, the seed moves everything
    let gapped = tiles('circle; gap: 2', 60);
    assert.ok(gapped.length <= tris.length && gapped.every(t => area(verts(t)) < area(verts(tris.find(u => u.origin == t.origin)))));
    let few = tiles('circle; points: 12', 60), twelve = scattered('circle', 12);
    assert.ok(few.length > 10 && few.length <= 22 && few.every(t => names(t).every(v => twelve.has(v))), few.length);
    assert.notDeepEqual(tiles('circle', 60, 'b').map(String), tris.map(String));
});

test('@tile.circle: circles packed inside the shape, one per cell, largest first', () => {
    let tiles = (shape, n, seed = 'a') => Array.from({ length: n }, (_, i) => Function.tile.circle(cell(n, i + 1), { context: {}, extra: [], seed })(shape));
    let circle = t => String(t).match(/^ellipse\((\S+)% (\S+)% at (\S+)% (\S+)%\)$/).slice(1).map(Number);
    let outline = String(Function.shape()('heart')).slice(8, -1).split(',').map(xy);
    let heart = tiles('heart', 100).map(circle);
    assert.equal(heart.length, 100);
    for (let [i, [r, ry, x, y]] of heart.entries()) {
        assert.ok(r > 0 && r == ry && inside(outline, [x, y]));
        // inside the outline (to its sampled points) and apart from the others
        assert.ok(outline.every(([u, v]) => Math.hypot(u - x, v - y) > r - 1e-6));
        assert.ok(heart.every(([s, , u, v], j) => i == j || Math.hypot(u - x, v - y) > r + s - 1e-6));
        assert.ok(!i || heart[i - 1][0] >= r);
    }
    // the biggest is capped, so a circle is not one big circle
    let round = tiles('circle', 30).map(circle);
    assert.ok(round[0][0] < 30 && round[29][0] > 1);
    // the origin is the centre; `gap` shrinks the radius by half; `points` caps the count
    let [t] = tiles('heart', 100);
    assert.equal(t.origin, String(t).split(' at ')[1].slice(0, -1));
    assert.ok(tiles('heart; gap: 2', 100).every((t, i) => Math.abs(circle(t)[0] - Math.max(0, heart[i][0] - 1)) < 1e-6));
    assert.equal(tiles('heart; points: 10', 100).filter(t => String(t) != 'polygon(0 0)').length, 10);
    // the doodle seed moves them, `seed: n` pins them
    assert.notEqual(String(tiles('heart', 20, 'b')[0]), String(tiles('heart', 20)[0]));
    assert.equal(String(tiles('heart; seed: 7', 20, 'b')[3]), String(tiles('heart; seed: 7', 20)[3]));
    // `size: f(x, y)` caps the radius in average radii (3 by default), 0 leaves no centre there
    assert.deepEqual(tiles('heart; size: 3', 100).map(String), tiles('heart', 100).map(String));
    assert.ok(tiles('circle; size: 1', 60).map(circle)[0][0] < round[0][0] / 2);
    let graded = tiles('circle; size: 1 + 3 * (1 + y)', 60).map(circle);
    let biggest = top => Math.max(...graded.filter(c => (c[3] < 50) == top).map(c => c[0]));
    assert.ok(biggest(true) > biggest(false) * 1.5);
    assert.ok(tiles('circle; size: 3 * (x > 0)', 60).map(circle).every(c => c[2] > 50));
    assert.deepEqual(tiles('circle; size: 1 + 4 * random()', 30).map(String), tiles('circle; size: 1 + 4 * random()', 30).map(String));
});

test('@tile.slice: the shape cut by random lines, a piece per cell', () => {
    let tiles = (shape, n, seed = 'a') => Array.from({ length: n }, (_, i) => Function.tile.slice(cell(n, i + 1), { context: {}, extra: [], seed })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let near = (a, b) => Math.abs(a - b) < 1e-6;
    let sum = list => list.reduce((s, t) => s + area(verts(t)), 0);
    // the box in as many pieces as cells, cut across by default
    let square = tiles('square', 50);
    assert.equal(square.length, 50);
    assert.ok(near(sum(square), 10000));
    let straight = t => verts(t).every(([x, y], i, vs) => near(x, vs[(i + 1) % vs.length][0]) || near(y, vs[(i + 1) % vs.length][1]));
    assert.ok(square.every(straight));
    // `spread` turns the cuts, in degrees
    let tilted = tiles('square; spread: 90', 50);
    assert.ok(near(sum(tilted), 10000) && !tilted.every(straight));
    // a shape keeps the pieces that reach into it
    let outline = String(Function.shape()('heart')).slice(8, -1).split(',').map(xy);
    let heart = tiles('heart', 80);
    assert.equal(heart.length, 80);
    assert.ok(heart.every(t => [xy(t.origin), ...verts(t)].some(p => inside(outline, p)) || outline.some(p => inside(verts(t), p))));
    // `gap` opens the cuts, the outer edge stays
    let gapped = tiles('square; gap: 2', 50);
    assert.ok(sum(gapped) < 10000 - 50 && gapped.some(t => verts(t).some(([x, y]) => x == 0 || y == 0)));
    // the doodle seed changes the cuts, `seed: n` pins them
    assert.notEqual(tiles('square', 10, 'b').join(), tiles('square', 10).join());
    assert.equal(tiles('square; seed: 3', 10, 'b').join(), tiles('square; seed: 3', 10).join());
    // `density: f(x, y)` cuts the dense parts more often; zero leaves a part whole, a constant changes nothing
    let graded = tiles('square; density: 1 - y', 200);
    let below = graded.filter(t => xy(t.origin)[1] > 50).length;
    assert.ok(below > (graded.length - below) * 2 && near(sum(graded), 10000));
    let disc = tiles('square; density: hypot(x, y) < .5', 100);
    assert.ok(disc.filter(t => Math.hypot(...xy(t.origin).map(v => v - 50)) < 30).length > 80);
    assert.deepEqual(tiles('square; density: 2', 50).map(String), tiles('square', 50).map(String));
});

test('@tile.cube and @tile.penrose: rhombs reaching into the shape, as many as the grid allows', () => {
    let tiles = (fn, shape, n) => Array.from({ length: n }, (_, i) => fn(cell(n, i + 1), { context: {}, extra: [], seed: 'a' })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let near = (a, b) => Math.abs(a - b) < 1e-6;
    let side = ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let covered = list => {
        let vs = list.map(verts);
        for (let x = 1.37; x < 100; x += 4) for (let y = 1.71; y < 100; y += 4) {
            if (vs.filter(v => inside(v, [x, y])).length != 1) return false;
        }
        return true;
    };
    // cubes: a hexagon in three equal rhombs, top, left, right, with the hexagon centre as a corner
    let cube = tiles(Function.tile.cube, 'square', 150);
    assert.ok(cube.length > 100 && cube.length <= 150 && cube.length % 3 == 0, cube.length);
    assert.ok(covered(cube));
    for (let i = 0; i < cube.length; i += 3) {
        let [top, left, right] = cube.slice(i, i + 3).map(verts);
        assert.deepEqual(top[0], left[0]);
        assert.ok(near(area(top), area(left)) && near(area(top), area(right)));
        assert.ok(top[2][1] < top[0][1] && left[2][0] < left[0][0] && right[2][0] > right[0][0]);
    }
    // penrose: two kinds of rhombs with one side length, the box covered once
    let pen = tiles(Function.tile.penrose, 'square', 100);
    assert.ok(pen.length > 80 && pen.length <= 100, pen.length);
    assert.ok(covered(pen));
    let s = side(verts(pen[0]));
    assert.ok(pen.every(t => verts(t).every((v, i, vs) => near(side([v, vs[(i + 1) % 4]]), s))));
    let kinds = new Set(pen.map(t => (area(verts(t)) / s / s).toFixed(4)));
    assert.deepEqual([...kinds].sort(), [Math.sin(Math.PI / 5).toFixed(4), Math.sin(2 * Math.PI / 5).toFixed(4)]);
    // a heart keeps the rhombs reaching into it; `gap` shrinks every rhomb about its centre
    let outline = String(Function.shape()('heart')).slice(8, -1).split(',').map(xy);
    assert.ok(tiles(Function.tile.penrose, 'heart', 100).every(t => [xy(t.origin), ...verts(t)].some(p => inside(outline, p))));
    let gapped = tiles(Function.tile.penrose, 'square; gap: 1', 100);
    assert.ok(gapped.every((t, i) => area(verts(t)) < area(verts(pen[i])) && t.origin == pen[i].origin));
});

test('@tile.grid with shift: every other row, or column, moved by part of a cell', () => {
    let tiles = shape => Array.from({ length: 64 }, (_, i) => Function.tile.grid(cell(64, i + 1), { context: {}, extra: [], seed: 'a' })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let covered = list => {
        let vs = list.map(verts);
        for (let x = 1.37; x < 100; x += 4) for (let y = 1.71; y < 100; y += 4) {
            if (vs.filter(v => inside(v, [x, y])).length != 1) return false;
        }
        return true;
    };
    let near = (a, b) => Math.abs(a - b) < 1e-6;
    let rows = (list, i) => [...new Set(list.map(t => xy(t.origin)[i].toFixed(6)))].map(Number).sort((a, b) => a - b);
    let plain = tiles('square');
    // `.5`: bricks, the top and bottom edges split where the next row's squares meet
    let brick = tiles('square; shift: .5'), s = Math.sqrt(area(verts(brick[0])));
    assert.ok(covered(brick));
    assert.ok(brick.every(t => verts(t).length == 6 && near(area(verts(t)), s * s)));
    let phase = rows(brick, 1).map(y => brick.filter(t => near(xy(t.origin)[1], y)).map(t => ((xy(t.origin)[0] - 50) / s % 1 + 1) % 1));
    assert.ok(phase.every((xs, j) => xs.every(x => near(Math.abs(x - phase[0][0]) % 1, j % 2 / 2))));
    // `0 .3`: columns, the left and right edges split
    let column = tiles('square; shift: 0 .3');
    assert.ok(covered(column));
    assert.ok(column.every(t => { let v = verts(t); return v.length == 6 && near(v[1][0], v[2][0]) && near(v[4][0], v[5][0]); }));
    // whole cells change nothing; an edge formula bends the split edges and still covers
    assert.deepEqual(tiles('square; shift: 2').map(String), plain.map(String));
    assert.ok(covered(tiles('square; shift: .5; edge: .15 * sin(t)')));
});

test('jitter: lattice corners move by a seeded offset, the same in every piece sharing one', () => {
    let tiles = (fn, shape, seed = 'a') => Array.from({ length: 64 }, (_, i) => fn(cell(64, i + 1), { context: {}, extra: [], seed })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let covered = list => {
        let vs = list.map(verts);
        for (let x = 1.37; x < 100; x += 4) for (let y = 1.71; y < 100; y += 4) {
            if (vs.filter(v => inside(v, [x, y])).length != 1) return false;
        }
        return true;
    };
    for (let fn of [Function.tile.grid, Function.tile.hex, Function.tile.triangle, Function.tile.cube, Function.tile.penrose]) {
        let plain = tiles(fn, 'square'), shaken = tiles(fn, 'jitter: .2');
        assert.notDeepEqual(shaken.map(String), plain.map(String));
        assert.ok(covered(shaken));
        assert.deepEqual(tiles(fn, 'jitter: 0').map(String), plain.map(String));
    }
    // with shift and edge too; the seed changes the offsets
    assert.ok(covered(tiles(Function.tile.grid, 'shift: .5; jitter: .2; edge: .1 * sin(t)')));
    assert.notDeepEqual(tiles(Function.tile.hex, 'jitter: .2', 'b').map(String), tiles(Function.tile.hex, 'jitter: .2').map(String));
});

test('edge: bends every lattice edge with a formula, and neighbours still fit', () => {
    let tiles = (fn, shape, seed = 'a') => Array.from({ length: 64 }, (_, i) => fn(cell(64, i + 1), { context: {}, extra: [], seed })(shape)).filter(t => String(t) != 'polygon(0 0)');
    let covered = list => {
        let vs = list.map(verts);
        for (let x = 1.37; x < 100; x += 2) for (let y = 1.71; y < 100; y += 2) {
            if (vs.filter(v => inside(v, [x, y])).length != 1) return false;
        }
        return true;
    };
    // distinct outlines, each moved to its origin
    let shapes = list => new Set(list.map(t => { let [ox, oy] = xy(t.origin); return verts(t).map(([x, y]) => (x - ox).toFixed(1) + ' ' + (y - oy).toFixed(1)).join(); })).size;
    for (let fn of [Function.tile.grid, Function.tile.hex, Function.tile.triangle]) {
        // the same curve on every edge: the box is covered once and the tiles stay congruent
        let bent = tiles(fn, 'square; edge: .15 * sin(t)');
        assert.ok(covered(bent) && bent.every(t => verts(t).length > 12) && shapes(bent) <= 2);
        // random() is drawn once per edge, x and y are the edge's midpoint: every edge differs, still covered
        for (let edge of ['.2 * sin(t) * random()', '.1 * x * sin(2t)']) {
            let varied = tiles(fn, `square; edge: ${edge}`);
            assert.ok(covered(varied) && shapes(varied) > 5, edge);
        }
    }
    // `e` is the edge direction: on a grid 1 is horizontal, so only the vertical edges bend
    let s = Math.sqrt(area(verts(tiles(Function.tile.grid, 'square; edge: (e - 1) * .1 * sin(t)')[0])));
    for (let t of tiles(Function.tile.grid, 'square; edge: (e - 1) * .1 * sin(t)')) {
        let xs = verts(t).map(v => v[0]), ys = verts(t).map(v => v[1]);
        assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - s) < 1e-6 && Math.max(...xs) - Math.min(...xs) > s + 1);
    }
    // x, y and random read through a variable vary the edges just the same
    assert.deepEqual(tiles(Function.tile.hex, 'square; a: .1 * x; edge: a * sin(2t)').map(String), tiles(Function.tile.hex, 'square; edge: .1 * x * sin(2t)').map(String));
    assert.ok(shapes(tiles(Function.tile.grid, 'square; a: random(); edge: .2 * a * sin(t)')) > 10);
    // the seed only reaches the curve through random()
    let rnd = 'square; edge: .2 * sin(t) * random()';
    assert.deepEqual(tiles(Function.tile.grid, rnd).map(String), tiles(Function.tile.grid, rnd).map(String));
    assert.notDeepEqual(tiles(Function.tile.grid, rnd, 'b').map(String), tiles(Function.tile.grid, rnd).map(String));
    assert.deepEqual(tiles(Function.tile.grid, 'square; edge: .15 * sin(t)', 'b').map(String), tiles(Function.tile.grid, 'square; edge: .15 * sin(t)').map(String));
});

test('pair: turn and slide: edges paired by turns about the corners, and bent along themselves', () => {
    let env = { context: {}, extra: [], seed: 'a' };
    let tiles = (fn, shape) => Array.from({ length: 64 }, (_, i) => {
        let c = cell(64, i + 1), t = fn(c, env)(shape);
        return String(t) == 'polygon(0 0)' ? null : Object.assign(t, { k: Number(Function.tile.kind(c)()) });
    }).filter(Boolean);
    let covered = list => {
        let vs = list.map(verts);
        for (let x = 1.37; x < 100; x += 2) for (let y = 1.71; y < 100; y += 2) {
            if (vs.filter(v => inside(v, [x, y])).length != 1) return false;
        }
        return true;
    };
    // whole tiles turned back by their kind, then moved to their origin
    let shapes = (list, step) => new Set(list.filter(t => verts(t).every(([x, y]) => x > 0 && x < 100 && y > 0 && y < 100)).map(t => {
        let [ox, oy] = xy(t.origin), a = -(t.k - 1) * step * Math.PI / 180, r = v => Math.round(v * 10) / 10;
        return verts(t).map(([x, y]) => [x - ox, y - oy]).map(([x, y]) => r(x * Math.cos(a) - y * Math.sin(a)) + ' ' + r(x * Math.sin(a) + y * Math.cos(a))).sort().join();
    })).size;
    for (let [fn, kinds, step] of [[Function.tile.hex, 3, 120], [Function.tile.grid, 4, 90]]) {
        for (let shape of ['edge: .3 * sin(t/2)^2 * (e - 2) + .1 * sin(t)', 'edge: .3 * sin(t/2)^2 * (e - 2) + .1 * sin(t); slide: .4 * sin(t/2)^4 * (e - 2)']) {
            let turned = tiles(fn, `square; pair: turn; ${shape}`);
            assert.ok(covered(turned), shape);
            assert.equal(new Set(turned.map(t => t.k)).size, kinds);
            assert.equal(shapes(turned, step), 1, shape);
        }
    }
    // ignored on triangles and shifted grids
    assert.deepEqual(tiles(Function.tile.triangle, 'square; pair: turn; edge: .1 * sin(t)').map(String), tiles(Function.tile.triangle, 'square; edge: .1 * sin(t)').map(String));
    assert.deepEqual(tiles(Function.tile.grid, 'square; shift: .5; pair: turn; edge: .1 * sin(t)').map(String), tiles(Function.tile.grid, 'square; shift: .5; edge: .1 * sin(t)').map(String));
});

test('@tile.r: the radius of the cell\'s @tile.circle', () => {
    let env = { context: {}, extra: [], seed: 'a' };
    let c = cell(20, 3);
    assert.equal(Function.tile.r(c)(), '');
    let t = Function.tile.circle(c, env)('heart');
    assert.equal(Function.tile.r(c)(), String(t).split(' ')[0].slice(8));
    assert.match(Function.tile.r(c)(), /%$/);
    // the larger radius, in percent of the shorter side, on a wide or tall element
    for (let aspect of ['2', '1 / 2']) {
        let [rx, ry] = String(Function.tile.circle(c, env)('heart; aspect: ' + aspect)).slice(8).split(' ');
        assert.equal(Function.tile.r(c)(), aspect == '2' ? ry : rx);
    }
    Function.tile.hex(c, env)('heart');
    assert.equal(Function.tile.r(c)(), '');
});

test('@tile.kind: which kind of piece the cell\'s tile is', () => {
    let env = { context: {}, extra: [], seed: 'a' };
    let kinds = (fn, shape, n) => Array.from({ length: n }, (_, i) => {
        let c = cell(n, i + 1), t = fn(c, env)(shape);
        return [t, Function.tile.kind(c)()];
    }).filter(([t]) => String(t) != 'polygon(0 0)');
    let c = cell(10, 2);
    assert.equal(Function.tile.kind(c)(), '');
    // penrose: 1 thin, 2 thick
    let s = 0;
    for (let [t, k] of kinds(Function.tile.penrose, 'square', 60)) {
        let vs = verts(t), side = Math.hypot(vs[0][0] - vs[1][0], vs[0][1] - vs[1][1]);
        assert.equal(k, area(vs) / side / side < .7 ? 1 : 2);
        s |= 1 << k;
    }
    assert.equal(s, 6);
    // cube: 1 top, 2 left, 3 right; triangle: 1 pointing down, 2 up
    assert.deepEqual(kinds(Function.tile.cube, 'square', 30).slice(0, 6).map(([, k]) => k), [1, 2, 3, 1, 2, 3]);
    for (let [t, k] of kinds(Function.tile.triangle, 'square', 40)) {
        let vs = verts(t), [, oy] = xy(t.origin);
        assert.equal(k, vs.filter(v => v[1] > oy).length == 1 ? 1 : 2);
    }
    // every other kind of piece is 1, an empty cell has none
    for (let fn of [Function.tile, Function.tile.delaunay, Function.tile.hex, Function.tile.circle, Function.tile.slice]) {
        assert.ok(kinds(fn, 'heart', 20).every(([, k]) => k === 1));
    }
    Function.tile.hex(c, env)('square; points: 1');
    assert.equal(Function.tile.kind(c)(), '');
});

test('scatter density: a formula in x and y (shape coordinates, y up) sets how many points land where', () => {
    let env = seed => ({ context: {}, extra: [], seed });
    let tiles = (shape, n = 200) => Array.from({ length: n }, (_, i) => Function.tile.voronoi(cell(n, i + 1), env('a'))(shape));
    // dense at the bottom (y = -1), sparse at the top: tiles there are several times larger
    let graded = tiles('square; density: 1 - y');
    let half = top => graded.filter(t => (xy(t.origin)[1] < 50) == top).map(t => area(verts(t)));
    let mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(half(false).length > half(true).length * 2 && mean(half(true)) > mean(half(false)) * 2);
    // @plot.scatter with the same density lands on the tiles' points; a constant density changes nothing
    assert.deepEqual(graded.map(t => t.origin), Array.from({ length: 200 }, (_, i) => String(Function.plot.scatter(cell(200, i + 1), env('a'))('square; density: 1 - y'))));
    assert.deepEqual(tiles('square; density: 1').map(String), tiles('square').map(String));
    assert.deepEqual(tiles('heart; density: 2').map(String), tiles('heart').map(String));
});

test('@palette: a seeded curve through oklch, the count samples it evenly', () => {
    let env = seed => ({ context: {}, seed });
    let palette = Function.palette(null, env('a'));
    let five = palette(5);
    assert.equal(five.length, 5);
    assert.ok(five.every(c => /^oklch\([\d.]+ [\d.]+ [\d.]+\)$/.test(c)));
    // the default count is 5; every count shares the ends, odd counts the middle
    assert.deepEqual(palette(), five);
    assert.deepEqual(palette(2), [five[0], five[4]]);
    assert.deepEqual(palette(3), [five[0], five[2], five[4]]);
    assert.deepEqual(palette(9).filter((_, i) => i % 2 == 0), five);
    // the seed decides it; counts are clamped, truncated and take arithmetic
    assert.deepEqual(Function.palette(null, env('a'))('2 + 1'), palette(3));
    assert.deepEqual(palette(3.7), palette(3));
    assert.deepEqual(palette(0), [five[2]]);
    assert.notDeepEqual(Function.palette(null, env('b'))(5), five);
    // results are copies
    palette(5).reverse();
    assert.deepEqual(palette(5), five);
});
