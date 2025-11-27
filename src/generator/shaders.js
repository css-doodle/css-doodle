import { hash } from '../utils/index.js';

const DEFAULT_VERTEX_SHADER = `#version 300 es
  in vec4 position;
  void main() {
    gl_Position = position;
  }
`;

const SCREEN_QUAD_VERTICES = new Float32Array([
  -1, -1, 1, -1, -1, 1, 1, 1
]);

function create_shader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
};

function create_program(gl, vss, fss) {
  const vs = create_shader(gl, gl.VERTEX_SHADER, vss);
  const fs = create_shader(gl, gl.FRAGMENT_SHADER, fss);
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
  const is_shadertoy = fragment.includes('void mainImage');
  const has_precision = /precision\s+(highp|mediump|lowp)\s+float/.test(fragment);
  const has_output = /^\s*out\s+vec4\s+\w+/m.test(fragment);
  const has_glFragColor = /gl_FragColor\s*=/.test(fragment);
  const has_texture2d = /texture2D\s*\(/.test(fragment);
  const snippets = ['#version 300 es'];

  const push = (line) => {
    if (!fragment.includes(line)) {
      snippets.push(line);
    }
  }

  if (!has_precision) {
    push('precision mediump float;');
  }

  if (!has_output) {
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

  if (is_shadertoy) {
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

  if (has_texture2d) {
    push('#define texture2D texture');
  }

  snippets.push(fragment);

  if (is_shadertoy) {
    snippets.push(`void main() { mainImage(FragColor, gl_FragCoord.xy); }`);
  }

  return snippets.join('\n');
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function load_texture(gl, image, i) {
  const texture = gl.createTexture();
  gl.activeTexture(gl['TEXTURE' + i]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
  return texture;
}

export default function draw_shader(shaders, seed, type) {
  const canvas = document.createElement('canvas');
  const dpr = devicePixelRatio || 1;

  let width = canvas.width = shaders.width * dpr;
  let height = canvas.height = shaders.height * dpr;

  const texture_list = [];

  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: type === 'background' });
  if (!gl) {
    return Promise.resolve('');
  }

  let program = create_program(
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

  const u_resolution = gl.getUniformLocation(program, 'u_resolution');
  gl.uniform2fv(u_resolution, [width, height]);

  shaders.textures.forEach((n, i) => {
    texture_list.push(load_texture(gl, n.value, i));
    gl.uniform1i(gl.getUniformLocation(program, n.name), i);
  });

  const u_seed = gl.getUniformLocation(program, 'u_seed');
  if (u_seed) {
    gl.uniform2f(u_seed, hash(seed) / 1e16, Math.random());
  }

  const u_time = gl.getUniformLocation(program, 'u_time');
  const u_frame_index = gl.getUniformLocation(program, 'u_frameIndex');
  const u_time_delta = gl.getUniformLocation(program, 'u_timeDelta');
  const u_mouse = gl.getUniformLocation(program, 'u_mouse');
  const is_animated = u_time || u_frame_index || u_time_delta;

  let frame_index = 0;
  let current_time = 0;

  const render = (t, w, h, m, textures) => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (shaders.width !== w || shaders.height !== h) {
      textures.forEach((n, i) => {
        gl.bindTexture(gl.TEXTURE_2D, texture_list[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n.value);
      });
      shaders.width = w;
      shaders.height = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2fv(u_resolution, [canvas.width, canvas.height]);
    }

    if (u_time) gl.uniform1f(u_time, t * 0.001);
    if (u_frame_index) gl.uniform1i(u_frame_index, frame_index++);
    if (u_mouse) gl.uniform2f(u_mouse, m.x * dpr, (h - m.y) * dpr);
    if (u_time_delta) {
      gl.uniform1f(u_time_delta, (t - current_time) * 0.001);
      current_time = t;
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return Promise.resolve([render, is_animated, canvas]);
}
