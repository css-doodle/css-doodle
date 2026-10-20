import parsePattern from '../parser/parse-pattern.js';
import parseGrid from '../parser/parse-grid.js';
import parseValueGroup from '../parser/parse-value-group.js';
import { compile as parse, float } from './glsl-math-transformer.js';
import { glsl } from '../lib/tagged-template.js';

const MAX_REPEAT = 1024;
const MAX_REPEAT_WORK = 65536;

const BUILTINS = [
    'x', 'y', 'i', 'X', 'Y', 'I', 'dx', 'dy', 'du', 'dv', 'dr', 'dc', 'dm', 'da', 'db', 'uv', 'pos', 't', 'size',
];

export const NAME = /^[a-zA-Z_]\w*$/;

const MASKS = {
    __proto__: null,
    circle: 'length(vec2(du, dv))',
    square: 'max(abs(du), abs(dv))',
    diamond: 'abs(du) + abs(dv)',
};

const CELL_INDEX = glsl`
    float dx = x - (X + 1.0) * 0.5;
    float dy = y - (Y + 1.0) * 0.5;
    float du = fract(uv.x * X) - 0.5;
    float dv = fract((1.0 - uv.y) * Y) - 0.5;
    float dr = length(vec2(dx, dy));
    float dc = max(abs(dx), abs(dy));
    float dm = abs(dx) + abs(dy);
    float da = atan(dy, dx);
    float db = min(min(x - 1.0, X - x), min(y - 1.0, Y - y));
`;

// Built-ins of the pattern language (grammar §9.3)
export const HELPERS = glsl`
    float g_hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    int g_pick(float k, int n) {
        return int(mod(floor(k + 0.5) - 1.0, float(n)) + 0.5);
    }
    vec3 g_hue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }
    float g_shape(float d, float size) {
        float r = 0.5 * size;
        return 1.0 - smoothstep(r - max(fwidth(d), 1e-5), r, d);
    }

    float rand(vec2 p) {
        return g_hash(p + u_seed.x * 71.0);
    }
    float rand(float n) {
        return rand(vec2(n));
    }
    float noise(vec2 p) {
        vec2 ip = floor(p) + u_seed.x * 71.0;
        vec2 u = fract(p);
        u = u * u * (3.0 - 2.0 * u);
        float r0 = mix(g_hash(ip), g_hash(ip + vec2(1.0, 0.0)), u.x);
        float r1 = mix(g_hash(ip + vec2(0.0, 1.0)), g_hash(ip + vec2(1.0, 1.0)), u.x);
        return mix(r0, r1, u.y);
    }
    float noise(float n) {
        return noise(vec2(n, 0.0));
    }
    float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int o = 0; o < 6; o++) {
            s += a * noise(p);
            p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03; a *= 0.5;
        }
        return s;
    }
    float voronoi(vec2 p) {
        vec2 ip = floor(p) + u_seed.x * 71.0, fp = fract(p);
        float md = 8.0;
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(g_hash(ip + g), g_hash(ip + g + 19.7));
            vec2 r = g + o - fp;
            md = min(md, dot(r, r));
        }
        return sqrt(md);
    }

    vec3 hsl(float h, float s, float l) {
        return l + s * (g_hue(h) - 0.5) * (1.0 - abs(2.0 * l - 1.0));
    }
    vec3 hsv(float h, float s, float v) {
        return v * mix(vec3(1.0), g_hue(h), s);
    }

    vec2 rot(vec2 p, float a) {
        float c = cos(a), s = sin(a);
        return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }
    float smin(float a, float b, float k) {
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
    }
    float ngon(vec2 p, float n) {
        float seg = 2.0 * PI / max(n, 3.0);
        float a = atan(p.y, p.x);
        return cos(a - seg * floor(0.5 + a / seg)) * length(p);
    }
    float escape(vec2 z, vec2 c) {
        for (int k = 0; k < 96; k++) {
            z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
            float r2 = dot(z, z);
            if (r2 > 256.0) {
                return (float(k) + 1.0 - log2(log2(r2) / 8.0)) / 96.0;
            }
        }
        return 0.0;
    }
    float escape(vec2 c) {
        return escape(vec2(0.0), c);
    }

    float spiral(vec2 d) {
        float r = max(abs(d.x), abs(d.y));
        float n = (2.0 * r - 1.0); n = n * n;
        float p = 2.0 * r;
        if (d.x == r && d.y > -r) return n + (d.y + r);
        if (d.y == r) return n + p + (r - d.x);
        if (d.x == -r) return n + 2.0 * p + (r - d.y);
        return n + 3.0 * p + (r + d.x);
    }
    float dither(vec2 f) {
        int X = int(mod(f.x, 4.0));
        int Y = int(mod(f.y, 4.0));
        int i = X ^ Y;
        return float((i & 1) * 8 + (Y & 1) * 4 + (i & 2) + ((Y >> 1) & 1)) / 16.0;
    }

    float box(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }
    float box(vec2 p, float b) {
        return box(p, vec2(b));
    }
    float segment(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
    }
`;

function newScope(parent = null) {
    return { ids: { __proto__: parent ? parent.ids : null }, key: parent?.key };
}

function compile(value, scope, ctx, expect = null) {
    let rgba = scope.ids[value] ? null : cssColor(ctx.extra, value);
    if (rgba) {
        rgba = channels(rgba);
        return vector(rgba.length, rgba.map(float));
    }
    let items = parseValueGroup(value, { symbol: ',', noSpace: true }).map(v => v.trim());
    if (!items.length) return null;
    if (items.some(v => !v)) {
        ctx.warn('empty list item');
        return null;
    }
    if (items.length === 1) {
        let e = expr(items[0], scope, ctx);
        let type = e.type === 'int' ? 'float' : e.type;
        let code = e.code(expect || type);
        return code ? { type, code } : null;
    }
    let parts = items.map(v => {
        let { type, code } = expr(v, scope, ctx);
        let width = /^vec\d$/.test(type) ? Number(type[3]) : 1;
        return { width, code: code(width > 1 ? type : 'float') };
    });
    let n = parts.reduce((sum, p) => sum + p.width, 0);
    if (n !== 3 && n !== 4) {
        ctx.warn(`a list needs 3 or 4 channels, not ${n}`);
        return null;
    }
    return parts.every(p => p.code) ? vector(n, parts.map(p => p.code)) : null;
}

function channels(rgba) {
    return rgba[3] === 1 ? rgba.slice(0, 3) : rgba;
}

// `hsl(h .75 .65)` without % is the shader hsl(), not a CSS color
export function cssColor(extra, value) {
    return /^hsl\([^%]*\)$/i.test(value) ? null : extra.getRgbaColor(value);
}

// the channels of a color named in an expression, read once; the names given are no colors
export function colorReader(extra, miss, names = []) {
    let known = new Map(names.map(name => [name, null]));
    return name => {
        if (!known.has(name)) {
            let rgba = extra.getRgbaColor(name);
            known.set(name, rgba ? channels(rgba) : (miss(name), [0]));
        }
        return known.get(name);
    };
}

function vector(n, items) {
    return { type: `vec${n}`, code: `vec${n}(${items.join(', ')})` };
}

function expr(code, scope, ctx) {
    return parse(code, { types: ctx.types, names: scope.ids, unknown: ctx.unknown, warn: ctx.warn, rand: () => randAt(scope, ctx) });
}

function randAt(scope, ctx) {
    return `rand(vec2(i, ${scope.key || '0.0'}) + ${float(++ctx.sites)} * vec2(0.7548, 0.5698))`;
}

function generateStatement(name, value, scope, ctx) {
    let [, base, part] = name.match(/^([a-zA-Z_]\w*)(?:\.(\w+))?$/) || [];
    if (base?.startsWith('g_')) {
        ctx.warn('g_ names are reserved');
        return '';
    }
    let from = part && expr(base, scope, ctx).type, size = /^vec/.test(from) && +from[3];
    if (!base || part && !['xyzw', 'rgba', 'stpq'].some(set => [...part].every((c, k) => set.slice(0, size).includes(c) && part.indexOf(c) == k))) {
        ctx.warn(`invalid name "${name}"`);
        return '';
    }
    let id = scope.ids[base];
    if (id || part) {
        if (ctx.readonly.has(id)) {
            ctx.warn(`${name} is read-only`);
            return '';
        }
        ctx.counts.delete(id);
        let type = !part ? ctx.types[id] : part.length > 1 ? `vec${part.length}` : 'float';
        let v = compile(value, scope, ctx, type);
        if (v && /vec|mat/.test(v.type) && v.type !== type) {
            ctx.warn(`${name} is a ${type}, not a ${v.type}`);
            return '';
        }
        if (!v) return '';
        let copy = id ? '' : generateStatement(base, base, scope, ctx);
        return `${copy}${scope.ids[base]}${part ? '.' + part : ''} = ${v.code};\n`;
    }
    let v = compile(value, scope, ctx);
    if (!v) return '';
    id = scope.ids[name] = `g_${++ctx.id}`;
    ctx.types[id] = v.type;
    if (/^\d+$/.test(value)) ctx.counts.set(id, Number(value));
    return `${v.type} ${id} = ${v.code};\n`;
}

function generateFill(value, scope, ctx) {
    let v = compile(value, scope, ctx);
    if (!v) return '';
    let { type, code } = v;
    if (type === 'vec4') return `g_color = ${code};\n`;
    if (type === 'vec3') return `g_color = vec4(${code}, 1.0);\n`;
    if (type === 'vec2') return `g_color = vec4(${code}, 0.0, 1.0);\n`;
    if (type === 'bool') code = `float(${code})`;
    else if (type !== 'float') {
        ctx.warn(`fill cannot take a ${type}`);
        return '';
    }
    return `g_color = vec4(vec3(${code}), 1.0);\n`;
}

function asFloat(value, scope, ctx, what) {
    let { type, code } = expr(value, scope, ctx);
    if (type !== 'float' && type !== 'int' && type !== 'bool') {
        ctx.warn(`${what} needs a number`);
        return '';
    }
    return code('float');
}

function generateShape(value, scope, ctx) {
    ctx.masked = true;
    if (value === 'none') return 'g_masked = false;\n';
    let d = MASKS[value] || asFloat(value, scope, ctx, 'shape');
    return d ? `g_dist = ${d};\ng_masked = true;\n` : '';
}

function generateSize(value, scope, ctx) {
    let size = asFloat(value, scope, ctx, 'size');
    return size ? `size = ${size};\n` : '';
}

const OUTPUT_GENERATORS = {
    __proto__: null,
    fill: generateFill,
    shape: generateShape,
    size: generateSize,
};

function generateRepeat(token, scope, ctx, opts) {
    let [head = '', ...stops] = token.args;
    let m = head.match(/^(\w+)(?:\s+as\s+(\S+))?$/);
    let times = m && (/^\d+$/.test(m[1]) ? Number(m[1]) : ctx.counts.get(scope.ids[m[1]]));
    let work = (opts.work || 1) * times;
    let error = !m ? 'repeat() needs a count'
        : times === undefined ? `repeat() count ${m[1]} must be a fixed whole number`
        : times > MAX_REPEAT ? `repeat() count exceeds ${MAX_REPEAT}`
        : work > MAX_REPEAT_WORK ? `nested repeat() exceeds ${MAX_REPEAT_WORK} steps`
        : m[2] && !NAME.test(m[2]) ? `invalid name "${m[2]}"`
        : '';
    if (error) {
        ctx.warn(error);
        return '';
    }
    let inner = newScope(scope);
    let counter = `g_${++ctx.id}`;
    ctx.types[counter] = 'float';
    ctx.readonly.add(counter);
    if (m[2]) inner.ids[m[2]] = counter;
    inner.key = scope.key ? `(${scope.key} * ${float(times)} + ${counter})` : counter;
    let body = generateBody(token.value, inner, ctx, { ...opts, loop: true, work, branched: opts.branched || stops.length > 0 });
    let stop = stops.map(s => expr(s, inner, ctx).code('bool')).filter(Boolean).join(' && ');
    if (stop) checkDerivatives(body, 'a repeat() that stops', ctx, opts);
    return glsl`
        for (float ${counter} = 0.0; ${counter} < ${float(times)}; ${counter}++) {
          ${body}
          ${stop && `if (${stop}) break;`}
        }
    ` + '\n';
}

function generateMatch(arms, scope, ctx, opts) {
    let out = '';
    for (let [k, { type, test, value }] of arms.entries()) {
        let isElse = test === 'else';
        if (type !== 'arm' || !test) ctx.warn('match arms need a test');
        else if (isElse && k < arms.length - 1) ctx.warn('else must be last');
        else if (isElse || (test = expr(test, scope, ctx).code('bool'))) {
            let body = generateBody(value, newScope(scope), ctx, { ...opts, branched: true });
            out += (out ? ' else ' : '') + (isElse ? '' : `if (${test}) `) + `{\n${body}}`;
        }
    }
    checkDerivatives(out, 'match', ctx, opts);
    return out && out + '\n';
}

// code reading the slope between neighbouring pixels
export const DERIVATIVES = /\b(fwidth|dFdx|dFdy|g_shape)\(/;

function checkDerivatives(code, where, ctx, opts) {
    if (!opts.branched && DERIVATIVES.test(code)) {
        ctx.warn(`compute ramp(), shape() and fwidth() before ${where}`);
    }
}

// the statements and blocks of a body, in source order
function generateBody(tokens, scope, ctx, opts = {}) {
    let out = '';
    let { loop, top } = opts;
    let has = name => tokens.some(t => t.type === 'statement' && t.name === name);
    let hasShape = has('shape');
    if (!loop && !hasShape && !opts.shaped && has('size')) out += generateShape('square', scope, ctx);
    opts = { ...opts, top: false, shaped: opts.shaped || hasShape };
    for (let t of tokens) {
        if (t.type === 'statement') {
            if (t.name === 'grid') {
                if (!top) ctx.warn('grid must be top level');
            } else if (!OUTPUT_GENERATORS[t.name]) {
                out += generateStatement(t.name, t.value, scope, ctx);
            } else if (loop) {
                ctx.warn(`no ${t.name} in repeat()`);
            } else {
                out += OUTPUT_GENERATORS[t.name](t.value, scope, ctx);
            }
        } else if (t.type === 'text') {
            ctx.warn(`write "${t.value}" as name: value`);
        } else if (t.type === 'texture') {
            if (!top) ctx.warn('texture must be top level');
        } else if (t.name === 'repeat') {
            out += generateRepeat(t, scope, ctx, opts);
        } else if (t.arms) {
            out += generateMatch(t.arms, scope, ctx, opts);
        } else if (t.name === 'match') {
            let args = t.args.filter(Boolean);
            if (args.length === 1) {
                out += generateMatch([{ type: 'arm', test: `(${args[0]})`, value: t.value }], scope, ctx, opts);
            } else {
                ctx.warn('match() needs one expression');
            }
        } else {
            ctx.warn(t.name === 'else' ? 'else goes in match { }' : `unknown block ${t.name}`);
        }
    }
    return out;
}

function generateShader({ grid, body, masked }) {
    let usesTime = /(?<![\w.])t\b/.test(body);
    return glsl`
    precision highp int;
    const float PI = 3.1415926535897932;
    ${HELPERS}
    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float X = ${float(grid.x)}, Y = ${float(grid.y)}, I = X * Y;
        float x = floor(uv.x * X) + 1.0;
        float y = floor((1.0 - uv.y) * Y) + 1.0;
        float i = x + (y - 1.0) * X;
        float t = ${usesTime ? 'u_time' : '0.0'};
        ${CELL_INDEX}
        vec4 g_color = vec4(0.0);
        float size = 1.0;
        ${masked ? 'float g_dist = 0.0;\nbool g_masked = false;' : ''}
        ${body}
        ${masked ? 'float g_mask = g_shape(g_dist, size);\nif (g_masked) g_color.a *= g_mask;' : ''}
        FragColor = g_color;
    }
  `;
}

export default function drawPattern(code, extra, warn = () => {}) {
    let tokens = parsePattern(code);
    let ctx = {
        extra, warn, id: 0, sites: 0, types: { __proto__: null }, counts: new Map(), readonly: new Set(), masked: false,
        unknown: colorReader(extra, name => warn(name == 'grid' ? 'grid is not a value; use X, Y' : /^(fill|shape)$/.test(name) ? `${name} is not a value`
            : `unknown name ${name}` + (/^(deg|rad|turn|grad|px|em|rem|vw|vh|vmin|vmax|ms)$/.test(name) ? '; no units, angles are radians' : '')), BUILTINS),
    };
    let grid = tokens.findLast(t => t.type === 'statement' && t.name === 'grid')?.value;
    let textures = new Map(tokens.filter(t => t.type === 'texture').map(t => [t.name, t.value]));
    for (let name of textures.keys()) ctx.types[name] = 'sampler2D';
    let body = '';
    try { body = generateBody(tokens, newScope(), ctx, { top: true }); }
    catch (e) { warn(e.message); }
    let fragment = generateShader({
        grid: parseGrid(grid, Infinity),
        body,
        masked: ctx.masked,
    });
    return { fragment, textures: [...textures].map(([name, value]) => ({ name, value })) };
}
