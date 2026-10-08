import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';

import seedrandom from '../lib/seedrandom.js';
import { clamp, tidyNumber, map2d } from '../lib/math.js';
import Perlin from '../lib/noise.js';
import { isEmpty } from '../lib/type.js';
import { memo } from '../lib/cache.js';
import calc, { defaultContext } from '../core/calc.js';
import { css } from '../lib/tagged-template.js';
import {
    insideTest, scatter, voronoi, mosaic, rounded, wave, lattice, penrose, delaunay, tiles,
    shake, bend, inset, bounds, pack, slice, centre, edges, PHI,
} from './tiling.js';

const { cos, sin, tan, atan2, sqrt, hypot, abs, max, PI } = Math;

const perlinOf = memo(seed => new Perlin(seedrandom('noise:' + seed)));

function ngon(k, inner = cos(PI / k)) {
    let a = PI / k, x = cos(a) - inner, y = sin(a), l = sqrt(x * x + y * y);
    return `r: ${inner * y / l} / cos(abs(abs(t) % ${2 * a} - ${a}) + ${atan2(x, y)})`;
}

function fit(commands) {
    let props = parseShapeCommands(commands), split = parseInt(props.split);
    let point = createPointFunction(props, split), ps = [];
    for (let i = 0; i < split; ++i) ps.push(...point(2 * PI * i / split, i));
    let [x0, y0, x1, y1] = bounds(ps);
    return `${commands}; move: ${-(x0 + x1) / 2} ${(y0 + y1) / 2}; scale: ${2 / max(x1 - x0, y1 - y0)}`;
}

const presetShapes = {
    __proto__: null,

    square:   css`split: 4; ${ngon(4)}; rotate: 45; scale: 1.42`,
    pentagon: css`split: 5; ${ngon(5)}; rotate: 54`,
    circle:   css`split: 180`,
    hexagon:  css`split: 6; ${ngon(6)}; rotate: 30`,
    octagon:  css`split: 8; ${ngon(8)}; rotate: 22.5`,
    triangle: () => fit(css`split: 3; ${ngon(3)}; rotate: 30`),
    bean:     () => fit(css`split: 180; r: sin(t)^3 + cos(t)^3`),
    bicorn:   css`split: 180; x: cos(t); y: sin(t)^2 / (2 + sin(t)) - .5`,
    fish:     () => fit(css`split: 240; x: .89cos(t) + .19cos(2t) + .07cos(4t) - .02cos(5t) + .03cos(6t) + .01cos(8t); y: .41sin(t) + .18sin(3t) - .08sin(4t) - .02sin(5t) + .05sin(6t) - .02sin(7t)`),
    infinity: css`split: 180; x: cos(t) / (sin(t)^2 + 1); y: x * sin(t)`,
    drop:     () => fit(css`split: 180; rotate: 90; x: sin(t); y: (1 + sin(t)) * cos(t) / 1.6`),
    vase:     css`split: 240; x: sign(sin(t)) * (.27 - .2cos(t) - .07cos(2t) + .09cos(3t)); y: cos(t)`,
    windmill: css`split: 18; R: seq(.618, 1, 0); T: seq(t-.55, t, t); x: R * cos(T); y: R * sin(T)`,
    heart:    () => fit(css`split: 180; a: cos(t)*13/18 - cos(2t)*5/18; b: cos(3t)/18 + cos(4t)/18; x: -.9 * sin(t)^3; y: 1.1 * (a - b)`),
    star(k = 5, inner = 1 / PHI ** 2) {
        k = clamp(k, 3, 10);
        return css`split: ${2 * k}; ${ngon(k, clamp(inner, .05, 1))}; rotate: ${-(90 % (360 / k))}`;
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
        return fit(css`split: 180; k: ${k}; x: (k+1)*cos(t) - cos((k+1)*t); y: (k+1)*sin(t) - sin((k+1)*t); rotate: -90`);
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

function parsePair(input, fallback) {
    let [a, b = a] = parseValueGroup(input);
    return [a, b].map(v => parseFloat(v) || fallback);
}

function createPointFunction(props, split) {
    let px = isEmpty(props.x) ? 'cos(t)' : props.x;
    let py = isEmpty(props.y) ? 'sin(t)' : props.y;
    let pr = props.r, pt = props.t;

    let rotate = Number(props.rotate) || 0;
    let rad = -PI / 180 * rotate;
    let cosR = cos(rad), sinR = sin(rad);

    let index = 0, perlin;
    let context = Object.assign(Object.create(defaultContext), {
        noise(t, x, y, octave = 1, scale = 1, from = 0, to = 1) {
            perlin ??= perlinOf(props.seed ?? '');
            let px = x + cos(t), py = y + sin(t), v = 0;
            for (let i = 0; i < octave; ++i) {
                let m = i ? 2 * i : 1;
                v += perlin.noise(px * m, py * m) * scale / m;
            }
            return map2d(v, from, to, scale);
        }
    }, props, {
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
        if (rotate) {
            let rx = x * cosR - y * sinR;
            y = y * cosR + x * sinR;
            x = rx;
        }
        return [x, y];
    };
    point.formula = text => t => {
        context['t'] = context['θ'] = t;
        return Number(calc(text, context)) || 0;
    };
    return point;
}

function createShapePoints(props, lo, hi) {
    let split = clamp(parseInt(props.points || props.split), lo, hi);

    // `r: 10px` carries the unit, but `2t` and `2i` are products
    let { unit, value } = parseCompoundValue(isEmpty(props.r) ? '' : props.r);
    if (unit && !props[unit] && !/^[tθi]$/.test(unit)) {
        if (isEmpty(props.unit)) props.unit = unit;
        props.r = value;
    }
    props.split = split;

    let point = createPointFunction(props, split);

    let turn = Number(props.turn) || 1;
    let frame = props.frame;
    let fill = props.fill;
    let evenodd = fill == 'evenodd';
    let [gap = 0, fine = gap / 4] = isEmpty(props.gap) ? [] : parseValueGroup(String(props.gap)).map(v => Number(v) || 0);
    let dir = props.direction || props.dir || '';
    let direction = parseDirection(dir);
    let [fx, fy] = parsePair(props.scale, 1);
    let [dx, dy] = parsePair(props.move, 0);
    // percentages of the element by default, else the unit or none
    let percent = props.unit === undefined || props.unit === '%';
    let suffix = percent ? '%' : (props.unit === 'none' ? '' : props.unit);
    let staticAngle = props.scatter && !dir ? 0
        : direction.direction ? null : 90 + direction.angle;

    let rad = (PI * 2) * turn / split;
    let points = [];
    let px = [], py = [];

    let toScreen = ([x, y]) => {
        x = (x + dx) * fx;
        y = -(y - dy) * fy;
        return percent ? [(x + 1) * 50, (y + 1) * 50] : [x, y];
    };
    let box = percent ? [0, 0, 100, 100] : [-1, -1, 1, 1];
    let fmt = (x, y) => tidyNumber(x) + suffix + ' ' + tidyNumber(y) + suffix;

    let add = ([x, y]) => {
        let angle = staticAngle;
        if (angle === null) {
            angle = atan2(-y * fy, x * fx) * 180 / PI;
            if (direction.direction === 'reverse') angle -= 180;
            angle = tidyNumber(angle + direction.angle);
        }
        [x, y] = toScreen([x, y]);
        points.push(new Point(fmt(x, y), angle));
        px.push(x);
        py.push(y);
    };

    let smooth = clamp(Number(props.round) || 0, 0, 1);
    let tile = ([poly, [x, y], kind = 1, extra]) => {
        if (smooth) poly = rounded(poly, smooth, (box[2] - box[0]) / 1e3);
        let vs = [];
        for (let i = 0; i < poly.length; i += 2) {
            let v = fmt(poly[i], poly[i + 1]);
            if (v !== vs.at(-1)) vs.push(v);
        }
        if (vs.length > 1 && vs[0] === vs.at(-1)) vs.pop();
        return new Point(`polygon(${vs.join(', ') || '0 0'})`, extra, fmt(x, y), kind);
    };

    let outline = [];
    for (let i = 0; i < split; ++i) {
        outline.push(point(rad * i, i));
    }
    let edge = !isEmpty(props.edge) && point.formula(props.edge);
    let shape = (ps, back) => {
        if (back) ps = [ps[0], ...ps.slice(1).reverse()];
        if (edge) ps = wave(ps, edge, .001);
        if (smooth) {
            let p = rounded(ps.flat(), smooth, .002);
            ps = [];
            for (let i = 0; i < p.length; i += 2) ps.push([p[i], p[i + 1]]);
        }
        return back ? [ps[0], ...ps.slice(1).reverse()] : ps;
    };

    if (props.scatter) {
        // tiled in the element's proportions, with the shorter side as 100%, then mapped back
        let [w, h = 1] = isEmpty(props.aspect) ? [] : String(props.aspect).split('/').map(Number);
        let aspect = w / h > 0 ? w / h : 1, sx = max(aspect, 1), sy = max(1 / aspect, 1);
        if (aspect != 1) {
            let [screenOf, format] = [toScreen, fmt];
            toScreen = p => { let [x, y] = screenOf(p); return [x * sx, y * sy]; };
            fmt = (x, y) => format(x / sx, y / sy);
            box = [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy];
        }
        let screen = outline.map(toScreen), inside = insideTest(screen, evenodd);
        let name = props.tile, count = props.scatter, seed = Number(props.seed) || 0;
        let sides = { hex: 6, triangle: 3, cube: 6, grid: 4 }[name];
        let shift = parsePair(props.shift, 0);
        let toShape = (x, y) => percent ? [x / sx / 50 - 1, 1 - y / sy / 50] : [x / sx, -y / sy];
        let make = sides ? (box, bounds, s) => lattice(sides, box, bounds, s, shift) : name == 'penrose' && penrose;
        if (make) {
            let classes = sides == 4 ? 2 : 3, edge = !isEmpty(props.edge) && sides && name != 'cube' && edges(props, sides == 3, seed);
            let probes = [-1, -.5, 0, .5, 1], bulge = 0;
            if (edge) for (let e = 1; e <= classes; ++e) for (let x of probes) for (let y of probes) bulge = max(bulge, ...edge(e, x, y).f.map(abs));
            let jitter = Number(props.jitter) || 0;
            let grow = (edge ? 1 + 2 * tan(PI / sides) * bulge : 1) * (1 + 2 * abs(jitter));
            let pieces = tiles(make, box, screen, inside, name == 'cube' ? max(1, count / 3 | 0) : count, grow);
            // top, left, right faces of a hexagon
            if (name == 'cube') pieces = pieces.flatMap(([p, c]) => [6, 2, 10].map((i, face) => {
                let q = [...c, ...[...p, ...p].slice(i, i + 6)];
                return [q, centre(q), face + 1];
            }));
            if (jitter) pieces = shake(pieces, jitter, seed);
            let p = pieces[0]?.[0], tol = edge && p && (box[2] - box[0]) * 5e-4 / hypot(p[2] - p[0], p[3] - p[1]);
            return pieces.map(([p, c, kind]) => tile([inset(p, ...c, gap / 2, edge ? bend(p, c, edge, classes, tol, toShape) : p), c, kind]));
        }
        let context = Object.assign(Object.create(defaultContext), props);
        let formula = text => isEmpty(text) ? null : (x, y) => {
            context.x = x;
            context.y = y;
            return Number(calc(text, context)) || 0;
        };
        if (name == 'circle') {
            let size = formula(props.size);
            context.random = seedrandom('size:' + seed);
            return pack(screen, box, inside, count, seed, size && ((x, y) => size(...toShape(x, y)))).map(([x, y, r]) => {
                let at = fmt(x, y), [rx, ry] = [sx, sy].map(s => tidyNumber(max(0, r - gap / 2) / s) + suffix);
                return new Point(`ellipse(${rx} ${ry} at ${at})`, undefined, at, 1);
            });
        }
        let density = formula(props.density);
        if (name == 'slice') return slice(screen, box, inside, count, seed, gap, (Number(props.spread) || 0) * PI / 180, density && ((x, y) => density(...toShape(x, y)))).map(tile);
        let relax = isEmpty(props.relax) ? undefined : Number(props.relax);
        let [ratio, angle] = isEmpty(props.stretch) ? [] : parseValueGroup(String(props.stretch)).map(parseFloat);
        let crack = Number(props.crack) || 0;
        if (name == 'voronoi' && (ratio > 0 || crack > 1)) {
            return mosaic(screen, box, count, evenodd, seed, density && ((x, y) => density(...toShape(x, y))), relax,
                ratio > 0 ? ratio : 1, (angle || 0) * PI / 180, crack, gap, fine).map(tile);
        }
        scatter(outline, count, evenodd, seed, density, relax).forEach(add);
        if (name == 'delaunay') return delaunay(px, py, box, inside, props.count, gap).map(tile);
        if (name == 'voronoi') {
            let kinds = [];
            return voronoi(px, py, ...box, gap).map(([poly, ids], k) => {
                let kind = 1;
                while (ids.some(q => kinds[q] == kind)) ++kind;
                return tile([poly, [px[k], py[k]], kinds[k] = kind, points[k].extra]);
            });
        }
        return points;
    }

    if (fill == 'nonzero' || fill == 'evenodd') {
        points.push(new Point(fill, ''));
    }

    outline = shape(outline);
    outline.forEach(add);

    // an outline: back to the first point, then the inner ring in reverse
    if (frame !== undefined) {
        let first = outline[0];
        add(first);
        let w = frame / 100 * (turn > 1 ? 2 : 1) || .002;
        let inner = [];
        for (let i = 0; i < split; ++i) {
            let [x, y] = point(-rad * i, i);
            let theta = atan2(y, x);
            inner.push([x - w * cos(theta), y - w * sin(theta)]);
        }
        inner = shape(inner, true);
        inner.forEach(add);
        add(inner[0]);
        add(first);
    }

    return points;
}

// The callers memoize: the results are shared and read-only.
export default function generateShape(input, range = {}, modifier) {
    let [head, more = ''] = input.split(/;([^]*)/);
    let [name, ...args] = parseValueGroup(head);
    let preset = presetShapes[name];
    if (typeof preset === 'function') {
        preset = preset(...args);
    }
    let rules = parseShapeCommands(preset === undefined ? input : preset + ';' + more);
    if (preset === undefined && range.preset && ['x', 'y', 'r'].every(k => isEmpty(rules[k]))) {
        preset = presetShapes[range.preset];
        rules = parseShapeCommands(preset + ';' + input);
    }
    if (modifier) {
        rules = modifier(rules, preset !== undefined);
    }
    if (isEmpty(rules.seed) && range.seed != null) {
        rules.seed = range.seed;
    }
    let points = createShapePoints(rules, range.min || 3, range.max || 3600);
    return { rules, points, preset: preset !== undefined };
}
