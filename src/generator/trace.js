import parseSvgPath, { ARITY } from '../parser/parse-svg-path.js';
import { memo } from '../lib/cache.js';
import { bounds, thin, area, mix, toPairs } from './polygon.js';

const { cos, sin, atan2, sqrt, abs, min, max, ceil, PI } = Math;

export const fontsLoading = new Set();

export function glyphs(text, font, axis) {
    let [, lead, family] = (font + ' ').match(/^((?:(?:italic|oblique|bold|bolder|lighter|small-caps|\d+)\s+)*)(?:[\d.]+\S*\s+)?(.*)/);
    family = (family.trim() || 'sans-serif').split(',').map(f => (f = f.trim(), /^(['"]|-?[a-z_][\w-]*(\s+-?[a-z_][\w-]*)*$)/i.test(f) ? f : `"${f}"`));
    let face = lead + '100px ' + family.join(', '), ready;
    try {
        ready = document.fonts.check(face, text);
    } catch {
        return [];
    }
    return traced(text, face, ready, axis);
}

const traced = memo((text, face, ready, axis) => {
    if (!ready) fontsLoading.add(document.fonts.load(face, text));
    let n = 512, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    let draw = (w, h, s, x, y) => {
        canvas.width = w, canvas.height = h;
        ctx.font = face;
        ctx.setTransform(s, 0, 0, s, x, y);
        ctx.fillText(text, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
    };
    ctx.font = face;
    let { width, fontBoundingBoxAscent: a, fontBoundingBoxDescent: d } = ctx.measureText(text), s = n / 2 / max(width, a + d);
    if (!(s < Infinity)) return [];
    let data = draw(n, n, s, n / 4, n / 2), x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (let i = 0; i < n * n; ++i) if (data[4 * i + 3]) {
        let x = i % n, y = i / n | 0;
        x0 = min(x0, x), x1 = max(x1, x + 1), y0 = min(y0, y), y1 = max(y1, y + 1);
    }
    let w = x1 - x0, h = y1 - y0;
    if (!(w > 0)) return [];
    let k = min(max(496 / max(w, h), 3 / s), 1e3 / sqrt((w + 2) * (h + 2))), pad = ceil(k) + 8, W = ceil(w * k) + 2 * pad, H = ceil(h * k) + 2 * pad;
    data = draw(W, H, s * k, W / 2 + k * (n / 4 - (x0 + x1) / 2), H / 2 + k * (n / 2 - (y0 + y1) / 2));
    let alpha = new Uint8Array(W * H), v = i => alpha[i] - 127.5, next = new Int32Array(2 * W * H).fill(-1), starts = [], rings = [];
    for (let i = 0; i < W * H; ++i) alpha[i] = data[4 * i + 3];
    for (let i = 0; i < W * (H - 1); ++i) {
        let tl = alpha[i], tr = alpha[i + 1], bl = alpha[i + W], br = alpha[i + W + 1];
        if (!(tl | tr | bl | br) || (tl & tr & bl & br) == 255) continue;
        let sum = tl + tr + bl + br - 510, ins = [tl > 127, tr > 127, br > 127, bl > 127], keys = [2 * i, 2 * i + 3, 2 * i + 2 * W, 2 * i + 1], list = [];
        for (let j = 0; j < 4; ++j) if (ins[j] != ins[(j + 1) % 4]) list.push([keys[j], ins[(j + 1) % 4]]);
        let k = list.length, step = sum > 0 ? k - 1 : 1;
        list.forEach(([key, into], m) => into && (next[key] = list[(m + step) % k][0], starts.push(key)));
    }
    let at = key => {
        let i = key >> 1, t = v(i) / (v(i) - v(i + (key & 1 ? W : 1))), x = i % W + .5, y = (i / W | 0) + .5;
        key & 1 ? y += t : x += t;
        return [x, y];
    };
    for (let k of starts.sort((p, q) => p - q)) {
        if (next[k] < 0) continue;
        let ring = [];
        for (let key = k, to; (to = next[key]) >= 0; key = to) {
            ring.push(at(key));
            next[key] = -1;
        }
        rings.push(ring);
    }
    return fitRings(rings, axis);
});

export function traceRings(d, perRadian = 8) {
    let { commands } = parseSvgPath(d), rings = [], ring = [], x = 0, y = 0, x0 = 0, y0 = 0, c, last;
    if (!/^\s*[a-z]/i.test(d)) return [];
    let draw = (...p) => {
        let ps = [[x, y], ...toPairs(p)], n = ps.length > 2 ? 32 : 1;
        for (let j = 1; j <= n; ++j) {
            let q = ps;
            while (q.length > 1) q = q.slice(1).map((p, i) => mix(q[i], p, j / n));
            ring.push(q[0]);
        }
        c = ps.at(-2);
        [x, y] = ps.at(-1);
    };
    let arc = (rx, ry, deg, large, sweep, ex, ey) => {
        let cs = cos(deg * PI / 180), sn = sin(deg * PI / 180), dx = (x - ex) / 2, dy = (y - ey) / 2;
        let px = cs * dx + sn * dy, py = cs * dy - sn * dx;
        rx = abs(rx), ry = abs(ry);
        let s = (px / rx) ** 2 + (py / ry) ** 2;
        if (!(s > 0 && s < Infinity)) return draw(ex, ey);
        if (s > 1) rx *= sqrt(s), ry *= sqrt(s);
        let k = (large == sweep ? -1 : 1) * sqrt(max(0, 1 / s - 1)), ux = k * rx * py / ry, uy = -k * ry * px / rx;
        let a = atan2((py - uy) / ry, (px - ux) / rx), da = atan2((-py - uy) / ry, (-px - ux) / rx) - a;
        if (sweep && da < 0) da += 2 * PI;
        if (!sweep && da > 0) da -= 2 * PI;
        let mx = (x + ex) / 2 + cs * ux - sn * uy, my = (y + ey) / 2 + sn * ux + cs * uy;
        for (let j = 1, n = ceil(abs(da) * perRadian); j <= n; ++j) {
            let t = a + da * j / n;
            ring.push([mx + cs * rx * cos(t) - sn * ry * sin(t), my + sn * rx * cos(t) + cs * ry * sin(t)]);
        }
        x = ex, y = ey;
    };
    for (let { name, value } of commands) {
        let n = ARITY[name.toLowerCase()], i = 0;
        if (n === undefined || (n ? !value.length : value.length)) break;
        if (!n) name = 'M', value = [x0, y0], n = 2;
        let N = name.toUpperCase(), rel = name != N;
        for (; i + n <= value.length; i += n) {
            let v = value.slice(i, i + n), ox = rel ? x : 0, oy = rel ? y : 0;
            if (v.some(k => typeof k != 'number') || N == 'A' && [v[3], v[4]].some(f => f !== 0 && f !== 1)) break;
            if (N == 'H') v = [v[0] + ox, y];
            else if (N == 'V') v = [x, v[0] + oy];
            else if (N == 'A') v[5] += ox, v[6] += oy;
            else v = v.map((k, j) => k + (j % 2 ? oy : ox));
            if (N == 'M' && !i) {
                rings.push(ring);
                [x, y] = [x0, y0] = v;
                ring = [v];
            }
            else if (N == 'A') arc(...v);
            else if (N == 'S' || N == 'T') draw(...(/[CS]S|[QT]T/.test(last + N) ? [2 * x - c[0], 2 * y - c[1]] : [x, y]), ...v);
            else draw(...v);
            last = N;
        }
        if (i < value.length) break;
    }
    rings.push(ring);
    return rings.filter(ring => ring.length > 2);
}

export const pathRings = memo((d, axis) => fitRings(traceRings(d), axis));

function fitRings(rings, axis) {
    let [l, t, r, b] = bounds(rings.flat(2)), cx = (l + r) / 2, cy = (t + b) / 2, w = r - l;
    if (axis) cx = axis == 'start' ? l : 0, w = 2 * max(cx - l, r - cx);
    let s = 2 / max(w, b - t);
    return s < Infinity ? rings.map(ring => thin(ring.map(([x, y]) => [(x - cx) * s, (cy - y) * s]), .002)).filter(ring => area(ring.flat()) > 1e-4) : [];
}
