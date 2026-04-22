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

test('nested match block is skipped, no crash', () => {
  compare(
    'match(x>3) { match(y>3) { fill: red } }',
    'if (bool((x > 3.0))) {'
  );
});

test('non-comparison root is bool-coerced', () => {
  compare('match(x) { fill: red }', 'if (bool(x)) {');
  compare('match(sin(x)) { fill: red }', 'if (bool(sin(x))) {');
});
