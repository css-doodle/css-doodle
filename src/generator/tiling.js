import seedrandom from '../lib/seedrandom.js';
import { clamp, map2d } from '../lib/math.js';
import Perlin from '../lib/noise.js';
import { memo } from '../lib/cache.js';
import calc, { defaultContext } from '../core/calc.js';

const { cos, sin, tan, asin, atan2, sqrt, hypot, log, ceil, floor, round, abs, min, max, PI } = Math;

const SCATTER_SAMPLES = 16;
const SCATTER_ROUNDS = 10;
const SCATTER_BANDS = 256;
const PHI = (1 + sqrt(5)) / 2;

const perlinOf = memo(seed => new Perlin(seedrandom('noise:' + seed)));

const mix = ([ax, ay], [bx, by], t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
const dist = (p, q) => hypot(p[0] - q[0], p[1] - q[1]);
const lists = n => Array.from({ length: n }, () => []);
const sum = list => list.reduce((a, b) => a + b, 0);
const turn = (ring, i) => {
    let [ax, ay] = ring.at(i - 1), [px, py] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    let ux = px - ax, uy = py - ay, vx = bx - px, vy = by - py;
    return abs(atan2(ux * vy - uy * vx, ux * vx + uy * vy));
};
// the k-th point of the R2 sequence over the box
const r2 = (k, x0, y0, w, h) => {
    let u = .5 + k * .7548776662, v = .5 + k * .5698402909;
    return [x0 + (u - floor(u)) * w, y0 + (v - floor(v)) * h];
};

function noiseOf(props) {
    let perlin;
    return (t, x, y, octave = 1, scale = 1, from = 0, to = 1, r = 1) => {
        perlin ??= perlinOf(props.seed ?? '');
        let px = x + r * cos(t), py = y + r * sin(t), v = 0;
        for (let i = 0; i < octave; ++i) {
            let m = i ? 2 * i : 1;
            v += perlin.noise(px * m, py * m) * scale / m;
        }
        return map2d(v, from, to, scale);
    };
}

function insideTest(outline, evenodd) {
    let [, y0, , y1] = bounds(outline.flat()), h = y1 - y0;
    let bands = lists(SCATTER_BANDS);
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

function bridge(rings) {
    return rings.length < 2 ? rings[0]
        : [...rings[0], ...rings.slice(1).flatMap(ring => [rings[0][0], ...ring, ring[0]]), rings[0][0]];
}

function overlay(A, B, op, joints) {
    let test = rings => {
        let f = rings.length ? insideTest(bridge(rings), rings.evenodd) : () => 0;
        return rings.positive ? (x, y) => f(x, y) > 0 : f;
    };
    let a = test(A), b = test(B), T = 1e-9, sides = [], from = new Map(), rings = [];
    let result = (x, y) => {
        let p = !!a(x, y), q = !!b(x, y);
        return op == 'subtract' ? p && !q : op == 'intersect' ? p && q : op == 'exclude' ? p != q : p || q;
    };
    [A, B].forEach((rings, k) => rings.forEach(ring => ring.forEach((p, i) => {
        let q = ring[(i + 1) % ring.length];
        if (p[0] != q[0] || p[1] != q[1]) sides.push({ a: p, b: q, x0: min(p[0], q[0]), cuts: [], k });
    })));
    // swept along x: a side meets only the ones starting before it ends
    sides.sort((e, g) => e.x0 - g.x0);
    sides.forEach((e, i) => {
        let [ax, ay] = e.a, [bx, by] = e.b, rx = bx - ax, ry = by - ay, x1 = max(ax, bx), y0 = min(ay, by), y1 = max(ay, by), lr = hypot(rx, ry);
        for (let j = i + 1; j < sides.length && sides[j].x0 <= x1; ++j) {
            let g = sides[j], [cx, cy] = g.a, [dx, dy] = g.b;
            if (max(cy, dy) < y0 || min(cy, dy) > y1) continue;
            let sx = dx - cx, sy = dy - cy, wx = cx - ax, wy = cy - ay, d = rx * sy - ry * sx;
            if (abs(d) > 1e-12 * lr * hypot(sx, sy)) {
                let t = (wx * sy - wy * sx) / d, u = (wx * ry - wy * rx) / d;
                if (t < -T || t > 1 + T || u < -T || u > 1 + T) continue;
                let X = t < T ? e.a : t > 1 - T ? e.b : u < T ? g.a : u > 1 - T ? g.b : mix(e.a, e.b, t);
                if (e.k != g.k) joints.add(X);
                if (t > T && t < 1 - T) e.cuts.push([t, X]);
                if (u > T && u < 1 - T) g.cuts.push([u, X]);
            } else if (abs(wx * ry - wy * rx) < 1e-12 * lr * lr) {
                for (let [h, P] of [[e, g.a], [e, g.b], [g, e.a], [g, e.b]]) {
                    let [hx, hy] = h.a, vx = h.b[0] - hx, vy = h.b[1] - hy;
                    let t = ((P[0] - hx) * vx + (P[1] - hy) * vy) / (vx * vx + vy * vy);
                    if (t > T && t < 1 - T) h.cuts.push([t, P]);
                }
            }
        }
    });
    let key = ([x, y]) => round(x * 1e9) + ',' + round(y * 1e9);
    for (let e of sides) {
        let ps = [e.a, ...e.cuts.sort((p, q) => p[0] - q[0]).map(c => c[1]), e.b], ks = ps.map(key);
        for (let i = 1; i < ps.length; ++i) {
            let p = ps[i - 1], q = ps[i], kp = ks[i - 1], kq = ks[i], dx = q[0] - p[0], dy = q[1] - p[1], len = hypot(dx, dy);
            if (kp == kq) continue;
            let s = min(1e-7, len / 4) / len, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
            let left = result(mx - dy * s, my + dx * s);
            if (left == result(mx + dy * s, my - dx * s)) continue;
            if (!left) [p, q, kp, kq] = [q, p, kq, kp];
            let list = from.get(kp);
            if (!list) from.set(kp, list = []);
            if (!list.some(s => s[3] == kq)) list.push([p, q, kp, kq]);
        }
    }
    for (let list of from.values()) for (let piece of list) {
        let ring = [], cur = piece, start = piece[2];
        while (cur && !cur.used) {
            let [p, q, , kq] = cur, dx = q[0] - p[0], dy = q[1] - p[1], best = -Infinity;
            cur.used = true;
            ring.push(q);
            if (kq == start) break;
            for (let s of from.get(kq) || []) {
                let ex = s[1][0] - s[0][0], ey = s[1][1] - s[0][1], turn = atan2(dx * ey - dy * ex, dx * ex + dy * ey);
                if (!s.used && turn > best) best = turn, cur = s;
            }
        }
        if (ring.length > 2) rings.push(ring);
    }
    return rings;
}

// the region pushed out by d, or in when d < 0, round where it bends away, as rings filled on their left
function offset(rings, d, evenodd) {
    rings = overlay(Object.assign([...rings], { evenodd }), [], 'union', new Set());
    let [x0, y0, x1, y1] = bounds(rings.flat(2));
    // nothing is that far inside
    if (d < 0 && -2 * d >= min(x1 - x0, y1 - y0)) return [];
    if (!d) return rings;
    let tol = .002, raw = rings.map(ring => {
        let out = [];
        ring.forEach((p, i) => {
            let a = ring.at(i - 1), b = ring[(i + 1) % ring.length], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
            let lu = hypot(ux, uy), lv = hypot(vx, vy), n = [uy / lu, -ux / lu], m = [vy / lv, -vx / lv];
            let turn = atan2(ux * vy - uy * vx, ux * vx + uy * vy), at = ([x, y]) => [p[0] + d * x, p[1] + d * y];
            if (turn * d > 0) {
                // an arc around the corner, as a disk rolled along the outline leaves
                let from = atan2(n[1], n[0]), k = min(64, ceil(abs(turn) / sqrt(8 * tol / abs(d))));
                for (let j = 0; j <= k; ++j) out.push(at([cos(from + turn * j / k), sin(from + turn * j / k)]));
            } else if (abs(d) * tan(abs(turn) / 2) < min(lu, lv) / 2) {
                // the moved sides overlap: they meet, and no side turns around
                let k = 1 + n[0] * m[0] + n[1] * m[1];
                out.push(at([(n[0] + m[0]) / k, (n[1] + m[1]) / k]));
            } else {
                // or back through the corner, so what turns around winds the other way and is cut
                out.push(at(n), p, at(m));
            }
        });
        return out;
    });
    return overlay(Object.assign(raw, { positive: true }), [], 'union', new Set()).map(ring => thin(ring, tol / 2));
}

// a ring with its corners (only joints when given) as curves `[x, y, bx, by]` of radius r
function corners(ring, joints, r) {
    let turns = new Set(ring.filter((p, i) => (!joints || joints.has(p)) && turn(ring, i) > .1));
    let j0 = ring.findIndex(p => turns.has(p));
    if (j0 < 0) return ring;
    ring = [...ring.slice(j0), ...ring.slice(0, j0), ring[j0]];
    let s = [0], js = [], out = [];
    for (let i = 1; i < ring.length; ++i) s.push(s[i - 1] + dist(ring[i], ring[i - 1]));
    ring.forEach((p, i) => i < ring.length - 1 && turns.has(p) && js.push(i));
    let L = s.at(-1), gaps = js.map((j, m) => ((m + 1 < js.length ? s[js[m + 1]] : L) - s[j]) / 2);
    let index = d => {
        let i = 1;
        d = (d + L) % L;
        while (i < s.length - 1 && s[i] < d) ++i;
        return [i, d];
    };
    let at = d => {
        let [i, e] = index(d);
        return mix(ring[i - 1], ring[i], (e - s[i - 1]) / (s[i] - s[i - 1] || 1));
    };
    // bend through where the sides' tangents meet, so a curve leaves each side along it
    let control = (j, d) => {
        let p = at(s[j] - d), q = at(s[j] + d), [i] = index(s[j] - d), [k] = index(s[j] + d);
        let ux = ring[i][0] - ring[i - 1][0], uy = ring[i][1] - ring[i - 1][1];
        let vx = ring[k][0] - ring[k - 1][0], vy = ring[k][1] - ring[k - 1][1];
        let den = ux * vy - uy * vx, t = ((q[0] - p[0]) * vy - (q[1] - p[1]) * vx) / den;
        let c = [p[0] + t * ux, p[1] + t * uy];
        return t > 0 && dist(c, ring[j]) > 1e-9 * L && dist(c, ring[j]) < d ? c : ring[j];
    };
    let cuts = js.map((j, m) => {
        let [bx, by] = ring[j], limit = min(gaps[m], gaps.at(m - 1), L / 4), lo = 0, hi = limit;
        // the radius a cut of d gives, exact at once on straight sides
        let curve = d => {
            let [px, py] = at(s[j] - d), [qx, qy] = at(s[j] + d);
            let ux = px - bx, uy = py - by, vx = qx - bx, vy = qy - by;
            return d * tan(abs(atan2(ux * vy - uy * vx, ux * vx + uy * vy)) / 2);
        };
        let d = r * limit / curve(limit);
        if (!(d < limit)) return limit;
        if (abs(curve(d) - r) < 1e-9) return d;
        for (let i = 0; i < 30; ++i) curve((lo + hi) / 2) < r ? lo = (lo + hi) / 2 : hi = (lo + hi) / 2;
        return hi;
    });
    js.forEach((j, m) => {
        out.push(at(s[j] - cuts[m]), [...at(s[j] + cuts[m]), ...control(j, cuts[m])]);
        let end = m + 1 < js.length ? s[js[m + 1]] - cuts[m + 1] : L - cuts[0];
        for (let i = j + 1; i < ring.length - 1 && s[i] < end; ++i) if (s[i] > s[j] + cuts[m]) out.push(ring[i]);
    });
    return out;
}

// only where the outline turns: shapes that just touch keep their outlines
function fillet(ring, joints, r) {
    let path = corners(ring, joints, r), out = [];
    if (path === ring) return ring;
    let f = flatten(path, .002);
    for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
    return out;
}

function resample(rings, counts) {
    let sides = rings.map(ring => ring.map((p, i) => dist(ring[(i + 1) % ring.length], p)));
    let lens = sides.map(sum), total = sum(lens), run = 0, done = 0;
    return rings.map((ring, k) => {
        let m = counts.length > 1 ? counts[k % counts.length] : round(counts[0] * (run += lens[k]) / total) - done, out = [];
        done += m;
        for (let j = 0, i = 0, s = 0; j < m; ++j) {
            let d = j * lens[k] / m;
            while (s + sides[k][i] < d) s += sides[k][i++];
            out.push(mix(ring[i], ring[(i + 1) % ring.length], (d - s) / (sides[k][i] || 1)));
        }
        return out;
    }).filter(ring => ring.length);
}

// rings with n points between them, by length, corners kept: the longest sides split, the shortest
// folded into where the sides next to them meet, so an arc folds into the corner of its sides
function recount(rings, n) {
    let lens = rings.map(ring => sum(ring.map((p, i) => dist(p, ring.at(i - 1))))), total = sum(lens), run = 0, done = 0;
    return rings.map((ring, k) => {
        let m = max(3, round(n * (run += lens[k]) / total) - done), at = i => ring[(i + ring.length) % ring.length];
        let side = i => dist(at(i), at(i + 1)), pick = better => ring.reduce((j, p, i) => better(side(i), side(j)) ? i : j, 0);
        done += m;
        ring = [...ring];
        while (ring.length < m) {
            let i = pick((a, b) => a > b);
            ring.splice(i + 1, 0, mix(at(i), at(i + 1), .5));
        }
        while (ring.length > m) {
            let i = pick((a, b) => a < b), j = (i + 1) % ring.length, [a, p, q, b] = [at(i - 1), ring[i], ring[j], at(i + 2)];
            let ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - q[0], vy = b[1] - q[1];
            let t = ((q[0] - a[0]) * vy - (q[1] - a[1]) * vx) / (ux * vy - uy * vx), x = [a[0] + t * ux, a[1] + t * uy];
            ring[i] = t >= 1 && dist(x, p) + dist(x, q) < dist(a, p) + dist(q, b) ? x : mix(p, q, .5);
            ring.splice(j, 1);
        }
        return ring;
    });
}

function scatter(outline, count, evenodd, seed, density, rounds = SCATTER_ROUNDS) {
    let [x0, y0, x1, y1] = bounds(outline.flat()), w = x1 - x0, h = y1 - y0;
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
        let [x, y] = r2(tried + seed % 1e4 * 1e4, x0, y0, w, h);
        if (!inside(x, y) || density && density(x, y) < peak * rnd()) continue;
        sx[n] = x, sy[n++] = y;
    }
    let m = min(count, n);
    if (!rounds) for (let i = 0, rnd = seedrandom('relax:' + seed); i < m; ++i) {
        let j = i + (rnd() * (n - i) | 0);
        [sx[i], sx[j], sy[i], sy[j]] = [sx[j], sx[i], sy[j], sy[i]];
    }
    let px = sx.slice(0, m), py = sy.slice(0, m);
    let size = sqrt(w * h * n / tried / count) || 1;
    let cols = ceil(w / size) || 1, rows = ceil(h / size) || 1;
    let col = x => min(cols - 1, (x - x0) / size | 0);
    let row = y => min(rows - 1, (y - y0) / size | 0);
    let head = new Int32Array(cols * rows), next = new Int32Array(m);
    let sums = new Float64Array(m * 3);
    for (let r = 0; r < rounds; ++r) {
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
            if (!poly.length || reach > 0 && reach * reach / 4 > limit) break;
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

function mosaic(screen, box, count, evenodd, seed, density, relax, ratio, angle, crack, gap, fine) {
    let [x0, y0, x1, y1] = box, ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
    let c = cos(angle), s = sin(angle), a = sqrt(ratio);
    let warp = (x, y, k = a) => {
        let u = ((x - ox) * c + (y - oy) * s) * k, v = ((y - oy) * c - (x - ox) * s) / k;
        return [ox + u * c - v * s, oy + u * s + v * c];
    };
    let back = (p, k) => {
        let q = [];
        for (let i = 0; i < p.length; i += 2) q.push(...warp(p[i], p[i + 1], k));
        return q;
    };
    let corners = [x0, y0, x1, y0, x1, y1, x0, y1];
    let [l, t, r, b] = bounds(back(corners, 1 / a));
    let pad = (r - l + b - t) / 4, qbox = [l - pad, t - pad, r + pad, b + pad];
    let seeds = scatter(screen.map(p => warp(...p, 1 / a)), count, evenodd, seed, density && ((x, y) => density(...warp(x, y))), relax);
    let n = seeds.length, m = crack > 1 ? max(1, round(n / crack)) : n;
    let rnd = seedrandom('crack:' + seed), order = seeds.map((_, i) => i), parents = [];
    for (let i = 0; i < n; ++i) {
        let j = i + (rnd() * (n - i) | 0);
        [order[i], order[j]] = [order[j], order[i]];
    }
    let reach = relax === 0 || m == n ? 0 : .7 * sqrt(area(screen.flat()) / m);
    if (!reach) parents = order.slice(0, m);
    for (let pass = 0; pass < 2 && parents.length < m; ++pass) for (let i of order) {
        if (parents.length < m && !parents.includes(i) && (pass || parents.every(j => dist(seeds[i], seeds[j]) >= reach))) parents.push(i);
    }
    let px = parents.map(i => seeds[i][0]), py = parents.map(i => seeds[i][1]);
    let cells = voronoi(px, py, ...qbox, 0), kinds = colors(cells);
    let cut = (p, d, outer) => {
        p = back(p);
        return clip(d ? clip(p, p, d) : p, outer);
    };
    if (m == n) return cells.map(([q], k) => [cut(q, gap / 2, corners), warp(px[k], py[k]), kinds[k]]);
    let groups = cells.map(() => []);
    seeds.forEach(([x, y]) => {
        let near = 0, best = Infinity;
        for (let k = 0; k < m; ++k) {
            let d = (x - px[k]) ** 2 + (y - py[k]) ** 2;
            if (d < best) best = d, near = k;
        }
        groups[near].push([x, y]);
    });
    return cells.flatMap(([q], i) => {
        let outer = cut(q, gap / 2, corners), g = groups[i];
        return voronoi(g.map(p => p[0]), g.map(p => p[1]), ...bounds(q), 0).map(([p], k) => [cut(clip(p, q), fine / 2, outer), warp(...g[k]), kinds[i]]);
    });
}

function colors(cells) {
    let kinds = [];
    cells.forEach(([, ids], k) => {
        let kind = 1;
        while (ids.some(q => kinds[q] == kind)) ++kind;
        kinds[k] = kind;
    });
    return kinds;
}

function clip(p, outer, d = 0) {
    for (let i = 0, n = outer.length; i < n && p.length; i += 2) {
        let dx = outer[(i + 2) % n] - outer[i], dy = outer[(i + 3) % n] - outer[i + 1], l = hypot(dx, dy) || 1;
        let nx = dy / l, ny = -dx / l;
        p = halfplane(p, nx, ny, outer[i] - nx * d, outer[i + 1] - ny * d, [])[0];
    }
    return p;
}

function flatten(path, tol) {
    let out = [];
    path.forEach(([x, y, bx, by], i) => {
        if (bx === undefined) return out.push(x, y);
        let [ax, ay] = path[i - 1];
        for (let j = 1, k = min(ceil(sqrt(hypot(ax - 2 * bx + x, ay - 2 * by + y) / 4 / tol)), 64); j <= k; ++j) {
            let t = j / k, u = 1 - t;
            out.push(u * u * ax + 2 * u * t * bx + t * t * x, u * u * ay + 2 * u * t * by + t * t * y);
        }
    });
    return out;
}

// Douglas–Peucker: the indexes from 0 to n that keep every other k within tol, by error(i, j)(k)
function keepers(n, error, tol) {
    let keep = [0], walk = (i, j) => {
        let worst = tol, at = 0, of = error(i, j);
        for (let k = i + 1; k < j; ++k) {
            let e = of(k);
            if (e > worst) worst = e, at = k;
        }
        if (at) walk(i, at), walk(at, j);
        else keep.push(j);
    };
    walk(0, n);
    return keep;
}

function thin(p, tol) {
    let n = p.length, keep = keepers(n, (i, j) => {
        let [ax, ay] = p[i], [bx, by] = p[j % n], dx = bx - ax, dy = by - ay, len = hypot(dx, dy);
        return k => {
            let x = p[k][0] - ax, y = p[k][1] - ay;
            return len ? abs(x * dy - y * dx) / len : hypot(x, y);
        };
    }, tol);
    keep.pop();
    return keep.length > 2 ? keep.map(i => p[i]) : p;
}

function wave(ps, f, tol) {
    let sides = ps.map(([x, y], i) => [x, y, ...ps[(i + 1) % ps.length]]), len = 0, s = 0, a = 0, q = [];
    for (let [x, y, ex, ey] of sides) len += hypot(ex - x, ey - y);
    if (!(len > 0 && len < Infinity)) return ps;
    for (let [x, y, ex, ey] of sides) {
        let l = hypot(ex - x, ey - y);
        for (let j = 0, k = ceil(l / len * 1024 - 1e-9); j < k; ++j) {
            q.push([x + (ex - x) * j / k, y + (ey - y) * j / k, 2 * PI * (s + l * j / k) / len]);
        }
        s += l;
        a += x * ey - ex * y;
    }
    let f0 = f(0), drift = (f(2 * PI) - f0) / 2 / PI;
    return thin(q.map(([x, y, t], i) => {
        let [px, py] = q.at(i - 1), [nx, ny] = q[(i + 1) % q.length];
        let v = (f(t) - drift * t) / (hypot(nx - px, ny - py) || 1) * (a < 0 ? -1 : 1);
        return [x + (ny - py) * v, y - (nx - px) * v];
    }), tol);
}

function lattice(k, box, bounds, s, [a, b], turn, half) {
    let [cx, cy] = centre(box);
    if (half) cx += s / 2, cy += k == 4 ? s / 2 : 0;
    let h = k == 4 ? s : s * sqrt(3) / 2, r = s / sqrt(3), out = [];
    let i0 = floor((bounds[0] - cx) / s) - 2, i1 = ceil((bounds[2] - cx) / s) + 2;
    let j0 = floor((bounds[1] - cy) / h) - 2, j1 = ceil((bounds[3] - cy) / h) + 2;
    let add = (x, y, angle, kind, marks) => {
        let p = [];
        for (let m = 0; m < k; ++m) {
            let a = angle + m * 2 * PI / k;
            p.push(x + r * cos(a), y + r * sin(a));
        }
        out.push([p, [x, y], kind, marks]);
    };
    let mod = (v, m) => (v % m + m) % m;
    a -= floor(a), b = a ? 0 : b - floor(b);
    for (let j = j0; j <= j1; ++j) {
        let y = cy + j * h, shift = j & 1 ? k == 4 ? a * s : s / 2 : 0;
        for (let i = i0; i <= i1; ++i) {
            let x = cx + i * s + shift;
            if (k == 4) {
                let m = y + (i & 1) * b * s, f = (j & 1 ? 1 - a : a) % 1 * s, g = (i & 1 ? 1 - b : b) % 1 * s;
                let l = x - s / 2, t = m - s / 2, R = l + s, B = t + s;
                let p = [R, B, ...f ? [l + f, B] : [], l, B, ...g ? [l, t + g] : [], l, t, ...f ? [l + f, t] : [], R, t, ...g ? [R, t + g] : []];
                if (turn && !a && !b) {
                    let mk = (u, v) => (u + v) & 1 ? 0 : (u & 1) + 1;
                    out.push([p, [x, m], 1 + (2 * (i & 1) + 3 * ((i + j) & 1)) % 4, [mk(i + 1, j + 1), mk(i, j + 1), mk(i, j), mk(i + 1, j)]]);
                }
                else out.push([p, [x, m], 1]);
            }
            else if (k == 6 && turn) {
                let c = mod(i - (j >> 1) - j, 3);
                add(x, y, PI / 6, c + 1, [mod(c - 1, 3) + 1, 0, mod(c - 2, 3) + 1, 0, c + 1, 0]);
            }
            else if (k == 6) add(x, y, PI / 6, 1);
            else add(x + s / 2, y + h / 3, -PI / 6, 1), add(x + s, y + h * 2 / 3, PI / 6, 2);
        }
    }
    return out;
}

// P3 rhombs from Robinson triangles; a rhombus is a triangle and its mirror over BC
function penrose(box, bounds, s) {
    let [cx, cy] = centre(box);
    let far = hypot(max(cx - bounds[0], bounds[2] - cx), max(cy - bounds[1], bounds[3] - cy)) / cos(PI / 10) + 2 * s;
    let n = max(0, ceil(log(far / s) / log(PHI))), r = s * PHI ** n, tris = [];
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

function conway(op, star, pre) {
    let letters = [...String(op ?? '').replace(/[^abdegjkmost]/g, '').replace(/[gjmo]/g, c => ({ g: 'ds', j: 'da', m: 'kda', o: 'de' })[c])].reverse();
    star = parseFloat(star);
    if (star > 0 && star < 90) letters.push('*');
    let fn = pieces => {
        if (pre) pieces = pre(pieces);
        for (let letter of letters) pieces = derive(pieces, letter, star * PI / 180);
        return pieces;
    };
    return { rim: letters.length + 1, fn };
}

function derive(pieces, letter, angle) {
    let eps = sqrt(area(pieces[0]?.[0] || [])) * 1e-7 || 1e-9, ids = new Map(), V = [], F = [], top = 0;
    for (let [p, c, kind = 1] of pieces) {
        let f = [];
        for (let i = 0; i < p.length; i += 2) {
            let key = round(p[i] / eps) + ' ' + round(p[i + 1] / eps), v = ids.get(key);
            if (v === undefined) ids.set(key, v = V.length), V.push([p[i], p[i + 1]]);
            if (v !== f.at(-1)) f.push(v);
        }
        if (f[0] === f.at(-1)) f.pop();
        if (f.length > 2) F.push([signed(p) < 0 ? f.reverse() : f, c, kind]), top = max(top, kind);
    }
    let n = V.length, half = new Map(), first = [], out = [];
    F.forEach(([f], k) => f.forEach((v, i) => {
        half.set(v * n + f[(i + 1) % f.length], [k, i]);
        first[v] ??= [k, i];
    }));
    let id = (k, i) => F[k][0].at(i % F[k][0].length), at = (k, i) => V[id(k, i)];
    let rings = first.map(([k, i], v) => {
        let ring = [], k0 = k;
        do {
            ring.push([k, i]);
            [k, i] = half.get(id(k, i + 1) * n + v) || [];
            if (k === undefined) return;
            ++i;
        } while (k != k0);
        return ring;
    });
    let emit = (ps, kind) => out.push([ps.flat(2), kind]);
    if (letter == 'd') rings.forEach(ring => ring && emit(ring.map(([k]) => F[k][1]), 1));
    else if (letter == 'k') F.forEach(([f, c, kind], k) => f.forEach((v, i) => emit([c, at(k, i), at(k, i + 1)], kind)));
    else {
        let pair = (k, i) => {
            let [cx, cy] = F[k][1], b = PI / F[k][0].length, T = tan(b) ** 2, x = 1 / (2 + 2 * cos(b)), a = 0, r, w = at(k, i);
            if (letter == 'a') return [w = mix(w, at(k, i + 1), .5), w];
            if (letter == 't') return [-1, 1].map(d => mix(w, at(k, i + d), 1 / (2 + 2 * sin(PI / (rings[id(k, i)]?.length || 3)))));
            if (letter == '*') {
                let ex = cx - w[0], ey = cy - w[1], l = 0;
                for (let d of [-1, 1]) {
                    let [ux, uy] = at(k, i + d), dx = w[0] - ux, dy = w[1] - uy, h = hypot(dx, dy), cs = cos(angle) / h, sn = -d * sin(angle) / h;
                    let rx = cs * dx - sn * dy, ry = cs * dy + sn * dx, det = rx * ey - ex * ry;
                    let t = det && (ry * dx - rx * dy) / 2 / det, s = det && (ey * dx - ex * dy) / 2 / det;
                    l += t > 0 && t < 1 && s > 0 ? t / 2 : .5;
                }
                return [mix(w, [cx, cy], l), mix(w, at(k, i + 1), .5)];
            }
            if (letter == 's') r = sqrt((1 + T - sqrt(3 * T)) / (1 - T + T * T)), a = asin(r * tan(b) / 2);
            else r = 1 / (1 + tan(b) * (letter == 'b' ? 1 - 2 * x : 1));
            let turn = j => { let [px, py] = at(k, j); px -= cx, py -= cy; return [cx + (px * cos(a) - py * sin(a)) * r, cy + (px * sin(a) + py * cos(a)) * r]; };
            return letter == 'b' ? [mix(turn(i), turn(i - 1), x), mix(turn(i), turn(i + 1), x)] : [w = turn(i), w];
        };
        F.forEach(([f, , kind], k) => emit(f.map((v, i) => pair(k, i)), kind));
        rings.forEach(ring => ring && emit(ring.map(([k, i]) => pair(k, i)), top + 1));
        if ('esb'.includes(letter)) F.forEach(([f], k) => f.forEach((u, i) => {
            let [g, j] = half.get(f[(i + 1) % f.length] * n + u) || [];
            if (g < k) {
                let [a, b, c, d] = [pair(k, i)[1], pair(k, i + 1)[0], pair(g, j)[1], pair(g, j + 1)[0]];
                if (letter != 's') emit([a, b, c, d], top + 2);
                else if (dist(a, c) < dist(b, d)) emit([a, b, c], top + 2), emit([a, c, d], top + 2);
                else emit([a, b, d], top + 2), emit([b, c, d], top + 2);
            }
        }));
    }
    return out.map(([p, kind]) => [p, centre(p), kind]);
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
    let keep = sorted[sorted.length >> 1] * 9, edge = (p, q) => min(p, q) + ' ' + max(p, q);
    for (let drop = 1; drop;) {
        let uses = {};
        for (let [k, a, b] of tris) for (let e of [edge(k, a), edge(a, b), edge(b, k)]) uses[e] = (uses[e] || 0) + 1;
        let outer = tris.filter(([k, a, b]) => uses[edge(k, a)] < 2 || uses[edge(a, b)] < 2 || uses[edge(b, k)] < 2);
        drop = outer.filter(t => r2(t) > keep);
        if (!drop.length) drop = outer.sort((u, v) => r2(v) - r2(u)).slice(0, max(0, tris.length - count));
        tris = tris.filter(t => !drop.includes(t));
        drop = drop.length;
    }
    return tris.map(([k, a, b, cx, cy]) => {
        let tri = [px[k], py[k], px[a], py[a], px[b], py[b]];
        if (gap) {
            let la = sqrt(d(a, b)), lb = sqrt(d(b, k)), lc = sqrt(d(k, a)), per = la + lb + lc;
            tri = inset(tri, (la * px[k] + lb * px[a] + lc * px[b]) / per, (la * py[k] + lb * py[a] + lc * py[b]) / per, gap / 2);
        }
        return [tri, [cx, cy]];
    });
}

function border(rings, count) {
    let len = sum(rings.map(ring => sum(ring.map((p, i) => dist(p, ring.at(i - 1)))))), a = area(bridge(rings).flat());
    let s = (len * sqrt(3) / 4 + sqrt(len * len * 3 / 16 + 2 * sqrt(3) * count * a)) / (sqrt(3) * count);
    let rim = [], sharp = rings.flatMap(ring => ring.filter((p, i) => turn(ring, i) > .5));
    for (let p of sharp.concat(resample(rings, [round(len / s)]).flat())) if (rim.length < count - 1 && rim.every(q => dist(p, q) > s / 2)) rim.push(p);
    return rim;
}

function reacher(box, inside, grow, derived) {
    let corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].filter(c => inside(...c));
    let crosses = p => {
        for (let i = 0; i < p.length; i += 2) {
            let ax = p[i], ay = p[i + 1], dx = p[(i + 2) % p.length] - ax, dy = p[(i + 3) % p.length] - ay, t0 = 0, t1 = 1;
            let clip = (d, q) => d < 0 ? t0 = max(t0, q / d) : d > 0 ? t1 = min(t1, q / d) : q < 0 && (t1 = -1);
            clip(-dx, ax - box[0]), clip(dx, box[2] - ax), clip(-dy, ay - box[1]), clip(dy, box[3] - ay);
            if (t0 < t1 && inside(ax + dx * (t0 + t1) / 2, ay + dy * (t0 + t1) / 2)) return true;
        }
    };
    return ([p, c]) => reaches(grow == 1 ? p : scale(p, c, grow), c, inside, corners) || derived && crosses(p);
}

function tiles(make, box, screen, inside, count, grow, derive, half) {
    let [x0, y0, x1, y1] = bbox(screen, [2 * box[0] - box[2], 2 * box[1] - box[3], 2 * box[2] - box[0], 2 * box[3] - box[1]]), area = (x1 - x0) * (y1 - y0);
    if (!(area > 0)) return [];
    let keep = pieces => pieces.filter(reacher(box, inside, grow, derive));
    let reaching = (s, half) => keep(make(box, [x0, y0, x1, y1], s, half));
    let hi = sqrt(area / count), fit = (size, hi, lo) => {
        for (let i = 0; i < 30 && size(hi).length > count; ++i) hi *= 1.25;
        lo ??= hi / 8;
        for (let i = 0; i < 20; ++i) {
            let mid = (lo + hi) / 2;
            if (size(mid).length > count) lo = mid; else hi = mid;
        }
        return size(hi);
    };
    if (!derive) {
        let best = fit(reaching, hi), other = half && fit(s => reaching(s, 1), hi), fill = p => p.length > count ? 0 : p.length;
        return other && fill(other) > fill(best) ? other : best;
    }
    let o = centre(box), [cx, cy] = o, { rim, fn } = derive, d = (rim + 3) * hi;
    let near = ps => ps.filter(([, [x, y]]) => abs(x - cx) < 2 * hi && abs(y - cy) < 2 * hi).length;
    let probe = make(box, [cx - d, cy - d, cx + d, cy + d], hi);
    let s = hi * sqrt(near(fn(probe)) / near(probe) * reaching(hi).length / count || 1) / 1.25;
    let [u0, v0, u1, v1] = [min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)];
    let pieces = fn(make(box, [x0 - rim * s, y0 - rim * s, x1 + rim * s, y1 + rim * s], s)).filter(([p]) => {
        let [a, b, c, d] = bounds(p);
        return a < u1 && c > u0 && b < v1 && d > v0;
    });
    return fit(t => keep(pieces.map(([p, c, kind]) => [scale(p, o, t / s), scale(c, o, t / s), kind])), s, s);
}

function shake(pieces, n, seed) {
    let d = n * sqrt(pieces.reduce((s, [p]) => s + area(p), 0) / pieces.length), moved = {};
    return pieces.map(([p, , kind]) => {
        let q = [];
        for (let i = 0; i < p.length; i += 2) {
            let key = round(p[i] * 1e6) + ',' + round(p[i + 1] * 1e6);
            if (!moved[key]) {
                let rnd = seedrandom('jitter:' + seed + ':' + key), a = 2 * PI * rnd(), r = d * sqrt(rnd());
                moved[key] = [r * cos(a), r * sin(a)];
            }
            q.push(p[i] + moved[key][0], p[i + 1] + moved[key][1]);
        }
        return [q, centre(q), kind];
    });
}

function bend(p, [cx, cy], edge, classes, tol, toShape, marks) {
    let out = [];
    for (let i = 0; i < p.length; i += 2) {
        let ax = p[i], ay = p[i + 1], dx = p[(i + 2) % p.length] - ax, dy = p[(i + 3) % p.length] - ay;
        let a = atan2(dy, dx), first = a > -1e-9 && a < PI - 1e-9, e;
        if (marks) e = marks[i / 2] || marks[(i / 2 + 1) % marks.length], first = !!marks[i / 2];
        else e = floor(((a % PI) + PI) % PI / (PI / classes) + .25) % classes + 1;
        let table = edge(e, ...toShape(ax + dx / 2, ay + dy / 2));
        let { f, g, n } = table, idx = table.idx ||= simplify(table, tol);
        let nx = dy, ny = -dx;
        if (!marks && nx * (ax - cx) + ny * (ay - cy) < 0) nx = -nx, ny = -ny;
        for (let m = 0; m < idx.length - 1; ++m) {
            let j = first ? idx[m] : n - idx[idx.length - 1 - m], o = first ? f[j] : -f[n - j], u = j / n + (first ? g[j] : -g[n - j]);
            out.push(ax + dx * u + nx * o, ay + dy * u + ny * o);
        }
    }
    return out;
}

function inset(p, x, y, d, q = p) {
    let per = 0;
    for (let i = 0; i < p.length; i += 2) {
        per += hypot(p[(i + 2) % p.length] - p[i], p[(i + 3) % p.length] - p[i + 1]);
    }
    let f = 1 - d * per / 2 / area(p);
    return f > 0 ? scale(q, [x, y], f) : [];
}

function scale(p, o, f) {
    return p.map((v, i) => o[i & 1] + (v - o[i & 1]) * f);
}

function bounds(p) {
    let xs = p.filter((_, i) => !(i & 1)), ys = p.filter((_, i) => i & 1);
    return [min(...xs), min(...ys), max(...xs), max(...ys)];
}

function bbox(screen, box) {
    let [x0, y0, x1, y1] = bounds(screen.flat());
    return [max(box[0], x0), max(box[1], y0), min(box[2], x1), min(box[3], y1)];
}

// the circles keep clear of every contour, given apart so the bridges between them are no walls
function pack(rings, box, inside, count, seed, size) {
    let [x0, y0, x1, y1] = bbox(rings.flat(), box), w = x1 - x0, h = y1 - y0;
    let total = max(4096, 32 * count), xs = [], ys = [], heap = [], key = [], out = [];
    let k = seed % 1e4 * 1e4, start = k;
    for (; xs.length < total && k < start + total * 50; ++k) {
        let [x, y] = r2(k, x0, y0, w, h);
        if (inside(x, y)) heap.push(xs.length), key.push(Infinity), xs.push(x), ys.push(y);
    }
    let avg = sqrt(w * h * xs.length / (k - start) / count / PI) || 1;
    let caps = xs.map((x, i) => avg * size(x, ys[i])), cap = caps.reduce((a, b) => max(a, b), 0);
    if (!(cap > 0)) return out;
    cap = max(cap, avg);
    let cols = ceil(w / cap) + 1, rows = ceil(h / cap) + 1, sides = lists(cols * rows);
    let edge = [], segs = [], cell = (v, o) => floor((v - o) / cap);
    let span = 3 * avg, gx = ceil(w / span) + 1, gy = ceil(h / span) + 1, grid = lists(gx * gy);
    let slot = (v, o, n) => clamp(floor((v - o) / span), 0, n - 1);
    let under = (x, y, r, fn) => {
        for (let j = slot(y - r, y0, gy), j1 = slot(y + r, y0, gy); j <= j1; ++j) {
            for (let m = slot(x - r, x0, gx), m1 = slot(x + r, x0, gx); m <= m1; ++m) fn(grid[m + gx * j]);
        }
    };
    for (let ring of rings) ring.forEach(([bx, by], a) => {
        let [ax, ay] = ring.at(a - 1), dx = bx - ax, dy = by - ay;
        for (let j = max(0, cell(min(ay, by), y0) - 2); j <= min(rows - 1, cell(max(ay, by), y0) + 2); ++j) {
            for (let m = max(0, cell(min(ax, bx), x0) - 2); m <= min(cols - 1, cell(max(ax, bx), x0) + 2); ++m) sides[m + cols * j].push(segs.length);
        }
        segs.push(ax, ay, dx, dy, 1 / (dx * dx + dy * dy || Infinity));
    });
    let room = i => {
        let x = xs[i], y = ys[i], r = edge[i];
        if (r === undefined) {
            r = max(0, min(caps[i], x - box[0], box[2] - x, y - box[1], box[3] - y)) ** 2;
            for (let a of sides[cell(x, x0) + cols * cell(y, y0)]) {
                let ax = x - segs[a], ay = y - segs[a + 1], dx = segs[a + 2], dy = segs[a + 3];
                let t = (ax * dx + ay * dy) * segs[a + 4];
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                r = min(r, (ax - dx * t) ** 2 + (ay - dy * t) ** 2);
            }
            r = edge[i] = sqrt(r);
        }
        under(x, y, r, circles => {
            if (r > 0) for (let [cx, cy, cr] of circles) r = min(r, sqrt((x - cx) ** 2 + (y - cy) ** 2) - cr);
        });
        return r;
    };
    while (out.length < count && heap.length) {
        let i = heap[0], r = key[i] = room(i);
        if (r > 0 && r >= max(key[heap[1]] ?? 0, key[heap[2]] ?? 0)) {
            let x = xs[i], y = ys[i];
            out.push([x, y, r]);
            under(x, y, r, circles => circles.push([x, y, r]));
            r = 0;
        }
        if (!(r > 0)) heap[0] = heap.at(-1), heap.pop();
        for (let a = 0, b; (b = 2 * a + 1) < heap.length; a = b) {
            if (b + 1 < heap.length && key[heap[b + 1]] > key[heap[b]]) ++b;
            if (key[heap[a]] >= key[heap[b]]) break;
            [heap[a], heap[b]] = [heap[b], heap[a]];
        }
    }
    return out;
}

function slice(screen, box, inside, count, seed, gap, spread, density) {
    let [x0, y0, x1, y1] = bbox(screen, box);
    let rnd = seedrandom('slice:' + seed);
    let N = 64, w = (x1 - x0) / N, h = (y1 - y0) / N;
    let grid = density && Array.from({ length: N * N }, (_, i) => max(0, density(x0 + (i % N + .5) * w, y0 + ((i / N | 0) + .5) * h)));
    let weight = p => {
        if (!density) return area(p);
        let [l, t, r, b] = bounds(p), acc = 0, n = 0;
        for (let j = max(0, ceil((t - y0) / h - .5)); j <= min(N - 1, (b - y0) / h - .5); ++j) {
            for (let i = max(0, ceil((l - x0) / w - .5)); i <= min(N - 1, (r - x0) / w - .5); ++i) {
                if (contains(p, x0 + (i + .5) * w, y0 + (j + .5) * h)) acc += grid[i + N * j], ++n;
            }
        }
        return area(p) * (n ? acc / n : max(0, density(...centre(p))));
    };
    let pieces = [[x0, y0, x1, y0, x1, y1, x0, y1]], weights = pieces.map(weight), total = weights[0];
    for (let tries = 0; pieces.length < count && tries < count * 4 && total > 0; ++tries) {
        let run = 0, pick = rnd() * total, k = 0;
        while (k < pieces.length - 1 && (run += weights[k]) < pick) ++k;
        let p = pieces[k], [cx, cy] = centre(p);
        let [l, t, r, b] = bounds(p);
        let a = (r - l > b - t ? 0 : PI / 2) + (rnd() - .5) * spread;
        let nx = cos(a), ny = sin(a), shift = (rnd() - .5) * .5 * sqrt(area(p));
        let mx = cx + nx * shift, my = cy + ny * shift, g = gap / 2;
        let parts = [1, -1].map(d => halfplane(p, d * nx, d * ny, mx - d * nx * g, my - d * ny * g, [])[0])
            .filter(p => p.length && reaches(p, centre(p), inside, screen));
        if (!parts.length) continue;
        let sizes = parts.map(weight);
        total += sum(sizes) - weights[k];
        pieces.splice(k, 1, ...parts);
        weights.splice(k, 1, ...sizes);
    }
    return pieces.map(p => [p, centre(p)]).sort((a, b) => a[1][1] - b[1][1] || a[1][0] - b[1][0]);
}

// twice the signed area: negative when the polygon runs clockwise
function signed(p) {
    let a = 0;
    for (let i = 0; i < p.length; i += 2) a += p[i] * p[(i + 3) % p.length] - p[(i + 2) % p.length] * p[i + 1];
    return a;
}

function area(p) {
    return abs(signed(p) / 2);
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
    let noise = noiseOf(props);
    let context = Object.assign(Object.create(defaultContext), {
        noise: (t, a, b, octave, scale, from, to, r = 1) =>
            noise(t, a + context.x * r / 2, b + context.y * r / 2, octave, scale, from, to, r)
    }, props), cache = {};
    let seen = new Set(['edge', 'slide', 'e', 't']);
    let reads = text => /\b[xy]\b|random|noise/.test(text) || (String(text).match(/[\w$-]+/g) || []).some(name =>
        !seen.has(name) && Object.hasOwn(props, name) && seen.add(name) && reads(props[name]));
    let local = reads(props.edge) || reads(props.slide || '');
    return (e, x, y) => {
        let key = local ? e + ',' + x.toFixed(4) + ',' + y.toFixed(4) : e;
        if (cache[key]) return cache[key];
        let rnd = seedrandom('edge:' + seed + ':' + key), draws = [], k;
        Object.assign(context, { e, x, y, random: () => draws[k++] ??= rnd() });
        let table = text => {
            let f = [];
            for (let j = 0; j <= n; ++j) {
                k = 0;
                context.t = context['θ'] = 2 * PI * j / n;
                f.push(text ? Number(calc(text, context)) || 0 : 0);
            }
            f = f.map((v, j) => v - f[0] - (f[n] - f[0]) * j / n);
            return odd ? f.map((v, j) => (v - f[n - j]) / 2) : f;
        };
        return cache[key] = { f: table(props.edge), g: table(props.slide), n };
    };
}

function simplify({ f, g, n }, tol) {
    let u = k => k / n + g[k];
    return keepers(n, (i, j) => {
        let dx = u(j) - u(i), dy = f[j] - f[i], len = hypot(dx, dy) || 1e-9;
        return k => abs((u(k) - u(i)) * dy - (f[k] - f[i]) * dx) / len;
    }, tol);
}

export {
    conway, reacher, insideTest, scatter, voronoi, colors, mosaic, corners, wave, lattice, penrose, delaunay, border, tiles,
    shake, bend, inset, bounds, pack, slice, centre, edges, noiseOf, flatten, bridge, overlay, offset, recount, fillet, resample, PHI,
};
