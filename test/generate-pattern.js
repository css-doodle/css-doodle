import test from 'node:test';
import draw from '../src/generator/pattern.js';
import compare from './_compare.js';

// Emulates the browser's parse-or-null getRgbaColor: values the CSS
// engine would accept as colors resolve (to red, for easy assertions),
// anything else returns null and compiles as a shader expression.
function isCssColor(v) {
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
  if (/^(red|black|white|tan|transparent)$/i.test(v)) return true;
  if (/^(rgb|rgba|hsla)\(\s*[\d.,%\s/]+\)$/i.test(v)) return true;
  if (/^hsl\([^)]*%[^)]*\)$/i.test(v)) return true;
  return false;
}
const extra = {
  getRgbaColor: v => isCssColor(v) ? { r: 255, g: 0, b: 0, a: 1 } : null,
};

function ifLine(code) {
  let s = draw(code, extra);
  // match() conditions always contain bool(...), which prelude helper `if`
  // statements (escape bailouts, etc.) never do.
  let line = s.split('\n').map(l => l.trim())
    .find(l => l.startsWith('if (') && l.includes('bool('));
  return line || '';
}

compare.use(ifLine);

test('match with nested commas in function call', () => {
  compare('match(atan(y, x) > 3) { fill: red }', 'if (bool((atan(y, x) > 3.0))) {');
});

test('match AND-joins multiple args', () => {
  compare(
    'match(x>y, 2*x-y == 0) { fill: red }',
    'if (bool((x > y)) && bool((((2.0 * x) - y) == 0.0))) {'
  );
});

test('match with no args emits no if block', () => {
  compare('match() { fill: red }', '');
  compare('match(   ) { fill: red }', '');
});

test('nested match block is emitted recursively', () => {
  let shader = draw('match(x>3) { match(y>3) { fill: red } }', extra);
  if (!/if \(bool\(\(x > 3\.0\)\)\) \{[\s\S]*if \(bool\(\(y > 3\.0\)\)\) \{[\s\S]*color = vec4/.test(shader)) {
    throw new Error('nested match not emitted: ' + shader);
  }
});

test('and/or/not keywords in match conditions (CSS media-query style)', () => {
  compare('match(x > 1 and y > 1) { fill: red }',
    'if (bool((bool((x > 1.0)) && bool((y > 1.0))))) {');
  compare('match(x > 3 or y > 3) { fill: red }',
    'if (bool((bool((x > 3.0)) || bool((y > 3.0))))) {');
  compare('match(not (x > 3)) { fill: red }',
    'if (!bool((x > 3.0))) {');
});

test('variables inside match blocks are scoped and need no -- prefix', () => {
  let shader = draw('match(x > 1) { c: x/X; fill: hsl(c, 0.5, 0.5) }', extra);
  if (!shader.includes('hsl((x / X), 0.5, 0.5)')) {
    throw new Error('block variable not substituted: ' + shader);
  }
  // and they do not leak into the outer scope
  let leak = draw('match(x > 1) { c: 9.0; } match(c > 1) { fill: red }', extra);
  if (!/if \(bool\(\(c > 1\.0\)\)\)/.test(leak)) {
    throw new Error('block variable leaked outside its block: ' + leak);
  }
});

test('int() cast in match predicate coerces to bool', () => {
  compare('match(int(x)) { fill: red }', 'if (bool(int(x))) {');
});

test('non-comparison root is bool-coerced', () => {
  compare('match(x) { fill: red }', 'if (bool(x)) {');
  compare('match(sin(x)) { fill: red }', 'if (bool(sin(x))) {');
});

test('dr, da, PI built-ins', () => {
  let shader = draw('match(dr < 3) { fill: red }', extra);
  if (!/float dr = length\(vec2\(dx, dy\)\);/.test(shader)) {
    throw new Error('missing dr definition');
  }
  if (!/float da = atan\(dy, dx\);/.test(shader)) {
    throw new Error('missing da definition');
  }
  if (!/const float PI = 3\.14159/.test(shader)) {
    throw new Error('missing PI constant');
  }
  compare('match(dr < 3) { fill: red }', 'if (bool((dr < 3.0))) {');
  compare('match(da > 0) { fill: red }', 'if (bool((da > 0.0))) {');
  compare(
    'match(da > -PI/4 && da < PI/4) { fill: red }',
    'if (bool((bool((da > (-PI / 4.0))) && bool((da < (PI / 4.0)))))) {'
  );
});

test('dc, dm distance built-ins', () => {
  let shader = draw('match(dc < 2) { fill: red }', extra);
  if (!/float dc = max\(abs\(dx\), abs\(dy\)\);/.test(shader)) {
    throw new Error('missing dc definition');
  }
  if (!/float dm = abs\(dx\) \+ abs\(dy\);/.test(shader)) {
    throw new Error('missing dm definition');
  }
  compare('match(dc < 2) { fill: red }', 'if (bool((dc < 2.0))) {');
  compare('match(dm < 3) { fill: red }', 'if (bool((dm < 3.0))) {');
});

test('db boundary-distance built-in', () => {
  let shader = draw('match(db == 0) { fill: red }', extra);
  if (!/float db = min\(min\(x - 1\.0, v\.x - x\), min\(y - 1\.0, v\.y - y\)\);/.test(shader)) {
    throw new Error('missing db definition');
  }
  compare('match(db == 0) { fill: red }', 'if (bool((db == 0.0))) {');
  compare('match(db < 2) { fill: red }', 'if (bool((db < 2.0))) {');
  compare(
    'match(int(db) % 2 == 0) { fill: red }',
    'if (bool((mod(float(int(db)), 2.0) == 0.0))) {'
  );
});

test('du/dv intra-cell coordinates', () => {
  let shader = draw('match(du > 0) { fill: red }', extra);
  if (!/float du = fract\(uv\.x \* v\.x\) - 0\.5;/.test(shader)) {
    throw new Error('missing du definition');
  }
  if (!/float dv = fract\(\(1\.0 - uv\.y\) \* v\.y\) - 0\.5;/.test(shader)) {
    throw new Error('missing dv definition');
  }
  // composes with ngon() for per-cell polygon masks
  compare('match(ngon(du, dv, 6) < 0.4) { fill: red }',
    'if (bool((ngon(du, dv, 6.0) < 0.4))) {');
  // a bare `du` is not a CSS color, so it compiles as an expression
  compare('fill: du', 'color = vec4(vec3(du), 1.0);', null, colorLine);
});

test('dx/dy grid-centered cell index', () => {
  let shader = draw('match(dx > 0) { fill: red }', extra);
  if (!/float dx = x - \(v\.x \+ 1\.0\) \* 0\.5;/.test(shader)) {
    throw new Error('missing dx definition');
  }
  if (!/float dy = y - \(v\.y \+ 1\.0\) \* 0\.5;/.test(shader)) {
    throw new Error('missing dy definition');
  }
  compare(
    'match(dx*dx + dy*dy < 4) { fill: red }',
    'if (bool((((dx * dx) + (dy * dy)) < 4.0))) {'
  );
  compare(
    'match(max(abs(dx), abs(dy)) < 2) { fill: red }',
    'if (bool((max(abs(dx), abs(dy)) < 2.0))) {'
  );
});

// Pull the `color = ...;` assignment out of the generated getColor body.
function colorLine(code) {
  let s = draw(code, extra);
  let line = s.split('\n').map(l => l.trim()).find(l => l.startsWith('color = '));
  return line || '';
}

test('static colors stay byte-identical (backward compatible)', () => {
  compare('fill: red', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('fill: #f00', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('fill: rgb(10, 20, 30)', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
});

test('computed fill: single color-valued expression wraps in vec4(vec3(...), 1.0)', () => {
  compare('fill: hsl(da, 0.8, 0.5)',
    'color = vec4(vec3(hsl(da, 0.8, 0.5)), 1.0);', null, colorLine);
  compare('fill: dr/10',
    'color = vec4(vec3((dr / 10.0)), 1.0);', null, colorLine);
});

test('computed fill: 3 top-level commas become rgb channels', () => {
  compare('fill: x/X, y/Y, 0.5',
    'color = vec4((x / X), (y / Y), 0.5, 1.0);', null, colorLine);
});

test('computed fill: 4 top-level commas become rgba channels', () => {
  compare('fill: x/X, y/Y, t, 0.6',
    'color = vec4((x / X), (y / Y), t, 0.6);', null, colorLine);
});

test('computed fill: nested commas are not split into channels', () => {
  compare('fill: vec3(x/X, y/Y, t)',
    'color = vec4(vec3(vec3((x / X), (y / Y), t)), 1.0);', null, colorLine);
});

test('computed fill substitutes pattern variables', () => {
  compare('--c: hsv(i/I, 1, 1); fill: c',
    'color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);', null, colorLine);
});

test('size: scales the circle mask radius per cell', () => {
  let shader = draw('shape: circle; size: x/X; fill: #000', extra);
  if (!/float size = \(x \/ X\);/.test(shader)) {
    throw new Error('missing per-cell size: ' + shader);
  }
  if (!/float radius = 0\.5 \* size;/.test(shader)) {
    throw new Error('mask does not use size: ' + shader);
  }
});

test('size: without an explicit shape uses a square mask', () => {
  let shader = draw('size: rand(i); fill: #000', extra);
  if (!/float dsq = max\(abs\(cellUV\.x\), abs\(cellUV\.y\)\);/.test(shader)) {
    throw new Error('expected square mask: ' + shader);
  }
});

test('shape inside a match block applies the matching mask', () => {
  // No top-level shape/size, so any mask must come from the block.
  let sq = draw('match(x > 2) { shape: square; fill: red }', extra);
  if (!/float dsq = max\(abs\(cellUV\.x\), abs\(cellUV\.y\)\);/.test(sq)) {
    throw new Error('expected square mask from block: ' + sq);
  }
  let ci = draw('match(x > 2) { shape: circle; fill: red }', extra);
  if (!/float dist = length\(cellUV\);/.test(ci)) {
    throw new Error('expected circle mask from block: ' + ci);
  }
  // Any other value resets the mask to the full cell (the second occurrence,
  // after the `float shapeMask = 1.0;` declaration).
  let none = draw('match(x > 2) { shape: none; fill: red }', extra);
  if (/cellUV/.test(none) || (none.match(/shapeMask = 1\.0;/g) || []).length < 2) {
    throw new Error('expected mask reset from block: ' + none);
  }
});

test('size: inside a match block updates the mask size', () => {
  let shader = draw('match(x > 1) { size: 0.5; shape: circle; fill: red }', extra);
  let ifIdx = shader.indexOf('if (bool((x > 1.0)))');
  let sizeIdx = shader.indexOf('size = 0.5;');
  let maskIdx = shader.indexOf('float dist = length(cellUV);');
  if (sizeIdx < 0) {
    throw new Error('block size not emitted: ' + shader);
  }
  if (!(ifIdx < sizeIdx && sizeIdx < maskIdx)) {
    throw new Error('block size must land inside the if, before the mask');
  }
});

test('no shape and no size leaves shapeMask untouched (backward compatible)', () => {
  let shader = draw('fill: #000', extra);
  if (/cellUV/.test(shader)) {
    throw new Error('unexpected shape mask emitted: ' + shader);
  }
  if (!/float size = 1\.0;/.test(shader)) {
    throw new Error('size should default to 1.0: ' + shader);
  }
});

function mainBlock(code) {
  let s = draw(code, extra);
  return s.slice(s.indexOf('void main()'));
}

test('u_time is only wired up when the pattern reads t (so static patterns stay static)', () => {
  // No `t` anywhere -> getColor receives 0.0, leaving uTime unreferenced.
  if (!/v\.y, 0\.0, uv/.test(mainBlock('fill: hsl(dr/10, 0.7, 0.5)'))) {
    throw new Error('static pattern should pass 0.0 for time');
  }
  // `t` in a fill expression -> real uTime uniform.
  if (!/v\.y, u_time, uv/.test(mainBlock('fill: hsl(i/I + t*0.1, 0.7, 0.5)'))) {
    throw new Error('time-driven fill should pass u_time');
  }
  // `t` in a size expression also counts.
  if (!/v\.y, u_time, uv/.test(mainBlock('shape: circle; size: 0.5 + 0.4*sin(t); fill: #000'))) {
    throw new Error('time-driven size should pass u_time');
  }
});

test('rand/noise/hsl built-ins are declared in the shader prelude', () => {
  let shader = draw('fill: #000', extra);
  for (let sig of [
    'float rand(float a, float b)',
    'float rand(float n)',
    'float noise(float a, float b)',
    'vec3 hsl(float h, float s, float l)',
    'vec3 hsv(float h, float s, float v)',
  ]) {
    if (!shader.includes(sig)) {
      throw new Error('missing prelude helper: ' + sig);
    }
  }
  // GLSL ES reserves identifiers containing consecutive underscores.
  if (/__/.test(shader)) {
    throw new Error('shader contains reserved "__" identifier: ' + shader);
  }
});

test('fbm() and voronoi() built-ins are available', () => {
  let shader = draw('grid:40; fill: fbm(x/8, y/8)', extra);
  if (!shader.includes('float fbm(float px, float py)')) {
    throw new Error('missing fbm() prelude helper');
  }
  if (!shader.includes('float voronoi(float px, float py)')) {
    throw new Error('missing voronoi() prelude helper');
  }
  compare('match(voronoi(x, y) > 0.3) { fill: red }',
    'if (bool((voronoi(x, y) > 0.3))) {');
});

test('noise() and voronoi() lattices are offset by the seed (like rand)', () => {
  let shader = draw('fill: noise(x, y)', extra);
  if (!shader.includes('vec2 ip = floor(p) + u_seed.x * 71.0;')) {
    throw new Error('noise() lattice is not seed-offset');
  }
  if (!shader.includes('ip = floor(p) + u_seed.x * 71.0, fp = fract(p);')) {
    throw new Error('voronoi() lattice is not seed-offset');
  }
});

test('escape() and math/geometry built-ins are available', () => {
  let shader = draw('grid:1; fill: escape(0, 0, uv.x, uv.y)', extra);
  for (let sig of [
    'float escape(float zx, float zy, float cx, float cy)',
    'float rotx(float px, float py, float a)',
    'float roty(float px, float py, float a)',
    'float smin(float a, float b, float k)',
    'float ngon(float px, float py, float n)',
    'float dither(float fx, float fy)',
    'float gcd(float a, float b)',
    'float prime(float fn)',
    'float spiral(float dx, float dy)',
    'float digitsum(float fn, float fb)',
    'float digitsum(float fn)',
    'float collatz(float fn)',
  ]) {
    if (!shader.includes(sig)) {
      throw new Error('missing prelude helper: ' + sig);
    }
  }
});

test('fill through a variable keeps CSS colors static', () => {
  compare('--c: red; fill: c', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('--c: #f00; fill: c', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('--c: 1, 0, 0; fill: c', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
});

test('CSS color functions stay static; unitless hsl()/hsv() mean the shader helpers', () => {
  compare('fill: hsla(210, 50%, 50%, 0.5)', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('fill: hsl(120, 50%, 50%)', 'color = vec4(1.0, 0.0, 0.0, 1.0);', null, colorLine);
  compare('fill: hsl(x/X, 0.5, 0.5)', 'color = vec4(vec3(hsl((x / X), 0.5, 0.5)), 1.0);', null, colorLine);
  // anything the CSS engine rejects compiles as an expression
  compare('fill: rgb(x*20, 0, 0)', 'color = vec4(vec3(rgb((x * 20.0), 0.0, 0.0)), 1.0);', null, colorLine);
});

test('top-level declarations are order-free (fill may precede its variable)', () => {
  compare('fill: c; --c: hsv(i/I, 1, 1)',
    'color = vec4(vec3(hsv((i / I), 1.0, 1.0)), 1.0);', null, colorLine);
});

test('invalid channel counts and empty fills are dropped, not emitted', () => {
  compare('fill: x/X, y/Y', '', null, colorLine);
  compare('fill: x/X, y/Y, 0.5, 1, 0.2', '', null, colorLine);
  compare('fill: ;', '', null, colorLine);
});

test('in-block shape/size are order-free and apply once (last wins)', () => {
  // size lands before the mask that reads it, whatever the source order
  let shader = draw('match(x > 1) { shape: circle; size: 0.5; fill: red }', extra);
  let ifIdx = shader.indexOf('if (bool((x > 1.0)))');
  let sizeIdx = shader.indexOf('size = 0.5;');
  let maskIdx = shader.indexOf('float dist = length(cellUV);');
  if (!(ifIdx > -1 && ifIdx < sizeIdx && sizeIdx < maskIdx)) {
    throw new Error('block size must land inside the if, before the mask');
  }
  // duplicate shapes collapse to the last one instead of redeclaring locals
  let dup = draw('match(x > 1) { shape: circle; shape: square; fill: red }', extra);
  if ((dup.match(/vec2 cellUV/g) || []).length !== 1 || !/float dsq/.test(dup)) {
    throw new Error('duplicate shape statements must emit a single mask: ' + dup);
  }
});

test('in-block size without a shape re-applies the effective mask', () => {
  let shader = draw('shape: circle; match(x > 1) { size: 0.5; fill: red }', extra);
  if ((shader.match(/float dist = length\(cellUV\);/g) || []).length !== 2) {
    throw new Error('expected the circle mask re-applied inside the block: ' + shader);
  }
});

test('an explicit non-mask shape never gets a square mask', () => {
  let shader = draw('shape: none; size: 0.5; fill: red', extra);
  if (/float dsq/.test(shader)) {
    throw new Error('shape: none must not emit a square mask: ' + shader);
  }
});

test('size expressions coerce to float', () => {
  let shader = draw('shape: circle; size: x > 2; fill: #000', extra);
  if (!/float size = float\(\(x > 2\.0\)\);/.test(shader)) {
    throw new Error('boolean size must be cast to float: ' + shader);
  }
});

test('variable names with regex metacharacters do not crash generation', () => {
  let shader = draw('a[: 1; fill: x', extra);
  if (typeof shader !== 'string') {
    throw new Error('expected a shader string');
  }
});

test('integer helpers run at highp with clamped conversions', () => {
  let shader = draw('fill: #000', extra);
  if (!shader.includes('precision highp int;')) {
    throw new Error('missing highp int precision');
  }
  if (!shader.includes('int cssd_int(float f)')) {
    throw new Error('missing clamped float-to-int helper');
  }
});
