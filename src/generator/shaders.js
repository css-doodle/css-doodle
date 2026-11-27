import { hash } from '../lib/math.js';
import { glsl } from '../lib/tagged-template.js';

const DEFAULT_VERTEX_SHADER = glsl`#version 300 es
    in vec4 position;
    void main() {
        gl_Position = position;
    }
`;

const SCREEN_QUAD_VERTICES = new Float32Array([
    -1, -1, 1, -1, -1, 1, 1, 1
]);

const MAX_TEXTURE_SIZE = 4096;

function createProgram(gl, vss, fss, outputs) {
    const program = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, vss], [gl.FRAGMENT_SHADER, fss]].map(([type, source]) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
        return shader;
    });
    gl.bindAttribLocation(program, 0, 'position');
    if (outputs) gl.transformFeedbackVaryings(program, outputs, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    return { program, shaders, users: 0 };
}

function checkProgram(gl, entry) {
    if (entry.shaders) {
        const [vs, fs] = entry.shaders;
        const linked = gl.getProgramParameter(entry.program, gl.LINK_STATUS);
        const log = linked ? '' : [gl.getShaderInfoLog(fs), gl.getShaderInfoLog(vs)].find(log => /ERROR/.test(log)) || gl.getProgramInfoLog(entry.program) || '';
        entry.shaders.forEach(shader => gl.deleteShader(shader));
        entry.shaders = null;
        if (!linked) entry.error = shaderError(log);
    }
    if (entry.error) throw entry.error;
}

const later = () => new Promise(resolve => setTimeout(resolve, 16));

async function settle(surface, entry, warm) {
    const { gl, parallel } = surface;
    gl.flush();
    while (parallel && !surface.disposed && !gl.getProgramParameter(entry.program, parallel.COMPLETION_STATUS_KHR)) {
        await later();
    }
    if (surface.disposed) return;
    checkProgram(gl, entry);
    gl.useProgram(entry.program);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    if (warm) warm();
    else gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    while (!surface.disposed && gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
        await later();
    }
    gl.deleteSync(sync);
}

export function shaderError(log) {
    let token = log.match(/ERROR:\s*\d+:\d+:\s*'(.+?)'/)?.[1];
    return new Error(token ? `invalid ${token}` : 'shader failed');
}

export function generateFragment(fragment, textures) {
    fragment = fragment.replace(/^\s*#version[^\n]*/, '');

    const precisionMatch = fragment.match(/precision\s+(highp|mediump|lowp)\s+float\s*;/);
    const outputMatch = fragment.match(/\bout\s+vec4\s+(\w+)/);
    const snippets = ['#version 300 es'];

    const push = line => fragment.includes(line) || snippets.push(line);
    if (precisionMatch) {
        fragment = fragment.replace(precisionMatch[0], '');
    }
    push(`precision ${precisionMatch?.[1] || 'highp'} float;`);

    if (!outputMatch) {
        push('out vec4 FragColor;');
    }

    for (const u of ['vec2 u_resolution', 'float u_time', 'float u_timeDelta', 'int u_frameIndex', 'vec2 u_seed']) {
        push(`uniform ${u};`);
    }

    textures.forEach(t => {
        push(`uniform sampler2D ${t.name};`);
    });

    if (/gl_FragColor\s*=/.test(fragment)) {
        push(`#define gl_FragColor ${outputMatch?.[1] || 'FragColor'}`);
    }

    if (/texture2D\s*\(/.test(fragment)) {
        push('#define texture2D texture');
    }

    if (/\bpos\b/.test(fragment) && !/\b(?:[biu]?vec[234]|float|int|bool|mat[234])\s+pos\b/.test(fragment)) {
        push('#define pos ((gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y))');
    }

    snippets.push(fragment);

    return snippets.join('\n');
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(gl, image, i) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    uploadTexture(gl, image);
    return texture;
}

function uploadTexture(gl, image) {
    if (!image) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return;
    }

    let src = image;
    if (image.width > MAX_TEXTURE_SIZE || image.height > MAX_TEXTURE_SIZE) {
        const scale = Math.min(MAX_TEXTURE_SIZE / image.width, MAX_TEXTURE_SIZE / image.height);
        src = new OffscreenCanvas(image.width * scale, image.height * scale);
        src.getContext('2d').drawImage(image, 0, 0, src.width, src.height);
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}

// Browsers cap the number of live WebGL contexts (Chrome evicts the oldest
// past 16), so shaders share one context per raster size instead of holding
// one each. A surface nobody draws on is dropped a moment later.
const MAX_SURFACES = 8;
const surfaces = new Map();
let sweeper = null;

function createSurface(key, width, height, kind) {
    const canvas = kind === 't' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext('webgl2', {
        powerPreference: 'high-performance',
        antialias: false,
        premultipliedAlpha: !!kind,
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: kind !== 't'
    });

    if (!gl) {
        throw new Error('no WebGL2');
    }

    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    const surface = { canvas, gl, kind, parallel, users: new Set(), programs: new Map(), disposed: false };
    surface.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, SCREEN_QUAD_VERTICES, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (kind) gl.enable(gl.BLEND);

    canvas.addEventListener('webglcontextlost', () => {
        // losing it on purpose is not news
        if (surface.disposed) return;
        surface.disposed = true;
        surfaces.delete(key);
        surface.users.forEach(drawing => drawing.onLost?.());
    });

    return surface;
}

function sweep() {
    clearTimeout(sweeper);
    sweeper = null;
    for (const [key, surface] of surfaces) {
        if (!surface.users.size) {
            surfaces.delete(key);
            surface.disposed = true;
            surface.gl.deleteBuffer(surface.buffer);
            surface.gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        for (const [source, entry] of surface.programs) {
            if (!entry.users) {
                surface.programs.delete(source);
                entry.shaders?.forEach(shader => surface.gl.deleteShader(shader));
                surface.gl.deleteProgram(entry.program);
            }
        }
    }
}

function acquireProgram(surface, vertex, fragment, outputs) {
    const source = vertex + fragment;
    let entry = surface.programs.get(source);
    if (!entry) {
        entry = createProgram(surface.gl, vertex, fragment, outputs);
        surface.programs.set(source, entry);
    }
    entry.users++;
    return entry;
}

function acquireSurface(width, height, drawing, kind) {
    const key = width + 'x' + height + kind;
    let surface = surfaces.get(key);
    if (!surface) {
        if (surfaces.size >= MAX_SURFACES) {
            sweep();
        }
        const same = [...surfaces.values()].filter(s => s.kind === kind);
        if (surfaces.size >= MAX_SURFACES && same.length) {
            surface = same.reduce((a, b) => b.users.size < a.users.size ? b : a);
        } else {
            surface = createSurface(key, width, height, kind);
            surfaces.set(key, surface);
        }
    }
    surface.users.add(drawing);
    return surface;
}

function releaseSurface(surface, drawing) {
    surface.users.delete(drawing);
    if (!sweeper) {
        sweeper = setTimeout(sweep, 1000);
    }
}

export default function drawShader(shaders, seed, onLost) {
    const dpr = devicePixelRatio;
    const { textures, points, transfer, marks } = shaders;
    const kind = transfer ? 't' : points ? 'p' : '';
    const vertex = shaders.vertex?.trim() || DEFAULT_VERTEX_SHADER;
    const fragment = generateFragment(shaders.fragment, textures);
    const stride = marks && marks.record.length * 16;
    const uploaded = textures.map(t => t.value);
    const raster = size => Math.min(size * dpr, MAX_TEXTURE_SIZE) | 0;
    const seeds = [hash(seed) / 1e16, hash(seed, 1) / 1e16];

    let surface, gl, entries, program, textureList, uniforms, size, records, quads, resolution;
    let frameIndex = 0;
    let currentTime = 0;

    const drawing = { onLost, draw, dispose };

    function setup(width, height) {
        size = { width, height };
        surface = acquireSurface(width, height, drawing, kind);
        gl = surface.gl;
        entries = [acquireProgram(surface, vertex, fragment, marks?.record)];
        program = entries[0].program;
        drawing.canvas = surface.canvas;
        textureList = uploaded.map((image, i) => loadTexture(gl, image, i));
        uniforms = null;
        if (marks) {
            entries.push(acquireProgram(surface, marks.vertex, generateFragment(marks.fragment, [])));
            records = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, records);
            gl.bufferData(gl.ARRAY_BUFFER, (points + 3) * stride, gl.DYNAMIC_COPY);
            quads = gl.createVertexArray();
            gl.bindVertexArray(quads);
            for (let i = 0; i < 4 * marks.record.length; i++) {
                gl.enableVertexAttribArray(i);
                gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, i * 16);
                gl.vertexAttribDivisor(i, 1);
            }
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
        }
    }

    function bind() {
        try {
            entries.forEach(entry => checkProgram(gl, entry));
        } catch (e) {
            dispose();
            throw e;
        }
        // uniforms live in the program, so these are set once
        gl.useProgram(program);
        textures.forEach((n, i) => {
            gl.uniform1i(gl.getUniformLocation(program, n.name), i);
        });
        uniforms = {};
        for (const name of ['resolution', 'seed', 'time', 'frameIndex', 'timeDelta', 'drag', 'px', 'mouse']) {
            uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
        }
        drawing.animated = !!(uniforms.time || uniforms.frameIndex || uniforms.timeDelta);
        drawing.mouse = !!uniforms.mouse;
        if (marks) resolution = gl.getUniformLocation(entries[1].program, 'u_resolution');
    }

    function teardown() {
        textureList.forEach(texture => gl.deleteTexture(texture));
        entries.forEach(entry => entry.users--);
        gl.deleteBuffer(records);
        gl.deleteVertexArray(quads);
        releaseSurface(surface, drawing);
        surface = null;
    }

    // the body once per cell, its record written instead of drawn
    function capture(count) {
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, records, stride, count * stride);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.endTransformFeedback();
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.disable(gl.RASTERIZER_DISCARD);
    }

    function draw(t, w, h, images, drag, [x = w / 2, y = h / 2] = []) {
        if (!surface) return;
        const width = raster(w);
        const height = raster(h);
        if (surface.disposed || width !== size.width || height !== size.height) {
            teardown();
            setup(width, height);
        }
        if (!uniforms) bind();

        const { canvas } = surface;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, width, height);

        // the caller swaps in freshly rendered images after a resize
        images.forEach((n, i) => {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, textureList[i]);
            if (n.value !== uploaded[i]) {
                uploadTexture(gl, n.value);
                uploaded[i] = n.value;
            }
        });

        gl.clear(gl.COLOR_BUFFER_BIT);
        if (uniforms.seed) gl.uniform2f(uniforms.seed, seeds[0], seeds[1]);
        if (uniforms.time) gl.uniform1f(uniforms.time, t * 0.001);
        if (uniforms.frameIndex) gl.uniform1i(uniforms.frameIndex, frameIndex++);
        if (uniforms.drag) gl.uniform2f(uniforms.drag, ...drag);
        if (uniforms.mouse) gl.uniform2f(uniforms.mouse, x / w * width, (1 - y / h) * height);
        if (uniforms.px) gl.uniform1f(uniforms.px, 1 / Math.min(w, h));
        if (uniforms.timeDelta) {
            gl.uniform1f(uniforms.timeDelta, (t - currentTime) * 0.001);
            currentTime = t;
        }
        if (!marks) {
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            return;
        }
        capture(points);
        gl.useProgram(entries[1].program);
        gl.uniform2f(resolution, width, height);
        gl.bindVertexArray(quads);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, points);
        gl.bindVertexArray(null);
    }

    function dispose() {
        if (surface) {
            teardown();
        }
    }

    setup(raster(shaders.width), raster(shaders.height));
    // the cell pass compiles for transform feedback, so it warms up as one
    const first = surface;
    const warm = marks && (() => surface === first && capture(1));
    drawing.ready = Promise.all(entries.map((entry, i) => entry.ready ||= settle(surface, entry, !i && warm))).then(() => surface && !surface.disposed && !uniforms && bind(), e => {
        dispose();
        throw e;
    });
    return drawing;
}
