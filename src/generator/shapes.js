import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands, { readShapes, commandsOf, spaced, degrees, GROUPS } from '../parser/parse-shape-commands.js';
import { scan } from '../parser/tokenizer.js';

import seedrandom from '../lib/seedrandom.js';
import { clamp, tidyNumber } from '../lib/math.js';
import { isEmpty, removeParens } from '../lib/type.js';
import { memo } from '../lib/cache.js';
import calc, { defaultContext, evaluate } from '../core/calc.js';
import { css } from '../lib/tagged-template.js';
import {
    conway, reacher, insideTest, scatter, voronoi, colors, mosaic, corners, wave, lattice, penrose, delaunay, border, tiles,
    shake, bend, inset, bounds, pack, slice, centre, edges, noiseOf, flatten, bridge, overlay, offset, recount, fillet, resample, PHI,
} from './tiling.js';

const { cos, sin, tan, atan2, sqrt, hypot, abs, min, max, PI } = Math;

function ngon(k, inner = cos(PI / k)) {
    let a = PI / k, x = cos(a) - inner, y = sin(a), l = sqrt(x * x + y * y);
    return `r: ${inner * y / l} / cos(abs(abs(t) % ${2 * a} - ${a}) + ${atan2(x, y)})`;
}

const fit = memo(commands => {
    let props = parseShapeCommands(commands), split = parseInt(props.split);
    let point = createPointFunction(props, split), ps = [], a = PI / 180 * (Number(props.rotate) || 0);
    for (let i = 0; i < split; ++i) {
        let [x, y] = point(2 * PI * i / split, i);
        ps.push(x * cos(a) - y * sin(a), y * cos(a) + x * sin(a));
    }
    let [x0, y0, x1, y1] = bounds(ps);
    return `${commands}; move: ${-(x0 + x1) / 2} ${-(y0 + y1) / 2}; scale: ${2 / max(x1 - x0, y1 - y0)}`;
});

const presetShapes = {
    __proto__: null,

    square:   css`split: 4; ${ngon(4)}; rotate: -45; scale: 1.42`,
    pentagon: css`split: 5; ${ngon(5)}; rotate: -54`,
    circle:   css`split: 180`,
    hexagon:  css`split: 6; ${ngon(6)}; rotate: -30`,
    octagon:  css`split: 8; ${ngon(8)}; rotate: -22.5`,
    triangle: () => fit(css`split: 3; ${ngon(3)}; rotate: -30`),
    bean:     () => fit(css`split: 180; r: sin(t)^3 + cos(t)^3`),
    fish:     css`subtract {union{leaf .6 {rotate: 90; scale: .72; move: .25 0} polygon { points: -.35 0, -.95 .52, -.75 0, -.95 -.52 }} circle {scale: .065; move: .58 .1}} round: .03`,
    infinity: css`split: 180; x: cos(t) / (sin(t)^2 + 1); y: x * sin(t)`,
    drop:     () => fit(css`split: 180; rotate: -90; x: sin(t); y: (1 + sin(t)) * cos(t) / 1.6`),
    vase:     css`split: 240; x: sign(sin(t)) * (.27 - .2cos(t) - .07cos(2t) + .09cos(3t)); y: cos(t)`,
    windmill: css`split: 18; R: seq(.618, 1, 0); T: seq(t-.55, t, t); x: R * cos(T); y: R * sin(T)`,
    heart:    () => fit(css`split: 180; a: cos(t)*13/18 - cos(2t)*5/18; b: cos(3t)/18 + cos(4t)/18; x: -.9 * sin(t)^3; y: 1.1 * (a - b)`),
    star(k = 5, inner = 1 / PHI ** 2) {
        k = clamp(k, 3, 10);
        return css`split: ${2 * k}; ${ngon(k, clamp(inner, .05, 1))}; rotate: ${90 % (360 / k)}`;
    },
    clover(k = 3) {
        k = clamp(k, 3, 10);
        return css`split: 240; r: ${k % 2 ? `cos(${k}t)` : `abs(cos(${k / 2}t))`}`;
    },
    hypocycloid(k = 3) {
        k = clamp(k, 3, 10);
        return fit(css`split: 240; k: ${k}; x: (k-1)*cos(t) + cos((k-1)*t); y: (k-1)*sin(t) - sin((k-1)*t)`);
    },
    cloud(k = 3) {
        k = clamp(k, 1, 10);
        return fit(css`split: 180; k: ${k}; x: (k+1)*cos(t) - cos((k+1)*t); y: (k+1)*sin(t) - sin((k+1)*t); rotate: 90`);
    },
    // |x|^k + |y|^k = 1
    squircle(k = 4) {
        k = clamp(k, .2, 20);
        return css`split: 180; k: ${k}; r: (abs(cos(t))^k + abs(sin(t))^k)^(-1/k)`;
    },
    bud(k = 3) {
        k = clamp(k, 3, 10);
        return fit(css`split: 240; r: 1 + .2 * cos(${k}t)`);
    },
    cross(k = .3) {
        k = clamp(k, .05, 1);
        return css`points: 1 ${-k}, 1 ${k}, ${k} ${k}, ${k} 1, ${-k} 1, ${-k} ${k}, -1 ${k}, -1 ${-k}, ${-k} ${-k}, ${-k} -1, ${k} -1, ${k} ${-k}`;
    },
    leaf(k = .5) {
        k = clamp(k, .05, 1);
        return css`split: 180; x: ${k} * cos(t) * abs(cos(t)); y: sin(t)`;
    },
};

class Point {
    constructor(value, angle, origin, kind) {
        this.value = value;
        this.extra = angle;
        this.origin = origin;
        this.kind = kind;
    }
    toString() {
        return this.value;
    }
}

function faces3(pieces) {
    return pieces.flatMap(([p, c]) => [6, 2, 10].map((i, face) => {
        let q = [...c, ...[...p, ...p].slice(i, i + 6)];
        return [q, centre(q), face + 1];
    }));
}

function parsePair(input, fallback, context) {
    let parts = parseValueGroup(input, { noSpace: true });
    let [a, b = a] = parts.length > 1 ? parts : spaced(input);
    return [a, b].map(v => v === undefined ? fallback : evaluate(v, context) || fallback);
}

function createPointFunction(props, split) {
    let px = isEmpty(props.x) ? 'cos(t)' : props.x;
    let py = isEmpty(props.y) ? 'sin(t)' : props.y;
    let pr = props.r, pt = props.t;

    let index = 0;
    let context = Object.assign(Object.create(defaultContext), { noise: noiseOf(props) }, props, {
        seq(...list) {
            return list.length ? list[index % list.length] : '';
        },
        range(a, b = 0) {
            a = Number(a) || 0;
            b = Number(b) || 0;
            if (a > b) [a, b] = [b, a];
            let step = split > 1 ? (b - a) / (split - 1) : 0;
            return a + step * index;
        }
    });
    let point = (t, i) => {
        index = i;
        context['i'] = i + 1;
        context['t'] = context['θ'] = t;
        // a `t:` command rewrites the angle, in terms of the angle and index
        if (pt) {
            context['t'] = context['θ'] = t = calc(pt, context);
        }
        let x, y;
        if (pr) {
            let r = calc(pr, context) || .00001;
            x = r * cos(t);
            y = r * sin(t);
        } else {
            x = calc(px, context);
            y = calc(py, context);
        }
        return [x, y];
    };
    point.formula = text => t => {
        context['t'] = context['θ'] = t;
        return Number(calc(text, context)) || 0;
    };
    return point;
}

const COMMANDS = new Set('points split turn r t x y rotate move scale round grow frame fill fill-rule unit smooth blocks steps'.split(' '));

function check(node, warn) {
    let name = node.name.split(' ')[0];
    if (name && !(name in presetShapes) && !GROUPS.includes(name) && !/^(shape|polygon)$|^\(/.test(name)) warn(`unknown shape ${node.name}`);
    [...node.copies || node.children, ...node.unused || []].forEach(n => check(n, warn));
}

function combine(props, lo, hi) {
    let { op, items } = props.blocks, joints = new Set(), vars = {}, rings;
    for (let k in props) if (!COMMANDS.has(k)) vars[k] = props[k];
    for (let item of items) {
        let next = typeof item == 'string'
            ? generateShape(item, { min: lo, max: hi, raw: true }, rules => ({ ...vars, ...rules })).points
            : createShapePoints({ ...vars, ...item }, lo, hi, true);
        rings = rings ? overlay(rings, next, op, joints) : next;
    }
    let k = calc('smooth', props);
    return (rings || []).map(ring => k > 0 ? fillet(ring, joints, k) : ring);
}

// [x0, y0, x1, y1, …] → [[x0, y0], [x1, y1], …]
function toPairs(flat) {
    let out = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
}

function pairsOf(points) {
    let pairs = isEmpty(points) ? [] : parseValueGroup(points, { noSpace: true }).map(spaced);
    return pairs.length > 2 && pairs.every(p => p.length == 2) && pairs;
}

function createShapePoints(props, lo, hi, raw) {
    let pairs = pairsOf(props.points);
    let vertices = pairs && pairs.map(p => p.map(v => evaluate(v, props) || 0));
    if (vertices) props = { ...props, points: String(vertices.length) };
    let lists = {}, count = 1, contours = [], index = [];
    for (let k of ['points', 't', 'r', 'x', 'y', 'rotate', 'grow']) {
        if (String(props[k]).includes(',')) {
            lists[k] = parseValueGroup(props[k], { noSpace: true });
            count = max(count, lists[k].length);
        }
    }
    for (let c = 0; c < count; ++c) {
        let p = props;
        if (count > 1) {
            p = { ...props };
            for (let k in lists) p[k] = lists[k][c % lists[k].length];
        }
        // a curve in t, also through a variable, gets as many points as a circle
        let f = createPointFunction(p, 3), n = !isEmpty(p.points || p.split) ? Math.trunc(calc(p.points ? 'points' : 'split', p))
            : [p.r, p.x, p.y].some(v => !isEmpty(v) && (v = f.formula(v), v(1) != v(2))) ? 180 : NaN;
        if (c && n === 0) continue;
        let { unit, value } = parseCompoundValue(isEmpty(p.r) ? '' : p.r);
        if (unit && !p[unit] && !/^[tθi]$/.test(unit)) {
            if (isEmpty(props.unit)) props.unit = unit;
            p.r = value;
        }
        p.split = clamp(n, lo, hi);
        contours.push(p);
        index.push(c);
    }
    let fns = contours.map(p => createPointFunction(p, p.split));

    let turn = isEmpty(props.turn) ? 1 : evaluate(props.turn, props) || 1;
    let fill = props['fill-rule'] ?? props.fill;
    let evenodd = fill == 'evenodd';
    let [gap = 0, fine = gap / 4] = isEmpty(props.gap) ? [] : parseValueGroup(String(props.gap)).map(v => Number(v) || 0);
    let dir = props.direction || props.dir || '';
    let direction = parseDirection(dir);
    let steps = (props.steps || []).filter(([k]) => props[k] !== undefined);
    let changed = steps.some(([k]) => k == 'grow' || k == 'frame');
    let last = steps.length;
    while (last && /^(move|scale)$/.test(steps[last - 1][0])) last--;
    let place = steps.slice(last).map(([k, v]) => [k, ...parsePair(v, k == 'move' ? 0 : 1, props)]);
    steps = steps.slice(0, last);
    let view = ([x, y]) => {
        for (let [k, a, b] of place) k == 'move' ? (x += a, y += b) : (x *= a, y *= b);
        return [x, y];
    };
    let [fx, fy] = place.reduce(([x, y], [k, a, b]) => k == 'move' ? [x, y] : [x * a, y * b], [1, 1]);
    let percent = props.unit === undefined || props.unit === '%';
    let suffix = percent ? '%' : (props.unit === 'none' ? '' : props.unit);
    let staticAngle = props.scatter && !dir ? 0
        : direction.direction ? null : 90 + direction.angle;

    let points = [];
    let px = [], py = [];

    let toScreen = p => {
        let [x, y] = view(p);
        return percent ? [(x + 1) * 50, (1 - y) * 50] : [x, -y];
    };
    let origin = [0, 0];
    let box = percent ? [0, 0, 100, 100] : [-1, -1, 1, 1];
    let fmt = (x, y) => tidyNumber(x) + suffix + ' ' + tidyNumber(y) + suffix;

    let add = ([x, y]) => {
        let angle = staticAngle;
        if (angle === null) {
            angle = atan2((origin[1] - y) * fy, (x - origin[0]) * fx) * 180 / PI;
            if (direction.direction === 'reverse') angle -= 180;
            angle = tidyNumber(angle + direction.angle);
        }
        [x, y] = toScreen([x, y]);
        points.push(new Point(fmt(x, y), angle));
        px.push(x);
        py.push(y);
    };

    let curved = path => suffix && path && path.some(e => e[2] !== undefined);
    let toPath = (paths, map = p => p, rule) => {
        let out = [];
        for (let path of paths) {
            let last, start = out.length, head = start ? 'move to ' : 'from ';
            for (let [x, y, bx, by] of path) {
                let at = fmt(...map([x, y]));
                if (bx !== undefined) out.push(`curve to ${at} with ${fmt(...map([bx, by]))}`);
                else if (at != last) out.push((out.length > start ? 'line to ' : head) + at);
                last = at;
            }
            out.push('close');
        }
        return `shape(${rule ? rule + ' ' : ''}${out.join(',')})`;
    };
    let radius = isEmpty(props.round) ? 0 : max(0, evaluate(props.round, props) || 0);
    let tile = ([poly, [x, y], kind = 1, extra]) => {
        if (radius) {
            let tol = (box[2] - box[0]) / 1e3, r = radius * (box[2] - box[0]) / 2;
            let path = corners(toPairs(poly), null, r);
            if (curved(path)) return new Point(toPath([path]), extra, fmt(x, y), kind);
            poly = flatten(path, tol);
        }
        let vs = [];
        for (let [x, y] of toPairs(poly)) {
            let v = fmt(x, y);
            if (v !== vs.at(-1)) vs.push(v);
        }
        if (vs.length > 1 && vs[0] === vs.at(-1)) vs.pop();
        return new Point(`polygon(${vs.join(', ') || '0 0'})`, extra, fmt(x, y), kind);
    };

    let trace = ({ split }, c) => {
        let step = PI * 2 * turn / split;
        return Array.from({ length: split }, (_, i) => fns[c](step * i, i));
    };
    let rings = props.blocks ? combine(props, lo, hi) : vertices ? [vertices] : contours.map(trace);
    if (props.blocks && !isEmpty(props.points)) rings = resample(rings, contours.map(p => p.split));
    if (!rings.length) rings = [[[0, 0]]];
    // every ring at once: for grow and frame a group's rings are one region, each contour of a list its own
    let run = (rings, rounding = radius) => {
        let paths = rings.map(ring => rounding && corners(ring, null, rounding));
        let os = rings.map(() => [0, 0]), units = rings.map((_, c) => props.blocks ? 0 : c);
        rings = rings.map((ring, c) => paths[c] ? toPairs(flatten(paths[c], .002)) : ring);
        for (let [name, text] of steps) {
            let f = fns[0].formula(text), frame = name == 'frame';
            // a frame, or a grow by a constant, is exact: the band inside, the region moved out
            if (frame || name == 'grow' && !text.includes(',') && [1, 2, 4].every(t => f(t) == f(0))) {
                let d = frame ? -(evaluate(text, props) || .002) : f(0), next = [], ids = [];
                for (let u of new Set(units)) {
                    let own = rings.filter((_, c) => units[c] == u), region = own.flat(2).every(isFinite) && offset(own, 0, evenodd);
                    // an outline with no area stays put; a frame's inner rings take as many points as its outline, so frames morph
                    if (region.length) own = frame ? [...region, ...recount(offset(region, d), region.flat().length).map(ring => ring.reverse())] : offset(region, d);
                    own.forEach(ring => next.push(ring) && ids.push(u));
                }
                os = next.map(() => os[0] || [0, 0]);
                [rings, units, paths] = [next, ids, []];
                continue;
            }
            rings = rings.map((ring, c) => {
                let k = c % contours.length, p = contours[k], value = text, fn;
                if ((name == 'rotate' || name == 'grow') && text.includes(',')) {
                    let list = parseValueGroup(text, { noSpace: true });
                    value = list[index[k] % list.length];
                }
                if (name == 'grow') {
                    paths[c] = null;
                    return wave(ring, fns[k].formula(value), .001);
                }
                if (name == 'rotate') {
                    let a = PI / 180 * (evaluate(degrees(value), { ...p, deg: PI / 180, turn: 2 * PI }) || 0), cs = cos(a), sn = sin(a);
                    fn = ([x, y]) => [x * cs - y * sn, y * cs + x * sn];
                } else {
                    let [a, b] = parsePair(value, name == 'move' ? 0 : 1, p);
                    fn = ([x, y]) => name == 'move' ? [x + a, y + b] : [x * a, y * b];
                }
                paths[c] = paths[c] && paths[c].map(([x, y, bx, by]) => bx === undefined ? fn([x, y]) : [...fn([x, y]), ...fn([bx, by])]);
                os[c] = fn(os[c]);
                return ring.map(fn);
            });
        }
        return rings.length ? { rings, paths, os } : { rings: [[[0, 0]]], paths, os: [[0, 0]] };
    };

    if (raw) {
        return Object.assign(run(rings).rings.map(ring => ring.map(view)), { evenodd });
    }

    if (props.scatter) {
        rings = run(rings, 0).rings;
        let [w, h = 1] = isEmpty(props.aspect) ? [] : String(props.aspect).split('/').map(Number);
        let aspect = w / h > 0 && w / h < Infinity ? w / h : 1, sx = max(aspect, 1), sy = max(1 / aspect, 1);
        if (aspect != 1) {
            let [screenOf, format] = [toScreen, fmt];
            toScreen = p => { let [x, y] = screenOf(p); return [x * sx, y * sy]; };
            fmt = (x, y) => format(x / sx, y / sy);
            box = [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy];
        }
        let outline = bridge(rings), screen = outline.map(toScreen), inside = insideTest(screen, evenodd);
        let name = props.tile, count = props.scatter, seed = Number(props.seed) || 0;
        let sides = { hex: 6, triangle: 3, cube: 6, grid: 4 }[name];
        let shift = parsePair(props.shift, 0, props);
        let toShape = (x, y) => percent ? [x / sx / 50 - 1, 1 - y / sy / 50] : [x / sx, -y / sy];
        let turn = props.pair == 'turn' && (sides == 4 || name == 'hex');
        let make = sides ? (box, bounds, s, half) => lattice(sides, box, bounds, s, shift, turn, half) : name == 'penrose' && penrose;
        let derive = (props.op || parseFloat(props.star)) && conway(props.op, props.star, name == 'cube' && faces3), cube = name == 'cube' && !derive;
        if (make) {
            let classes = sides == 4 ? 2 : 3, edge = !isEmpty(props.edge) && sides && !derive && !cube && edges(props, sides == 3, seed);
            let probes = [-1, -.5, 0, .5, 1], bulge = 0;
            if (edge) for (let e = 1; e <= classes; ++e) for (let x of probes) for (let y of probes) { let { f, g } = edge(e, x, y); bulge = max(bulge, ...f.map(abs), ...g.map(abs)); }
            let jitter = Number(props.jitter) || 0;
            let grow = (edge ? 1 + 2 * tan(PI / sides) * bulge : 1) * (1 + 2 * abs(jitter));
            let pieces = tiles(make, box, screen, inside, cube ? max(1, count / 3 | 0) : count, grow, derive, sides);
            if (cube) pieces = faces3(pieces);
            if (jitter) pieces = shake(pieces, jitter, seed);
            let p = pieces[0]?.[0] || [], len = 0;
            for (let i = 0; i < p.length; i += 2) len = max(len, hypot(p[(i + 2) % p.length] - p[i], p[(i + 3) % p.length] - p[i + 1]));
            let tol = (box[2] - box[0]) * 5e-4 / len;
            return pieces.map(([p, c, kind, marks]) => tile([inset(p, ...c, gap / 2, edge ? bend(p, c, edge, classes, tol, toShape, marks) : p), c, kind]));
        }
        let context = Object.assign(Object.create(defaultContext), props);
        let formula = text => isEmpty(text) ? null : (x, y) => {
            context.x = x;
            context.y = y;
            return Number(calc(text, context)) || 0;
        };
        let onScreen = f => f && ((x, y) => f(...toShape(x, y)));
        if (name == 'circle') {
            let size = formula(props.size);
            context.random = seedrandom('size:' + seed);
            size = onScreen(size) || (count < 2 ? () => 1 : () => min(1.5, sqrt(count) / 2) + min(count / 100, sqrt(count) / 5) * context.random() ** 24);
            return pack(rings.map(ring => ring.map(toScreen)), box, inside, count, seed, size).map(([x, y, r]) => {
                let at = fmt(x, y), [rx, ry] = [sx, sy].map(s => tidyNumber(max(0, r - gap / 2) / s) + suffix);
                let point = new Point(`ellipse(${rx} ${ry} at ${at})`, undefined, at, 1);
                point.rx = rx;
                point.ry = ry;
                return point;
            });
        }
        context.random = seedrandom('random:density:' + seed);
        let density = formula(props.density);
        if (name == 'slice') return slice(screen, box, inside, count, seed, gap, (Number(props.spread) || 0) * PI / 180, onScreen(density)).map(tile);
        let relax = isEmpty(props.relax) ? undefined : clamp(props.relax, 0, 50);
        let [ratio, angle] = isEmpty(props.stretch) ? [] : parseValueGroup(String(props.stretch)).map(parseFloat);
        let crack = Number(props.crack) || 0;
        if (name == 'voronoi' && (ratio > 0 || crack > 1)) {
            return mosaic(screen, box, count, evenodd, seed, onScreen(density), relax,
                ratio > 0 ? clamp(ratio, 1e-3, 1e3) : 1, (angle || 0) * PI / 180, crack, gap, fine).map(tile);
        }
        let sow = n => aspect == 1 ? scatter(outline, n, evenodd, seed, density, relax)
            : scatter(screen, n, evenodd, seed, onScreen(density), relax).reverse().map(([x, y]) => {
                let [u, v] = toShape(x, y);
                for (let [k, a, b] of [...place].reverse()) k == 'move' ? (u -= a, v -= b) : (u /= a, v /= b);
                return [u, v];
            });
        if (name == 'voronoi' && derive) {
            let [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0, fits = reacher(box, inside, 1, 1), pieces = [];
            for (let n = count, i = 0; i < 5 && n >= 1; ++i) {
                let at = sow(n).map(toScreen);
                at = at.concat(...[[2 * x0, 1], [2 * x1, 1], [2 * y0, 0], [2 * y1, 0]].map(([m, a]) => at.map(([x, y]) => a ? [m - x, y] : [x, m - y])));
                let cells = voronoi(at.map(p => p[0]), at.map(p => p[1]), x0 - w, y0 - h, x1 + w, y1 + h, 0), kinds = colors(cells);
                pieces = derive.fn(cells.map(([poly], k) => [poly, at[k], kinds[k]])).filter(fits);
                if (pieces.length <= count) break;
                n = n * count / pieces.length * .98 | 0;
            }
            return pieces.map(([p, c, kind]) => tile([inset(p, ...c, gap / 2), c, kind]));
        }
        if (name == 'delaunay') {
            let rim = border(rings.map(ring => ring.map(toScreen)), count);
            sow(count - rim.length).forEach(add);
            for (let [x, y] of rim) px.push(x), py.push(y);
            return delaunay(px, py, box, inside, props.count, gap).map(tile);
        }
        sow(count).forEach(add);
        if (name == 'voronoi') {
            let cells = voronoi(px, py, ...box, gap), kinds = colors(cells);
            return cells.map(([poly], k) => tile([poly, [px[k], py[k]], kinds[k], points[k].extra]));
        }
        return points;
    }

    let rule = (fill == 'nonzero' || fill == 'evenodd') && fill;
    if (rule) points.push(new Point(rule, ''));

    let { rings: out, paths, os } = run(rings);
    rings = out.map((ring, c) => {
        let at = points.length;
        origin = os[c];
        ring.forEach(add);
        return points.slice(at);
    });

    points.rings = rings;
    points.clip = !changed && paths.some(curved)
        ? toPath(paths, toScreen, rule)
        : `polygon(${rule ? rule + ',' : ''}${bridge(rings).join(',')})`;
    return points;
}

function unwrap(input) {
    let pieces = [''], depth = 0;
    for (let t of scan(input)) {
        depth += t.isSymbol('(', '{') - t.isSymbol(')', '}');
        if (!depth && t.isSymbol(';')) pieces.push('');
        else pieces[pieces.length - 1] += t.value;
    }
    return pieces.map(s => {
        let inner = removeParens(s = s.trim());
        return inner === s ? s : unwrap(inner);
    }).join(';');
}

export function outline(polygon, warn) {
    polygon.children.forEach(n => check(n, warn));
    let rings = createShapePoints(commandsOf({ rows: polygon.rows.filter(r => r.name === 'points'), children: polygon.children }), 3, 3600, true);
    // thinned to 256 points, a hole too small for 3 of them is left out
    return rings.flat().length > 256 ? resample(rings, [256]).filter(ring => ring.length > 2) : rings;
}

export const shapeWarnings = memo(input => {
    let list = [], warn = message => list.push(message);
    check(readShapes(input.includes('(') ? unwrap(input) : input, warn), warn);
    return list;
});

export default function generateShape(input, range = {}, modifier) {
    if (input.includes('(')) input = unwrap(input);
    let [head, more = ''] = input.split(/;([^]*)/);
    let [name, ...args] = input.includes('{') ? [] : parseValueGroup(head);
    let preset = presetShapes[name];
    if (typeof preset === 'function') {
        preset = preset(...args);
    }
    let rules = parseShapeCommands(preset === undefined ? input : preset + ';' + more);
    if (!rules.blocks && pairsOf(rules.points)) {
        rules.blocks = { op: 'union', items: [{ points: rules.points }] };
        delete rules.points;
    }
    if (preset === undefined && range.preset && !rules.blocks && ['x', 'y', 'r'].every(k => isEmpty(rules[k]))) {
        preset = presetShapes[range.preset];
        rules = parseShapeCommands(preset + ';' + input);
    }
    if (modifier) {
        rules = modifier(rules, preset !== undefined);
    }
    if (isEmpty(rules.seed) && range.seed != null) {
        rules.seed = range.seed;
    }
    let points = createShapePoints(rules, range.min || 3, range.max || 3600, range.raw);
    return { rules, points, clip: points.clip, preset: preset !== undefined };
}
