import test from 'node:test';
import assert from 'node:assert/strict';

import generateShape, { shapeWarnings } from '../../src/generator/shapes.js';
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
    // y points up and rotate turns counterclockwise
    assert.equal(String(generateShape('split: 3; r: .5; move: 0 .5').points[0]), '75% 25%');
    assert.equal(String(generateShape('split: 3; r: .5; rotate: 90').points[0]), '50% 25%');
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
    let { points } = generateShape('split: 3; fill-rule: evenodd');
    assert.equal(String(points).split(',')[0], 'evenodd');
    // the old spelling still reads
    assert.equal(String(generateShape('split: 3; fill: evenodd').points), String(points));
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

test('round: is a radius, the same on a sparse outline and a dense one', () => {
    // a right angle is cut back the radius both ways: .2 is 10% of the box
    assert.match(generateShape('points: 4; x: seq(1, -1, -1, 1); y: seq(1, 1, -1, -1); round: .2').clip, /^shape\(from 100% 10%,curve to 90% 0% with 100% 0%,/);
    let area = s => {
        let p = generateShape(s + '; unit: none').points.map(q => String(q).split(' ').map(parseFloat)), a = 0;
        p.forEach((q, i) => a += q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]);
        return Math.abs(a / 2);
    };
    let sparse = area('points: 4; rotate: 45; scale: 1.414; round: .3'), dense = area('points: 400; r: 1 / max(abs(cos(t)), abs(sin(t))); round: .3');
    assert.ok(Math.abs(sparse - dense) / sparse < .02, `${sparse} ${dense}`);
    // a cusp, as at the top of the heart, rounds without eating the shape
    assert.ok(area('heart; round: .15') > area('heart') * .9);
    // and so does a lone corner, however big the radius
    assert.ok(area('drop; round: 2') > area('drop') * .9);
});

test('round: softens the corners of an outline, smooth curves stay', () => {
    assert.ok(generateShape('star; round: .5').points.length > 10);
    assert.equal(String(generateShape('circle; round: 1').points), String(generateShape('circle').points));
    // the frame is the rounded outline and a ring inside it
    assert.equal(generateShape('star; round: .5; frame: .1').points.rings.length, 2);
    // corners are rounded before grow: runs along the outline
    let far = s => Math.max(...generateShape(s).points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50))));
    assert.ok(far('square; round: 1; grow: .02 * sin(8t)') < 60);
});

test('round: corners print as curves in CSS shape(), unless the outline is waved, framed or unitless', () => {
    let { clip, points } = generateShape('square; round: .5');
    assert.match(clip, /^shape\(from [^,]+(,(line|curve) to [^,]+)+,close\)$/);
    assert.equal(clip.match(/curve to \S+ \S+ with \S+ \S+,/g).length, 4);
    // where the polygon starts too
    assert.ok(clip.startsWith('shape(from ' + points[0] + ','));
    assert.match(generateShape('square; round: .5; fill-rule: evenodd').clip, /^shape\(evenodd from /);
    assert.match(generateShape('square; round: .5; unit: px').clip, /^shape\(from \S+px \S+px,/);
    for (let s of ['square', 'circle; round: 1', 'square; round: .5; grow: .02 * sin(8t)', 'square; round: .5; unit: none']) {
        let { clip, points } = generateShape(s);
        assert.equal(clip, `polygon(${points.join(',')})`, s);
    }
    assert.match(generateShape('square; round: .5; frame: .1').clip, /^polygon\(/);
});

test('a list in points, r, t, x, y, rotate or grow draws one contour per item', () => {
    // the polygon goes out from the first point to each contour and back
    let { clip, points } = generateShape('points: 4, 3; r: 1, .5; fill-rule: evenodd');
    assert.equal(points.length, 8);
    assert.equal(clip, 'polygon(evenodd,100% 50%,50% 0%,0% 50%,50% 100%,100% 50%,'
        + '75% 50%,37.5% 28.3493649054%,37.5% 71.6506350946%,75% 50%,100% 50%)');
    // the shorter lists repeat, `points: 0` leaves one out, commas inside a call are no list
    assert.equal(generateShape('points: 6; r: 1, .5, .25').points.length, 18);
    assert.equal(generateShape('points: 6, 0, 4; r: 1, .7, .5').points.length, 10);
    assert.equal(generateShape('points: 6; r: max(.5, cos(t))').points.length, 6);
    // rotate turns each contour by its own item
    let star = generateShape('points: 3; rotate: 0, 180').points.map(String);
    assert.deepEqual(star.slice(3), generateShape('points: 3; rotate: 180').points.map(String));
    // `t` and `i` start over in each contour
    assert.equal(String(generateShape('points: 4, 3; r: 1, .5; t: t + i').points[4]), String(generateShape('points: 3; r: .5; t: t + i').points[0]));
    // grow waves each contour by its own item: a wavy rim around a round hole
    let [rim, hole] = generateShape('points: 90; r: 1, .5; grow: .05sin(12t), 0').points.rings
        .map(ring => ring.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50))));
    assert.ok(Math.max(...rim) - Math.min(...rim) > 4);
    assert.ok(hole.every(r => Math.abs(r - 25) < .05));
    // frame outlines each contour: its own outline and a ring inside it
    let { rings } = generateShape('points: 4; r: 1, .5; frame: .1').points;
    assert.deepEqual(rings.map(ring => ring.length), [4, 4, 4, 4]);
    // curves print one subpath per contour
    assert.match(generateShape('points: 6, 4; r: 1, .5; round: .4').clip, /^shape\(from [^]+,close,move to [^]+,close\)$/);
    // scatter fills between them
    let radii = generateShape('r: 1, .5; fill-rule: evenodd', { min: 1, max: 65536 }, rules => Object.assign(rules, { split: 180, scatter: 40, seed: 1 }))
        .points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50)));
    assert.ok(radii.every(r => r > 25 && r < 50), String(radii));
    // circle tiles cross the bridge between contours, it is no wall
    let circles = generateShape('r: 1, .5; fill-rule: evenodd', { min: 1, max: 65536 }, rules => Object.assign(rules, { split: 180, scatter: 80, seed: 1, tile: 'circle', count: 80 })).points;
    assert.ok(circles.some(p => { let [x, y] = p.origin.split(' ').map(parseFloat); return x > 70 && Math.abs(y - 50) < 8; }));
});

test('a body in parentheses, as a variable keeps it, is read as commands', () => {
    let shape = s => String(generateShape(s).points);
    assert.equal(shape('(points: 8; r: 1, .5; fill-rule: evenodd)'), shape('points: 8; r: 1, .5; fill-rule: evenodd'));
    // commands after it add to it or override it
    assert.equal(shape('(points: 8; r: 1, .5); points: 4'), shape('points: 4; r: 1, .5'));
    assert.equal(shape('(points: 4n); n: 3'), shape('points: 12'));
    // a preset inside, and bodies nest
    assert.equal(shape('(heart; frame: .05)'), shape('heart; frame: .05'));
    assert.equal(shape('((points: 6); r: .5)'), shape('points: 6; r: .5'));
});

test('union, subtract, intersect and exclude join whole shapes, first to last', () => {
    // filled where the winding of the rings is not 0, in percent of the box
    let fill = s => {
        let rings = generateShape(s).points.rings.map(ring => ring.map(p => String(p).split(' ').map(parseFloat)));
        return (x, y) => rings.reduce((n, ring) => n + insideTest(ring)(x, y), 0) != 0;
    };
    // a crescent: the cut leaves no sliver where it reaches past the circle, as evenodd would
    let crescent = fill('subtract { circle; circle { scale: .9; move: .45 -.135 } }');
    assert.deepEqual([crescent(10, 50), crescent(72.5, 56.75), crescent(98, 56.75), crescent(110, 56.75)], [true, false, false, false]);
    assert.equal(fill('points: 180; x: cos(t), .9cos(t) + .45; y: sin(t), .9sin(t) - .135; fill-rule: evenodd')(110, 56.75), true);
    let lens = fill('intersect { circle { move: -.45 0 } circle { move: .45 0 } }');
    assert.deepEqual([lens(50, 50), lens(50, 10), lens(10, 50), lens(50, 2)], [true, true, false, false]);
    // exclude keeps what an odd number of shapes cover
    let pieces = fill('exclude { circle { move: -.45 0 } circle { move: .45 0 } }');
    assert.deepEqual([pieces(50, 50), pieces(10, 50), pieces(90, 50), pieces(50, 2)], [false, true, true, false]);
    let three = fill('exclude { union*3 { rotate: n * 120; circle { scale: .5; move: 0 .3 } } }');
    assert.deepEqual([three(50, 50), three(50, 15), three(71.65, 37.5)], [true, true, false]);
    let pair = 'union { circle { scale: .5; move: -.4 0 } circle { scale: .5; move: .4 0 } }';
    assert.equal(generateShape(pair).points.rings.length, 1);
    assert.deepEqual([fill(pair)(30, 50), fill(pair)(50, 50), fill(pair)(50, 30)], [true, true, false]);
    // smooth rounds where they meet: the notch above the waist fills in
    assert.equal(fill(pair)(50, 33), false);
    assert.equal(fill(pair.replace('{', '{ smooth: .2;'))(50, 33), true);
    // commands after a group apply to the result; groups nest; a body in parentheses is one shape
    let turned = fill('union { circle { scale: .5; move: .5 0 } } rotate: 90');
    assert.deepEqual([turned(50, 25), turned(75, 50)], [true, false]);
    let nested = fill('subtract { circle; union { circle { scale: .2; move: -.4 0 } circle { scale: .2; move: .4 0 } } }');
    assert.deepEqual([nested(30, 50), nested(70, 50), nested(50, 50)], [false, false, true]);
    assert.equal(String(generateShape('union { (points: 8; r: .5) }').points), String(generateShape('union { shape { points: 8; r: .5 } }').points));
    // the group's variables reach its shapes, down nested groups; its commands do not
    let points = s => String(generateShape(s).points);
    assert.equal(points('k: 7; union { subtract { shape { points: 300; r: .6 + .3cos(k*t) } circle { scale: .1 } } }'),
        points('union { subtract { shape { points: 300; r: .6 + .3cos(7*t) } circle { scale: .1 } } }'));
    assert.equal(points('k: 2; union { shape { points: 3; r: 2k } }'), points('union { shape { points: 3; r: 4 } }'));
    assert.equal(points('rotate: 90; union { shape { points: 3 } }'), points('union { shape { points: 3; rotate: 90 } }'));
    // copies see n: in move, in a turned group, across a grid
    let two = points('union { circle { scale: .4; move: -1.5 0 } circle { scale: .4; move: 1.5 0 } }');
    assert.equal(points('union { circle*2 { scale: .4; move: (n * 3 - 4.5) 0 } }'), two);
    assert.equal(points('union { circle*2 { scale: .4; move: 3n-4.5 0 } }'), two);
    assert.equal(generateShape('union { union*6 { rotate: n * 60; circle { scale: .2; move: 0 -.6 } } }').points.rings.length, 6);
    assert.equal(generateShape('subtract { square { scale: 1.3 } circle*3x3 { scale: .12; move: (nx * .6 - 1.2) (ny * .6 - 1.2) } }').points.rings.length, 10);
    // a framed shape joins as its outline band
    let band = fill('union { circle { frame: .1 } circle { scale: .2; move: .6 0 } }');
    assert.deepEqual([band(50, 50), band(97, 50), band(80, 50), band(20, 50)], [false, true, true, false]);
    // points spreads that many over the outline, so two cuts morph; nothing left clips everything
    assert.equal(generateShape('subtract { circle; circle { scale: .9; move: .45 .135 } } points: 40').points.length, 40);
    // a list gives each outline its own count, so a shape with a hole morphs too
    assert.deepEqual(generateShape('subtract { circle; circle { scale: .3; move: .15 0 } } points: 50, 10').points.rings.map(r => r.length), [50, 10]);
    assert.equal(generateShape('subtract { circle; circle { scale: 1.2 } }').clip, 'polygon(50% 50%)');
});

test('points, rotate, move and scale read like variables: units drop, expressions are worked out', () => {
    let shape = s => String(generateShape(s).points);
    assert.equal(generateShape('points: 2 * 3').points.length, 6);
    assert.equal(generateShape('n: 5; points: 4n').points.length, 20);
    assert.equal(generateShape('points: 20px').points.length, 20);
    assert.equal(generateShape('points: 12.7').points.length, 12);
    assert.equal(shape('points: 4; n: 2; rotate: n * 15'), shape('points: 4; rotate: 30'));
    assert.equal(shape('points: 4; rotate: 30deg'), shape('points: 4; rotate: 30'));
    assert.equal(shape('points: 4; move: 10px 0'), shape('points: 4; move: 10 0'));
    assert.equal(shape('points: 4; k: .5; scale: k (k * 2)'), shape('points: 4; scale: .5 1'));
    // per contour, so @m can write the list
    assert.equal(shape('points: 4; r: 1, .5; rotate: 1 * 15, 2 * 15'), shape('points: 4; r: 1, .5; rotate: 15, 30'));
});

test('round, frame and turn are worked out too, and an angle\'s own units are degrees', () => {
    let shape = s => String(generateShape(s).points);
    assert.equal(generateShape('square; round: .1 * 2').clip, generateShape('square; round: .2').clip);
    assert.equal(shape('circle; frame: .05 * 2'), shape('circle; frame: .1'));
    assert.equal(shape('hexagon; turn: 1 + 1; frame: .1'), shape('hexagon; turn: 2; frame: .1'));
    assert.equal(shape('points: 4; rotate: 2 * 30deg'), shape('points: 4; rotate: 60'));
    assert.equal(shape('points: 4; rotate: 2 * .25turn'), shape('points: 4; rotate: 180'));
    assert.equal(shape('circle*3 { scale: .2; move: 0 .5; rotate: n * 30deg }'), shape('circle*3 { scale: .2; move: 0 .5; rotate: n * 30 }'));
    // inside a call they are radians
    assert.equal(shape('points: 4; rotate: 45 * sin(90deg)'), shape('points: 4; rotate: 45'));
});

test('a leading - negates each part of move and scale, and each contour of a list', () => {
    let shape = s => String(generateShape(s).points);
    assert.equal(shape('circle; scale: .2; -move: .5 0'), shape('circle; scale: .2; move: -.5 0'));
    assert.equal(shape('circle; scale: .2; -move: .5, .25'), shape('circle; scale: .2; move: -.5 -.25'));
    assert.equal(shape('points: 3, 3; -r: 1, .5'), shape('points: 3, 3; r: -1, -.5'));
});

test('grow: by a constant moves the whole outline that far; in t, along its normals, measured along the outline', () => {
    let radii = s => generateShape(s).points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50)));
    // a constant grows the shape, both ways round
    assert.ok(radii('circle; grow: .1').every(r => Math.abs(r - 55) < .01));
    assert.ok(radii('circle; grow: .1; x: -cos(t)').every(r => Math.abs(r - 55) < .01));
    assert.ok(radii('circle; grow: -.1').every(r => Math.abs(r - 45) < .01));
    // straight sides stay straight, the corners round
    assert.ok(Math.abs(Math.max(...radii('square; grow: .1')) - Math.max(...radii('square')) - 5) < .01);
    assert.equal(generateShape('square; grow: -.1').points.length, 4);
    // a star never crosses itself, and a shape shrunk away is gone
    assert.equal(generateShape('star; grow: .1').points.rings.length, 1);
    assert.equal(String(generateShape('circle; grow: -1.2').points), '50% 50%');
    // even bumps on a square: as far out at the middle of a side as at the corners
    let r = radii('points: 4; rotate: 45; grow: .1abs(cos(8t))');
    assert.ok([50, 25 * Math.SQRT2].every(at => r.some(v => Math.abs(v - at - 5) < .01)));
    // the ends meet even when f(2π) is not f(0)
    let p = generateShape('circle; grow: .1t / 2π').points.map(String);
    assert.ok(Math.abs(parseFloat(p[0]) - parseFloat(p.at(-1))) < 1);
    // the frame's inner ring follows the same grow
    assert.equal(generateShape('circle; grow: .05sin(12t); frame: .1').points.rings.length, 2);
});

test('frame and grow by a constant are exact, as in @scene: a band w wide inside, the whole region d out', () => {
    let rings = s => generateShape(s).points.rings.map(ring => ring.map(p => String(p).split(' ').map(v => parseFloat(v) / 50 - 1)));
    let far = (q, rings) => Math.min(...rings.flatMap(r => r.map((a, i) => {
        let b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
    })));
    // the inner ring of a crescent's frame is .1 from its outline everywhere, also where the outline wraps the center
    let moon = 'subtract { circle; circle { scale: .9; move: .45 .135 } }', outline = rings(moon);
    let [, inner] = rings(moon + '; frame: .1');
    assert.ok(inner.every(q => Math.abs(far(q, outline) - .1) < .002));
    // a star grown is the star .1 out, its corners round
    assert.ok(rings('star; grow: .1')[0].every(q => Math.abs(far(q, rings('star')) - .1) < .002));
    // a group's rings move together: the hole of a ring gets smaller
    let [rim, hole] = rings('subtract { circle; circle { scale: .5 } } grow: .1');
    assert.ok(rim.every(q => Math.abs(Math.hypot(...q) - 1.1) < .002) && hole.every(q => Math.abs(Math.hypot(...q) - .4) < .002));
    // the inner rings take the outline's count, so frames of any width morph
    let count = w => generateShape(`heart; frame: ${w}`).clip.split(',').length;
    assert.equal(count(.04), count(.3));
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

test('round: and grow: survive degenerate outlines', () => {
    // a zero-length outline has no normals: the points stay put
    assert.equal(String(generateShape('points: 3; x: 0; y: 0; grow: .1').points), '50% 50%,50% 50%,50% 50%');
    // poles in the formula: finite output count, no throw
    assert.ok(generateShape('split: 4; y: tan(t); round: .5').points.length < 4 * 66);
    assert.ok(generateShape('r: 1/t; round: .5').points.length > 0);
    assert.ok(generateShape('r: 1/t; grow: .1').points.length > 0);
});

test('move, rotate, scale, grow and frame run in the order written', () => {
    let points = s => String(generateShape(s).points);
    // scale then move moves the full distance, move then scale moves a scaled one
    assert.equal(points('points: 3; r: .2; scale: .5; move: .5 0'), points('points: 3; r: .1; move: .5 0'));
    assert.equal(points('points: 3; r: .2; move: .5 0; scale: .5'), points('points: 3; r: .1; move: .25 0'));
    // rotate after move turns around the center, and one written twice runs twice
    assert.equal(points('points: 3; r: .2; move: .5 0; rotate: 90'), points('points: 3; r: .2; rotate: 90; move: 0 .5'));
    assert.equal(points('points: 3; scale: .5; scale: .5'), points('points: 3; scale: .25'));
    // rotate is in degrees, and turn converts
    assert.equal(points('points: 3; rotate: .25turn'), points('points: 3; rotate: 90'));
    assert.equal(points('points: 3; rotate: 30deg'), points('points: 3; rotate: 30'));
    // a preset's own steps come first
    assert.equal(points('square; scale: .5'), points('points: 4; rotate: -45; scale: 1.42; scale: .5'));
    // grow after scale is not scaled
    let radii = s => generateShape(s).points.map(p => Math.hypot(...String(p).split(' ').map(v => parseFloat(v) - 50)));
    assert.ok(radii('circle; scale: .5; grow: .1').every(r => Math.abs(r - 30) < .01));
    assert.ok(radii('circle; grow: .1; scale: .5').every(r => Math.abs(r - 27.5) < .01));
});

test('points: x y pairs give the corners themselves, a number how many', () => {
    assert.equal(String(generateShape('points: 0 1, 1 -1, -1 -1').points), '50% 0%,100% 100%,0% 100%');
    assert.equal(String(generateShape('polygon { points: 0 1, 1 -1, -1 -1 }').points), '50% 0%,100% 100%,0% 100%');
    assert.equal(String(generateShape('k: .5; points: 0 k, k (-k), (-k) (-k); move: 0 .5').points), '50% 0%,75% 50%,25% 50%');
    assert.match(generateShape('points: 0 1, 1 -1, -1 -1; round: .2').clip, /^shape\(/);
    // counts stay counts
    assert.equal(generateShape('points: 2 * 3').points.length, 6);
    assert.equal(generateShape('points: 120, 60; r: 1, .5').points.rings.length, 2);
});

test('commas split the parts of move and scale, so a part may have spaces', () => {
    let points = s => String(generateShape(s).points);
    assert.equal(points('points: 3; r: .2; n: 2; move: n * .25, .25'), points('points: 3; r: .2; move: .5 .25'));
    assert.equal(points('points: 3; r: .2; scale: .5, .25'), points('points: 3; r: .2; scale: .5 .25'));
    // also when a step follows: a comma is not a list of contours here
    assert.equal(points('points: 3; r: .2; move: .5, .25; rotate: 10'), points('points: 3; r: .2; move: .5 .25; rotate: 10'));
    // but not inside a call
    assert.equal(points('points: 3; r: .2; move: max(.1, .5) 0'), points('points: 3; r: .2; move: .5 0'));
});

test('spaces split the parts of move, scale and corners, but an operator keeps its operands', () => {
    let points = s => String(generateShape(s).points);
    assert.equal(points('points: 4; scale: .04 + .12 * 2 / 4'), points('points: 4; scale: .1'));
    assert.equal(points('points: 4; k: 2; move: k * .25 0'), points('points: 4; move: .5 0'));
    assert.equal(points('points: 4; move: .5 - .1 .2'), points('points: 4; move: .4 .2'));
    // a sign on a number starts the next part
    assert.equal(points('points: 4; move: .5 -.25'), points('points: 4; move: .5, -.25'));
    assert.equal(points('points: 1 - .5 0, 0 1, -1 0'), points('points: .5 0, 0 1, -1 0'));
});

test('round: curves leave the outline along it, also between curved sides', () => {
    // the crescent's tips: each curve starts the way the outline was going
    let clip = generateShape('subtract { circle; circle { scale: .6; move: .5 .3 } } round: .1').clip;
    let steps = [...clip.matchAll(/(?:from|line to|move to|curve to) ([-\d.]+)% ([-\d.]+)%(?: with ([-\d.]+)% ([-\d.]+)%)?/g)].map(m => m.slice(1).filter(Boolean).map(Number));
    let turns = 0;
    steps.forEach((step, i) => {
        if (step.length < 4 || i < 2) return;
        let [p, q] = [steps[i - 1], steps[i - 2]], [, , cx, cy] = step;
        let a = Math.atan2(p[1] - q[1], p[0] - q[0]), b = Math.atan2(cy - p[1], cx - p[0]);
        turns = Math.max(turns, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
    });
    assert.ok(turns < .2, `a curve turns ${turns} rad where it starts`);
});

test('unknown shapes are reported', () => {
    assert.deepEqual(shapeWarnings('cirle'), ['unknown shape cirle']);
    assert.deepEqual(shapeWarnings('subtract { circle; cirle { scale: .5 } }'), ['unknown shape cirle']);
    assert.deepEqual(shapeWarnings('union { #nope }'), ['unknown shape #nope']);
    for (let s of ['star 6 .3; scale: .5', 'polygon { points: 0 1, 1 -1, -1 -1 }', 'shape { r: .5 }', '(points: 8; r: .5)', 'circle#a { scale: .2 } union { #a }', 'r: cos(3t)']) {
        assert.deepEqual(shapeWarnings(s), [], s);
    }
});

test('a curve in t gets as many points as a circle unless points says otherwise; corners at the top are a polygon', () => {
    assert.equal(generateShape('r: cos(4t)').points.length, 180);
    assert.equal(generateShape('x: cos(t); y: sin(t)^3').points.length, 180);
    assert.equal(generateShape('points: 7; r: cos(t)').points.length, 7);
    assert.equal(generateShape('r: .5').points.length, 3);
    // also through a variable, or as θ
    assert.equal(generateShape('k: sin(3t); r: 1 + .2 * k').points.length, 180);
    assert.equal(generateShape('r: (1 + .1 * cos(3θ))').points.length, 180);
    assert.equal(generateShape('r: seq(1, .5)').points.length, 3);
    let corners = 'points: 0 1, 1 -1, -1 -1';
    assert.equal(String(generateShape(corners).points), String(generateShape(`polygon { ${corners} }`).points));
    assert.ok(generateShape(corners).rules.blocks);
});

test('cross and leaf: arms and width k of the box, counterclockwise from the right like circle', () => {
    let xy = s => generateShape(s).points.map(p => String(p).split(' ').map(parseFloat));
    assert.deepEqual(xy('cross').slice(0, 4), [[100, 65], [100, 35], [65, 35], [65, 0]]);
    assert.deepEqual(xy('cross .2')[2], [60, 40]);
    assert.equal(generateShape('cross').points.length, 12);
    let leaf = xy('leaf .3');
    assert.equal(leaf.length, 180);
    assert.deepEqual(leaf[0], [65, 50]);
    assert.deepEqual(leaf[45], [50, 0]);
    assert.ok(leaf.every(([x]) => x >= 35 - 1e-9 && x <= 65 + 1e-9));
    assert.deepEqual(shapeWarnings('bicorn'), ['unknown shape bicorn']);
    assert.equal(generateShape('fish').points.rings.length, 2);
});
