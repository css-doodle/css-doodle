import { hash } from '../utils/math.js';
import { glsl } from '../utils/tagged-template.js';

// Rendering queue
const MAX_CONCURRENT = 12;
const pending = [];
let active = 0;

function pump() {
    while (active < MAX_CONCURRENT && pending.length) {
        active++;
        pending.shift()();
    }
}

function acquireSlot() {
    return new Promise(resolve => { pending.push(resolve); pump(); });
}

function makeRelease() {
    let done = false;
    return () => {
        if (done) return;
        done = true;
        active = Math.max(0, active - 1);
        pump();
    };
}

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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
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

export default function drawShader(shaders, seed) {
    return acquireSlot().then(() => renderShader(shaders, seed));
}

function renderShader(shaders, seed) {
    const release = makeRelease();
    const canvas = document.createElement('canvas');
    const dpr = devicePixelRatio || 1;
    const textures = shaders.textures || [];

    let width = Math.min(shaders.width * dpr, MAX_TEXTURE_SIZE);
    let height = Math.min(shaders.height * dpr, MAX_TEXTURE_SIZE);
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext('webgl2', {
        powerPreference: 'high-performance',
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: true
    });

    if (!gl) {
        release();
        throw new Error('WebGL2 is not available');
    }

    const textureList = [];
    const uploaded = [];
    const positionBuffer = gl.createBuffer();
    let program = null;
    let watchdog = setTimeout(release, 10000);

    canvas.loseContext = () => {
        clearTimeout(watchdog);
        release();
        // Delete textures first
        textureList.forEach(texture => {
            gl.deleteTexture(texture);
        });
        textureList.length = 0;
        // Delete program and buffers
        gl.deleteProgram(program);
        gl.deleteBuffer(positionBuffer);
        // Lose context
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) {
            ext.loseContext();
        }
    };

    try {
        program = createProgram(
            gl,
            shaders.vertex || DEFAULT_VERTEX_SHADER,
            generateFragment(shaders.fragment || '', textures)
        );
    } catch (e) {
        canvas.loseContext();
        throw e;
    }

    const positionAttributeLocation = gl.getAttribLocation(program, 'position');

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, SCREEN_QUAD_VERTICES, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);

    gl.useProgram(program);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(uResolution, width, height);

    textures.forEach((n, i) => {
        textureList.push(loadTexture(gl, n.value, i));
        uploaded.push(n.value);
        gl.uniform1i(gl.getUniformLocation(program, n.name), i);
    });

    const uSeed = gl.getUniformLocation(program, 'u_seed');
    if (uSeed) {
        gl.uniform2f(uSeed, hash(seed) / 1e16, Math.random());
    }

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uFrameIndex = gl.getUniformLocation(program, 'u_frameIndex');
    const uTimeDelta = gl.getUniformLocation(program, 'u_timeDelta');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const isAnimated = uTime || uFrameIndex || uTimeDelta;

    if (isAnimated) {
        clearTimeout(watchdog);
        release();
    }

    let frameIndex = 0;
    let currentTime = 0;

    const render = (t, w, h, m, images) => {
        if (shaders.width !== w || shaders.height !== h) {
            shaders.width = w;
            shaders.height = h;
            canvas.width = Math.min(w * dpr, MAX_TEXTURE_SIZE);
            canvas.height = Math.min(h * dpr, MAX_TEXTURE_SIZE);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(uResolution, canvas.width, canvas.height);
        }

        // the caller swaps in freshly rendered images after a resize
        images.forEach((n, i) => {
            if (n.value !== uploaded[i]) {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, textureList[i]);
                uploadTexture(gl, n.value);
                uploaded[i] = n.value;
            }
        });

        gl.clear(gl.COLOR_BUFFER_BIT);
        if (uTime) gl.uniform1f(uTime, t * 0.001);
        if (uFrameIndex) gl.uniform1i(uFrameIndex, frameIndex++);
        if (uMouse && m) gl.uniform2f(uMouse, m.x * dpr, (h - m.y) * dpr);
        if (uTimeDelta) {
            gl.uniform1f(uTimeDelta, (t - currentTime) * 0.001);
            currentTime = t;
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return [render, isAnimated, canvas];
}
