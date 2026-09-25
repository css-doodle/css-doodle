import parsePattern from '../parser/parse-pattern.js';
import parseGrid from '../parser/parse-grid.js';
import parseValueGroup from '../parser/parse-value-group.js';
import transform from './glsl-math-transformer.js';
import { glsl } from '../lib/tagged-template.js';

const MAX_REPEAT = 1024;
const MAX_REPEAT_WORK = 65536;

const BUILTINS = [
    'x', 'y', 'i', 'X', 'Y', 'I', 'dx', 'dy', 'du', 'dv', 'dr', 'dc', 'dm', 'da', 'db', 'uv', 'pos', 't', 'size',
    'PI', 'true', 'false', 'u_time', 'u_resolution', 'u_seed', 'u_mouse', 'u_timeDelta', 'u_frameIndex', 'gl_FragCoord',
];

const NAME = /^[a-zA-Z_]\w*$/;

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
        return 1.0 - smoothstep(r - max(fwidth(d), 1e-5), r, d);
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

function newScope(parent = null) {
    return { ids: { __proto__: parent ? parent.ids : null } };
}

function compile(value, scope, ctx, expect = null) {
    let rgba = ctx.extra.getRgbaColor(value);
    let items = rgba
        ? rgba.map(float)
        : parseValueGroup(value, { symbol: ',', noSpace: true }).map(v => v.trim()).filter(Boolean);
    if (!items.length) return null;
    if (items.length === 1) {
        let type = expr(items[0], scope, ctx, null, true);
        if (type === 'int') type = 'float';
        let code = expr(items[0], scope, ctx, expect || type);
        return code ? { type, code } : null;
    }
    if (items.length !== 3 && items.length !== 4) {
        ctx.warn(`a list value needs 3 or 4 items, not ${items.length}`);
        return null;
    }
    let channels = rgba ? items : items.map(v => expr(v, scope, ctx, 'float'));
    if (!channels.every(Boolean)) return null;
    let type = `vec${items.length}`;
    let code = `${type}(${channels.join(', ')})`;
    return { type, code: expect && expect !== type ? `${expect}(${code})` : code };
}

function expr(code, scope, ctx, expect, type = false) {
    return transform(code, { expect, type, types: ctx.types, names: scope.ids, unknown: ctx.unknown });
}

function generateStatement(name, value, scope, ctx) {
    if (!NAME.test(name)) {
        ctx.warn(`"${name}" is not a valid name`);
        return '';
    }
    if (name.startsWith('cssd')) {
        ctx.warn(`names starting with cssd are reserved`);
        return '';
    }
    let id = scope.ids[name];
    if (id) {
        if (ctx.readonly.has(id)) {
            ctx.warn(`repeat() index ${name} is read-only`);
            return '';
        }
        let v = compile(value, scope, ctx, ctx.types[id]);
        return v ? `${id} = ${v.code};\n` : '';
    }
    let v = compile(value, scope, ctx);
    if (!v) return '';
    id = scope.ids[name] = `cssd${++ctx.id}`;
    ctx.types[id] = v.type;
    return `${v.type} ${id} = ${v.code};\n`;
}

function generateFill(value, scope, ctx) {
    let v = compile(value, scope, ctx);
    if (!v) return '';
    let { type, code } = v;
    if (type === 'vec4') return `cssd_color = ${code};\n`;
    if (type === 'vec3') return `cssd_color = vec4(${code}, 1.0);\n`;
    if (type === 'vec2') return `cssd_color = vec4(${code}, 0.0, 1.0);\n`;
    if (type === 'bool') code = `float(${code})`;
    else if (type !== 'float' && type !== 'int') {
        ctx.warn(`fill cannot take a ${type}`);
        return '';
    }
    return `cssd_color = vec4(vec3(${code}), 1.0);\n`;
}

function asFloat(value, scope, ctx, what) {
    let type = expr(value, scope, ctx, null, true);
    if (type && type !== 'float' && type !== 'int' && type !== 'bool') {
        ctx.warn(`${what} needs a number`);
        return '';
    }
    return expr(value, scope, ctx, 'float');
}

function generateShape(value, scope, ctx) {
    ctx.masked = true;
    if (value === 'none') return 'cssd_masked = false;\n';
    let d = MASKS[value] || asFloat(value, scope, ctx, 'shape');
    return d ? `cssd_dist = ${d};\ncssd_masked = true;\n` : '';
}

function generateSize(value, scope, ctx) {
    ctx.masked = true;
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
    let m = head.match(/^(\d+)(?:\s+as\s+(\S+))?$/);
    let times = m && Number(m[1]);
    let work = (opts.work || 1) * times;
    let error = !m ? 'repeat() needs a step count'
        : times > MAX_REPEAT ? `repeat() step count cannot exceed ${MAX_REPEAT}`
        : work > MAX_REPEAT_WORK ? `nested repeat() work cannot exceed ${MAX_REPEAT_WORK}`
        : m[2] && !NAME.test(m[2]) ? `"${m[2]}" is not a valid name`
        : '';
    if (error) {
        ctx.warn(error);
        return '';
    }
    let inner = newScope(scope);
    let counter = `cssd${++ctx.id}`;
    ctx.types[counter] = 'float';
    ctx.readonly.add(counter);
    if (m[2]) inner.ids[m[2]] = counter;
    let body = generateBody(token.value, inner, ctx, { ...opts, loop: true, work });
    let stop = stops.map(s => expr(s, inner, ctx, 'bool')).filter(Boolean).join(' && ');
    return glsl`
        for (float ${counter} = 0.0; ${counter} < ${float(times)}; ${counter}++) {
          ${body}
          ${stop && `if (${stop}) break;`}
        }
    ` + '\n';
}

const argsOf = block => block.args.filter(Boolean);
const isElse = block => block.name === 'else' && !argsOf(block).length;

function readChain(tokens, k) {
    let chain = [];
    do {
        let group = [tokens[k++]];
        while (tokens[k]?.value === group[0].value) group.push(tokens[k++]);
        chain.push(group);
    } while (tokens[k]?.name === 'else' && !isElse(chain.at(-1)[0]));
    return chain;
}

function generateMatch(chain, scope, ctx, opts) {
    let out = '';
    for (let [k, blocks] of chain.entries()) {
        let tests = [];
        if (!isElse(blocks[0])) {
            for (let block of blocks) {
                let args = argsOf(block);
                if (args.length !== 1) ctx.warn('match() needs one expression');
                else tests.push(expr(args[0], scope, ctx, 'bool'));
            }
            tests = tests.filter(Boolean);
            if (!tests.length) {
                if (k === 0) return '';
                continue;
            }
        }
        let body = generateBody(blocks[0].value, newScope(scope), ctx, opts);
        out += (k ? ' else ' : '') + (tests.length ? `if (${tests.join(' || ')}) ` : '') + `{\n${body}}`;
    }
    return out + '\n';
}

// the statements and blocks of a body, in source order
function generateBody(tokens, scope, ctx, opts = {}) {
    let out = '';
    let { loop, top } = opts;
    let has = name => tokens.some(t => t.type === 'statement' && t.name === name);
    let hasShape = has('shape');
    if (!loop && !hasShape && !opts.shaped && has('size')) out += generateShape('square', scope, ctx);
    opts = { ...opts, shaped: opts.shaped || hasShape };
    for (let k = 0; k < tokens.length; k++) {
        let t = tokens[k];
        if (t.type === 'statement') {
            if (t.name === 'grid') {
                if (!top) ctx.warn('grid must be at the top level');
            } else if (!OUTPUT_GENERATORS[t.name]) {
                out += generateStatement(t.name, t.value, scope, ctx);
            } else if (loop) {
                ctx.warn(`repeat() does not allow ${t.name}`);
            } else {
                out += OUTPUT_GENERATORS[t.name](t.value, scope, ctx);
            }
        } else if (t.name === 'repeat') {
            out += generateRepeat(t, scope, ctx, opts);
        } else if (t.name === 'match') {
            let chain = readChain(tokens, k);
            k += chain.flat().length - 1;
            out += generateMatch(chain, scope, ctx, opts);
        } else if (t.name === 'else') {
            ctx.warn('else needs a match block before it');
        } else {
            ctx.warn(`unknown block ${t.name}`);
        }
    }
    return out;
}

function generateShader({ grid, body, masked }) {
    let usesTime = /(?<![\w.])t\b/.test(body);
    let usesPos = /(?<![\w.])pos\b/.test(body);
    return glsl`
    precision highp float;
    precision highp int;
    const float PI = 3.1415926535897932;
    ${HELPERS}
    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        ${usesPos ? 'vec2 pos = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);' : ''}
        float X = ${float(grid.x)}, Y = ${float(grid.y)}, I = X * Y;
        float x = floor(uv.x * X) + 1.0;
        float y = floor((1.0 - uv.y) * Y) + 1.0;
        float i = x + (y - 1.0) * X;
        float t = ${usesTime ? 'u_time' : '0.0'};
        ${CELL_INDEX}
        vec4 cssd_color = vec4(0.0);
        float size = 1.0;
        ${masked ? 'float cssd_dist = 0.0;\nbool cssd_masked = false;' : ''}
        ${body}
        ${masked ? 'float cssd_mask = cssd_shape(cssd_dist, size);\nif (cssd_masked) cssd_color.a *= cssd_mask;' : ''}
        FragColor = cssd_color;
    }
  `;
}

export default function drawPattern(code, extra, warn = () => {}) {
    let tokens = parsePattern(code);
    let reported = new Set(BUILTINS);
    let ctx = {
        extra, warn, id: 0, types: { __proto__: null }, readonly: new Set(), masked: false,
        unknown: name => {
            if (!reported.has(name)) warn(`unknown name ${name}`);
            reported.add(name);
        },
    };
    let grid = tokens.findLast(t => t.type === 'statement' && t.name === 'grid')?.value;
    let body = generateBody(tokens, newScope(), ctx, { top: true });
    return generateShader({
        grid: grid === undefined ? { x: 1, y: 1 } : parseGrid(grid, Infinity),
        body,
        masked: ctx.masked,
    });
}
