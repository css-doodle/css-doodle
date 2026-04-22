import test from 'node:test';
import draw from '../src/generator/pattern.js';
import compare from './_compare.js';

const extra = { get_rgba_color: () => ({ r: 255, g: 0, b: 0, a: 1 }) };

function ifLine(code) {
  let s = draw(code, extra);
  let line = s.split('\n').map(l => l.trim()).find(l => l.startsWith('if ('));
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

test('int() cast in match predicate coerces to bool', () => {
  compare('match(int(x)) { fill: red }', 'if (bool(int(x))) {');
});

test('non-comparison root is bool-coerced', () => {
  compare('match(x) { fill: red }', 'if (bool(x)) {');
  compare('match(sin(x)) { fill: red }', 'if (bool(sin(x))) {');
});

test('r, theta, PI built-ins', () => {
  let shader = draw('match(r < 3) { fill: red }', extra);
  if (!/float r = length\(vec2\(dx, dy\)\);/.test(shader)) {
    throw new Error('missing r definition');
  }
  if (!/float theta = atan\(dy, dx\);/.test(shader)) {
    throw new Error('missing theta definition');
  }
  if (!/const float PI = 3\.14159/.test(shader)) {
    throw new Error('missing PI constant');
  }
  compare('match(r < 3) { fill: red }', 'if (bool((r < 3.0))) {');
  compare('match(theta > 0) { fill: red }', 'if (bool((theta > 0.0))) {');
  compare(
    'match(theta > -PI/4 && theta < PI/4) { fill: red }',
    'if (bool((bool((theta > (-PI / 4.0))) && bool((theta < (PI / 4.0)))))) {'
  );
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
