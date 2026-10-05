import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';

import { clamp, tidyNumber } from '../lib/math.js';
import { isEmpty } from '../lib/type.js';
import seedrandom from '../lib/seedrandom.js';
import calc, { defaultContext } from '../core/calc.js';
import { css } from '../lib/tagged-template.js';

const { cos, sin, atan2, sqrt, ceil, floor, abs, min, max, PI } = Math;

const SCATTER_SAMPLES = 16;
const SCATTER_ROUNDS = 10;
const SCATTER_BANDS = 256;

function ngon(n) {
    return `r: cos(π/${n}) / cos(t % (2π/${n}) - π/${n})`;
}

const presetShapes = {
    __proto__: null,

    square:   css`split: 4; r: 1.42; rotate: 45`,
    pentagon: css`split: 5; ${ngon(5)}; rotate: 54`,
    circle:   css`split: 180; scale: .99`,
    hexagon:  css`split: 6; ${ngon(6)}; rotate: 30; scale: .98`,
    octagon:  css`split: 8; ${ngon(8)}; rotate: 22.5; scale: .99`,
    triangle: css`split: 3; ${ngon(3)}; rotate: 30; scale: 1.1; move: 0 .2`,
    star:     css`split: 10; r: cos(5t); rotate: -18; scale: .99`,
    bean:     css`split: 180; r: sin(t)^3 + cos(t)^3; move: -.35 .35`,
    bicorn:   css`split: 180; x: cos(t); y: sin(t)^2 / (2 + sin(t)) - .5`,
    fish:     css`split: 240; x: cos(t) - sin(t)^2 / sqrt(2) - .04; y: sin(2t)/2`,
    infinity: css`split: 180; scale: .99; x: cos(t)*.99 / (sin(t)^2 + 1); y: x * sin(t)`,
    drop:     css`split: 180; rotate: 90; scale: .95; x: sin(t); y: (1 + sin(t)) * cos(t) / 1.6`,
    vase:     css`split: 240; scale: .3; x: sin(4t) + sin(t) * 1.4; y: cos(t) + cos(t) * 4.8 + .3`,
    windmill: css`split: 18; R: seq(.618, 1, 0); T: seq(t-.55, t, t); x: R * cos(T); y: R * sin(T)`,
    whale:    css`split: 240; rotate: 180; R: 3.4 * (sin(t)^2 - .5) * cos(t); x: cos(t) * R + .75; y: sin(t) * R * 1.2`,
    heart:    css`split: 180; rotate: 180; a: cos(t)*13/18 - cos(2t)*5/18; b: cos(3t)/18 + cos(4t)/18; x: (.75 * sin(t)^3) * 1.2; y: (a - b + .2) * -1.1`,
    clover(k = 3) {
        k = clamp(k, 3, 5);
        if (k == 4) k = 2;
        return css`split: 240; r: cos(${k}t); scale: .98`;
    },
    hypocycloid(k = 3) {
        k = clamp(k, 3, 5);
        let scale = [.34, .25, .19][k - 3];
        return css`split: 240; scale: ${scale}; k: ${k}; x: (k-1)*cos(t) + cos((k-1)*t); y: (k-1)*sin(t) - sin((k-1)*t)`;
    },
    bud(k = 3) {
        k = clamp(k, 3, 10);
        return css`split: 240; scale: .8; r: 1 + .2 * cos(${k}t)`;
    },
};

class Point {
    constructor(value, angle, origin) {
        this.value = value;
        this.extra = angle;
        this.origin = origin;
    }
    toString() {
        return this.value;
    }
}

function parsePair(input, fallback) {
    let [a, b = a] = parseValueGroup(input);
    a = parseFloat(a) || fallback;
    b = parseFloat(b) || fallback;
    return [a, b];
}

function createPointFunction(props, split) {
    let px = isEmpty(props.x) ? 'cos(t)' : props.x;
    let py = isEmpty(props.y) ? 'sin(t)' : props.y;
    let pr = isEmpty(props.r) ? '' : props.r;
    let pt = isEmpty(props.t) ? '' : props.t;

    let rotate = Number(props.rotate) || 0;
    let rad = -PI / 180 * rotate;
    let cosR = cos(rad), sinR = sin(rad);

    let index = 0;
    let context = Object.assign(Object.create(defaultContext), props, {
        't': 0,
        'θ': 0,
        'i': 0,
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

    return (t, i) => {
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
}

function insideTest(outline, evenodd) {
    let ys = outline.map(p => p[1]), y0 = min(...ys), h = max(...ys) - y0;
    let bands = Array.from({ length: SCATTER_BANDS }, () => []);
    let band = y => min(SCATTER_BANDS - 1, (y - y0) / h * SCATTER_BANDS | 0);
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        let [ax, ay] = outline[j], [bx, by] = outline[i];
        for (let r = band(min(ay, by)); r <= band(max(ay, by)); ++r) {
            bands[r].push(ax, ay, bx, by);
        }
    }
    return (x, y) => {
        if (y < y0 || y > y0 + h) return 0;
        let n = 0, edges = bands[band(y)];
        for (let i = 0; i < edges.length; i += 4) {
            let ax = edges[i], ay = edges[i + 1], bx = edges[i + 2], by = edges[i + 3];
            if ((ay <= y) != (by <= y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) {
                n += by > ay ? 1 : -1;
            }
        }
        return evenodd ? n & 1 : n;
    };
}

function scatter(outline, count, evenodd, seed, density) {
    let xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    let x0 = min(...xs), y0 = min(...ys);
    let w = max(...xs) - x0, h = max(...ys) - y0;
    let inside = insideTest(outline, evenodd);
    let total = max(1024, SCATTER_SAMPLES * count);
    let sx = new Float64Array(total), sy = new Float64Array(total), n = 0, tried = 0;
    let rnd = seedrandom('density:' + seed), peak = 0;
    if (density) for (let i = 0; i < 1024; ++i) {
        let x = x0 + (i % 32 + .5) / 32 * w, y = y0 + ((i >> 5) + .5) / 32 * h;
        if (inside(x, y)) peak = max(peak, density(x, y));
    }
    // quasi-random R2 samples over the box, kept when inside the shape
    for (; n < total && tried < (n ? total * 100 : 1e3); ++tried) {
        let k = tried + seed * 1e4;
        let u = .5 + k * .7548776662, v = .5 + k * .5698402909;
        let x = x0 + (u - floor(u)) * w, y = y0 + (v - floor(v)) * h;
        if (!inside(x, y) || density && density(x, y) < peak * rnd()) continue;
        sx[n] = x, sy[n++] = y;
    }
    // the first samples are the initial points
    let m = min(count, n);
    let px = sx.slice(0, m), py = sy.slice(0, m);
    let size = sqrt(w * h * n / tried / count) || 1;
    let cols = ceil(w / size) || 1, rows = ceil(h / size) || 1;
    let col = x => min(cols - 1, (x - x0) / size | 0);
    let row = y => min(rows - 1, (y - y0) / size | 0);
    let head = new Int32Array(cols * rows), next = new Int32Array(m);
    let sums = new Float64Array(m * 3);
    for (let r = 0; r < SCATTER_ROUNDS; ++r) {
        head.fill(-1);
        sums.fill(0);
        for (let k = 0; k < m; ++k) {
            let c = col(px[k]) + cols * row(py[k]);
            next[k] = head[c];
            head[c] = k;
        }
        for (let s = 0; s < n; ++s) {
            let x = sx[s], y = sy[s];
            let cx = col(x), cy = row(y), near = -1, best = Infinity;
            for (let ring = 1; near < 0; ++ring) {
                for (let j = max(0, cy - ring); j <= min(rows - 1, cy + ring); ++j) {
                    for (let i = max(0, cx - ring); i <= min(cols - 1, cx + ring); ++i) {
                        for (let k = head[i + cols * j]; k >= 0; k = next[k]) {
                            let d = (x - px[k]) ** 2 + (y - py[k]) ** 2;
                            if (d < best) best = d, near = k;
                        }
                    }
                }
            }
            near *= 3;
            sums[near] += x;
            sums[near + 1] += y;
            sums[near + 2]++;
        }
        for (let k = 0; k < m; ++k) {
            let c = sums[k * 3 + 2], x = sums[k * 3] / c, y = sums[k * 3 + 1] / c;
            if (c && inside(x, y)) px[k] = x, py[k] = y;
        }
    }
    return Array.from(px, (x, k) => [x, py[k]]).sort((a, b) => b[1] - a[1]);
}

function halfplane(poly, nx, ny, mx, my, ids, q) {
    let out = [], next = [];
    for (let a = 0, n = poly.length; a < n; a += 2) {
        let b = (a + 2) % n, id = ids[a / 2];
        let sa = nx * (poly[a] - mx) + ny * (poly[a + 1] - my);
        let sb = nx * (poly[b] - mx) + ny * (poly[b + 1] - my);
        if (sa <= 0) {
            out.push(poly[a], poly[a + 1]);
            next.push(sa < 0 || sb <= 0 ? id : q);
        }
        if (sa * sb < 0) {
            let t = sa / (sa - sb);
            out.push(poly[a] + (poly[b] - poly[a]) * t, poly[a + 1] + (poly[b + 1] - poly[a + 1]) * t);
            next.push(sa < 0 ? q : id);
        }
    }
    return [out, next];
}

function voronoi(px, py, x0, y0, x1, y1, gap) {
    let m = px.length, w = x1 - x0, h = y1 - y0;
    let size = sqrt(w * h / m) || 1;
    let cols = ceil(w / size) || 1, rows = ceil(h / size) || 1;
    let col = x => clamp((x - x0) / size | 0, 0, cols - 1);
    let row = y => clamp((y - y0) / size | 0, 0, rows - 1);
    let head = new Int32Array(cols * rows).fill(-1), next = new Int32Array(m);
    for (let k = 0; k < m; ++k) {
        let c = col(px[k]) + cols * row(py[k]);
        next[k] = head[c];
        head[c] = k;
    }
    return Array.from(px, (x, k) => {
        let y = py[k];
        let poly = [x0, y0, x1, y0, x1, y1, x0, y1], ids = [-1, -1, -1, -1];
        let far = () => {
            let r = 0;
            for (let i = 0; i < poly.length; i += 2) {
                r = max(r, (poly[i] - x) ** 2 + (poly[i + 1] - y) ** 2);
            }
            return r;
        };
        let limit = far(), cx = col(x), cy = row(y);
        for (let ring = 0; ring < max(cols, rows); ++ring) {
            let reach = (ring - 1) * size - gap;
            if (reach > 0 && reach * reach / 4 > limit) break;
            for (let j = max(0, cy - ring); j <= min(rows - 1, cy + ring); ++j) {
                for (let i = max(0, cx - ring); i <= min(cols - 1, cx + ring); ++i) {
                    if (max(abs(i - cx), abs(j - cy)) != ring) continue;
                    for (let q = head[i + cols * j]; q >= 0; q = next[q]) {
                        let ax = px[q] - x, ay = py[q] - y, d = sqrt(ax * ax + ay * ay);
                        if (q == k || d > gap && (d - gap) ** 2 / 4 > limit) continue;
                        let s = (d - gap) / (2 * d);
                        [poly, ids] = halfplane(poly, ax, ay, x + ax * s, y + ay * s, ids, q);
                        limit = far();
                    }
                }
            }
        }
        return [poly, ids];
    });
}

function regular(cx, cy, k, r, angle) {
    let out = [];
    for (let m = 0; m < k; ++m) {
        let a = angle + m * 2 * PI / k;
        out.push(cx + r * cos(a), cy + r * sin(a));
    }
    return out;
}

function lattice(k, box, bounds, s) {
    let cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    let h = s * sqrt(3) / 2, out = [];
    let i0 = floor((bounds[0] - cx) / s) - 2, i1 = ceil((bounds[2] - cx) / s) + 2;
    let j0 = floor((bounds[1] - cy) / h) - 2, j1 = ceil((bounds[3] - cy) / h) + 2;
    for (let j = j0; j <= j1; ++j) {
        let y = cy + j * h, shift = j & 1 ? s / 2 : 0;
        for (let i = i0; i <= i1; ++i) {
            let x = cx + i * s + shift;
            if (k == 6) out.push([x, y, PI / 6]);
            else out.push([x + s / 2, y + h / 3, -PI / 6], [x + s, y + h * 2 / 3, PI / 6]);
        }
    }
    return out;
}

function delaunay(px, py, box, inside, count, gap) {
    let [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
    let tris = [];
    voronoi(px, py, x0 - w, y0 - h, x1 + w, y1 + h, 0).forEach(([, ids], k) => {
        for (let i = 0, n = ids.length; i < n; ++i) {
            let a = ids[i], b = ids[(i + 1) % n];
            if (a < k || b < k) continue;
            let cx = (px[k] + px[a] + px[b]) / 3, cy = (py[k] + py[a] + py[b]) / 3;
            if (inside(cx, cy)) tris.push([k, a, b, cx, cy]);
        }
    });
    let d = (p, q) => (px[p] - px[q]) ** 2 + (py[p] - py[q]) ** 2;
    let twice = (k, a, b) => (px[a] - px[k]) * (py[b] - py[k]) - (px[b] - px[k]) * (py[a] - py[k]);
    let r2 = ([k, a, b]) => d(k, a) * d(a, b) * d(b, k) / (4 * twice(k, a, b) ** 2);
    let sorted = tris.map(r2).sort((u, v) => u - v);
    let keep = min(sorted[sorted.length >> 1] * 9, sorted[count - 1] ?? Infinity);
    return tris.filter(t => r2(t) <= keep).slice(0, count).map(([k, a, b, cx, cy]) => {
        let tri = [px[k], py[k], px[a], py[a], px[b], py[b]];
        if (gap) {
            let la = sqrt(d(a, b)), lb = sqrt(d(b, k)), lc = sqrt(d(k, a)), per = la + lb + lc;
            let ix = (la * px[k] + lb * px[a] + lc * px[b]) / per, iy = (la * py[k] + lb * py[a] + lc * py[b]) / per;
            let f = 1 - gap * per / 2 / abs(twice(k, a, b));
            tri = f > 0 ? tri.map((v, i) => { let c = i & 1 ? iy : ix; return c + (v - c) * f; }) : [];
        }
        return [tri, [cx, cy]];
    });
}

function tiles(k, box, screen, inside, count, gap) {
    let xs = screen.map(p => p[0]), ys = screen.map(p => p[1]);
    let bounds = [min(...xs), min(...ys), max(...xs), max(...ys)];
    let area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
    if (!(area > 0)) return [];
    let corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].filter(c => inside(c[0], c[1]));
    let reaching = s => {
        let r = s / sqrt(3), apothem = r * cos(PI / k);
        return lattice(k, box, bounds, s).filter(([x, y, angle]) => {
            if (inside(x, y)) return true;
            let vs = regular(x, y, k, r, angle);
            for (let i = 0; i < vs.length; i += 2) if (inside(vs[i], vs[i + 1])) return true;
            return corners.some(([px, py]) => {
                for (let m = 0; m < k; ++m) {
                    let a = angle + PI / k + m * 2 * PI / k;
                    if ((px - x) * cos(a) + (py - y) * sin(a) > apothem) return false;
                }
                return true;
            });
        });
    };
    let hi = sqrt(area / count);
    for (let i = 0; i < 30 && reaching(hi).length > count; ++i) hi *= 1.25;
    for (let lo = hi / 8, i = 0; i < 20; ++i) {
        let mid = (lo + hi) / 2;
        if (reaching(mid).length > count) lo = mid; else hi = mid;
    }
    let r = hi / sqrt(3) - gap / 2 / cos(PI / k);
    return reaching(hi).map(([x, y, angle]) => [r > 0 ? regular(x, y, k, r, angle) : [], [x, y]]);
}

function createShapePoints(props, range) {
    let split = clamp(parseInt(props.points || props.split), range.min, range.max);

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
    let gap = Number(props.gap) || 0;
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

    let polygon = (poly, origin, extra) => {
        let vs = [];
        for (let i = 0; i < poly.length; i += 2) {
            let v = fmt(poly[i], poly[i + 1]);
            if (v !== vs[vs.length - 1]) vs.push(v);
        }
        if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop();
        return new Point(`polygon(${vs.join(', ') || '0 0'})`, extra, origin);
    };

    if (props.scatter) {
        let outline = [];
        for (let i = 0; i < split; ++i) {
            outline.push(point(rad * i, i));
        }
        let screen = outline.map(toScreen), inside = insideTest(screen, evenodd);
        let tile = ([poly, [x, y]]) => polygon(poly, fmt(x, y));
        let sides = { hex: 6, triangle: 3 }[props.tile];
        if (sides) return tiles(sides, box, screen, inside, props.scatter, gap).map(tile);
        let context = Object.assign(Object.create(defaultContext), props);
        let density = isEmpty(props.density) ? null : (x, y) => {
            context.x = x;
            context.y = y;
            return Number(calc(props.density, context)) || 0;
        };
        scatter(outline, props.scatter, evenodd, Number(props.seed) || 0, density).forEach(add);
        if (props.tile == 'delaunay') return delaunay(px, py, box, inside, props.count, gap).map(tile);
        if (props.tile == 'voronoi') return voronoi(px, py, ...box, gap).map(([poly], k) => polygon(poly, points[k].value, points[k].extra));
        return points;
    }

    if (fill == 'nonzero' || fill == 'evenodd') {
        points.push(new Point(fill, ''));
    }

    let first;
    for (let i = 0; i < split; ++i) {
        let p = point(rad * i, i);
        if (!i) first = p;
        add(p);
    }

    // an outline: back to the first point, then the inner ring in reverse
    if (frame !== undefined) {
        add(first);
        let w = frame / 100;
        if (turn > 1) w *= 2;
        if (!w) w = .002;
        let firstInner;
        for (let i = 0; i < split; ++i) {
            let [x, y] = point(-rad * i, i);
            let theta = atan2(y, x);
            let p = [x - w * cos(theta), y - w * sin(theta)];
            if (!i) firstInner = p;
            add(p);
        }
        add(firstInner);
        add(first);
    }

    return points;
}

// The callers memoize: the results are shared and read-only.
export default function generateShape(input, range = {}, modifier) {
    let min = range.min || 3;
    let max = range.max || 3600;
    let [head, more = ''] = input.split(/;([^]*)/);
    let [name, ...args] = parseValueGroup(head);
    let preset = presetShapes[name];
    if (typeof preset === 'function') {
        preset = preset(...args);
    }
    let rules = parseShapeCommands(preset === undefined ? input : preset + ';' + more);
    if (typeof modifier === 'function') {
        rules = modifier(rules, preset !== undefined);
    }
    let points = createShapePoints(rules, {min, max});
    return { rules, points, preset: preset !== undefined };
}
