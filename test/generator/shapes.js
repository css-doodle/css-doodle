import test from 'node:test';
import assert from 'node:assert/strict';

import generateShape from '../../src/generator/shapes.js';
import { insideTest } from '../../src/generator/tiling.js';

test('preset shapes', () => {
    let { points, preset } = generateShape('triangle');
    assert.equal(preset, true);
    assert.equal(points.length, 3);
    assert.equal(generateShape('circle').points.length, 180);
});

test('commands after a preset add to it or override its own', () => {
    let { points, preset } = generateShape('heart; split: 12');
    assert.equal(preset, true);
    assert.equal(points.length, 12);
    assert.equal(generateShape('clover 5; split: 8').points.length, 8);
    assert.equal(generateShape('clover 5; split: 8').preset, true);
    // a new command keeps the outline
    assert.equal(String(generateShape('heart; gap: 1').points), String(generateShape('heart').points));
    // a formula after the preset overrides its own
    assert.equal(generateShape('heart; r: .5').points.length, 180);
    assert.notEqual(String(generateShape('heart; r: .5').points), String(generateShape('heart').points));
});

test('fitted presets fill the box, centred', () => {
    let bounds = shape => {
        let xs = [], ys = [];
        for (let p of generateShape(shape).points) {
            let [x, y] = String(p).split(' ').map(parseFloat);
            xs.push(x), ys.push(y);
        }
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round);
    };
    for (let shape of ['squircle', 'squircle 1', 'squircle .5', 'bud 4', 'hypocycloid 4']) {
        assert.deepEqual(bounds(shape), [0, 100, 0, 100], shape);
    }
    // the longer side touches, the shorter one is centred
    assert.deepEqual(bounds('cloud 1'), [0, 100, 7, 93]);
    assert.deepEqual(bounds('triangle'), [0, 100, 7, 93]);
    assert.deepEqual(bounds('hypocycloid 3'), [7, 93, 0, 100]);
});

test('prototype names are not preset shapes', () => {
    assert.equal(generateShape('constructor').preset, false);
    assert.equal(generateShape('toString').preset, false);
});

test('a modifier reshapes the commands before the points are generated', () => {
    let a = generateShape('r: cos(4t)', { min: 1, max: 65536 }, rules => {
        rules.points = 25;
        return rules;
    });
    let b = generateShape('split: 10; r: cos(2t)', { min: 1, max: 65536 }, rules => {
        rules.unit = rules.unit || 'none';
        return rules;
    });
    assert.equal(a.points.length, 25);
    assert.equal(b.points.length, 10);
    assert.doesNotMatch(String(b.points[0]), /%/);
});

test('scale, rotate and move apply per point', () => {
    let plain = generateShape('split: 4; x: cos(t); y: sin(t)');
    let moved = generateShape('split: 4; move: .1 .2; x: cos(t); y: sin(t)');
    let scaled = generateShape('split: 4; scale: .5; x: cos(t); y: sin(t)');
    assert.notEqual(String(plain.points), String(moved.points));
    assert.notEqual(String(plain.points), String(scaled.points));
    assert.equal(plain.points.length, 4);
    assert.equal(moved.points.length, 4);
});

test('point coordinates are tidied', () => {
    assert.equal(String(generateShape('split: 4; r: 1').points), '100% 50%,50% 0%,0% 50%,50% 100%');
    let plot = generateShape('split: 4; r: 1', { unit: true }, rules => {
        rules.unit = 'none';
        return rules;
    });
    assert.equal(String(plot.points), '1 0,0 -1,-1 0,0 1');
});

test('the fill rule leads the points', () => {
    let { points } = generateShape('split: 3; fill: evenodd');
    assert.equal(String(points).split(',')[0], 'evenodd');
});

test('direction angles are tidy and ignore move', () => {
    let angles = code => generateShape(code).points.map(p => p.extra);
    assert.deepEqual(angles('split: 4; r: 1; move: .1 .2'), [0, -90, -180, 90]);
    assert.deepEqual(angles('split: 4; r: 1; direction: reverse 30'), [-150, -240, -330, -60]);
    assert.deepEqual(angles('split: 4; r: 1; direction: 30'), [120, 120, 120, 120]);
});

test('a t: command rewrites the angle in terms of the angle', () => {
    // t: 2t used to collapse every point: `t` was a calc cycle, so 0
    let doubled = generateShape('split: 4; r: 1; t: 2t');
    assert.equal(String(doubled.points), '100% 50%,0% 50%,100% 50%,0% 50%');
    let shifted = generateShape('split: 4; r: 1; t: t + 90 * PI / 180');
    assert.equal(String(shifted.points), '50% 0%,0% 50%,50% 100%,100% 50%');
});

test('the unit of r is not a variable', () => {
    assert.equal(String(generateShape('split: 4; r: 10px').points), '10px 0px,0px -10px,-10px 0px,0px 10px');
    // 2i and 2θ are products, like 2t
    assert.equal(String(generateShape('split: 4; r: .1i').points), '55% 50%,50% 40%,35% 50%,50% 70%');
});

test('degenerate commands still give numbers', () => {
    let one = generateShape('x: range(-1, 1); y: 0', { min: 1 }, rules => {
        rules.points = 1;
        return rules;
    });
    assert.equal(String(one.points), '0% 50%');
    assert.doesNotMatch(String(generateShape('split: 3; frame: abc').points), /NaN/);
});


test('a large seed still spreads the scatter samples', () => {
    let scatter = seed => generateShape('square', { min: 1, max: 65536 }, rules => Object.assign(rules, { scatter: 5, seed })).points.map(String);
    for (let seed of [1e15, 1e20]) assert.equal(new Set(scatter(seed)).size, 5, String(seed));
});

test('a density that is nowhere positive scatters uniformly', () => {
    let scatter = density => generateShape('square', { min: 1, max: 65536 }, rules => Object.assign(rules, { scatter: 6, seed: 1, density })).points.map(String);
    assert.equal(scatter('-1').length, 6);
    assert.deepEqual(scatter('-1'), scatter(undefined));
});

test('relax sets the scatter rounds, 0 picks random seeds', () => {
    let scatter = relax => generateShape('square', { min: 1, max: 65536 }, rules => Object.assign(rules, { scatter: 20, seed: 1, relax })).points.map(String);
    assert.deepEqual(scatter('10'), scatter(undefined));
    assert.notDeepEqual(scatter('0'), scatter(undefined));
    // capped: a huge count of rounds takes no longer than 50
    assert.deepEqual(scatter('1e9'), scatter('50'));
});

test('stretched and cracked voronoi cells cover the box', () => {
    let area = p => {
        let v = String(p).match(/-?[\d.e-]+(?=%)/g).map(Number), a = 0;
        for (let i = 0; i < v.length; i += 2) a += v[i] * v[(i + 3) % v.length] - v[(i + 2) % v.length] * v[i + 1];
        return Math.abs(a / 2);
    };
    for (let rules of [{ stretch: '3 30' }, { crack: '8' }, { crack: '6', stretch: '2 90', relax: '0' }]) {
        let cells = generateShape('square', { min: 1, max: 65536 }, r => Object.assign(r, { tile: 'voronoi', seed: 2, scatter: 60 }, rules)).points;
        assert.equal(cells.length, 60);
        assert.ok(Math.abs(cells.reduce((sum, p) => sum + area(p), 0) - 1e4) < 1e-3, JSON.stringify(rules));
    }
});

test('round curves the corners of every polygon tile', () => {
    for (let tile of ['voronoi', 'hex', 'triangle', 'slice']) {
        let cells = round => generateShape('square', { min: 1, max: 65536 }, r => Object.assign(r, { tile, seed: 2, scatter: 10, gap: '1', round })).points.map(String);
        let [plain, round] = [cells('0'), cells('1')];
        assert.ok(round.every((p, i) => p.split(',').length > plain[i].split(',').length), tile);
        assert.deepEqual(cells('1'), cells('7'));
    }
});

test('cracked cells stay inside the shape', () => {
    let cells = generateShape('heart', { min: 1, max: 65536 }, r => Object.assign(r, { tile: 'voronoi', seed: 2, scatter: 200, crack: '10' })).points;
    let outline = generateShape('heart', { min: 1, max: 65536 }, r => r).points.map(p => String(p).match(/-?[\d.]+/g).map(Number)).filter(p => p.length == 2);
    let inside = insideTest(outline, false);
    assert.equal(cells.length, 200);
    assert.ok(cells.every(p => inside(...p.origin.match(/-?[\d.]+/g).map(Number))));
});

test('delaunay leaves no holes inside, even with random seeds', () => {
    for (let [max, seed] of [[150, 11], [500, 11], [50, 9]]) {
        let tris = generateShape('square', { min: 1, max: 65536 }, r => Object.assign(r, { tile: 'delaunay', seed, relax: '0', scatter: Math.ceil(max / 2 + Math.sqrt(max)), count: max })).points;
        let uses = new Map();
        for (let t of tris) {
            let v = String(t).slice(8, -1).split(', ');
            v.forEach((a, i) => { let key = [a, v[(i + 1) % 3]].sort().join('|'); uses.set(key, (uses.get(key) || 0) + 1); });
        }
        let next = new Map(), loops = 0;
        for (let [key, n] of uses) if (n == 1) {
            let [a, b] = key.split('|');
            next.set(a, [...(next.get(a) || []), b]);
            next.set(b, [...(next.get(b) || []), a]);
        }
        let seen = new Set();
        for (let start of next.keys()) if (!seen.has(start)) {
            loops++;
            for (let todo = [start]; todo.length;) {
                let v = todo.pop();
                if (!seen.has(v)) seen.add(v), todo.push(...next.get(v));
            }
        }
        assert.equal(loops, 1, max + ':' + seed);
    }
});

test('aspect tiles in the element proportions', () => {
    let circles = aspect => generateShape('square', { min: 1, max: 65536 }, r => Object.assign(r, { tile: 'circle', seed: 1, scatter: 20, aspect })).points.map(String);
    for (let c of circles('2')) {
        let [rx, ry] = c.match(/ellipse\(([\d.]+)% ([\d.]+)%/).slice(1).map(Number);
        assert.ok(Math.abs(rx * 2 - ry) < 1e-6, c);
    }
    assert.deepEqual(circles('300 / 150'), circles('2'));
    assert.deepEqual(circles('1'), circles(undefined));
    assert.deepEqual(circles('16 / 0'), circles(undefined));
    // voronoi cells come out as wide as they are tall on the element, the same as with no aspect
    let ratio = (aspect, s) => {
        let logs = generateShape('square', { min: 1, max: 65536 }, r => Object.assign(r, { tile: 'voronoi', seed: 1, scatter: 300, aspect })).points.map(p => {
            let v = String(p).match(/-?[\d.e-]+(?=%)/g).map(Number), xs = v.filter((_, i) => !(i & 1)), ys = v.filter((_, i) => i & 1);
            return Math.log((Math.max(...xs) - Math.min(...xs)) * s / (Math.max(...ys) - Math.min(...ys)));
        });
        return Math.exp(logs.reduce((a, b) => a + b) / logs.length);
    };
    let skew = ratio('2', 2) / ratio('1', 1);
    assert.ok(skew > .89 && skew < 1.12, String(skew));
});

test('round: softens the corners of an outline, smooth curves stay', () => {
    assert.ok(generateShape('star; round: .5').points.length > 10);
    assert.equal(String(generateShape('circle; round: 1').points), String(generateShape('circle').points));
    // the frame closes back on the rounded outline
    let points = generateShape('star; round: .5; frame: 10').points.map(String);
    assert.equal(points.at(-1), points[0]);
    // corners are rounded before edge: runs along the outline
    let far = s => Math.max(...generateShape(s).points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50))));
    assert.ok(far('square; round: 1; edge: .02 * sin(8t)') < 60);
});

test('round: corners print as curves in CSS shape(), unless the outline is waved, framed or unitless', () => {
    let { clip, points } = generateShape('square; round: .5');
    assert.match(clip, /^shape\(from [^,]+(,(line|curve) to [^,]+)+,close\)$/);
    assert.equal(clip.match(/curve to \S+ \S+ with \S+ \S+,/g).length, 4);
    // where the polygon starts too
    assert.ok(clip.startsWith('shape(from ' + points[0] + ','));
    assert.match(generateShape('square; round: .5; fill: evenodd').clip, /^shape\(evenodd from /);
    assert.match(generateShape('square; round: .5; unit: px').clip, /^shape\(from \S+px \S+px,/);
    for (let s of ['square', 'circle; round: 1', 'square; round: .5; edge: .02 * sin(8t)', 'square; round: .5; frame: 10', 'square; round: .5; unit: none']) {
        let { clip, points } = generateShape(s);
        assert.equal(clip, `polygon(${points.join(',')})`, s);
    }
});

test('edge: pushes the outline out along its normals, measured along the outline', () => {
    let radii = s => generateShape(s).points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50)));
    // a constant grows the shape, both ways round
    assert.ok(radii('circle; edge: .1').every(r => Math.abs(r - 55) < .01));
    assert.ok(radii('circle; edge: .1; x: -cos(t)').every(r => Math.abs(r - 55) < .01));
    assert.ok(radii('circle; edge: -.1').every(r => Math.abs(r - 45) < .01));
    // straight sides stay straight, the corners bevelled
    assert.equal(generateShape('square; edge: .1').points.length, 12);
    // even bumps on a square: as far out at the middle of a side as at the corners
    let r = radii('square; scale: 1; edge: .1abs(cos(8t))');
    assert.ok([50, 25 * Math.SQRT2].every(at => r.some(v => Math.abs(v - at - 5) < .01)));
    // the ends meet even when f(2π) is not f(0)
    let p = generateShape('circle; edge: .1t / 2π').points.map(String);
    assert.ok(Math.abs(parseFloat(p[0]) - parseFloat(p.at(-1))) < 1);
    // the frame's inner ring follows the same edge
    let ring = generateShape('circle; edge: .05sin(12t); frame: 10').points.map(String);
    assert.equal(ring.at(-1), ring[0]);
});

test('noise(), what @R.t writes, closes at 2π and follows the seed', () => {
    let shape = s => generateShape(`points: 90; ${s}`, { seed: 'a' }).points.map(String);
    let at = 'noise(t, 3.2, 7.1)';
    assert.deepEqual(shape(`x: ${at}; y: 0`), shape(`x: ${at}; y: 0`));
    assert.deepEqual(shape(`x: ${at} - noise(t + 2π, 3.2, 7.1); y: 0`), shape('x: 0; y: 0'));
    // the doodle's seed by default, a seed: command over it
    assert.notDeepEqual(shape(`x: ${at}; y: 0`), generateShape(`points: 90; x: ${at}; y: 0`, { seed: 'b' }).points.map(String));
    assert.notDeepEqual(shape(`x: ${at}; y: 0`), shape(`seed: 1; x: ${at}; y: 0`));
    // a shape's own variable of that name still wins
    assert.equal(String(generateShape('points: 4; noise: .5; r: 1 + noise').points), '125% 50%,50% -25%,-25% 50%,50% 125%');
    // nearby points, nearby outlines
    let gap = (a, b) => Math.max(...a.map((p, i) => Math.abs(parseFloat(p) - parseFloat(b[i]))));
    assert.ok(gap(shape(`x: ${at}; y: 0`), shape('x: noise(t, 3.21, 7.1); y: 0')) < 2);
});

test('round: and edge: survive degenerate outlines', () => {
    // a zero-length outline has no normals: the points stay put
    assert.equal(String(generateShape('points: 3; x: 0; y: 0; edge: .1').points), '50% 50%,50% 50%,50% 50%');
    // poles in the formula: finite output count, no throw
    assert.ok(generateShape('split: 4; y: tan(t); round: .5').points.length < 4 * 66);
    assert.ok(generateShape('r: 1/t; round: .5').points.length > 0);
    assert.ok(generateShape('r: 1/t; edge: .1').points.length > 0);
});
