import { hash } from '../utils/index.js';

const DEFAULT_VERTEX_SHADER = `#version 300 es
  in vec4 position;
  void main() {
    gl_Position = position;
  }
`;

const SCREEN_QUAD_VERTICES = [-1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1];

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

function add_uniform(fragment, uniform) {
  if (!fragment.includes(uniform)) {
    return uniform + '\n' + fragment;
  }
  return fragment;
}

function prepend_fragment_head(source, is_shadertoy = false) {
  let head = '#version 300 es\n';
  if (!/precision\s+(highp|mediump|lowp)\s+float/.test(source)) {
    head += 'precision highp float;\n';
  }
  if (!/out\s+vec4\s+\w+/.test(source) && !is_shadertoy) {
    head += 'out vec4 FragColor;\n';
    if (/=\s*gl_FragColor\s*;/.test(source) || /gl_FragColor\s*=/.test(source)) {
      head += '\n#define gl_FragColor FragColor\n';
    }
  }
  return head + '\n' + source;
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

export default function draw_shader(shaders, seed) {
  const canvas = document.createElement('canvas');
  const ratio = devicePixelRatio || 1;

  let width = canvas.width = shaders.width * ratio;
  let height = canvas.height = shaders.height * ratio;

  const texture_list = [];

  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) {
    return Promise.resolve('');
  }

  let fragment = shaders.fragment || '';
  fragment = add_uniform(fragment, 'uniform vec2 u_resolution;');
  fragment = add_uniform(fragment, 'uniform float u_time;');
  fragment = add_uniform(fragment, 'uniform float u_timeDelta;');
  fragment = add_uniform(fragment, 'uniform int u_frameIndex;');
  fragment = add_uniform(fragment, 'uniform vec2 u_seed;');

  shaders.textures.forEach(t => {
    fragment = add_uniform(fragment, `uniform sampler2D ${t.name};`);
  });

  const defines = [
   '#define iResolution vec3(u_resolution, 0)',
   '#define iTime u_time',
   '#define iTimeDelta u_timeDelta',
   '#define iFrame u_frameIndex',
    ...shaders.textures.map((n, i) => `#define iChannel${i} ${n.name}`)
  ].join('\n');

  const is_shadertoy = /(^|[^\w\_])void\s+mainImage\(\s*out\s+vec4\s+fragColor,\s*in\s+vec2\s+fragCoord\s*\)/mg.test(fragment);
  if (is_shadertoy) {
    fragment = [defines, fragment, `void main() { mainImage(FragColor, gl_FragCoord.xy); }`].join('\n');
  }

  let program = create_program(
    gl,
    shaders.vertex || DEFAULT_VERTEX_SHADER,
    prepend_fragment_head(fragment, is_shadertoy)
  );

  const positionAttributeLocation = gl.getAttribLocation(program, 'position');
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(SCREEN_QUAD_VERTICES), gl.STATIC_DRAW);
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
  const is_animated = u_time || u_frame_index || u_time_delta;

  let frame_index = 0;
  let current_time = 0;

  const render = (t, w, h, textures) => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (shaders.width !== w || shaders.height !== h) {
      textures.forEach((n, i) => {
        gl.bindTexture(gl.TEXTURE_2D, texture_list[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n.value);
      });
      shaders.width = w;
      shaders.height = h;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2fv(u_resolution, [canvas.width, canvas.height]);
    }

    if (u_time) gl.uniform1f(u_time, t / 1000);
    if (u_frame_index) gl.uniform1i(u_frame_index, frame_index++);
    if (u_time_delta) {
      gl.uniform1f(u_time_delta, (current_time - t) / 1000);
      current_time = t;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return canvas;
  }
  return Promise.resolve([render, is_animated]);
}
