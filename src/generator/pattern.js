import parsePattern from '../parser/parse-pattern.js';
import parseGrid from '../parser/parse-grid.js';
import parseValueGroup from '../parser/parse-value-group.js';
import transform from './glsl-math-transformer.js';
import { glsl } from '../lib/tagged-template.js';

const MAX_REPEAT = 1024;
const MAX_REPEAT_WORK = 65536;

// the statements that drive the shader; every other statement names a variable
const OUTPUTS = new Set(['grid', 'shape', 'size', 'fill']);

// the distance from the cell center a shape masks by
const MASKS = {
    __proto__: null,
    circle: 'length(vec2(du, dv))',
    square: 'max(abs(du), abs(dv))',
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
const HELPERS = glsl`
    float cssd_hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    vec3 cssd_hue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }
    float cssd_shape(float d, float size) {
        float r = 0.5 * size;
        return 1.0 - smoothstep(r - fwidth(d), r, d);
    }

    float rand(vec2 p) {
        return cssd_hash(p + u_seed.x * 71.0);
    }
    float rand(float a, float b) {
        return rand(vec2(a, b));
    }
    float rand(float n) {
        return rand(vec2(n));
    }
    float noise(vec2 p) {
        vec2 ip = floor(p) + u_seed.x * 71.0;
        vec2 u = fract(p);
        u = u * u * (3.0 - 2.0 * u);
        float r0 = mix(cssd_hash(ip), cssd_hash(ip + vec2(1.0, 0.0)), u.x);
        float r1 = mix(cssd_hash(ip + vec2(0.0, 1.0)), cssd_hash(ip + vec2(1.0, 1.0)), u.x);
        return mix(r0, r1, u.y);
    }
    float noise(float a, float b) {
        return noise(vec2(a, b));
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
    float fbm(float px, float py) {
        return fbm(vec2(px, py));
    }
    float voronoi(vec2 p) {
        vec2 ip = floor(p) + u_seed.x * 71.0, fp = fract(p);
        float md = 8.0;
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(cssd_hash(ip + g), cssd_hash(ip + g + 19.7));
            vec2 r = g + o - fp;
            md = min(md, dot(r, r));
        }
        return sqrt(md);
    }
    float voronoi(float px, float py) {
        return voronoi(vec2(px, py));
    }

    vec3 hsl(float h, float s, float l) {
        return l + s * (cssd_hue(h) - 0.5) * (1.0 - abs(2.0 * l - 1.0));
    }
    vec3 hsv(float h, float s, float v) {
        return v * mix(vec3(1.0), cssd_hue(h), s);
    }

    vec2 rot(vec2 p, float a) {
        float c = cos(a), s = sin(a);
        return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }
    vec2 rot(float px, float py, float a) {
        return rot(vec2(px, py), a);
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
    float ngon(float px, float py, float n) {
        return ngon(vec2(px, py), n);
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
    float escape(float zx, float zy, float cx, float cy) {
        return escape(vec2(zx, zy), vec2(cx, cy));
    }
    float escape(float cx, float cy) {
        return escape(vec2(0.0), vec2(cx, cy));
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
    float spiral(float dx, float dy) {
        return spiral(vec2(dx, dy));
    }
    float dither(vec2 f) {
        int X = int(mod(f.x, 4.0));
        int Y = int(mod(f.y, 4.0));
        int i = X ^ Y;
        return float((i & 1) * 8 + (Y & 1) * 4 + (i & 2) + ((Y >> 1) & 1)) / 16.0;
    }
    float dither(float fx, float fy) {
        return dither(vec2(fx, fy));
    }
`;

function float(n) {
    return String(n).includes('.') ? n : n + '.0';
}

function maskFor(shape) {
    let d = MASKS[shape];
    return `\ncssd_mask = ${d ? `cssd_shape(${d}, size)` : '1.0'};\n`;
}

// Variables are macros: every name in the expression is replaced by its
// (expanded) value. Longest names first so `size-2` is not read as `size - 2`.
function expand(expr, vars, depth = 0, self = null) {
    if (depth > 10) return expr;
    let names = Object.keys(vars).sort((a, b) => b.length - a.length);
    for (let name of names) {
        if (name === self) continue;
        // not after a letter or a dot, and not inside a #hex literal: 2p is 2 × p,
        // the b in c.b is a swizzle, the a in #f0a is a color
        let escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let regex = new RegExp(`(?<![a-zA-Z_.])(?<!#[0-9a-fA-F]*)${escaped}\\b`, 'g');
        let value;
        expr = expr.replace(regex, () => value ??= `(${expand(vars[name], vars, depth + 1, name)})`);
    }
    return expr;
}

function glslOf(value, vars, ctx, expect) {
    return transform(expand(value, vars), { expect, types: ctx.types });
}

// splits a body into its shader outputs and its variables
function readStatements(tokens, vars) {
    let settings = {};
    for (let t of tokens) {
        if (t.type !== 'statement' || t.name === 'fill') continue;
        (OUTPUTS.has(t.name) ? settings : vars)[t.name] = t.value;
    }
    return settings;
}

// `c: red; fill: c` — a fill naming a variable takes its value, so that
// CSS colors stay static
function resolveAlias(value, vars) {
    for (let i = 0; i < 10 && Object.hasOwn(vars, value); i++) {
        value = vars[value];
    }
    return value;
}

function generateFill(token, vars, ctx) {
    let value = resolveAlias(token.value, vars);
    if (!value) return '';
    let rgba = ctx.extra.getRgbaColor(value);
    let channels = rgba
        ? [rgba.r / 255, rgba.g / 255, rgba.b / 255, rgba.a].map(float)
        : parseValueGroup(value, { symbol: ',', noSpace: true })
            .map(v => v.trim())
            .filter(Boolean)
            .map(v => glslOf(v, vars, ctx, 'float'));
    let n = channels.length;
    if (!(n === 1 || n === 3 || n === 4) || !channels.every(Boolean)) return '';
    if (n === 1) channels = [`vec3(${channels[0]})`];
    if (n !== 4) channels.push('1.0');
    return `\ncssd_color = vec4(${channels.join(', ')});\n`;
}

// Turns a variable into GLSL state: a typed `cssdN` the name points to from
// now on. Ints join the float number model of the pattern language.
function declare(name, value, vars, ctx) {
    let type = transform(value, { type: true, types: ctx.types });
    if (type === 'int') type = 'float';
    let id = vars[name] = `cssd${++ctx.id}`;
    ctx.types[id] = type;
    return `${type} ${id} = ${transform(value, { expect: type, types: ctx.types })};`;
}

// the outer variables a repeat body, including its nested repeats, writes
function assigned(tokens, vars, names = new Set()) {
    for (let t of tokens) {
        if (t.type === 'block' && t.name === 'repeat') assigned(t.value, vars, names);
        else if (t.type === 'statement' && Object.hasOwn(vars, t.name) && !OUTPUTS.has(t.name)) names.add(t.name);
    }
    return names;
}

function generateRepeat(token, vars, ctx, work) {
    let [head = '', ...stops] = token.args;
    let m = head.match(/^(\d+)(?:\s+as\s+([a-zA-Z_][\w-]*))?$/);
    let times = m && Number(m[1]);
    let error = !m ? 'repeat() needs a step count'
        : times > MAX_REPEAT ? `repeat() step count cannot exceed ${MAX_REPEAT}`
        : work * times > MAX_REPEAT_WORK ? `nested repeat() work cannot exceed ${MAX_REPEAT_WORK}`
        : '';
    if (error) {
        ctx.warn(error);
        return '';
    }
    // the variables the loop writes are declared once, before it, in the enclosing scope
    let init = [];
    for (let name of assigned(token.value, vars)) {
        if (!ctx.types[vars[name]]) init.push(declare(name, expand(vars[name], vars, 0, name), vars, ctx));
    }
    let scope = { ...vars };
    let counter = `cssd${++ctx.id}`;
    ctx.types[counter] = 'float';
    ctx.readonly.add(counter);
    if (m[2]) scope[m[2]] = counter;

    let body = [];
    for (let t of token.value) {
        let { name } = t;
        if (t.type === 'block') {
            if (name === 'repeat') body.push(generateRepeat(t, scope, ctx, work * times));
            else ctx.warn(`repeat() does not allow ${name} blocks`);
        } else if (OUTPUTS.has(name)) {
            ctx.warn(`repeat() does not allow ${name}`);
        } else if (ctx.readonly.has(scope[name])) {
            ctx.warn(`repeat() index ${name} is read-only`);
        } else if (Object.hasOwn(scope, name)) {
            body.push(`${scope[name]} = ${glslOf(t.value, scope, ctx, ctx.types[scope[name]])};`);
        } else {
            body.push(declare(name, expand(t.value, scope), scope, ctx));
        }
    }
    let stop = stops.map(s => glslOf(s, scope, ctx, 'bool')).join(' && ');
    return glsl`
        ${init.join('\n')}
        for (float ${counter} = 0.0; ${counter} < ${float(times)}; ${counter}++) {
          ${body.join('\n')}
          ${stop && `if (${stop}) break;`}
        }
    `;
}

function generateMatch(token, vars, outerShape, ctx) {
    let args = token.args.filter(Boolean);
    if (!args.length) return '';
    if (args.length > 1) {
        ctx.warn('match() needs one expression');
        return '';
    }
    let cond = glslOf(args[0], vars, ctx, 'bool');
    let scope = { ...vars };
    let { shape, size } = readStatements(token.value, scope);
    // a size without a shape masks with the enclosing shape, a square by default
    let header = size ? `\nsize = ${glslOf(size, scope, ctx, 'float')};\n` : '';
    if (shape || size) header += maskFor(shape || outerShape || 'square');
    let body = token.value.map(t => generate(t, scope, shape || outerShape, ctx)).join('');
    return glsl`
    if (${cond}) {
      ${header}
      ${body}
    }
  `;
}

// the code a body item emits; variables and settings are read by readStatements
function generate(token, vars, shape, ctx) {
    if (token.type === 'statement') return token.name === 'fill' ? generateFill(token, vars, ctx) : '';
    if (token.name === 'repeat') return generateRepeat(token, vars, ctx, 1);
    if (token.name === 'match') return generateMatch(token, vars, shape, ctx);
    return '';
}

function generateShader({ grid, state, size, mask, body }) {
    let usesTime = /\bt\b/.test([state, size, body].join('\n'));
    return glsl`
    precision highp float;
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
        vec4 cssd_color = vec4(0.0);
        float cssd_mask = 1.0;
        ${CELL_INDEX}
        ${state}
        float size = ${size};
        ${mask}
        ${body}
        cssd_color.a *= cssd_mask;
        FragColor = cssd_color;
    }
  `;
}

export default function drawPattern(code, extra, warn = () => {}) {
    let tokens = parsePattern(code);
    let vars = {};
    let ctx = { extra, warn, id: 0, types: { __proto__: null }, readonly: new Set() };
    let settings = readStatements(tokens, vars);
    let shape = settings.shape || (settings.size ? 'square' : null);
    // top-level repeats run before the size and the fills, which read the state
    // they leave behind; a fill written before a repeat still sees the initial value
    let state = [];
    let body = [];
    for (let t of tokens) {
        let out = t.type === 'block' && t.name === 'repeat' ? state : body;
        out.push(generate(t, vars, shape, ctx));
    }
    return generateShader({
        grid: settings.grid === undefined ? { x: 1, y: 1 } : parseGrid(settings.grid, Infinity),
        state: state.join(''),
        size: settings.size ? glslOf(settings.size, vars, ctx, 'float') : '1.0',
        mask: shape ? maskFor(shape) : '',
        body: body.join(''),
    });
}
