import parsePattern from '../parser/parse-pattern.js';
import parseGrid from '../parser/parse-grid.js';
import parseValueGroup from '../parser/parse-value-group.js';
import transform from './glsl-math-transformer.js';
import { glsl } from '../utils/tagged-template.js';

const CELL_INDEX = glsl`
    float dx = x - (v.x + 1.0) * 0.5;
    float dy = y - (v.y + 1.0) * 0.5;
    float du = fract(uv.x * v.x) - 0.5;
    float dv = fract((1.0 - uv.y) * v.y) - 0.5;
    float dr = length(vec2(dx, dy));
    float dc = max(abs(dx), abs(dy));
    float dm = abs(dx) + abs(dy);
    float da = atan(dy, dx);
    float db = min(min(x - 1.0, v.x - x), min(y - 1.0, v.y - y));
`;

const HELPERS = glsl`
    float cssd_hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    float rand(float a, float b) {
        return cssd_hash(vec2(a, b) + u_seed.x * 71.0);
    }
    float rand(float n) {
        return rand(n, n);
    }
    float noise(float a, float b) {
        vec2 p = vec2(a, b);
        vec2 ip = floor(p) + u_seed.x * 71.0;
        vec2 u = fract(p);
        u = u * u * (3.0 - 2.0 * u);
        float r0 = mix(cssd_hash(ip), cssd_hash(ip + vec2(1.0, 0.0)), u.x);
        float r1 = mix(cssd_hash(ip + vec2(0.0, 1.0)), cssd_hash(ip + vec2(1.0, 1.0)), u.x);
        return mix(r0, r1, u.y);
    }
    float noise(float n) {
        return noise(n, 0.0);
    }
    vec3 cssd_hue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }
    vec3 hsl(float h, float s, float l) {
        return l + s * (cssd_hue(h) - 0.5) * (1.0 - abs(2.0 * l - 1.0));
    }
    vec3 hsv(float h, float s, float v) {
        return v * mix(vec3(1.0), cssd_hue(h), s);
    }
    // Fractal Brownian motion
    float fbm(float px, float py) {
        float s = 0.0, a = 0.5;
        vec2 p = vec2(px, py);
        for (int o = 0; o < 6; o++) {
            s += a * noise(p.x, p.y);
            p *= 2.03; a *= 0.5;
        }
        return s;
    }
    float voronoi(float px, float py) {
        vec2 p = vec2(px, py), ip = floor(p) + u_seed.x * 71.0, fp = fract(p);
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
    float rotx(float px, float py, float a) {
        return px * cos(a) - py * sin(a);
    }
    float roty(float px, float py, float a) {
        return px * sin(a) + py * cos(a);
    }
    float smin(float a, float b, float k) {
        k = max(k, 1e-6);
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
    }
    // Regular n-gon distance
    float ngon(float px, float py, float n) {
        float seg = 2.0 * PI / max(n, 3.0);
        float a = atan(py, px);
        return cos(a - seg * floor(0.5 + a / seg)) * length(vec2(px, py));
    }
    float escape(float zx, float zy, float cx, float cy) {
        for (int k = 0; k < 96; k++) {
            float nx = zx * zx - zy * zy + cx;
            zy = 2.0 * zx * zy + cy;
            zx = nx;
            float r2 = zx * zx + zy * zy;
            if (r2 > 4.0) {
                return (float(k) + 1.0 - log2(0.5 * log(r2))) / 96.0;
            }
        }
        return 0.0;
    }
    int cssd_int(float f) {
        return int(min(abs(f), 8388608.0) + 0.5);
    }
    float gcd(float a, float b) {
        int x = cssd_int(a), y = cssd_int(b);
        for (int k = 0; k < 64; k++) {
            if (y == 0) break;
            int t = x % y; x = y; y = t;
        }
        return float(x);
    }
    float prime(float fn) {
        int n = cssd_int(fn);
        if (n < 2) return 0.0;
        if (n % 2 == 0) return float(n == 2);
        for (int d = 3; d < 256; d += 2) {
            if (d * d > n) break;
            if (n % d == 0) return 0.0;
        }
        return 1.0;
    }
    float spiral(float dx, float dy) {
        float r = max(abs(dx), abs(dy));
        float n = (2.0 * r - 1.0); n = n * n;
        float p = 2.0 * r;
        if (dx == r && dy > -r) return n + (dy + r);
        if (dy == r) return n + p + (r - dx);
        if (dx == -r) return n + 2.0 * p + (r - dy);
        return n + 3.0 * p + (r + dx);
    }
    // 4x4 Bayer ordered-dither threshold (0..1) for cell (x, y).
    float dither(float fx, float fy) {
        int X = int(mod(fx, 4.0));
        int Y = int(mod(fy, 4.0));
        int i = X ^ Y;
        return float((i & 1) * 8 + (Y & 1) * 4 + (i & 2) + ((Y >> 1) & 1)) / 16.0;
    }
    float digitsum(float fn, float fb) {
        int n = cssd_int(fn);
        int b = int(fb + 0.5);
        if (b < 2) return 0.0;
        int s = 0;
        for (int k = 0; k < 24; k++) {
            if (n == 0) break;
            s += n % b;
            n /= b;
        }
        return float(s);
    }
    float digitsum(float fn) {
        return digitsum(fn, 10.0);
    }
    float collatz(float fn) {
        int n = cssd_int(fn);
        if (n < 1) return 0.0;
        int c = 0;
        for (int k = 0; k < 256; k++) {
            if (n == 1) break;
            if (n % 2 == 0) {
                n /= 2;
            } else {
                // (2^31 - 2) / 3: 3n+1 would overflow int32
                if (n > 715827882) break;
                n = 3 * n + 1;
            }
            c++;
        }
        return float(c);
    }
`;

const CIRCLE_MASK = glsl`
    vec2 cellUV = fract(uv * v) - 0.5;
    float dist = length(cellUV);
    float radius = 0.5 * size;
    shapeMask = 1.0 - smoothstep(radius - fwidth(dist), radius, dist);
`;

const SQUARE_MASK = glsl`
    vec2 cellUV = fract(uv * v) - 0.5;
    float dsq = max(abs(cellUV.x), abs(cellUV.y));
    float radius = 0.5 * size;
    shapeMask = 1.0 - smoothstep(radius - fwidth(dsq), radius, dsq);
`;

function float(n) {
    return String(n).includes('.') ? n : n + '.0';
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function maskFor(shape) {
    if (shape === 'circle') return CIRCLE_MASK;
    if (shape === 'square') return SQUARE_MASK;
    return '\nshapeMask = 1.0;\n';
}

function resolveAlias(value, vars) {
    for (let i = 0; i < 10; i++) {
        if (!/^[a-zA-Z_][\w-]*$/.test(value) || !hasOwn(vars, value)) break;
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

const STATEMENT_HANDLERS = {
    fill(token, extra, insideBlock, vars) {
        let value = resolveAlias(token.value.trim(), vars || {});
        if (!value) {
            return { type: 'statement', value: '' };
        }
        let rgba = extra.getRgbaColor(value);
        if (rgba) {
            let { r, g, b, a } = rgba;
            return {
                type: 'statement',
                value: `\ncolor = vec4(${float(r/255)}, ${float(g/255)}, ${float(b/255)}, ${float(a)});\n`,
            };
        }
        let computed = compileFill(value, vars || {});
        return { type: 'statement', value: computed ? `\ncolor = ${computed};\n` : '' };
    },
    grid(token) {
        return { type: 'grid', value: token.value };
    },
    size(token) {
        return { type: 'size', value: token.value.trim() };
    },
    shape(token) {
        return { type: 'shape', value: token.value.trim() };
    },
};

function generateStatement(token, extra, insideBlock = false, vars = {}) {
    if (token.type !== 'statement') {
        return { type: 'statement', value: '' };
    }
    let handler = STATEMENT_HANDLERS[token.name];
    if (handler) {
        return handler(token, extra, insideBlock, vars);
    }
    let varName = token.name.startsWith('--') ? token.name.slice(2).trim() : token.name.trim();
    if (varName) {
        return { type: 'variable', name: varName, value: token.value.trim() };
    }
    return { type: 'statement', value: '' };
}

function substituteVariables(expr, vars, depth = 0, excludeName = null) {
    if (depth > 10) return expr;
    let names = Object.keys(vars).sort((a, b) => b.length - a.length);
    for (let name of names) {
        if (name === excludeName) continue;
        let regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (regex.test(expr)) {
            let resolved = substituteVariables(vars[name], vars, depth + 1, name);
            expr = expr.replace(regex, `(${resolved})`);
        }
    }
    return expr;
}

function generateBlock(token, extra, vars = {}, outerShape = null) {
    if (token.name !== 'match') {
        return '';
    }
    let args = (token.args || []).map(a => (a || '').trim()).filter(Boolean);
    if (!args.length) {
        return '';
    }
    let cond = args
        .map(a => transform(substituteVariables(a, vars), { expect: 'bool' }))
        .join(' && ');
    let scope = Object.assign({}, vars);
    let blockShape = null;
    let blockSize = null;
    for (let t of token.value) {
        if (t.type !== 'statement' || t.name === 'fill') continue;
        let s = generateStatement(t, extra, true, scope);
        if (s.type === 'variable') scope[s.name] = s.value;
        else if (s.type === 'shape' && s.value) blockShape = s.value;
        else if (s.type === 'size' && s.value) blockSize = s.value;
    }
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
                return generateBlock(t, extra, scope, blockShape || outerShape);
            }
            let s = generateStatement(t, extra, true, scope);
            return s.type === 'statement' ? s.value : '';
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
    let hasSize = !!(sizeExpr && sizeExpr.length);
    let sizeInit = hasSize
        ? transform(substituteVariables(sizeExpr, vars), { expect: 'float' })
        : '1.0';
    let maskInit = '';
    if (shape) {
        maskInit = maskFor(shape);
    } else if (hasSize) {
        maskInit = SQUARE_MASK;
    }
    let usesTime = /\bt\b/.test(input) || /\bt\b/.test(sizeInit);
    let timeArg = usesTime ? 'u_time' : '0.0';
    return glsl`
    precision highp float;
    precision highp int;
    const float PI = 3.1415926535897932;
    ${HELPERS}
    vec3 mapping(vec2 uv, vec2 grid) {
        float x = floor(uv.x * grid.x) + 1.0;
        float y = floor((1.0 - uv.y) * grid.y) + 1.0;
        float i = x + (y - 1.0) * grid.x;
        return vec3(x, y, i);
    }
    vec4 getColor(float x, float y, float i, float I, float X, float Y, float t, vec2 uv, vec2 v) {
        vec4 color = vec4(0, 0, 0, 0);
        float shapeMask = 1.0;
        ${CELL_INDEX}
        float size = ${sizeInit};
        ${maskInit}
        ${input}
        color.a *= shapeMask;
        return color;
    }
    void main() {
        vec2 uv = gl_FragCoord.xy/u_resolution.xy;
        vec2 v = vec2(${x}, ${y});
        vec3 p = mapping(uv, v);
        FragColor = getColor(p.x, p.y, p.z, v.x * v.y, v.x, v.y, ${timeArg}, uv, v);
    }
  `;
}

export default function drawPattern(code, extra) {
    let tokens = parsePattern(code);
    let result = [];
    let grid = { x: 1, y: 1 };
    let shape = null;
    let sizeExpr = null;
    let vars = {};
    for (let token of tokens) {
        if (token.type !== 'statement' || token.name === 'fill') continue;
        let stmt = generateStatement(token, extra, false, vars);
        switch (stmt.type) {
            case 'grid': grid = parseGrid(stmt.value, Infinity); break;
            case 'shape': shape = stmt.value; break;
            case 'size': sizeExpr = stmt.value; break;
            case 'variable': vars[stmt.name] = stmt.value; break;
        }
    }

    let topShape = shape || (sizeExpr ? 'square' : null);
    for (let token of tokens) {
        if (token.type === 'statement' && token.name === 'fill') {
            result.push(generateStatement(token, extra, false, vars).value);
        } else if (token.type === 'block') {
            result.push(generateBlock(token, extra, vars, topShape));
        }
    }

    return generateShader(result.join(''), grid, shape, sizeExpr, vars);
}
