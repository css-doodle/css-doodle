import { readShapes, degrees } from '../parser/parse-shape-commands.js';
import { textOf, itemsOf } from '../parser/tokenizer.js';
import { compile as parse, float } from './glsl-math-transformer.js';
import { outline } from './shapes.js';
import { HELPERS, DERIVATIVES, NAME, cssColor, colorReader } from './pattern.js';
import { glsl } from '../lib/tagged-template.js';

const SHAPES = {
    __proto__: null,
    sphere: ['r'],
    ellipsoid: ['r'],
    box: ['size', 'round'],
    cylinder: ['r', 'height', 'round'],
    cone: ['r', 'height'],
    torus: ['r'],
    capsule: ['from', 'to', 'r'],
    polygon: ['points', 'depth', 'round'],
    lathe: ['points'],
    plane: [],
    sdf: ['d'],
};

const GROUPS = { __proto__: null, union: '1.0, 1.0', subtract: '-1.0, 1.0', intersect: '-1.0, -1.0' };

const COMMANDS = new Set(['move', 'rotate', 'scale', 'mirror', 'repeat', 'twist', 'grow', 'frame']);
const AXES = { __proto__: null, x: '1.0, 0.0, 0.0', y: '0.0, 1.0, 0.0', z: '0.0, 0.0, 1.0' };

const SCENE_HELPERS = glsl`
    vec4 g_op(vec4 a, vec4 b, float k, float sa, float sb) {
        a.w *= sa;
        b.w *= sb;
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b.w - a.w) / k, 0.0, 1.0);
        return vec4(mix(b.rgb, a.rgb, h), sa * (mix(b.w, a.w, h) - k * h * (1.0 - h)));
    }
    vec3 g_rotate(vec3 p, vec3 k, float a) {
        k = normalize(k);
        return mix(k * dot(k, p), p, cos(a)) - cross(k, p) * sin(a);
    }
    float g_smin(float a, float b, float k, float sa, float sb) {
        a *= sa;
        b *= sb;
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return sa * (mix(b, a, h) - k * h * (1.0 - h));
    }
    float g_box(vec3 p, vec3 b) {
        vec3 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
    }
    float g_ellipsoid(vec3 p, vec3 r) {
        float k0 = length(p / r);
        return max(k0 * (k0 - 1.0) / length(p / (r * r)), length(p) - max(r.x, max(r.y, r.z)));
    }
    float g_cylinder(vec3 p, float r, float h) {
        vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    float g_cone(vec3 p, float h, float r1, float r2) {
        vec2 q = vec2(length(p.xz), p.y), k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
        vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r1 : r2), abs(q.y) - h);
        vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
        return (cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0) * sqrt(min(dot(ca, ca), dot(cb, cb)));
    }
    bool g_cross(vec2 q, vec2 a, vec2 b) {
        vec2 e = b - a, w = q - a;
        bvec3 c = bvec3(q.y >= a.y, q.y < b.y, e.x * w.y > e.y * w.x);
        return all(c) || all(not(c));
    }
    float g_capsule(vec3 p, vec3 a, vec3 b, vec2 r) {
        vec3 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h) - mix(r.x, r.y, h);
    }
`;

const LIGHT = 'vec3(0.6, 0.8, 0.5)', SHADE = ' * g_L';

const SHADOWS = glsl`
    // soft: how near the way to the light passes a shape, for how far along it
    float g_shadow(vec3 p, vec3 l, float far, float e) {
        float s = 1.0, t = e;
        for (int k = 0; k < 64 && t < far && s > 1e-3; k++) {
            float d = g_dist(p + l * t);
            s = min(s, 10.0 * d / t);
            t += max(d, e);
        }
        return smoothstep(0.0, 1.0, s);
    }
    // 1 in the open, less where other shapes crowd p along n
    float g_open(vec3 p, vec3 n, float s) {
        float o = 0.0;
        for (int k = 1; k <= 4; k++) {
            float h = 0.01 * s * float(k);
            o += clamp(1.0 - g_dist(p + n * h) / h, 0.0, 1.0);
        }
        return 1.0 - o / 4.0;
    }
`;

function isVar(node, name) {
    return !COMMANDS.has(name) && name !== 'fill' && !SHAPES[node.name]?.includes(name)
        && !(name === 'smooth' && (GROUPS[node.name] || node.count));
}

function checkAll(node, warn, unread, code) {
    if (!NAME.test(node.name)) {
        let text = node.name + (node.count ? '*' + node.count.join('x') : '');
        warn(`unexpected ${text}` + (node.name.includes('(') ? `: write ${node.name.split('(')[0]} { … }` : ''));
    }
    if (SHAPES[node.name] || GROUPS[node.name]) {
        for (let r of node.rows) {
            if (!isVar(node, r.name)) {
                let m = r.name !== 'fill' && textOf(r.value).match(/\b(normal|light)\b/);
                if (m) warn(`${r.name} cannot read ${m[1]}`);
                continue;
            }
            let valid = NAME.test(r.name);
            if (valid && new RegExp(`(?<![a-zA-Z_]\\w*|\\.)${r.name}\\b(?!\\s*:)`).test(code)) continue;
            unread.add(r);
            warn(!valid ? `invalid name "${r.name}"` : node.top ? `nothing reads ${r.name}` : `${node.name} has no ${r.name}`);
        }
    }
    if (/^(polygon|lathe)$/.test(node.name) && node.children.length) {
        node.rings = outline(node, warn).map(ring => ring.map(xy => xy.map(float)));
        node.children = [];
    }
    if (SHAPES[node.name] && node.children.length) warn(`put shapes in a union, not ${node.name}`);
    for (let c of node.copies || node.children) checkAll(c, warn, unread, code);
}

export default function drawScene(code, extra, report = () => {}) {
    let said = new Set(), warn = message => said.has(message) || (said.add(message), report(message));
    let tree = readShapes(code, warn, { ignoreInlineComment: true });
    let root = { name: 'union', top: true, rows: [], children: tree.children }, camera = {};
    for (let r of tree.rows) {
        if (/^(view|perspective|zoom|light|shadow|ambient|drag)$/.test(r.name)) camera[r.name] = r.value;
        else root.rows.push(r);
    }
    let drag = textOf(camera.drag || []).split(/[\s,]+/).filter(w => w && w !== 'none');
    for (let w of drag) if (!/^(turn|tilt)$/.test(w)) warn(`drag takes turn or tilt, not ${w}`);
    let unread = new Set();
    for (let node of [root, ...tree.unused]) checkAll(node, warn, unread, code);
    let vars = node => node.rows.filter(r => isVar(node, r.name) && !unread.has(r));
    if (!root.children.length) warn('@scene has no shapes');
    if (/\bcalc\(/.test(code)) warn('no calc() in @scene; use ( )');

    // compiled three times: distances for marching, the far field the camera fit reads, colors for the hit
    let arrays = new Map();
    let build = (dist, warn, fit) => {
        let ctx = {
            id: 0, sites: 0, key: '0.0',
            types: { __proto__: null, p: 'vec3', normal: 'vec3', light: 'float' },
            // outside copies the scene is one copy
            names: { __proto__: null, t: 't', deg: '(PI / 180.0)', turn: '(2.0 * PI)', n: '1.0', N: '1.0', nx: '1.0', ny: '1.0' },
        };
        let unknown = colorReader(extra, name => warn(`unknown name ${name}`));
        let next = () => `g_${++ctx.id}`;
        let compile = (value, p) => parse(value.replace(/\bcalc\(/g, '('), {
            types: ctx.types, warn, unknown,
            names: { __proto__: ctx.names, p },
            rand: () => `rand(vec2(${ctx.key}, ${float(++ctx.sites)}) * vec2(0.7548, 0.5698))`,
        });
        // `.2 -.1 0` and `.2, -.1, 0` → ['.2', '-.1', '0.0']; an angle in degrees
        let numbers = (tokens, p, angle) => {
            let text = textOf(tokens), code = compile(`g_(${angle ? degrees(text) : text})`, p).code();
            let items = [], depth = 0, last = 3;
            for (let i = 3; i < code.length; i++) {
                if (code[i] === '(') depth++;
                else if (code[i] === ')' && depth) depth--;
                else if (code[i] === ',' && !depth || code[i] === ')') {
                    items.push(code.slice(last, i).trim());
                    last = i + 1;
                }
            }
            return items.filter(Boolean);
        };
        let vec3 = (items, fill = '0.0') => `vec3(${items.length > 1 ? [0, 1, 2].map(i => items[i] || fill).join(', ') : items[0] || fill})`;
        let color = (value, p) => {
            let rgba = cssColor(extra, value.trim());
            if (rgba) return `vec3(${rgba.slice(0, 3).map(float).join(', ')})`;
            let { type, code } = compile(value, p);
            if (!/^vec[34]$/.test(type)) {
                warn(`fill needs a color, not ${value}`);
                return null;
            }
            return type === 'vec4' ? `${code()}.rgb` : code();
        };

        let out = '';
        let lit = new Set(['light']), reads = code => code.match(/\w+/g)?.some(w => lit.has(w));
        let scoped = new Map();
        let scope = (node, p, again) => {
            let first = scoped.get(node), end = ctx.sites, moved = [p];
            if (!again) scoped.set(node, { p, sites: end });
            else if (first.p === p) return;
            else ctx.sites = first.sites;
            for (let { name, value } of vars(node)) {
                let { type, code } = compile(textOf(value), p);
                let t = type === 'int' ? 'float' : type, c = code(t);
                if (again && !new RegExp(`\\b(${moved.join('|')})\\b`).test(c)) continue;
                let id = next();
                ctx.types[id] = t;
                moved.push(id);
                ctx.names = { __proto__: ctx.names, [name]: id };
                if (reads(c)) lit.add(id);
                out += `${t} ${id} = ${c};\n`;
            }
            if (again) ctx.sites = end;
        };
        let base = ctx.fill = next(), none = dist ? '1e5' : `vec4(${base}, 1e5)`;
        let T = dist ? 'float' : 'vec4', W = dist ? '' : '.w';
        if (!dist) out += `vec3 ${base} = vec3(0.9)${SHADE};\n`;
        // a hard join is min for union, max against -b for subtract, max for intersect
        let join = (a, b, k, signs = '1.0, 1.0') => `${a} = ${dist && k === '0.0'
            ? signs === '1.0, 1.0' ? `min(${a}, ${b})` : `max(${a}, ${signs === '-1.0, 1.0' ? '-' : ''}${b})`
            : `${dist ? 'g_smin' : 'g_op'}(${a}, ${b}, ${k}, ${signs})`};\n`;
        let row = (node, name) => node.rows.findLast(r => r.name === name)?.value || [];
        let first = (tokens, p, angle) => numbers(tokens, p, angle)[0] || '0.0';
        // a part reading ctx.cap or more changes nothing, so a costly shape may stop at a bound that reaches it
        let below = a => ctx.cap ? `min(${ctx.cap}, ${a})` : a;
        let within = (cap, f) => {
            let saved = ctx.cap;
            ctx.cap = cap;
            let r = f();
            ctx.cap = saved;
            return r;
        };

        function generate(node, p) {
            let commands = node => node.rows.filter(r => COMMANDS.has(r.name));
            let names = ctx.names;
            if (!node.count) {
                scope(node, p);
                let r = chain(node, commands(node), p);
                ctx.names = names;
                return r;
            }
            let [X, Y] = node.count, r = next();
            let key = ctx.key, start = ctx.sites, end = start;
            let copy = (node, n, nx, ny) => {
                ctx.names = { __proto__: names, n, N: float(X * Y), nx, ny };
                ctx.key = `(${key} * 31.0 + ${n})`;
                ctx.sites = start;
                scope(node, p);
                let c = within(!row(node, 'smooth').length && below(r), () => chain(node, commands(node), p));
                let k = first(row(node, 'smooth'), p);
                out += join(r, c, k);
                end = Math.max(end, ctx.sites);
                return k;
            };
            out += `${T} ${r} = ${none};\n`;
            if (node.copies) {
                node.copies.forEach((c, i) => copy(c, float(i + 1), float(i % X + 1), float((i / X | 0) + 1)));
            } else {
                let [i, n, nx, ny] = [next(), next(), next(), next()], head = out;
                out = '';
                let same = copy(node, n, nx, ny) === '0.0' && !new RegExp(`\\b(${n}|${nx}|${ny})\\b`).test(out);
                out = head + glsl`
                    for (int ${i} = 0; ${i} < ${same ? 1 : X * Y}; ${i}++) {
                        float ${n} = float(${i} + 1), ${nx} = float(${i} % ${X} + 1), ${ny} = float(${i} / ${X} + 1);
                ` + '\n' + out + '}\n';
            }
            ctx.names = names;
            ctx.key = key;
            ctx.sites = end;
            return r;
        }

        // commands apply top to bottom to the shape, so the point meets the last one first
        function chain(node, mods, p) {
            if (!mods.length) return atom(node, p);
            let m = mods.at(-1), inner = mods.slice(0, -1);
            let args = () => numbers(m.value, p);
            let q = next(), r;
            ctx.types[q] = 'vec3';
            if (m.name === 'move') {
                out += `vec3 ${q} = ${p} - ${vec3(args())};\n`;
            } else if (m.name === 'scale') {
                let s = next();
                out += `vec3 ${s} = ${vec3(args(), '1.0')};\n`;
                if (fit) {
                    // far away a shape reads |p| - its reach; scaled, it reaches |S e| times the inner reach along S e
                    let w = next();
                    out += `vec3 ${w} = ${p} * ${s};\nvec3 ${q} = normalize(${w}) * length(${p});\n`;
                    r = chain(node, inner, q);
                    out += `${r} = length(${p}) - length(${w}) + ${r} * length(${w}) / length(${p});\n`;
                    return r;
                }
                out += `vec3 ${q} = ${p} / ${s};\n`;
                // a negative scale mirrors
                let f = `min(abs(${s}.x), min(abs(${s}.y), abs(${s}.z)))`;
                r = within(ctx.cap && `${ctx.cap} / ${f}`, () => chain(node, inner, q));
                out += `${r}${W} *= ${f};\n`;
                return r;
            } else if (m.name === 'rotate') {
                let axis = AXES.z, angle = '0.0';
                for (let g of itemsOf(m.value)) {
                    let named = g.find(t => t.isWord() && AXES[t.value]);
                    if (named) axis = AXES[named.value];
                    let v = numbers(g.filter(t => t !== named), p, true);
                    if (v.length === 3) axis = v.join(', ');
                    else if (v.length === 4) [axis, angle] = [v.slice(0, 3).join(', '), `radians(${v[3]})`];
                    else if (v.length === 1) angle = `radians(${v[0]})`;
                }
                out += `vec3 ${q} = g_rotate(${p}, vec3(${axis}), ${angle});\n`;
            } else if (m.name === 'mirror') {
                // every reflection reuses the same rand() sites
                let axes = [];
                for (let t of m.value.filter(t => !t.isSpace() && !t.isSymbol(','))) {
                    // a repeated axis mirrors nothing new, and each axis doubles the code
                    if (AXES[t.value]) axes.includes(t.value) || axes.push(t.value);
                    else warn(`mirror takes x, y or z, not ${t.value}`);
                }
                let start = ctx.sites, end = start;
                r = next();
                out += `${T} ${r} = ${none};\n`;
                for (let k = 0; k < 1 << axes.length; k++) {
                    let c = next();
                    ctx.types[c] = 'vec3';
                    out += `vec3 ${c} = ${p};\n`;
                    axes.forEach((a, j) => { if (k >> j & 1) out += `${c}.${a} = -${c}.${a};\n`; });
                    ctx.sites = start;
                    let d = within(below(r), () => chain(node, inner, c));
                    out += join(r, d, '0.0');
                    end = Math.max(end, ctx.sites);
                }
                ctx.sites = end;
                return r;
            } else if (m.name === 'twist') {
                let a = first(m.value, p, true);
                if (fit) {
                    let k = next();
                    r = next();
                    out += `${T} ${r} = ${none};\nfor (int ${k} = 0; ${k} < 16; ${k}++) {\nvec3 ${q} = ${p};\n${q}.xz = rot(${p}.xz, float(${k}) * PI / 8.0);\n`;
                    let c = chain(node, inner, q);
                    out += join(r, c, '0.0') + '}\n';
                    return r;
                }
                out += `vec3 ${q} = ${p};\n${q}.xz = rot(${p}.xz, -radians(${a}) * ${p}.y);\n`;
            } else if (m.name === 'repeat') {
                let [s = [], n] = itemsOf(m.value).map(g => numbers(g, p));
                if (n) warn('repeat takes no count; write box*5x5');
                let [on, base, dir, id, k, key] = [next(), next(), next(), next(), next(), ctx.key];
                r = next();
                out += glsl`
                    vec3 ${on} = step(1e-6, ${vec3(s)});
                    vec3 ${base} = ${on} * round(${p} / max(${vec3(s)}, 1e-6));
                    vec3 ${dir} = ${on} * sign(${p} - ${vec3(s)} * ${base});
                    ${T} ${r} = ${none};
                    for (int ${k} = 0; ${k} < 8; ${k}++) {
                        vec3 ${id} = vec3(${k} & 1, (${k} >> 1) & 1, (${k} >> 2) & 1);
                        if (any(greaterThan(${id}, ${on}))) continue;
                        ${id} = ${base} + ${id} * ${dir};
                        vec3 ${q} = ${p} - ${vec3(s)} * ${id};
                ` + '\n';
                ctx.key = `(${key} + dot(${id}, vec3(1.0, 57.0, 113.0)))`;
                let c = within(below(r), () => chain(node, inner, q));
                ctx.key = key;
                out += join(r, c, '0.0') + '}\n';
                return r;
            } else {
                // a frame only adds the inside back, while a grow subtracts a value read after the shape
                r = within(m.name === 'frame' && ctx.cap, () => chain(node, inner, p));
                let v = first(m.value, p);
                out += m.name === 'grow' ? `${r}${W} -= ${v};\n` : `${r}${W} = max(${r}${W}, -${r}${W} - ${v});\n`;
                return r;
            }
            return chain(node, inner, q);
        }

        function atom(node, p) {
            let saved = ctx.fill, names = ctx.names, f = row(node, 'fill');
            scope(node, p, true);
            let c = f.length && color(textOf(f), p);
            if (c && !dist) {
                ctx.fill = next();
                out += `vec3 ${ctx.fill} = ${c}${reads(c) ? (ctx.self = 1, '') : SHADE};\n`;
            }
            let r = shape(node, p);
            ctx.fill = saved;
            ctx.names = names;
            return r;
        }

        function shape(node, p) {
            let r = next();
            if (GROUPS[node.name]) {
                let k = first(row(node, 'smooth'), p), a, cut = ctx.cut, name = node.name;
                ctx.cut ||= name === 'intersect';
                ctx.loose ||= ctx.cut;
                for (let child of node.children) {
                    let cap = k !== '0.0' ? null : !a || name === 'intersect' ? ctx.cap : name === 'union' ? below(a) : `-${a}`;
                    let b = within(cap, () => generate(child, p));
                    if (a) out += join(a, b, k, GROUPS[node.name]);
                    a ??= b;
                }
                ctx.cut = cut;
                out += `${T} ${r} = ${a || none};\n`;
                return r;
            }
            if (!SHAPES[node.name]) {
                warn(`unknown shape ${node.name}`);
                out += `${T} ${r} = ${none};\n`;
                return r;
            }
            // round keeps the outer size: shrink by r, then grow by r
            let k = first(row(node, 'round'), p);
            let get = name => numbers(row(node, name), p), name = node.name;
            let rs = SHAPES[name].includes('r') ? get('r') : [], [r1, r2] = rs, d;
            if (name === 'sphere') d = `length(${p}) - ${r1 || '0.3'}`;
            else if (name === 'ellipsoid') d = `g_ellipsoid(${p}, ${vec3(rs, '0.3')})`;
            else if (name === 'box') d = `g_box(${p}, ${vec3(get('size'), '0.5')} * 0.5 - ${k}) - ${k}`;
            else if (name === 'torus') d = `length(vec2(length(${p}.xz) - ${r1 || '0.3'}, ${p}.y)) - ${r2 || '0.08'}`;
            else if (name === 'cylinder') d = `g_cylinder(${p}, ${r1 || '0.2'} - ${k}, ${get('height')[0] || '0.5'} * 0.5 - ${k}) - ${k}`;
            else if (name === 'cone') d = `g_cone(${p}, ${get('height')[0] || '0.4'} * 0.5, ${r1 || '0.2'}, ${r2 || '0.0'})`;
            else if (name === 'capsule') d = `g_capsule(${p}, ${vec3(get('from'))}, ${vec3(get('to'))}, vec2(${r1 || '0.1'}, ${r2 || r1 || '0.1'}))`;
            else if (name === 'plane') d = `${p}.y`;
            else if (name === 'sdf') {
                let value = textOf(row(node, 'd')), start = ctx.sites;
                let { type, code } = compile(value || '1e5', p);
                let ok = value && /^(float|int)$/.test(type);
                if (!ok) warn('sdf needs d');
                d = ok ? code('float') : '1e5';
                ctx.loose = true;
                if (ok && fit && !ctx.cut) {
                    let [a, h, c] = [next(), next(), next()];
                    ctx.types[h] = 'vec3';
                    out += `float ${a} = ${d};\nvec3 ${h} = ${p} * 0.5;\n`;
                    scope(node, h, true);
                    ctx.sites = start;
                    out += `float ${c} = 2.0 * (${a} - ${compile(value, h).code('float')}) / length(${p});\n`;
                    d = `${c} > 0.1 ? ${a} / ${c} : ${a}`;
                }
            } else {
                // in the xy plane, `depth` thick along z, or a lathe's outline turned around y
                let rings = node.rings || [itemsOf(row(node, 'points')).map(g => numbers(g, p))], lathe = name === 'lathe';
                if (!rings.length || rings.some(ring => ring.length < 3)) {
                    warn(`${name} needs points: x y, …`);
                    d = '1e5';
                } else {
                    let all = rings.flatMap(ring => [...ring, ring[0]]), n = all.length, at = 0, v;
                    let array = `vec2[${n}](${all.map(([x = '0.0', y = '0.0']) => `vec2(${x}, ${y})`).join(', ')})`;
                    let [q, e, s, w] = [next(), next(), next(), next()];
                    let constant = array => arrays.get(array) || arrays.set(array, `g_c${arrays.size}`).get(array);
                    let plain = all.flat().every(x => !isNaN(x));
                    if (plain) v = constant(array);
                    else out += `vec2 ${v = next()}[${n}] = ${array};\n`;
                    let walk = (from, to) => glsl`
                        for (int i = ${from}; i < ${to}; i++) {
                            vec2 a = ${v}[i], b = ${v}[i + 1] - a, w = ${q} - a, d = w - b * clamp(dot(w, b) / max(dot(b, b), 1e-12), 0.0, 1.0);
                            ${e} = min(${e}, dot(d, d));
                            if (g_cross(${q}, a, ${v}[i + 1])) ${s} = -${s};
                        }
                    ` + '\n';
                    out += `vec2 ${q} = ${lathe ? `vec2(length(${p}.xz), ${p}.y)` : `${p}.xy`};\n`;
                    let mark = out.length, depth = lathe ? '' : get('depth')[0] || '0.1';
                    out += `float ${e} = 1e30, ${s} = 1.0;\n`;
                    if (!plain || n < 64) {
                        for (let ring of rings) {
                            out += walk(at, at + ring.length);
                            at += ring.length + 1;
                        }
                    } else {
                        let runs = [], circles = [];
                        for (let ring of rings) {
                            let len = ring.length, size = Math.ceil(Math.sqrt(len));
                            for (let i = 0; i < len; i += size) {
                                let j = Math.min(i + size, len), run = all.slice(at + i, at + j + 1).map(xy => xy.map(Number));
                                let [x, y] = [0, 1].map(k => (run[0][k] + run.at(-1)[k]) / 2);
                                let r = Math.max(...run.map(([a, b]) => Math.hypot(a - x, b - y))) + 1e-5;
                                runs.push(`ivec2(${at + i}, ${at + j})`);
                                circles.push(`vec3(${[x, y, r].map(v => v.toFixed(6))})`);
                            }
                            at += len + 1;
                        }
                        let m = runs.length, R = constant(`ivec2[${m}](${runs})`), C = constant(`vec3[${m}](${circles})`);
                        out += glsl`
                            for (int c = 0; c < ${m}; c++) {
                                vec2 a = ${v}[${R}[c].x];
                                ${e} = min(${e}, dot(${q} - a, ${q} - a));
                                if (g_cross(${q}, a, ${v}[${R}[c].y])) ${s} = -${s};
                            }
                            for (int c = 0; c < ${m}; c++) {
                                float h = max(length(${q} - ${C}[c].xy) - ${C}[c].z, 0.0);
                                if (h * h >= ${e}) continue;
                                if (g_cross(${q}, ${v}[${R}[c].x], ${v}[${R}[c].y])) ${s} = -${s};
                                ${walk(`${R}[c].x`, `${R}[c].y`)}
                            }
                        ` + '\n';
                    }
                    if (lathe) d = `${s} * sqrt(${e})`;
                    else {
                        out += glsl`
                            vec2 ${w} = vec2(${s} * sqrt(${e}) + ${k}, abs(${p}.z) - ${depth} * 0.5 + ${k});
                        ` + '\n';
                        d = `min(max(${w}.x, ${w}.y), 0.0) + length(max(${w}, 0.0)) - ${k}`;
                    }
                    // the outline's box is never farther than the outline, so the walk runs only where it may count
                    if (plain && dist && !fit && ctx.cap) {
                        let ends = [0, 1].map(i => all.map(xy => +xy[i])).map(v => [Math.max(...v), Math.min(...v)]);
                        let box = `box(${q} - vec2(${ends.map(([a, b]) => float(+((a + b) / 2).toFixed(6)))}), vec2(${ends.map(([a, b]) => float(+((a - b) / 2 + 1e-5).toFixed(6)))}))`;
                        let walk = out.slice(mark);
                        out = out.slice(0, mark) + `float ${r} = ${lathe ? box : `max(${box}, abs(${p}.z) - ${depth} * 0.5)`};\nif (${r} < ${ctx.cap}) {\n${walk}${r} = ${d};\n}\n`;
                        return r;
                    }
                }
            }
            out += `${T} ${r} = ${dist ? d : `vec4(${ctx.fill}, ${d})`};\n`;
            return r;
        }

        let result = generate(root, 'p'), self = ctx.self;
        // the named shapes nothing draws are compiled too, so their mistakes show
        if (!dist) {
            let used = out, size = arrays.size;
            for (let def of tree.unused) generate(def, 'p');
            out = used;
            [...arrays.keys()].slice(size).forEach(k => arrays.delete(k));
        }
        if (!self) out = out.replaceAll(SHADE, '');

        let off = v => /^\s*none\s*$/.test(textOf(v || []));
        let angles = numbers(camera.view || [], 'p', true);
        let [turn = '0.0', tilt = '0.0'] = angles.map(v => `radians(${v})`);
        let depth = !camera.perspective ? '2.0' : off(camera.perspective) ? '0.0' : first(camera.perspective, 'p');
        let zoom = camera.zoom ? first(camera.zoom, 'p') : '1.0';
        let shadow = camera.shadow && !off(camera.shadow) && first(camera.shadow, 'p');
        // the values of a row, and a CSS color such as rgb() standing after the last space
        let paint = g => {
            let level = 0, at = 0;
            g.forEach((t, i) => (level += t.isSymbol('(') - t.isSymbol(')')) || !t.isSpace() || (at = i));
            let tail = textOf(g.slice(at)).trim(), rgba = cssColor(extra, tail);
            return [numbers(rgba ? g.slice(0, at) : g, 'p'), rgba && `vec3(${rgba.slice(0, 3).map(float)})`];
        };
        // `x y z color`, toward the light as `normal` sees it
        let lights = off(camera.light) ? [] : itemsOf(camera.light || []).map(g => {
            let [v, c] = paint(g);
            return [v.length ? vec3(v.slice(0, 3)) : LIGHT, c || `vec3(${v[3] || '1.0'})`];
        });
        if (!camera.light) lights.push([LIGHT, 'vec3(1.0)']);
        // `sky ground`, the light from all around: a surface facing up gets sky, one facing down ground, a fifth of sky unless given
        let ambient = '0.3 * (0.6 + 0.4 * dot(n, g_y))';
        if (camera.ambient) {
            let [v, c] = off(camera.ambient) ? [['0.0']] : paint(camera.ambient), sky;
            if (c) v.push(c);
            sky = `vec3(${v[0]})`;
            ambient = `mix(${v[1] ? `vec3(${v[1]})` : `${sky} * 0.2`}, ${sky}, 0.5 + 0.5 * dot(n, g_y))`;
        }
        return { out, result, turn, tilt, depth, zoom, shadow, lights, ambient, self, base: +angles[1] || 0, loose: ctx.loose };
    };
    let full = build(false, warn), bare = build(true, () => {}), fit = build(true, () => {}, true);
    let { turn, tilt, depth, zoom, shadow, lights, ambient, self, base } = full;
    let usesTime = /(?<![\w.])t\b/.test([full.out, full.result, fit.out, turn, tilt, depth, zoom, shadow, ambient, ...lights.flat()].join('\n'));
    let slopes = DERIVATIVES.test([full.out, full.result, ambient, ...lights.flat()].join('\n'));
    let common = glsl`
    const float PI = 3.1415926535897932;
    float t;
    vec3 normal = vec3(0.0, 0.0, 1.0);
    float light = 1.0;
    ${HELPERS}
    ${SCENE_HELPERS}
    ${[...arrays].map(([array, v]) => `const ${array.match(/^\w+/)} ${v}[] = ${array};`).join('\n')}
    `;
    let now = `t = ${usesTime ? 'u_time' : '0.0'};`;
    let view = (turn, tilt) => glsl`
        vec3 g_x = g_rotate(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), ${turn});
        vec3 g_y = g_rotate(g_rotate(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), ${tilt}), vec3(0.0, 1.0, 0.0), ${turn});
        vec3 g_z = cross(g_x, g_y);
    `;
    // probes at 50 and 1000 read as a line, so a distance that is uniformly too low still fits
    let vertex = glsl`#version 300 es
    precision highp float;
    precision highp int;
    #define fwidth(x) (0.0 * (x))
    in vec4 position;
    uniform float u_time;
    uniform vec2 u_seed;
    flat out vec3 g_vhi, g_vlo, g_vc;
    ${common}
    float g_fit(vec3 p) {
        ${fit.out}
        return ${fit.result};
    }
    ${fit.loose ? glsl`
        float g_dist(vec3 p) {
            ${bare.out}
            return ${bare.result};
        }
        float g_walk(vec3 e) {
            vec3 q = e * 50.0;
            for (int k = 0; k < 16; k++) {
                float d = g_dist(q), h = max(1e-3 * abs(d), 1e-5);
                if (abs(d) < 1e-4) return dot(q, e);
                vec3 g = vec3(0.0);
                for (int j = 0; j < 4; j++) {
                    vec3 o = 2.0 * vec3(float(((j + 3) >> 1) & 1), float((j >> 1) & 1), float(j & 1)) - 1.0;
                    g += o * g_dist(q + o * h);
                }
                q -= d * g * 4.0 * h / max(dot(g, g), 1e-12);
            }
            return -1e9;
        }
    ` : ''}
    float g_reach(vec3 e) {
        float b = 50.0 - g_fit(e * 50.0);
        float s = (1e3 - g_fit(e * 1e3) - b) / 950.0;
        return s < 0.9 ? ${fit.loose ? 'max(g_walk(e), (b - s * 50.0) / (1.0 - s))' : '(b - s * 50.0) / (1.0 - s)'} : 1e9;
    }
    void main() {
        gl_Position = position;
        ${now}
        g_vhi = vec3(-1e9);
        g_vlo = vec3(1e9);
        for (int i = 0; i <= ${usesTime ? 32 : 0}; i++) {
            if (i > 0) t = float(i - 1) * PI / 16.0;
            ${drag.length ? view('0.0', '0.0') : view(turn, tilt)}
            g_vhi = max(g_vhi, vec3(g_reach(g_x), g_reach(g_y), g_reach(g_z)));
            g_vlo = min(g_vlo, -vec3(g_reach(-g_x), g_reach(-g_y), g_reach(-g_z)));
        }
        g_vc = vec3(0.0);
        ${drag.length ? glsl`
            float r = length(g_vhi - g_vlo) * 0.5;
            if (r < 1e8) g_vc = (g_vhi + g_vlo) * 0.5;
            g_vhi = vec3(r);
            g_vlo = -g_vhi;
        ` : ''}
    }
    `;
    let fragment = glsl`
    precision highp int;
    uniform vec2 u_drag;
    flat in vec3 g_vhi, g_vlo, g_vc;
    ${common}
    float g_dist(vec3 p) {
        ${bare.out}
        return ${bare.result};
    }
    ${shadow ? SHADOWS : ''}
    vec3 g_L = vec3(1.0);
    vec4 g_scene(vec3 p) {
        ${full.out}
        return ${full.result};
    }
    void main() {
        ${now}
        ${view(drag.includes('turn') ? turn + ' + u_drag.x' : turn, drag.includes('tilt') ? tilt + ' + u_drag.y' : tilt)}
        float g_m = min(u_resolution.x, u_resolution.y), g_px = g_m * ${zoom};
        vec2 g_q = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / g_px;
        mat3 g_v = mat3(g_x, g_y, g_z);
        float g_d = ${depth}, g_f = g_d > 0.0 ? 1.0 / g_d : 0.0;
        vec2 g_w = 0.5 * u_resolution.xy / g_m;
        vec3 g_hi = g_vhi, g_lo = g_vlo;
        vec2 g_n = (g_hi.xy - g_lo.xy) * 0.5 / g_w + g_hi.z * g_f;
        float g_k = max(1.0, max(g_n.x, g_n.y));
        bool g_b = g_n.x + g_n.y < 1e3;
        if (!g_b) { g_k = 1.0; g_hi = g_lo = vec3(0.0); }
        g_w *= g_k - g_hi.z * g_f;
        float g_z0 = g_d > 0.0 ? g_d * g_k : max(g_hi.z, 0.0) + g_k;
        vec3 g_o = vec3(clamp(vec2(0.0), g_hi.xy - g_w, g_lo.xy + g_w) + (g_d > 0.0 ? vec2(0.0) : g_q * g_k), g_z0);
        vec3 g_r = normalize(vec3(g_d > 0.0 ? g_q : vec2(0.0), -max(g_d, 1.0)));
        vec3 g_a = (g_lo - 0.02 * g_k - g_o) / (g_r + 1e-9), g_c = (g_hi + 0.02 * g_k - g_o) / (g_r + 1e-9);
        vec3 g_in = min(g_a, g_c), g_out = max(g_a, g_c);
        float g_t = g_b ? max(max(max(g_in.x, g_in.y), g_in.z), 0.0) : 0.0;
        float g_far = g_b ? min(min(g_out.x, g_out.y), g_out.z) : g_z0 + 4.0 * g_k;
        if (g_t > g_far) {
            FragColor = vec4(0.0);
            return;
        }
        vec3 g_ro = g_vc + g_v * g_o, g_rd = g_v * g_r;
        float g_tn = g_t, g_near = 1e9;
        for (int k = 0; k < 128; k++) {
            float d = g_dist(g_ro + g_rd * g_t);
            float e = d * g_px / (g_d > 0.0 ? g_t * g_f : g_k);
            if (e < g_near) { g_near = e; g_tn = g_t; }
            if (g_near < 0.1 || g_t > g_far) break;
            g_t += d;
        }
        ${slopes ? '' : glsl`
            if (g_near >= 1.1) {
                FragColor = vec4(0.0);
                return;
            }
        `}
        vec3 g_h = g_ro + g_rd * g_tn;
        vec3 n = vec3(0.0);
        float g_u = g_k / ${zoom};
        for (int k = 0; k < 4; k++) {
            vec3 e = 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
            n += e * g_dist(g_h + e * 5e-4 * g_u);
        }
        if (g_near >= 0.1) g_near /= clamp(length(n) * 1500.0 / g_u, 1e-3, 1.0);
        n = normalize(n);
        normal = n * g_v;
        ${lights.length ? glsl`
            vec3 g_lit = vec3(0.0);
            ${shadow ? glsl`
                float g_e = (g_d > 0.0 ? g_tn * g_f : g_k) / g_px, g_s = g_b ? length(g_hi - g_lo) : g_k, g_sh = ${shadow};
            ` : ''}
            ${lights.map(([dir, color], i) => `vec3 g_l${i} = g_v * normalize(${dir});\ng_lit += ${color} * max(dot(n, g_l${i}), 0.0)${shadow
                ? ` * mix(1.0, g_shadow(g_h + n * g_e, g_l${i}, 2.0 * g_s, g_e), g_sh)` : ''};`).join('\n')}
            g_L = sqrt((0.7 * g_lit + ${ambient})${shadow ? ' * mix(1.0, g_open(g_h, n, g_s), g_sh)' : ''});
        ` : ''}
        ${self ? 'light = dot(g_L, vec3(1.0 / 3.0));' : ''}
        FragColor = vec4(g_scene(g_h).rgb${self ? '' : SHADE}, 1.0 - clamp(g_near - 0.1, 0.0, 1.0));
    }
  `;
    return { vertex, fragment, textures: [], drag: drag.length && [base * Math.PI / 180] };
}
