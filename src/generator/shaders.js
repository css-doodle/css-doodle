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

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
};

function createProgram(gl, vss, fss) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vss);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fss);
  const prog = gl.createProgram();

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('Link failed: ' + gl.getProgramInfoLog(prog));
    console.warn('vs info-log: ' + gl.getShaderInfoLog(vs));
    console.warn('fs info-log: ' + gl.getShaderInfoLog(fs));
    gl.deleteProgram(prog);
  }

  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return prog;
}

function generateFragment(fragment, textures) {
  const isShadertoy = fragment.includes('void mainImage');
  const precisionMatch = fragment.match(/precision\s+(highp|mediump|lowp)\s+float\s*;/);
  const hasOutput = /^\s*out\s+vec4\s+\w+/m.test(fragment);
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

  if (!hasOutput) {
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
    push('#define gl_FragColor FragColor');
  }

  if (hasTexture2d) {
    push('#define texture2D texture');
  }

  snippets.push(fragment);

  if (isShadertoy) {
    snippets.push(`void main() { mainImage(FragColor, gl_FragCoord.xy); }`);
  }

  return snippets.join('\n');
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(gl, image, i, maxSize = 4096) {
  const texture = gl.createTexture();
  gl.activeTexture(gl['TEXTURE' + i]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Check if image needs resizing
  let src = image;
  if (image.width > maxSize || image.height > maxSize) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(maxSize / image.width, maxSize / image.height);
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    src = canvas;
  }

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  return texture;
}

export default function drawShader(shaders, seed, type) {
  return acquireSlot().then(() => renderShader(shaders, seed, type));
}

function renderShader(shaders, seed, type) {
  const release = makeRelease();
  const canvas = document.createElement('canvas');
  const dpr = devicePixelRatio || 1;

  const MAX_TEXTURE_SIZE = 4096;
  let width = Math.min(shaders.width * dpr, MAX_TEXTURE_SIZE);
  let height = Math.min(shaders.height * dpr, MAX_TEXTURE_SIZE);
  canvas.width = width;
  canvas.height = height;

  const textureList = [];

  const gl = canvas.getContext('webgl2', {
    powerPreference: 'high-performance',
    antialias: false,
    failIfMajorPerformanceCaveat: true,
    preserveDrawingBuffer: true
  });

  if (!gl) {
    release();
    return '';
  }

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

  let program = createProgram(
    gl,
    shaders.vertex || DEFAULT_VERTEX_SHADER,
    generateFragment(shaders.fragment || '', shaders.textures || [])
  );

  const positionAttributeLocation = gl.getAttribLocation(program, 'position');
  const positionBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, SCREEN_QUAD_VERTICES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  gl.uniform2fv(uResolution, [width, height]);

  shaders.textures.forEach((n, i) => {
    textureList.push(loadTexture(gl, n.value, i, MAX_TEXTURE_SIZE));
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

  const render = (t, w, h, m, textures) => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (shaders.width !== w || shaders.height !== h) {
      textures.forEach((n, i) => {
        gl.bindTexture(gl.TEXTURE_2D, textureList[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n.value);
      });
      shaders.width = w;
      shaders.height = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2fv(uResolution, [canvas.width, canvas.height]);
    }

    if (uTime) gl.uniform1f(uTime, t * 0.001);
    if (uFrameIndex) gl.uniform1i(uFrameIndex, frameIndex++);
    if (uMouse) gl.uniform2f(uMouse, m.x * dpr, (h - m.y) * dpr);
    if (uTimeDelta) {
      gl.uniform1f(uTimeDelta, (t - currentTime) * 0.001);
      currentTime = t;
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return [render, isAnimated, canvas];
}
