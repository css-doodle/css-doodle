import parsePattern from '../parser/parse-pattern.js';
import parseGrid from '../parser/parse-grid.js';
import parseValueGroup from '../parser/parse-value-group.js';
import transform from './glsl-math-transformer.js';
import { glsl } from '../lib/tagged-template.js';

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
    if (shape === 'circle') return '\ncssd_mask = cssd_shape(length(vec2(du, dv)), size);\n';
    if (shape === 'square') return '\ncssd_mask = cssd_shape(max(abs(du), abs(dv)), size);\n';
    return '\ncssd_mask = 1.0;\n';
}

function resolveAlias(value, vars) {
    for (let i = 0; i < 10; i++) {
        if (!/^[a-zA-Z_][\w-]*$/.test(value) || !Object.hasOwn(vars, value)) break;
        value = String(vars[value]).trim();
    }
    return value;
}

function compileFill(expr, vars) {
    let channels = parseValueGroup(expr, { symbol: ',', noSpace: true })
        .map(c => c.trim())
        .filter(Boolean);
    if (channels.length === 3 || channels.length === 4) {
        let ch = channels.map(c => transform(substituteVariables(c, vars), { expect: 'float' }));
        let alpha = channels.length === 4 ? ch[3] : '1.0';
        return `vec4(${ch[0]}, ${ch[1]}, ${ch[2]}, ${alpha})`;
    }
    if (channels.length !== 1) return null;
    let single = transform(substituteVariables(channels[0], vars), { expect: 'float' });
    return single ? `vec4(vec3(${single}), 1.0)` : null;
}

// `fill: red` is a static color, anything else compiles as an expression
function generateFill(token, extra, vars) {
    let value = resolveAlias(token.value.trim(), vars);
    if (!value) return '';
    let rgba = extra.getRgbaColor(value);
    if (rgba) {
        let { r, g, b, a } = rgba;
        return `\ncssd_color = vec4(${float(r/255)}, ${float(g/255)}, ${float(b/255)}, ${float(a)});\n`;
    }
    let computed = compileFill(value, vars);
    return computed ? `\ncssd_color = ${computed};\n` : '';
}

// grid, shape, size and the variables of a body, fill left out
function readSettings(tokens, settings, vars) {
    for (let t of tokens) {
        if (t.type !== 'statement' || t.name === 'fill') continue;
        let value = t.value.trim();
        if (t.name === 'grid' || t.name === 'shape' || t.name === 'size') {
            settings[t.name] = value;
        } else {
            vars[t.name.trim()] = value;
        }
    }
}

function substituteVariables(expr, vars, depth = 0, excludeName = null) {
    if (depth > 10) return expr;
    let names = Object.keys(vars).sort((a, b) => b.length - a.length);
    for (let name of names) {
        if (name === excludeName) continue;
        // not after a dot: the b in c.b is a swizzle, not the variable b
        let regex = new RegExp(`(?<![\\w.])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (regex.test(expr)) {
            let resolved = substituteVariables(vars[name], vars, depth + 1, name);
            expr = expr.replace(regex, `(${resolved})`);
        }
    }
    return expr;
}

// helpers and GLSL functions that return a float from a vector argument
const FLOAT_CALL = /^[(-]*(rand|noise|fbm|voronoi|ngon|escape|spiral|dither|length|distance|dot)\(/;

// the type of a loop state: what its first call returns, else a vector
// constructor or a bare `uv` makes it a vector
function typeOf(value) {
    if (FLOAT_CALL.test(value)) return 'float';
    let m = value.match(/\b(vec[234]|mat2)\(/);
    return m ? m[1] : (/\buv\b(?!\.)/.test(value) ? 'vec2' : 'float');
}

function generateIterate(token, vars, warn, types) {
    let [count, stop] = token.args.map(a => a.trim());
    let times = parseInt(count);
    if (isNaN(times)) {
        warn('iterate() needs a step count');
        return '';
    }
    let body = {};
    for (let t of token.value) {
        if (t.type !== 'statement' || t.name === 'fill') continue;
        body[t.name.trim()] = t.value.trim();
    }
    let state = Object.keys(body).filter(name => Object.hasOwn(vars, name));
    let scope = Object.assign({}, vars, body);
    for (let name of state) scope[name] = name;
    scope.n = 'n';
    let expr = (value, expect, from = scope) => transform(substituteVariables(value, from), { expect });
    // a name an earlier loop already made a GLSL variable keeps its value
    let init = state
        .filter(name => vars[name] !== name)
        .map(name => {
            let value = expr(vars[name], 'float', vars);
            types[name] = typeOf(value);
            return `${types[name]} ${name} = ${value};`;
        });
    let next = state.map(name => `${types[name]} ${name}_ = ${expr(body[name], 'float')};`);
    let assign = state.map(name => `${name} = ${name}_;`);
    let counter = vars.n === 'n' ? 'n = 0.0;' : 'float n = 0.0;';
    let leave = stop ? `if (${expr(stop, 'bool')}) break;` : '';
    for (let name of state) vars[name] = name;
    vars.n = 'n';
    return glsl`
        ${init.join('\n')}
        ${counter}
        for (int cssd_k = 0; cssd_k < ${times}; cssd_k++) {
          ${next.join('\n')}
          ${assign.join('\n')}
          n += 1.0;
          ${leave}
        }
    `;
}

function generateBlock(token, extra, vars, outerShape, warn, types) {
    if (token.name === 'iterate') {
        return generateIterate(token, vars, warn, types);
    }
    // cond() blocks; match() is the legacy name
    if (token.name !== 'cond' && token.name !== 'match') {
        return '';
    }
    let args = token.args.map(a => a.trim()).filter(Boolean);
    if (!args.length) {
        return '';
    }
    let cond = args
        .map(a => transform(substituteVariables(a, vars), { expect: 'bool' }))
        .join(' && ');
    let scope = Object.assign({}, vars);
    let settings = {};
    readSettings(token.value, settings, scope);
    let { shape: blockShape, size: blockSize } = settings;
    let header = '';
    if (blockSize) {
        header += `\nsize = ${transform(substituteVariables(blockSize, scope), { expect: 'float' })};\n`;
    }
    if (blockShape) {
        header += maskFor(blockShape);
    } else if (blockSize) {
        header += maskFor(outerShape || 'square');
    }
    let body = token.value
        .map(t => {
            if (t.type === 'block') {
                return generateBlock(t, extra, scope, blockShape || outerShape, warn, types);
            }
            return t.type === 'statement' && t.name === 'fill' ? generateFill(t, extra, scope) : '';
        })
        .join('');
    return glsl`
    if (${cond}) {
      ${header}
      ${body}
    }
  `;
}

function generateShader(input, { x, y }, shape, sizeExpr, vars) {
    let sizeInit = sizeExpr
        ? transform(substituteVariables(sizeExpr, vars), { expect: 'float' })
        : '1.0';
    let maskInit = shape ? maskFor(shape) : '';
    let usesTime = /\bt\b/.test(input) || /\bt\b/.test(sizeInit);
    return glsl`
    precision highp float;
    precision highp int;
    const float PI = 3.1415926535897932;
    ${HELPERS}
    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float X = ${float(x)}, Y = ${float(y)}, I = X * Y;
        float x = floor(uv.x * X) + 1.0;
        float y = floor((1.0 - uv.y) * Y) + 1.0;
        float i = x + (y - 1.0) * X;
        float t = ${usesTime ? 'u_time' : '0.0'};
        vec4 cssd_color = vec4(0.0);
        float cssd_mask = 1.0;
        ${CELL_INDEX}
        float size = ${sizeInit};
        ${maskInit}
        ${input}
        cssd_color.a *= cssd_mask;
        FragColor = cssd_color;
    }
  `;
}

export default function drawPattern(code, extra, warn = () => {}) {
    let tokens = parsePattern(code);
    let settings = {};
    let vars = {};
    let types = {};
    readSettings(tokens, settings, vars);
    let grid = settings.grid !== undefined ? parseGrid(settings.grid, Infinity) : { x: 1, y: 1 };
    let shape = settings.shape || (settings.size ? 'square' : null);
    let result = [];
    for (let token of tokens) {
        if (token.type === 'statement' && token.name === 'fill') {
            result.push(generateFill(token, extra, vars));
        } else if (token.type === 'block') {
            result.push(generateBlock(token, extra, vars, shape, warn, types));
        }
    }
    return generateShader(result.join(''), grid, shape, settings.size, vars);
}
