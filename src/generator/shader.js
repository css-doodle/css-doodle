import Cache from '../utils/cache.js';

function create_shader(gl, type, source) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
};

function create_program(gl, vss, fss) {
  let vs = create_shader(gl, gl.VERTEX_SHADER, vss);
  let fs = create_shader(gl, gl.FRAGMENT_SHADER, fss);
  let prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('Link failed: ' + gl.getProgramInfoLog(prog));
    console.warn('vs info-log: ' + gl.getShaderInfoLog(vs));
    console.warn('fs info-log: ' + gl.getShaderInfoLog(fs));
  }
  return prog;
}

function add_uniform(fragment, uniform) {
  if (!fragment.includes(uniform)) {
    return uniform + '\n' + fragment;
  }
  return fragment;
}

const fragment_head = `#version 300 es
  precision highp float;
  out vec4 FragColor;
`;

const default_vertex_shader = `#version 300 es
  in vec4 position;
  void main() {
    gl_Position = position;
  }
`;

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function load_texture(gl, image, i) {
  const texture = gl.createTexture();
  gl.activeTexture(gl['TEXTURE' + i]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);

  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function draw_shader(shaders, width, height) {
  let result = Cache.get(shaders);
  if (result) {
    return Promise.resolve(result);
  }
  let canvas = document.createElement('canvas');
  let ratio = window.devicePixelRatio || 1;
  width *= ratio;
  height *= ratio;
  canvas.width = width;
  canvas.height = height;

  let gl = canvas.getContext('webgl2', {preserveDrawingBuffer: true});
  if (!gl) return Promise.resolve('');

  // resolution uniform
  let fragment = add_uniform(shaders.fragment || '', 'uniform vec2 u_resolution;');

  fragment = add_uniform(fragment, 'uniform float u_time;');
  fragment = add_uniform(fragment, 'uniform float u_timeDelta;');
  fragment = add_uniform(fragment, 'uniform int u_frameIndex;');
  // fragment = add_uniform(fragment, 'uniform vec4 u_mouse;');

  // texture uniform
  shaders.textures.forEach(n => {
    let uniform = `uniform sampler2D ${ n.name };`;
    fragment =  add_uniform(fragment, uniform);
  });

  const isShaderToyFragment = /(^|[^\w\_])void\s+mainImage\(\s*out\s+vec4\s+fragColor,\s*in\s+vec2\s+fragCoord\s*\)/mg.test(fragment);
  
  if(isShaderToyFragment) {
    fragment = `// https://www.shadertoy.com/howto

#define iResolution vec3(u_resolution, 0)
#define iTime u_time
#define iTimeDelta u_timeDelta
#define iFrame u_frameIndex

${shaders.textures.map((n, i) => `#define iChannel${i} ${n.name}`).join('\n')}

${fragment}

void main() {
  mainImage(FragColor, gl_FragCoord.xy);
}`
  }

  let program = create_program(
    gl,
    shaders.vertex || default_vertex_shader,
    fragment_head + fragment
  );

  // position in vertex shader
  let positionAttributeLocation = gl.getAttribLocation(program, 'position');
  let positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  let vertices = [-1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  // resolve uniforms
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  gl.uniform2fv(uResolutionLoc, [width, height]);

  shaders.textures.forEach((n, i) => {
    load_texture(gl, n.value, i);
    gl.uniform1i(gl.getUniformLocation(program, n.name), i);
  });

  // two triangles to form a rectangle
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // resolve image data in 72dpi :(
  const uTimeLoc = gl.getUniformLocation(program, "u_time");
  const uFrameLoc = gl.getUniformLocation(program, "u_frameIndex");
  const uTimeDelta = gl.getUniformLocation(program, "u_timeDelta");
  if(uTimeLoc || uFrameLoc) {
    let frameIndex = 0;
    let currentTime = 0;
    return Promise.resolve(Cache.set(shaders, (t) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if(uTimeLoc) gl.uniform1f(uTimeLoc, t / 1000);
      if(uFrameLoc) gl.uniform1i(uFrameLoc, frameIndex++);
      if(uTimeDelta) {
        gl.uniform1f(uTimeDelta, (currentTime - t) / 1000);
        currentTime = t;
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return canvas.toDataURL();
    }));
  } else {
    return Promise.resolve(Cache.set(shaders, canvas.toDataURL()));
  }
}

export {
  draw_shader,
}
