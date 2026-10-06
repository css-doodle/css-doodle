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
const PHI = (1 + sqrt(5)) / 2;

function ngon(k, inner = cos(PI / k)) {
    let a = PI / k, x = cos(a) - inner, y = sin(a), l = sqrt(x * x + y * y);
    return `r: ${inner * y / l} / cos(abs(abs(t) % ${2 * a} - ${a}) + ${atan2(x, y)})`;
}

function fit(commands) {
    let props = parseShapeCommands(commands), split = parseInt(props.split);
    let point = createPointFunction(props, split), xs = [], ys = [];
    for (let i = 0; i < split; ++i) {
        let [x, y] = point(2 * PI * i / split, i);
        xs.push(x);
        ys.push(y);
    }
    let x0 = min(...xs), x1 = max(...xs), y0 = min(...ys), y1 = max(...ys);
    return `${commands}; move: ${-(x0 + x1) / 2} ${(y0 + y1) / 2}; scale: ${2 / max(x1 - x0, y1 - y0)}`;
}

const presetShapes = {
    __proto__: null,

    square:   css`split: 4; ${ngon(4)}; rotate: 45; scale: 1.42`,
    pentagon: css`split: 5; ${ngon(5)}; rotate: 54`,
    circle:   css`split: 180`,
    hexagon:  css`split: 6; ${ngon(6)}; rotate: 30`,
    octagon:  css`split: 8; ${ngon(8)}; rotate: 22.5`,
    triangle: () => fit(`split: 3; ${ngon(3)}; rotate: 30`),
    bean:     () => fit(`split: 180; r: sin(t)^3 + cos(t)^3`),
    bicorn:   css`split: 180; x: cos(t); y: sin(t)^2 / (2 + sin(t)) - .5`,
    fish:     () => fit(`split: 240; x: cos(t) - sin(t)^2 / sqrt(2); y: sin(2t)/2`),
    infinity: css`split: 180; x: cos(t) / (sin(t)^2 + 1); y: x * sin(t)`,
    drop:     () => fit(`split: 180; rotate: 90; x: sin(t); y: (1 + sin(t)) * cos(t) / 1.6`),
    vase:     css`split: 240; scale: .3; x: sin(4t) + sin(t) * 1.4; y: cos(t) + cos(t) * 4.8 + .3`,
    windmill: css`split: 18; R: seq(.618, 1, 0); T: seq(t-.55, t, t); x: R * cos(T); y: R * sin(T)`,
    heart:    () => fit(`split: 180; a: cos(t)*13/18 - cos(2t)*5/18; b: cos(3t)/18 + cos(4t)/18; x: -.9 * sin(t)^3; y: 1.1 * (a - b)`),
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
        return fit(`split: 240; k: ${k}; x: (k-1)*cos(t) + cos((k-1)*t); y: (k-1)*sin(t) - sin((k-1)*t)`);
    },
    cloud(k = 3) {
        k = clamp(k, 1, 10);
        return fit(`split: 180; k: ${k}; x: (k+1)*cos(t) - cos((k+1)*t); y: (k+1)*sin(t) - sin((k+1)*t); rotate: -90`);
    },
    // |x|^k + |y|^k = 1
    squircle(k = 4) {
        k = clamp(k, .2, 20);
        return css`split: 180; k: ${k}; r: (abs(cos(t))^k + abs(sin(t))^k)^(-1/k)`;
    },
    bud(k = 3) {
        k = clamp(k, 3, 10);
        return fit(`split: 240; r: 1 + .2 * cos(${k}t)`);
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
    if (!(peak > 0)) density = null;
    // quasi-random R2 samples over the box, kept when inside the shape
    for (; n < total && tried < (n ? total * 100 : 1e3); ++tried) {
        let k = tried + seed % 1e4 * 1e4;
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

function lattice(k, box, bounds, s, [a, b] = [0, 0]) {
    let cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    let h = k == 4 ? s : s * sqrt(3) / 2, r = s / sqrt(3), out = [];
    let i0 = floor((bounds[0] - cx) / s) - 2, i1 = ceil((bounds[2] - cx) / s) + 2;
    let j0 = floor((bounds[1] - cy) / h) - 2, j1 = ceil((bounds[3] - cy) / h) + 2;
    let add = (x, y, angle, kind) => out.push([regular(x, y, k, r, angle), [x, y], kind]);
    a -= floor(a), b = a ? 0 : b - floor(b);
    for (let j = j0; j <= j1; ++j) {
        let y = cy + j * h, shift = j & 1 ? k == 4 ? a * s : s / 2 : 0;
        for (let i = i0; i <= i1; ++i) {
            let x = cx + i * s + shift;
            if (k == 4) {
                let m = y + (i & 1) * b * s, f = (j & 1 ? 1 - a : a) % 1 * s, g = (i & 1 ? 1 - b : b) % 1 * s;
                let l = x - s / 2, t = m - s / 2, R = l + s, B = t + s;
                out.push([[R, B, ...f ? [l + f, B] : [], l, B, ...g ? [l, t + g] : [], l, t, ...f ? [l + f, t] : [], R, t, ...g ? [R, t + g] : []], [x, m], 1]);
            }
            else if (k == 6) add(x, y, PI / 6, 1);
            else add(x + s / 2, y + h / 3, -PI / 6, 1), add(x + s, y + h * 2 / 3, PI / 6, 2);
        }
    }
    return out;
}

// P3 rhombs from Robinson triangles; a rhombus is a triangle and its mirror over BC
function penrose(box, bounds, s) {
    let cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    let far = max(...[0, 2].flatMap(i => [1, 3].map(j => Math.hypot(bounds[i] - cx, bounds[j] - cy)))) / cos(PI / 10) + 2 * s;
    let n = max(0, ceil(Math.log(far / s) / Math.log(PHI))), r = s * PHI ** n, tris = [];
    for (let i = 0; i < 10; ++i) {
        let b = (2 * i - 1) * PI / 10, c = (2 * i + 1) * PI / 10;
        if (i & 1) [b, c] = [c, b];
        tris.push([0, cx, cy, cx + r * cos(b), cy + r * sin(b), cx + r * cos(c), cy + r * sin(c)]);
    }
    let at = (ax, ay, bx, by) => [ax + (bx - ax) / PHI, ay + (by - ay) / PHI];
    while (n--) tris = tris.flatMap(([t, ax, ay, bx, by, cx, cy]) => {
        if (!t) {
            let [px, py] = at(ax, ay, bx, by);
            return [[0, cx, cy, px, py, bx, by], [1, px, py, cx, cy, ax, ay]];
        }
        let [qx, qy] = at(bx, by, ax, ay), [rx, ry] = at(bx, by, cx, cy);
        return [[1, rx, ry, cx, cy, ax, ay], [1, qx, qy, rx, ry, bx, by], [0, rx, ry, qx, qy, ax, ay]];
    });
    return tris.filter(([, ax, ay, bx, by, cx, cy]) => (bx - ax) * (cy - ay) > (cx - ax) * (by - ay)).map(([t, ax, ay, bx, by, cx, cy]) => {
        let p = [ax, ay, bx, by, bx + cx - ax, by + cy - ay, cx, cy];
        return [p, centre(p), t + 1];
    });
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

// the smallest pieces of make(s) with no more than `count` reaching into the shape
function tiles(make, box, screen, inside, count, grow = 1) {
    let xs = screen.map(p => p[0]), ys = screen.map(p => p[1]);
    let bounds = [min(...xs), min(...ys), max(...xs), max(...ys)];
    let area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
    if (!(area > 0)) return [];
    let corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].filter(c => inside(c[0], c[1]));
    let reaching = s => make(box, bounds, s).filter(([p, c]) => reaches(grow == 1 ? p : p.map((v, i) => c[i & 1] + (v - c[i & 1]) * grow), c, inside, corners));
    let hi = sqrt(area / count);
    for (let i = 0; i < 30 && reaching(hi).length > count; ++i) hi *= 1.25;
    for (let lo = hi / 8, i = 0; i < 20; ++i) {
        let mid = (lo + hi) / 2;
        if (reaching(mid).length > count) lo = mid; else hi = mid;
    }
    return reaching(hi);
}

function bend(p, [cx, cy], edge, classes, tol, toShape) {
    let out = [];
    for (let i = 0; i < p.length; i += 2) {
        let ax = p[i], ay = p[i + 1], dx = p[(i + 2) % p.length] - ax, dy = p[(i + 3) % p.length] - ay;
        let a = atan2(dy, dx), first = a > -1e-9 && a < PI - 1e-9;
        let g = edge(floor(((a % PI) + PI) % PI / (PI / classes) + .25) % classes + 1, ...toShape(ax + dx / 2, ay + dy / 2));
        let { f, n } = g, idx = g.idx ||= simplify(g, tol);
        let nx = dy, ny = -dx;
        if (nx * (ax - cx) + ny * (ay - cy) < 0) nx = -nx, ny = -ny;
        for (let m = 0; m < idx.length - 1; ++m) {
            let j = first ? idx[m] : n - idx[idx.length - 1 - m], o = first ? f[j] : -f[n - j];
            out.push(ax + dx * j / n + nx * o, ay + dy * j / n + ny * o);
        }
    }
    return out;
}

function inset(p, x, y, d, q = p) {
    let per = 0;
    for (let i = 0; i < p.length; i += 2) {
        per += Math.hypot(p[(i + 2) % p.length] - p[i], p[(i + 3) % p.length] - p[i + 1]);
    }
    let f = 1 - d * per / 2 / area(p);
    return f > 0 ? q.map((v, i) => { let c = i & 1 ? y : x; return c + (v - c) * f; }) : [];
}

function bbox(screen, box) {
    let xs = screen.map(p => p[0]), ys = screen.map(p => p[1]);
    return [max(box[0], min(...xs)), max(box[1], min(...ys)), min(box[2], max(...xs)), min(box[3], max(...ys))];
}

// largest circle first, at most 3x the average; room only shrinks, so a centre is measured again at the top of the heap
function pack(screen, box, inside, count, seed) {
    let [x0, y0, x1, y1] = bbox(screen, box), w = x1 - x0, h = y1 - y0;
    let total = max(4096, 32 * count), xs = [], ys = [], heap = [], key = [], out = [];
    let k = seed % 1e4 * 1e4, start = k;
    for (; xs.length < total && k < start + total * 50; ++k) {
        let u = .5 + k * .7548776662, v = .5 + k * .5698402909;
        let x = x0 + (u - floor(u)) * w, y = y0 + (v - floor(v)) * h;
        if (inside(x, y)) heap.push(xs.length), key.push(Infinity), xs.push(x), ys.push(y);
    }
    let cap = 3 * sqrt(w * h * xs.length / (k - start) / count / PI) || 1;
    let cols = ceil(w / cap) + 1, grid = Array.from({ length: cols * (ceil(h / cap) + 1) }, () => []);
    let edge = [], segs = [];
    screen.forEach(([bx, by], a) => {
        let [ax, ay] = screen.at(a - 1), dx = bx - ax, dy = by - ay;
        segs.push(ax, ay, dx, dy, 1 / (dx * dx + dy * dy) || 0);
    });
    let room = i => {
        let x = xs[i], y = ys[i], r = edge[i];
        if (r === undefined) {
            r = min(cap, x - box[0], box[2] - x, y - box[1], box[3] - y) ** 2;
            for (let a = 0; a < segs.length; a += 5) {
                let ax = x - segs[a], ay = y - segs[a + 1], dx = segs[a + 2], dy = segs[a + 3];
                let t = (ax * dx + ay * dy) * segs[a + 4];
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                r = min(r, (ax - dx * t) ** 2 + (ay - dy * t) ** 2);
            }
            r = edge[i] = sqrt(r);
        }
        let c = (x - x0) / cap | 0, d = (y - y0) / cap | 0;
        for (let j = max(0, d - 2); j <= d + 2; ++j) for (let m = max(0, c - 2); m < min(cols, c + 3); ++m) {
            for (let [cx, cy, cr] of grid[m + cols * j] || []) r = min(r, sqrt((x - cx) ** 2 + (y - cy) ** 2) - cr);
        }
        return r;
    };
    while (out.length < count && heap.length) {
        let i = heap[0], r = key[i] = room(i);
        if (r > 0 && r >= max(key[heap[1]] ?? 0, key[heap[2]] ?? 0)) {
            let x = xs[i], y = ys[i];
            out.push([x, y, r]);
            grid[((x - x0) / cap | 0) + cols * ((y - y0) / cap | 0)].push([x, y, r]);
            r = 0;
        }
        if (!(r > 0)) heap[0] = heap.at(-1), heap.pop();
        for (let a = 0, b; (b = 2 * a + 1) < heap.length; a = b) {
            if (key[heap[b + 1]] > key[heap[b]]) ++b;
            if (key[heap[a]] >= key[heap[b]]) break;
            [heap[a], heap[b]] = [heap[b], heap[a]];
        }
    }
    return out;
}

// a random piece, bigger ones more often, cut across its longer side
function slice(screen, box, inside, count, seed, gap, spread) {
    let [x0, y0, x1, y1] = bbox(screen, box);
    let rnd = seedrandom('slice:' + seed);
    let pieces = [[x0, y0, x1, y0, x1, y1, x0, y1]], areas = pieces.map(area), total = areas[0];
    for (let tries = 0; pieces.length < count && tries < count * 4; ++tries) {
        let sum = 0, pick = rnd() * total, k = 0;
        while (k < pieces.length - 1 && (sum += areas[k]) < pick) ++k;
        let p = pieces[k], [cx, cy] = centre(p);
        let px = p.filter((_, i) => !(i & 1)), py = p.filter((_, i) => i & 1);
        let wide = max(...px) - min(...px) > max(...py) - min(...py);
        let a = (wide ? 0 : PI / 2) + (rnd() - .5) * spread;
        let nx = cos(a), ny = sin(a), shift = (rnd() - .5) * .5 * sqrt(areas[k]);
        let mx = cx + nx * shift, my = cy + ny * shift, g = gap / 2;
        let parts = [
            halfplane(p, nx, ny, mx - nx * g, my - ny * g, [])[0],
            halfplane(p, -nx, -ny, mx + nx * g, my + ny * g, [])[0],
        ].filter(p => p.length && reaches(p, centre(p), inside, screen));
        if (!parts.length) continue;
        let sizes = parts.map(area);
        total += sizes.reduce((a, b) => a + b, 0) - areas[k];
        pieces.splice(k, 1, ...parts);
        areas.splice(k, 1, ...sizes);
    }
    return pieces.map(p => [p, centre(p)]).sort((a, b) => a[1][1] - b[1][1] || a[1][0] - b[1][0]);
}

function area(p) {
    let a = 0;
    for (let i = 0; i < p.length; i += 2) a += p[i] * p[(i + 3) % p.length] - p[(i + 2) % p.length] * p[i + 1];
    return abs(a / 2);
}

function centre(p) {
    let x = 0, y = 0, n = p.length / 2;
    for (let i = 0; i < p.length; i += 2) x += p[i], y += p[i + 1];
    return [x / n, y / n];
}

function reaches(p, [x, y], inside, points) {
    if (inside(x, y)) return true;
    for (let i = 0; i < p.length; i += 2) if (inside(p[i], p[i + 1])) return true;
    return points.some(([px, py]) => contains(p, px, py));
}

function contains(p, x, y) {
    let sign = 0;
    for (let i = 0; i < p.length; i += 2) {
        let j = (i + 2) % p.length;
        let s = (p[j] - p[i]) * (y - p[i + 1]) - (p[j + 1] - p[i + 1]) * (x - p[i]);
        if (s && sign && (s > 0) != (sign > 0)) return false;
        if (s) sign = s;
    }
    return true;
}

function edges(props, odd, seed, n = 256) {
    let context = Object.assign(Object.create(defaultContext), props), cache = {};
    let local = /\b[xy]\b|random/.test(props.edge);
    return (e, x, y) => {
        let key = local ? e + ',' + x.toFixed(4) + ',' + y.toFixed(4) : e;
        if (cache[key]) return cache[key];
        let rnd = seedrandom('edge:' + seed + ':' + key), draws = [], k;
        Object.assign(context, { e, x, y, random: () => k < draws.length ? draws[k++] : (draws[k++] = rnd()) });
        let f = Array.from({ length: n + 1 }, (_, j) => {
            k = 0;
            context.t = context['θ'] = 2 * PI * j / n;
            return Number(calc(props.edge, context)) || 0;
        });
        f = f.map((v, j) => v - f[0] - (f[n] - f[0]) * j / n);
        return cache[key] = { f: odd ? f.map((v, j) => (v - f[n - j]) / 2) : f, n };
    };
}

function simplify({ f, n }, tol) {
    let keep = [0, n], walk = (i, j) => {
        let dx = (j - i) / n, dy = f[j] - f[i], len = Math.hypot(dx, dy), worst = tol, at = 0;
        for (let k = i + 1; k < j; ++k) {
            let e = abs((k - i) / n * dy - (f[k] - f[i]) * dx) / len;
            if (e > worst) worst = e, at = k;
        }
        if (at) walk(i, at), keep.push(at), walk(at, j);
    };
    walk(0, n);
    return keep.sort((a, b) => a - b);
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

    let polygon = (poly, origin, extra, kind = 1) => {
        let vs = [];
        for (let i = 0; i < poly.length; i += 2) {
            let v = fmt(poly[i], poly[i + 1]);
            if (v !== vs[vs.length - 1]) vs.push(v);
        }
        if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop();
        return new Point(`polygon(${vs.join(', ') || '0 0'})`, extra, origin, kind);
    };

    if (props.scatter) {
        let outline = [];
        for (let i = 0; i < split; ++i) {
            outline.push(point(rad * i, i));
        }
        let screen = outline.map(toScreen), inside = insideTest(screen, evenodd);
        let tile = ([poly, [x, y], kind]) => polygon(poly, fmt(x, y), undefined, kind);
        let name = props.tile, count = props.scatter, seed = Number(props.seed) || 0;
        let sides = { hex: 6, triangle: 3, cube: 6, grid: 4 }[name];
        let shift = name == 'grid' && parsePair(props.shift, 0);
        let make = sides ? (box, bounds, s) => lattice(sides, box, bounds, s, shift || undefined) : name == 'penrose' && penrose;
        if (make) {
            let classes = sides == 4 ? 2 : 3, edge = !isEmpty(props.edge) && sides && name != 'cube' && edges(props, sides == 3, seed);
            let probes = [-1, -.5, 0, .5, 1], bulge = 0;
            if (edge) for (let e = 1; e <= classes; ++e) for (let x of probes) for (let y of probes) bulge = max(bulge, ...edge(e, x, y).f.map(abs));
            let grow = edge ? 1 + 2 * Math.tan(PI / sides) * bulge : 1;
            let pieces = tiles(make, box, screen, inside, name == 'cube' ? max(1, count / 3 | 0) : count, grow);
            // top, left, right faces of a hexagon
            if (name == 'cube') pieces = pieces.flatMap(([p, c]) => [6, 2, 10].map((i, face) => {
                let q = [...c, ...[0, 1, 2, 3, 4, 5].map(m => p[(i + m) % 12])];
                return [q, centre(q), face + 1];
            }));
            if (edge && pieces.length) {
                let [p] = pieces[0], tol = (box[2] - box[0]) * 5e-4 / Math.hypot(p[2] - p[0], p[3] - p[1]);
                let toShape = percent ? (x, y) => [x / 50 - 1, 1 - y / 50] : (x, y) => [x, -y];
                return pieces.map(([p, c, kind]) => tile([inset(p, ...c, gap / 2, bend(p, c, edge, classes, tol, toShape)), c, kind]));
            }
            return pieces.map(([p, c, kind]) => tile([inset(p, ...c, gap / 2), c, kind]));
        }
        if (name == 'circle') return pack(screen, box, inside, count, seed).map(([x, y, r]) => {
            r = tidyNumber(max(0, r - gap / 2)) + suffix;
            return new Point(`ellipse(${r} ${r} at ${fmt(x, y)})`, undefined, fmt(x, y), 1);
        });
        if (name == 'slice') return slice(screen, box, inside, count, seed, gap, (Number(props.spread) || 0) * PI / 180).map(tile);
        let context = Object.assign(Object.create(defaultContext), props);
        let density = isEmpty(props.density) ? null : (x, y) => {
            context.x = x;
            context.y = y;
            return Number(calc(props.density, context)) || 0;
        };
        scatter(outline, count, evenodd, seed, density).forEach(add);
        if (name == 'delaunay') return delaunay(px, py, box, inside, props.count, gap).map(tile);
        if (name == 'voronoi') return voronoi(px, py, ...box, gap).map(([poly], k) => polygon(poly, points[k].value, points[k].extra));
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
    if (preset === undefined && range.preset && ['x', 'y', 'r'].every(k => isEmpty(rules[k]))) {
        preset = presetShapes[range.preset];
        rules = parseShapeCommands(preset + ';' + input);
    }
    if (typeof modifier === 'function') {
        rules = modifier(rules, preset !== undefined);
    }
    let points = createShapePoints(rules, {min, max});
    return { rules, points, preset: preset !== undefined };
}
