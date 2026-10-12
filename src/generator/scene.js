import { parseBody } from '../parser/parse-body.js';
import { scan, iterator, textOf, itemsOf } from '../parser/tokenizer.js';
import { compile as parse, float } from './glsl-math-transformer.js';
import { HELPERS } from './pattern.js';
import { glsl } from '../lib/tagged-template.js';

const NAME = /^[a-zA-Z_]\w*$/;

// size attributes, like r on an SVG circle
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
    plane: [],
    sdf: ['d'],
};

// the signs cssd_op takes
const GROUPS = { __proto__: null, union: '1.0, 1.0', subtract: '-1.0, 1.0', intersect: '-1.0, -1.0' };

const COMMANDS = new Set(['translate', 'rotate', 'scale', 'mirror', 'repeat', 'twist', 'grow', 'shell']);
const AXES = { __proto__: null, x: '1.0, 0.0, 0.0', y: '0.0, 1.0, 0.0', z: '0.0, 0.0, 1.0' };

const SCENE_HELPERS = glsl`
    vec4 cssd_op(vec4 a, vec4 b, float k, float sa, float sb) {
        a.w *= sa;
        b.w *= sb;
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b.w - a.w) / k, 0.0, 1.0);
        return vec4(mix(b.rgb, a.rgb, h), sa * (mix(b.w, a.w, h) - k * h * (1.0 - h)));
    }
    vec3 cssd_rotate(vec3 p, vec3 k, float a) {
        k = normalize(k);
        return mix(k * dot(k, p), p, cos(a)) - cross(k, p) * sin(a);
    }
    float cssd_smin(float a, float b, float k, float sa, float sb) {
        a *= sa;
        b *= sb;
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return sa * (mix(b, a, h) - k * h * (1.0 - h));
    }
    float cssd_box(vec3 p, vec3 b) {
        vec3 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
    }
    float cssd_ellipsoid(vec3 p, vec3 r) {
        float k0 = length(p / r);
        return max(k0 * (k0 - 1.0) / length(p / (r * r)), length(p) - max(r.x, max(r.y, r.z)));
    }
    float cssd_cylinder(vec3 p, float r, float h) {
        vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    float cssd_cone(vec3 p, float h, float r1, float r2) {
        vec2 q = vec2(length(p.xz), p.y), k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
        vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r1 : r2), abs(q.y) - h);
        vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
        return (cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0) * sqrt(min(dot(ca, ca), dot(cb, cb)));
    }
    float cssd_capsule(vec3 p, vec3 a, vec3 b, vec2 r) {
        vec3 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h) - mix(r.x, r.y, h);
    }
`;

// a statement value that reaches `{` is a named block: `leg: capsule { … }`
const reader = {
    readBlocks: (iter, head) => [{ head, value: parseBody(iter, {}, reader).value }],
    readStatement(iter, head) {
        let value = [];
        while (iter.next()) {
            let curr = iter.curr(), next = iter.curr(1);
            if (curr.isSymbol('{')) {
                value = { head: value, value: parseBody(iter, {}, reader).value };
                break;
            }
            if (curr.isSymbol(';')) break;
            value.push(curr);
            if (!next || next.isSymbol('}')) break;
        }
        return [{ name: textOf(head).trim(), value }];
    },
    readTail: head => [{ head, value: [] }],
};

function check(node, warn) {
    for (let { name } of node.rows) {
        if (COMMANDS.has(name) || name === 'fill' || SHAPES[node.name]?.includes(name)
            || name === 'smooth' && (GROUPS[node.name] || node.count)) continue;
        warn(`${node.name} has no ${name}`);
    }
    if (node.children.length && !GROUPS[node.name]) warn(`${node.name} cannot hold shapes; put them in a union`);
}

// `box*5x5 { rows }` → { name, count: [5, 5], rows, children }
function shapeOf({ head, value }, warn) {
    let text = textOf(head).trim();
    let [name = '', times] = text.split(/\s*\*\s*/);
    let count = times?.match(/^([1-9]\d*)(?:x([1-9]\d*))?$/);
    if (!NAME.test(name) || times !== undefined && !count) {
        warn(`unexpected ${text}` + (name.includes('(') ? `: write ${name.split('(')[0]} { … }` : ''));
    }
    count = count ? [+count[1], +(count[2] || 1)] : 0;
    let node = { name, count, rows: [], children: [] };
    for (let r of value) {
        if (count && r.head && !textOf(r.head).trim()) (node.copies ||= []).push(shapeOf({ head, value: r.value }, warn));
        else if (r.head) node.children.push(shapeOf(r, warn));
        else if (Array.isArray(r.value)) node.rows.push(r);
        else warn(`name shapes at the top level: ${r.name}`);
    }
    if (SHAPES[name] || GROUPS[name]) check(node, warn);
    return node;
}

export default function drawScene(code, extra, report = () => {}) {
    let said = new Set(), warn = message => said.has(message) || (said.add(message), report(message));
    let root = { name: 'union', count: 0, rows: [], children: [] };
    let defs = new Map(), pending = [], camera = {};
    for (let r of parseBody(iterator(scan(code, { ignoreInlineComment: true })), null, reader)) {
        if (r.head) root.children.push(shapeOf(r, warn));
        else if (!NAME.test(r.name)) warn(`"${r.name}" is not a valid name`);
        else if (r.name === 'view' || r.name === 'perspective') camera[r.name] = r.value;
        else if (!Array.isArray(r.value)) defs.set(r.name, shapeOf(r.value, warn));
        else if (COMMANDS.has(r.name) || r.name === 'fill' || r.name === 'smooth') root.rows.push(r);
        else pending.push(r);
    }
    // a value is a shape when it starts with a primitive, a group or a named shape
    for (let found = true; found;) {
        found = false;
        for (let r of pending) {
            let t = textOf(r.value).match(/^\s*([a-zA-Z_]\w*)/)?.[1];
            if (!defs.has(r.name) && (SHAPES[t] || GROUPS[t] || defs.has(t))) {
                defs.set(r.name, shapeOf({ head: r.value, value: [] }, warn));
                found = true;
            }
        }
    }
    let vars = pending.filter(r => !defs.has(r.name));
    if (!root.children.length) warn('@scene draws nothing: add a shape such as sphere { r: .3 }');
    if (/\bcalc\(/.test(code)) warn('@scene does math without calc(): write (t * 30deg)');

    // compiled three times: distances for marching, the far field the camera fit reads, colors for the hit
    let build = (dist, warn, fit) => {
        let ctx = {
            id: 0, sites: 0, key: '0.0', using: new Set(),
            types: { __proto__: null },
            // outside copies the scene is one copy
            names: { __proto__: null, t: 't', deg: '(PI / 180.0)', turn: '(2.0 * PI)', n: '1.0', N: '1.0', nx: '1.0', ny: '1.0' },
        };
        let known = new Map();
        let unknown = name => {
            if (!known.has(name)) {
                let rgba = extra.getRgbaColor(name);
                known.set(name, rgba && (rgba[3] === 1 ? rgba.slice(0, 3) : rgba));
                if (!rgba) warn(`unknown name ${name}`);
            }
            return known.get(name);
        };
        let next = () => `cssd${++ctx.id}`;
        let compile = (value, p) => parse(value.replace(/\bcalc\(/g, '('), {
            types: ctx.types, warn, unknown,
            names: { __proto__: ctx.names, p },
            rand: () => `rand(vec2(${ctx.key}, ${float(++ctx.sites)}) * vec2(0.7548, 0.5698))`,
        });
        // `.2 -.1 0` and `.2, -.1, 0` → ['.2', '-.1', '0.0']
        let numbers = (tokens, p) => {
            let code = compile(`cssd(${textOf(tokens)})`, p).code();
            let items = [], depth = 0, last = 5;
            for (let i = 5; i < code.length; i++) {
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
            let rgba = extra.getRgbaColor(value.trim());
            if (rgba) return `vec3(${rgba.slice(0, 3).map(float).join(', ')})`;
            let { type, code } = compile(value, p);
            if (!/^vec[34]$/.test(type)) {
                warn(`fill needs a color, not ${value}`);
                return null;
            }
            return type === 'vec4' ? `${code()}.rgb` : code();
        };

        let out = '';
        for (let { name, value } of vars) {
            let { type, code } = compile(textOf(value), 'p');
            let id = ctx.names[name] = next();
            let t = ctx.types[id] = type === 'int' ? 'float' : type;
            out += `${t} ${id} = ${code(t)};\n`;
        }
        let base = ctx.fill = next(), none = dist ? '1e5' : `vec4(${base}, 1e5)`;
        let T = dist ? 'float' : 'vec4', W = dist ? '' : '.w';
        if (!dist) out += `vec3 ${base} = vec3(0.9);\n`;
        let join = (a, b, k, signs = '1.0, 1.0') => `${a} = ${dist && k === '0.0'
            ? { '1.0, 1.0': `min(${a}, ${b})`, '-1.0, 1.0': `max(${a}, -${b})`, '-1.0, -1.0': `max(${a}, ${b})` }[signs]
            : `${dist ? 'cssd_smin' : 'cssd_op'}(${a}, ${b}, ${k}, ${signs})`};\n`;
        let row = (node, name) => node.rows.findLast(r => r.name === name)?.value || [];
        let first = (tokens, p) => numbers(tokens, p)[0] || '0.0';

        function generate(node, p) {
            let commands = node => node.rows.filter(r => COMMANDS.has(r.name));
            if (!node.count) return chain(node, commands(node), p);
            let [X, Y] = node.count, r = next();
            let key = ctx.key, names = ctx.names, start = ctx.sites, end = start;
            let copy = (node, n, nx, ny) => {
                ctx.names = { __proto__: names, n, N: float(X * Y), nx, ny };
                ctx.key = `(${key} * 31.0 + ${n})`;
                ctx.sites = start;
                let c = chain(node, commands(node), p);
                out += join(r, c, first(row(node, 'smooth'), p));
                end = Math.max(end, ctx.sites);
            };
            out += `${T} ${r} = ${none};\n`;
            if (node.copies) {
                node.copies.forEach((c, i) => copy(c, float(i + 1), float(i % X + 1), float((i / X | 0) + 1)));
            } else {
                let [i, n, nx, ny] = [next(), next(), next(), next()];
                out += glsl`
                    for (int ${i} = 0; ${i} < ${X * Y}; ${i}++) {
                        float ${n} = float(${i} + 1), ${nx} = float(${i} % ${X} + 1), ${ny} = float(${i} / ${X} + 1);
                ` + '\n';
                copy(node, n, nx, ny);
                out += '}\n';
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
            if (m.name === 'translate') {
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
                r = chain(node, inner, q);
                // a negative scale mirrors
                out += `${r}${W} *= min(abs(${s}.x), min(abs(${s}.y), abs(${s}.z)));\n`;
                return r;
            } else if (m.name === 'rotate') {
                let axis = AXES.z, angle = '0.0';
                for (let g of itemsOf(m.value)) {
                    let named = g.find(t => t.isWord() && AXES[t.value]);
                    if (named) axis = AXES[named.value];
                    let v = numbers(g.filter(t => t !== named), p);
                    if (v.length === 3) axis = v.join(', ');
                    else if (v.length === 4) [axis, angle] = [v.slice(0, 3).join(', '), v[3]];
                    else if (v.length === 1) angle = v[0];
                }
                out += `vec3 ${q} = cssd_rotate(${p}, vec3(${axis}), ${angle});\n`;
            } else if (m.name === 'mirror') {
                // every reflection reuses the same rand() sites
                let axes = [];
                for (let t of m.value.filter(t => !t.isSpace() && !t.isSymbol(','))) {
                    if (AXES[t.value]) axes.push(t.value);
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
                    let d = chain(node, inner, c);
                    out += join(r, d, '0.0');
                    end = Math.max(end, ctx.sites);
                }
                ctx.sites = end;
                return r;
            } else if (m.name === 'twist') {
                out += `vec3 ${q} = ${p};\n${q}.xz = rot(${p}.xz, -(${args()[0] || '0.0'}) * ${p}.y);\n`;
            } else if (m.name === 'repeat') {
                // the nearest cell and its neighbours toward p, so copies may differ
                let [s = [], n] = itemsOf(m.value).map(g => numbers(g, p));
                if (n) warn('repeat takes a spacing only; for a counted grid write box*5x5');
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
                let c = chain(node, inner, q);
                ctx.key = key;
                out += join(r, c, '0.0') + '}\n';
                return r;
            } else {
                r = chain(node, inner, p);
                let v = args()[0] || '0.0';
                out += m.name === 'grow' ? `${r}${W} -= ${v};\n` : `${r}${W} = abs(${r}${W}) - ${v};\n`;
                return r;
            }
            return chain(node, inner, q);
        }

        // fill works like on an SVG <g>
        function atom(node, p) {
            let saved = ctx.fill, f = row(node, 'fill');
            let c = f.length && color(textOf(f), p);
            if (c && !dist) {
                ctx.fill = next();
                out += `vec3 ${ctx.fill} = ${c};\n`;
            }
            let r = shape(node, p);
            ctx.fill = saved;
            return r;
        }

        function shape(node, p) {
            let r = next();
            if (GROUPS[node.name]) {
                let k = first(row(node, 'smooth'), p), a, cut = ctx.cut;
                ctx.cut ||= node.name === 'intersect';
                for (let child of node.children) {
                    let b = generate(child, p);
                    if (a) out += join(a, b, k, GROUPS[node.name]);
                    a ??= b;
                }
                ctx.cut = cut;
                out += `${T} ${r} = ${a || none};\n`;
                return r;
            }
            if (!SHAPES[node.name]) {
                let def = defs.get(node.name);
                if (!def || ctx.using.has(node.name)) {
                    warn(def ? `${node.name} uses itself` : `unknown shape ${node.name}`);
                    out += `${T} ${r} = ${none};\n`;
                    return r;
                }
                if (!node.checked) check(node, warn);
                node.checked = def.used = true;
                ctx.using.add(node.name);
                r = generate(def, p);
                ctx.using.delete(node.name);
                return r;
            }
            // round keeps the outer size: shrink by r, then grow by r
            let k = first(row(node, 'round'), p);
            let get = name => numbers(row(node, name), p);
            let [r1, r2] = get('r'), name = node.name, d;
            if (name === 'sphere') d = `length(${p}) - ${r1 || '0.3'}`;
            else if (name === 'ellipsoid') d = `cssd_ellipsoid(${p}, ${vec3(get('r'), '0.3')})`;
            else if (name === 'box') d = `cssd_box(${p}, ${vec3(get('size'), '0.5')} * 0.5 - ${k}) - ${k}`;
            else if (name === 'torus') d = `length(vec2(length(${p}.xz) - ${r1 || '0.3'}, ${p}.y)) - ${r2 || '0.08'}`;
            else if (name === 'cylinder') d = `cssd_cylinder(${p}, ${r1 || '0.2'} - ${k}, ${get('height')[0] || '0.5'} * 0.5 - ${k}) - ${k}`;
            else if (name === 'cone') d = `cssd_cone(${p}, ${get('height')[0] || '0.4'} * 0.5, ${r1 || '0.2'}, ${r2 || '0.0'})`;
            else if (name === 'capsule') d = `cssd_capsule(${p}, ${vec3(get('from'))}, ${vec3(get('to'))}, vec2(${r1 || '0.1'}, ${r2 || r1 || '0.1'}))`;
            else if (name === 'plane') d = `${p}.y`;
            else if (name === 'sdf') {
                let value = textOf(row(node, 'd')), start = ctx.sites;
                let { type, code } = compile(value || '1e5', p);
                let ok = value && /^(float|int)$/.test(type);
                if (!ok) warn('sdf needs a distance in d');
                d = ok ? code('float') : '1e5';
                // a distance written at part strength, like `* .5`, reads at full strength so it hides no other part;
                // inside an intersect it may only shrink the fit, so it stays as written
                if (ok && fit && !ctx.cut) {
                    let [a, h, c, end] = [next(), next(), next(), ctx.sites];
                    ctx.types[h] = 'vec3';
                    ctx.sites = start;
                    out += `float ${a} = ${d};\nvec3 ${h} = ${p} * 0.5;\nfloat ${c} = 2.0 * (${a} - ${compile(value, h).code('float')}) / length(${p});\n`;
                    ctx.sites = end;
                    d = `${c} > 0.1 ? ${a} / ${c} : ${a}`;
                }
            } else {
                // in the xy plane, `depth` thick along z
                let pts = itemsOf(row(node, 'points')).map(g => numbers(g, p));
                if (pts.length < 3) {
                    warn('polygon needs points: x y, x y, x y, …');
                    d = '1e5';
                } else {
                    let [v, q, e, s, w] = [next(), next(), next(), next(), next()], n = pts.length;
                    out += glsl`
                        vec2 ${v}[${n}] = vec2[${n}](${pts.map(([x = '0.0', y = '0.0']) => `vec2(${x}, ${y})`).join(', ')});
                        vec2 ${q} = ${p}.xy;
                        float ${e} = dot(${q} - ${v}[0], ${q} - ${v}[0]), ${s} = 1.0;
                        for (int i = 0, j = ${n - 1}; i < ${n}; j = i, i++) {
                            vec2 e = ${v}[j] - ${v}[i], w = ${q} - ${v}[i], b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
                            ${e} = min(${e}, dot(b, b));
                            bvec3 c = bvec3(${q}.y >= ${v}[i].y, ${q}.y < ${v}[j].y, e.x * w.y > e.y * w.x);
                            if (all(c) || all(not(c))) ${s} = -${s};
                        }
                        vec2 ${w} = vec2(${s} * sqrt(${e}) + ${k}, abs(${p}.z) - ${get('depth')[0] || '0.1'} * 0.5 + ${k});
                    ` + '\n';
                    d = `min(max(${w}.x, ${w}.y), 0.0) + length(max(${w}, 0.0)) - ${k}`;
                }
            }
            out += `${T} ${r} = ${dist ? d : `vec4(${ctx.fill}, ${d})`};\n`;
            return r;
        }

        let result = generate(root, 'p');
        // the named shapes nothing draws are compiled too, so their mistakes show
        let used = out;
        for (let [name, def] of defs) if (!def.used) shape({ name, rows: [], children: [] }, 'p');
        out = used;

        let [turn = '0.0', tilt = '0.0'] = numbers(camera.view || [], 'p');
        let depth = !camera.perspective ? '2.0'
            : /^\s*none\s*$/.test(textOf(camera.perspective)) ? '0.0'
            : first(camera.perspective, 'p');
        return { out, result, turn, tilt, depth };
    };
    let full = build(false, warn), bare = build(true, () => {}), fit = build(true, () => {}, true);
    let { turn, tilt, depth } = full;
    let usesTime = /(?<![\w.])t\b/.test(code);
    let common = glsl`
    const float PI = 3.1415926535897932;
    float t;
    ${HELPERS}
    ${SCENE_HELPERS}
    `;
    let basis = glsl`
        t = ${usesTime ? 'u_time' : '0.0'};
        vec3 cssd_x = cssd_rotate(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), ${turn});
        vec3 cssd_y = cssd_rotate(cssd_rotate(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), ${tilt}), vec3(0.0, 1.0, 0.0), ${turn});
        vec3 cssd_z = cross(cssd_x, cssd_y);
    `;
    // probes at 50 and 1000 read as a line, so a distance that is uniformly too low still fits
    let vertex = glsl`#version 300 es
    precision highp float;
    precision highp int;
    #define fwidth(x) (0.0 * (x))
    in vec4 position;
    uniform float u_time;
    uniform vec2 u_seed;
    flat out vec3 cssd_vhi, cssd_vlo;
    ${common}
    float cssd_fit(vec3 p) {
        ${fit.out}
        return ${fit.result};
    }
    float cssd_reach(vec3 e) {
        float b = 50.0 - cssd_fit(e * 50.0);
        float s = (1e3 - cssd_fit(e * 1e3) - b) / 950.0;
        return s < 0.9 ? (b - s * 50.0) / (1.0 - s) : 1e9;
    }
    void main() {
        gl_Position = position;
        ${basis}
        cssd_vhi = vec3(cssd_reach(cssd_x), cssd_reach(cssd_y), cssd_reach(cssd_z));
        cssd_vlo = -vec3(cssd_reach(-cssd_x), cssd_reach(-cssd_y), cssd_reach(-cssd_z));
    }
    `;
    let fragment = glsl`
    precision highp int;
    flat in vec3 cssd_vhi, cssd_vlo;
    ${common}
    float cssd_dist(vec3 p) {
        ${bare.out}
        return ${bare.result};
    }
    vec4 cssd_scene(vec3 p) {
        ${full.out}
        return ${full.result};
    }
    void main() {
        ${basis}
        float cssd_m = min(u_resolution.x, u_resolution.y);
        vec2 cssd_q = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / cssd_m;
        mat3 cssd_v = mat3(cssd_x, cssd_y, cssd_z);
        // zoom out and shift only as far as keeps the model in view
        float cssd_d = ${depth}, cssd_f = cssd_d > 0.0 ? 1.0 / cssd_d : 0.0;
        vec2 cssd_w = 0.5 * u_resolution.xy / cssd_m;
        vec3 cssd_hi = cssd_vhi, cssd_lo = cssd_vlo;
        vec2 cssd_n = (cssd_hi.xy - cssd_lo.xy) * 0.5 / cssd_w + cssd_hi.z * cssd_f;
        float cssd_k = max(1.0, max(cssd_n.x, cssd_n.y));
        bool cssd_b = cssd_n.x + cssd_n.y < 1e3;
        if (!cssd_b) { cssd_k = 1.0; cssd_hi = cssd_lo = vec3(0.0); }
        cssd_w *= cssd_k - cssd_hi.z * cssd_f;
        float cssd_z0 = cssd_d > 0.0 ? cssd_d * cssd_k : max(cssd_hi.z, 0.0) + cssd_k;
        vec3 cssd_o = vec3(clamp(vec2(0.0), cssd_hi.xy - cssd_w, cssd_lo.xy + cssd_w) + (cssd_d > 0.0 ? vec2(0.0) : cssd_q * cssd_k), cssd_z0);
        vec3 cssd_r = normalize(vec3(cssd_d > 0.0 ? cssd_q : vec2(0.0), -max(cssd_d, 1.0)));
        // march inside the model's box only
        vec3 cssd_a = (cssd_lo - 0.02 * cssd_k - cssd_o) / (cssd_r + 1e-9), cssd_c = (cssd_hi + 0.02 * cssd_k - cssd_o) / (cssd_r + 1e-9);
        vec3 cssd_in = min(cssd_a, cssd_c), cssd_out = max(cssd_a, cssd_c);
        float cssd_t = cssd_b ? max(max(max(cssd_in.x, cssd_in.y), cssd_in.z), 0.0) : 0.0;
        float cssd_far = cssd_b ? min(min(cssd_out.x, cssd_out.y), cssd_out.z) : cssd_z0 + 4.0 * cssd_k;
        if (cssd_t > cssd_far) {
            FragColor = vec4(0.0);
            return;
        }
        vec3 cssd_ro = cssd_v * cssd_o, cssd_rd = cssd_v * cssd_r;
        // the closest approach in pixels gives the smooth edge
        float cssd_tn = cssd_t, cssd_near = 1e9;
        for (int k = 0; k < 128; k++) {
            float d = cssd_dist(cssd_ro + cssd_rd * cssd_t);
            float e = d * cssd_m / (cssd_d > 0.0 ? cssd_t * cssd_f : cssd_k);
            if (e < cssd_near) { cssd_near = e; cssd_tn = cssd_t; }
            if (cssd_near < 0.1 || cssd_t > cssd_far) break;
            cssd_t += d;
        }
        vec3 cssd_h = cssd_ro + cssd_rd * cssd_tn;
        vec3 n = vec3(0.0);
        for (int k = 0; k < 4; k++) {
            vec3 e = 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
            n += e * cssd_dist(cssd_h + e * 5e-4 * cssd_k);
        }
        // a miss reads its closest approach at full strength, so squashed and blended shapes keep a one-pixel edge
        if (cssd_near >= 0.1) cssd_near /= clamp(length(n) * 1500.0 / cssd_k, 1e-3, 1.0);
        n = normalize(n);
        vec3 cssd_l = cssd_v * normalize(vec3(0.6, 0.8, 0.5));
        float light = sqrt(0.7 * max(dot(n, cssd_l), 0.0) + 0.3 * (0.6 + 0.4 * dot(n, cssd_y)));
        FragColor = vec4(cssd_scene(cssd_h).rgb * light, 1.0 - clamp(cssd_near - 0.1, 0.0, 1.0));
    }
  `;
    return { vertex, fragment, textures: [] };
}
