import { hash } from '../utils/math.js';
import { glsl } from '../utils/tagged-template.js';

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

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

function createProgram(gl, vss, fss) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vss);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fss);
    const prog = gl.createProgram();

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
    const log = linked ? '' : [
        gl.getProgramInfoLog(prog),
        gl.getShaderInfoLog(vs),
        gl.getShaderInfoLog(fs)
    ].join('\n');

    gl.detachShader(prog, vs);
    gl.detachShader(prog, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!linked) {
        gl.deleteProgram(prog);
        throw new Error('Shader link failed:\n' + log);
    }
    return prog;
}

function generateFragment(fragment, textures) {
    // the generated source supplies its own version directive
    fragment = fragment.replace(/^\s*#version[^\n]*/, '');

    const isShadertoy = fragment.includes('void mainImage');
    const precisionMatch = fragment.match(/precision\s+(highp|mediump|lowp)\s+float\s*;/);
    const outputMatch = fragment.match(/^\s*out\s+vec4\s+(\w+)/m);
    const output = outputMatch ? outputMatch[1] : 'FragColor';
    const has_glFragColor = /gl_FragColor\s*=/.test(fragment);
    const hasTexture2d = /texture2D\s*\(/.test(fragment);
    const snippets = ['#version 300 es'];

    const push = (line) => {
        if (!fragment.includes(line)) {
            snippets.push(line);
        }
    }
    if (precisionMatch) {
        fragment = fragment.replace(precisionMatch[0], '');
    }
    push(`precision ${precisionMatch ? precisionMatch[1] : 'mediump'} float;`);

    if (!outputMatch) {
        push('out vec4 FragColor;');
    }

    push('uniform vec2 u_resolution;');
    push('uniform float u_time;');
    push('uniform float u_timeDelta;');
    push('uniform int u_frameIndex;');
    push('uniform vec2 u_seed;');
    push('uniform vec2 u_mouse;');

    textures.forEach(t => {
        push(`uniform sampler2D ${t.name};`);
    });

    if (isShadertoy) {
        push('#define iResolution vec3(u_resolution, 0)');
        push('#define iTime u_time');
        push('#define iTimeDelta u_timeDelta');
        push('#define iFrame u_frameIndex');
        push('#define iMouse vec4(u_mouse, 0, 0)');
        textures.forEach((n, i) => {
            push(`#define iChannel${i} ${n.name}`);
        });
    }

    if (has_glFragColor) {
        push(`#define gl_FragColor ${output}`);
    }

    if (hasTexture2d) {
        push('#define texture2D texture');
    }

    snippets.push(fragment);

    if (isShadertoy) {
        snippets.push(`void main() { mainImage(${output}, gl_FragCoord.xy); }`);
    }

    return snippets.join('\n');
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(gl, image, i) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
        const canvas = document.createElement('canvas');
        const scale = Math.min(MAX_TEXTURE_SIZE / image.width, MAX_TEXTURE_SIZE / image.height);
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        src = canvas;
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}

// Browsers cap the number of live WebGL contexts (Chrome evicts the oldest
// past 16), so shaders share one context per raster size instead of holding
// one each. A surface nobody draws on is dropped a moment later.
const MAX_SURFACES = 8;
const surfaces = new Map();
let sweeper = null;

function createSurface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext('webgl2', {
        powerPreference: 'high-performance',
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: true
    });

    if (!gl) {
        throw new Error('WebGL2 is not available');
    }

    const surface = { canvas, gl, width, height, users: new Set(), disposed: false };
    surface.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, SCREEN_QUAD_VERTICES, gl.STATIC_DRAW);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);

    canvas.addEventListener('webglcontextlost', () => {
        // losing it on purpose is not news
        if (surface.disposed) return;
        surface.disposed = true;
        surfaces.delete(width + 'x' + height);
        surface.users.forEach(drawing => drawing.onLost && drawing.onLost());
    });

    return surface;
}

function disposeSurface(surface) {
    surface.disposed = true;
    surface.gl.deleteBuffer(surface.buffer);
    const ext = surface.gl.getExtension('WEBGL_lose_context');
    if (ext) {
        ext.loseContext();
    }
}

function sweep() {
    clearTimeout(sweeper);
    sweeper = null;
    for (const [key, surface] of surfaces) {
        if (!surface.users.size) {
            surfaces.delete(key);
            disposeSurface(surface);
        }
    }
}

function acquireSurface(width, height, drawing) {
    const key = width + 'x' + height;
    let surface = surfaces.get(key);
    if (!surface) {
        if (surfaces.size >= MAX_SURFACES) {
            sweep();
        }
        surface = createSurface(width, height);
        surfaces.set(key, surface);
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

export default function drawShader(shaders, seed, cell, onLost) {
    const dpr = devicePixelRatio || 1;
    const textures = shaders.textures || [];
    const vertex = shaders.vertex || DEFAULT_VERTEX_SHADER;
    const fragment = generateFragment(shaders.fragment || '', textures);
    const uploaded = textures.map(t => t.value);
    const raster = size => Math.min(size * dpr, MAX_TEXTURE_SIZE) | 0;

    let surface, gl, program, position, textureList, uniforms;
    let frameIndex = 0;
    let currentTime = 0;

    const drawing = { canvas: null, animated: false, onLost, draw, dispose };

    function setup(width, height) {
        surface = acquireSurface(width, height, drawing);
        gl = surface.gl;
        try {
            program = createProgram(gl, vertex, fragment);
        } catch (e) {
            releaseSurface(surface, drawing);
            surface = null;
            throw e;
        }
        drawing.canvas = surface.canvas;
        position = gl.getAttribLocation(program, 'position');
        textureList = uploaded.map((image, i) => loadTexture(gl, image, i));

        // uniforms live in the program, so these are set once
        gl.useProgram(program);
        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
        textures.forEach((n, i) => {
            gl.uniform1i(gl.getUniformLocation(program, n.name), i);
        });
        const uSeed = gl.getUniformLocation(program, 'u_seed');
        if (uSeed) {
            gl.uniform2f(uSeed, hash(seed) / 1e16, hash(seed + cell, 1) / 1e16);
        }
        uniforms = {
            time: gl.getUniformLocation(program, 'u_time'),
            frame: gl.getUniformLocation(program, 'u_frameIndex'),
            delta: gl.getUniformLocation(program, 'u_timeDelta'),
            mouse: gl.getUniformLocation(program, 'u_mouse'),
        };
        drawing.animated = !!(uniforms.time || uniforms.frame || uniforms.delta);
    }

    function teardown() {
        textureList.forEach(texture => gl.deleteTexture(texture));
        gl.deleteProgram(program);
        releaseSurface(surface, drawing);
        surface = null;
    }

    function draw(t, w, h, mouse, images) {
        if (!surface) return;
        const width = raster(w);
        const height = raster(h);
        // a program belongs to its context, so a new size means a rebuild
        if (width !== surface.width || height !== surface.height) {
            teardown();
            setup(width, height);
        }

        // the context is shared: bind everything this program needs
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

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
        if (uniforms.time) gl.uniform1f(uniforms.time, t * 0.001);
        if (uniforms.frame) gl.uniform1i(uniforms.frame, frameIndex++);
        if (uniforms.mouse && mouse) gl.uniform2f(uniforms.mouse, mouse.x * dpr, (h - mouse.y) * dpr);
        if (uniforms.delta) {
            gl.uniform1f(uniforms.delta, (t - currentTime) * 0.001);
            currentTime = t;
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function dispose() {
        if (surface) {
            teardown();
        }
    }

    setup(raster(shaders.width), raster(shaders.height));
    return drawing;
}
