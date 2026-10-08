import seedrandom from '../lib/seedrandom.js';
import { clamp } from '../lib/math.js';
import calc, { defaultContext } from '../core/calc.js';

const { cos, sin, atan2, sqrt, hypot, log, ceil, floor, round, abs, min, max, PI } = Math;

const SCATTER_SAMPLES = 16;
const SCATTER_ROUNDS = 10;
const SCATTER_BANDS = 256;
const PHI = (1 + sqrt(5)) / 2;

function insideTest(outline, evenodd) {
    let [, y0, , y1] = bounds(outline.flat()), h = y1 - y0;
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
        let k = tried + seed % 1e4 * 1e4;
        let u = .5 + k * .7548776662, v = .5 + k * .5698402909;
        let x = x0 + (u - floor(u)) * w, y = y0 + (v - floor(v)) * h;
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
    // parents are spread out among the seeds, or random ones when unrelaxed
    let rnd = seedrandom('crack:' + seed), order = seeds.map((_, i) => i), parents = [];
    for (let i = 0; i < n; ++i) {
        let j = i + (rnd() * (n - i) | 0);
        [order[i], order[j]] = [order[j], order[i]];
    }
    let reach = relax === 0 || m == n ? 0 : .7 * sqrt(area(screen.flat()) / m);
    if (!reach) parents = order.slice(0, m);
    for (let pass = 0; pass < 2 && parents.length < m; ++pass) for (let i of order) {
        if (parents.length < m && !parents.includes(i) && (pass || parents.every(j => hypot(seeds[i][0] - seeds[j][0], seeds[i][1] - seeds[j][1]) >= reach))) parents.push(i);
    }
    let px = parents.map(i => seeds[i][0]), py = parents.map(i => seeds[i][1]);
    let cells = voronoi(px, py, ...qbox, 0), kinds = colors(cells);
    let cut = (p, d, outer) => clip(shrink(back(p), d), outer);
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

// greedy coloring: each cell takes the lowest kind none of its neighbours has
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

function shrink(p, d) {
    return d ? clip(p, p, d) : p;
}

// corners become quadratic curves through the edge points f / 2 of the way along
function rounded(p, f, tol) {
    let out = [], n = p.length;
    for (let i = 0; i < n; i += 2) {
        let bx = p[i], by = p[i + 1];
        let ax = bx + (p[(i + n - 2) % n] - bx) * f / 2, ay = by + (p[(i + n - 1) % n] - by) * f / 2;
        let cx = bx + (p[(i + 2) % n] - bx) * f / 2, cy = by + (p[(i + 3) % n] - by) * f / 2;
        let bend = hypot(ax - 2 * bx + cx, ay - 2 * by + cy) / 4;
        if (!(bend > tol)) {
            out.push(bx, by);
            continue;
        }
        for (let j = 0, k = min(ceil(sqrt(bend / tol)), 64); j <= k; ++j) {
            let t = j / k, u = 1 - t;
            out.push(u * u * ax + 2 * u * t * bx + t * t * cx, u * u * ay + 2 * u * t * by + t * t * cy);
        }
    }
    return out;
}

// Douglas–Peucker: the indexes from 0 to n that keep every other k within tol, by error(i, j, k)
function keepers(n, error, tol) {
    let keep = [0], walk = (i, j) => {
        let worst = tol, at = 0;
        for (let k = i + 1; k < j; ++k) {
            let e = error(i, j, k);
            if (e > worst) worst = e, at = k;
        }
        if (at) walk(i, at), walk(at, j);
        else keep.push(j);
    };
    walk(0, n);
    return keep;
}

function thin(p, tol) {
    let n = p.length, keep = keepers(n, (i, j, k) => {
        let [ax, ay] = p[i], [bx, by] = p[j % n], dx = bx - ax, dy = by - ay, len = hypot(dx, dy);
        let x = p[k][0] - ax, y = p[k][1] - ay;
        return len ? abs(x * dy - y * dx) / len : hypot(x, y);
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

function lattice(k, box, bounds, s, [a, b], turn) {
    let [cx, cy] = centre(box);
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
            if (k == 4 && turn && !a && !b) {
                let l = x - s / 2, t = y - s / 2, R = l + s, B = t + s, mk = (u, v) => (u + v) & 1 ? 0 : (u & 1) + 1;
                out.push([[R, B, l, B, l, t, R, t], [x, y], 1 + (2 * (i & 1) + 3 * ((i + j) & 1)) % 4, [mk(i + 1, j + 1), mk(i, j + 1), mk(i, j), mk(i + 1, j)]]);
            }
            else if (k == 4) {
                let m = y + (i & 1) * b * s, f = (j & 1 ? 1 - a : a) % 1 * s, g = (i & 1 ? 1 - b : b) % 1 * s;
                let l = x - s / 2, t = m - s / 2, R = l + s, B = t + s;
                out.push([[R, B, ...f ? [l + f, B] : [], l, B, ...g ? [l, t + g] : [], l, t, ...f ? [l + f, t] : [], R, t, ...g ? [R, t + g] : []], [x, m], 1]);
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
    // long ones, then the largest over the count, are peeled from the outside so the inside keeps no holes
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

// the smallest pieces of make(s) with no more than `count` reaching into the shape
function tiles(make, box, screen, inside, count, grow = 1) {
    // no further out than the box's own size, so an outline moved far away can't ask for millions of pieces
    let [x0, y0, x1, y1] = bbox(screen, [2 * box[0] - box[2], 2 * box[1] - box[3], 2 * box[2] - box[0], 2 * box[3] - box[1]]), area = (x1 - x0) * (y1 - y0);
    if (!(area > 0)) return [];
    let corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].filter(c => inside(...c));
    let reaching = s => make(box, [x0, y0, x1, y1], s).filter(([p, c]) => reaches(grow == 1 ? p : p.map((v, i) => c[i & 1] + (v - c[i & 1]) * grow), c, inside, corners));
    let hi = sqrt(area / count);
    for (let i = 0; i < 30 && reaching(hi).length > count; ++i) hi *= 1.25;
    for (let lo = hi / 8, i = 0; i < 20; ++i) {
        let mid = (lo + hi) / 2;
        if (reaching(mid).length > count) lo = mid; else hi = mid;
    }
    return reaching(hi);
}

function shake(pieces, n, seed) {
    let d = n * sqrt(pieces.reduce((s, [p]) => s + area(p), 0) / pieces.length), moved = {};
    return pieces.map(([p, , kind]) => {
        let q = [];
        for (let i = 0; i < p.length; i += 2) {
            let key = round(p[i] * 1e6) + ',' + round(p[i + 1] * 1e6);
            let [dx, dy] = moved[key] ||= (rnd => {
                let a = 2 * PI * rnd(), r = d * sqrt(rnd());
                return [r * cos(a), r * sin(a)];
            })(seedrandom('jitter:' + seed + ':' + key));
            q.push(p[i] + dx, p[i + 1] + dy);
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
    return f > 0 ? q.map((v, i) => { let c = i & 1 ? y : x; return c + (v - c) * f; }) : [];
}

function bounds(p) {
    let xs = p.filter((_, i) => !(i & 1)), ys = p.filter((_, i) => i & 1);
    return [min(...xs), min(...ys), max(...xs), max(...ys)];
}

function bbox(screen, box) {
    let [x0, y0, x1, y1] = bounds(screen.flat());
    return [max(box[0], x0), max(box[1], y0), min(box[2], x1), min(box[3], y1)];
}

function pack(screen, box, inside, count, seed, size) {
    let [x0, y0, x1, y1] = bbox(screen, box), w = x1 - x0, h = y1 - y0;
    let total = max(4096, 32 * count), xs = [], ys = [], heap = [], key = [], out = [];
    let k = seed % 1e4 * 1e4, start = k;
    for (; xs.length < total && k < start + total * 50; ++k) {
        let u = .5 + k * .7548776662, v = .5 + k * .5698402909;
        let x = x0 + (u - floor(u)) * w, y = y0 + (v - floor(v)) * h;
        if (inside(x, y)) heap.push(xs.length), key.push(Infinity), xs.push(x), ys.push(y);
    }
    let avg = sqrt(w * h * xs.length / (k - start) / count / PI) || 1;
    let caps = xs.map((x, i) => size ? avg * size(x, ys[i]) : 3 * avg), cap = caps.reduce((a, b) => max(a, b), 0);
    if (!(cap > 0)) return out;
    let cols = ceil(w / cap) + 1, grid = Array.from({ length: cols * (ceil(h / cap) + 1) }, () => []);
    let edge = [], segs = [];
    screen.forEach(([bx, by], a) => {
        let [ax, ay] = screen.at(a - 1), dx = bx - ax, dy = by - ay;
        segs.push(ax, ay, dx, dy, 1 / (dx * dx + dy * dy) || 0);
    });
    let room = i => {
        let x = xs[i], y = ys[i], r = edge[i];
        if (r === undefined) {
            r = max(0, min(caps[i], x - box[0], box[2] - x, y - box[1], box[3] - y)) ** 2;
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

function slice(screen, box, inside, count, seed, gap, spread, density) {
    let [x0, y0, x1, y1] = bbox(screen, box);
    let rnd = seedrandom('slice:' + seed);
    let N = 64, w = (x1 - x0) / N, h = (y1 - y0) / N;
    let grid = density && Array.from({ length: N * N }, (_, i) => max(0, density(x0 + (i % N + .5) * w, y0 + ((i / N | 0) + .5) * h)));
    let weight = p => {
        if (!density) return area(p);
        let [l, t, r, b] = bounds(p), sum = 0, n = 0;
        for (let j = max(0, ceil((t - y0) / h - .5)); j <= min(N - 1, (b - y0) / h - .5); ++j) {
            for (let i = max(0, ceil((l - x0) / w - .5)); i <= min(N - 1, (r - x0) / w - .5); ++i) {
                if (contains(p, x0 + (i + .5) * w, y0 + (j + .5) * h)) sum += grid[i + N * j], ++n;
            }
        }
        return area(p) * (n ? sum / n : max(0, density(...centre(p))));
    };
    let pieces = [[x0, y0, x1, y0, x1, y1, x0, y1]], weights = pieces.map(weight), total = weights[0];
    for (let tries = 0; pieces.length < count && tries < count * 4 && total > 0; ++tries) {
        let sum = 0, pick = rnd() * total, k = 0;
        while (k < pieces.length - 1 && (sum += weights[k]) < pick) ++k;
        let p = pieces[k], [cx, cy] = centre(p);
        let [l, t, r, b] = bounds(p);
        let a = (r - l > b - t ? 0 : PI / 2) + (rnd() - .5) * spread;
        let nx = cos(a), ny = sin(a), shift = (rnd() - .5) * .5 * sqrt(area(p));
        let mx = cx + nx * shift, my = cy + ny * shift, g = gap / 2;
        let parts = [1, -1].map(d => halfplane(p, d * nx, d * ny, mx - d * nx * g, my - d * ny * g, [])[0])
            .filter(p => p.length && reaches(p, centre(p), inside, screen));
        if (!parts.length) continue;
        let sizes = parts.map(weight);
        total += sizes.reduce((a, b) => a + b, 0) - weights[k];
        pieces.splice(k, 1, ...parts);
        weights.splice(k, 1, ...sizes);
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
    let seen = new Set(['edge', 'slide', 'e', 't']);
    let reads = text => /\b[xy]\b|random/.test(text) || (String(text).match(/[\w$-]+/g) || []).some(name =>
        !seen.has(name) && Object.hasOwn(props, name) && seen.add(name) && reads(props[name]));
    let local = reads(props.edge) || reads(props.slide || '');
    return (e, x, y) => {
        let key = local ? e + ',' + x.toFixed(4) + ',' + y.toFixed(4) : e;
        if (cache[key]) return cache[key];
        let rnd = seedrandom('edge:' + seed + ':' + key), draws = [], k;
        Object.assign(context, { e, x, y, random: () => draws[k++] ??= rnd() });
        let table = text => {
            let f = Array.from({ length: n + 1 }, (_, j) => {
                k = 0;
                context.t = context['θ'] = 2 * PI * j / n;
                return text ? Number(calc(text, context)) || 0 : 0;
            });
            f = f.map((v, j) => v - f[0] - (f[n] - f[0]) * j / n);
            return odd ? f.map((v, j) => (v - f[n - j]) / 2) : f;
        };
        return cache[key] = { f: table(props.edge), g: table(props.slide), n };
    };
}

function simplify({ f, g, n }, tol) {
    let u = k => k / n + g[k];
    return keepers(n, (i, j, k) => {
        let dx = u(j) - u(i), dy = f[j] - f[i];
        return abs((u(k) - u(i)) * dy - (f[k] - f[i]) * dx) / (hypot(dx, dy) || 1e-9);
    }, tol);
}

export {
    insideTest, scatter, voronoi, colors, mosaic, rounded, wave, lattice, penrose, delaunay, tiles,
    shake, bend, inset, bounds, pack, slice, centre, edges, PHI,
};
