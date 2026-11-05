const { cos, sin, tan, atan2, sqrt, hypot, ceil, round, abs, min, max, PI } = Math;

const BANDS = 256;
const mix = ([ax, ay], [bx, by], t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
const dist = (p, q) => hypot(p[0] - q[0], p[1] - q[1]);
const lists = n => Array.from({ length: n }, () => []);
const sum = list => list.reduce((a, b) => a + b, 0);
const perimeter = ring => sum(ring.map((p, i) => dist(p, ring.at(i - 1))));

const turn = (ring, i) => {
    let [ax, ay] = ring.at(i - 1), [px, py] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    let ux = px - ax, uy = py - ay, vx = bx - px, vy = by - py;
    return abs(atan2(ux * vy - uy * vx, ux * vx + uy * vy));
};

function insideTest(rings, evenodd) {
    let [, y0, , y1] = bounds(rings.flat(2)), h = y1 - y0;
    let bands = lists(BANDS);
    let band = y => min(BANDS - 1, (y - y0) / h * BANDS | 0);
    for (let ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        let [ax, ay] = ring[j], [bx, by] = ring[i];
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

// [x0, y0, x1, y1, …] → [[x0, y0], [x1, y1], …]
function toPairs(flat) {
    let out = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
}

function bridge(rings) {
    return rings.length < 2 ? rings[0]
        : [...rings[0], ...rings.slice(1).flatMap(ring => [rings[0][0], ...ring, ring[0]]), rings[0][0]];
}

function overlay(A, B, op, joints = new Set()) {
    let merge = rings => Object.assign(rings.map(ring => ring.filter((p, i) =>
        !i || dist(p, ring[i - 1]) > 1e-9 && (i < ring.length - 1 || dist(p, ring[0]) > 1e-9))), { evenodd: rings.evenodd, positive: rings.positive });
    A = merge(A), B = merge(B);
    let test = rings => {
        let f = rings.length ? insideTest(rings, rings.evenodd) : () => 0;
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
            let s = min(1e-10, len / 4) / len, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
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
function offset(rings, d, evenodd, tol = .002) {
    rings = overlay(Object.assign([...rings], { evenodd }), [], 'union');
    let [x0, y0, x1, y1] = bounds(rings.flat(2));
    // nothing is that far inside
    if (d < 0 && -2 * d >= min(x1 - x0, y1 - y0)) return [];
    if (!d) return rings;
    let raw = rings.map(ring => {
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
    return overlay(Object.assign(raw, { positive: true }), [], 'union').map(ring => thin(ring, tol / 2));
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
    // bend through where the sides' tangents meet, so a curve leaves each side along it,
    // unless the curve would then reach past the corner
    let control = (j, d) => {
        let p = at(s[j] - d), q = at(s[j] + d), [i] = index(s[j] - d), [k] = index(s[j] + d);
        let ux = ring[i][0] - ring[i - 1][0], uy = ring[i][1] - ring[i - 1][1];
        let vx = ring[k][0] - ring[k - 1][0], vy = ring[k][1] - ring[k - 1][1];
        let den = ux * vy - uy * vx, t = ((q[0] - p[0]) * vy - (q[1] - p[1]) * vx) / den;
        let c = [p[0] + t * ux, p[1] + t * uy], h = ([x, y]) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
        let hc = h(c), hv = h(ring[j]);
        return t > 0 && dist(c, ring[j]) > 1e-9 * L && dist(c, ring[j]) < d && hc * hv > 0 && abs(hc) <= 2 * abs(hv) ? c : ring[j];
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
    let lens = rings.map(perimeter), total = sum(lens), run = 0, done = 0;
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

function scale(p, o, f) {
    return p.map((v, i) => o[i & 1] + (v - o[i & 1]) * f);
}

// a loop, not min(...xs): spreading 120k points overflows the stack
function bounds(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
        x0 = min(x0, p[i]), y0 = min(y0, p[i + 1]), x1 = max(x1, p[i]), y1 = max(y1, p[i + 1]);
    }
    return [x0, y0, x1, y1];
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

export {
    mix, dist, lists, sum, perimeter, turn, insideTest, toPairs, bridge, overlay, offset, corners,
    resample, recount, flatten, keepers, thin, wave, scale, bounds, signed, area,
};
