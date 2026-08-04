/**
 * Differential harness: compares the legacy parse-css/css.js pipeline
 * (snapshotted from git, see setup.js) against the working tree.
 *
 * Usage:
 *   node test/diff/run.js [mode] [caseName]
 *
 * Modes:
 *   full  (default) new parse + new generate  vs  legacy parse + legacy generate
 *   cross           new parse + adapter + LEGACY generate  vs  legacy pipeline
 *                   (verifies the parser independently of the generator rewrite)
 *   parse           adapted new AST vs legacy AST as normalized JSON
 *   mutate          full + double-generate on a shared AST (mutation check)
 *
 * Normalizations applied before comparing (see plan divergences D1/D2/D3):
 *   - unique ids (doodle/shader/pattern/filter- + random) -> ordinals
 *   - millisecond timings -> XXms
 *   - runs of whitespace -> single space; spaces around commas dropped;
 *     spaces before ;} dropped; block comments stripped
 */
import setup from './setup.js';
import { all_cases } from './corpus.js';
import expected from './expected-divergences.js';
import adapt from './adapter.js';

setup();

const legacy_parse = (await import('../../src/parser/_legacy-parse-css.mjs')).default;
const legacy_generate = (await import('../../src/generator/_legacy-css.mjs')).default;
const new_parse = (await import('../../src/parser/parse-css.js')).default;
const new_generate = (await import('../../src/generator/css.js')).default;

// The memo() cache (e.g. shape-function) is a module-level singleton shared
// by both function.js snapshots; clear it around each generate so values
// cached by one pipeline never serve the other.
const { cache } = await import('../../src/cache.js');
function fresh(generate, ...args) {
  cache.clear();
  return generate(...args);
}

const mode = process.argv[2] || 'full';
const only = process.argv[3];

const SEED = '12345';
const MAX_GRID = 64;
const GRIDS = [
  { x: 4, y: 4, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: 1, y: 1, z: 3 },
];

function make_extra(map) {
  if (!map) return undefined;
  return { get_variable: name => map[name] ?? '' };
}

function normalize(str) {
  let ids = new Map();
  return String(str)
    .replace(/(doodle|shader|pattern|filter-)([a-z0-9]{8,})/g, (m, p) => {
      if (!ids.has(m)) ids.set(m, `${p}<${ids.size}>`);
      return ids.get(m);
    })
    // svg element ids come from a module-level counter (generator/svg.js
    // nextId) that keeps incrementing across generate calls in one process
    .replace(/(id="|url\(#|href="#)([a-zA-Z0-9_.]+)-\d+/g, '$1$2-N')
    .replace(/(id%3D%22|url\(%23|href%3D%22%23)([a-zA-Z0-9_.]+)-\d+/g, '$1$2-N')
    .replace(/-?\d+(?:\.\d+)?ms/g, 'XXms')
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(/[ \t\n]+/g, ' ')
    .replace(/ ?, ?/g, ',')
    .replace(/ ?([;}{]) ?/g, '$1')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/: +/g, ':');
}

function normalize_result(result) {
  if (!result) return String(result);
  let { random, ...rest } = result;
  return normalize(JSON.stringify(rest, (key, value) => {
    if (typeof value === 'function') return '<fn>';
    return value;
  }))
  // an empty upstream-extra stack and an absent one are equivalent
  // (generate_css defaults upextra to []); legacy emits whichever the
  // incidental coords.extra state left behind
  .replace(/,"upextra":\[\]/g, '');
}

function sort_keys(value) {
  if (Array.isArray(value)) return value.map(sort_keys);
  if (value && typeof value === 'object') {
    let out = {};
    for (let key of Object.keys(value).sort()) {
      out[key] = sort_keys(value[key]);
    }
    return out;
  }
  return value;
}

function drop_empty_text(value) {
  if (Array.isArray(value)) {
    return value
      .map(drop_empty_text)
      .filter(v => !(v && v.type === 'text' && v.value === ''));
  }
  if (value && typeof value === 'object') {
    let out = {};
    for (let k of Object.keys(value)) out[k] = drop_empty_text(value[k]);
    return out;
  }
  return value;
}

function strip_ast(ast) {
  return drop_empty_text(sort_keys(JSON.parse(JSON.stringify(ast, (key, value) => {
    if (key === 'position') return undefined;
    if (key === 'value' && typeof value === 'string') {
      // parse-level view of divergences D1/D3: comment leaks and
      // whitespace normalization inside values
      return value
        .replace(/\/\*[^]*?\*\//g, '')
        .replace(/[ \t\n]+/g, ' ')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')')
        .trim();
    }
    if (key === 'selector' && typeof value === 'string') {
      return value.replace(/^\:+doodle/, ':host');
    }
    return value;
  }))));
}

function first_diff(a, b) {
  let i = 0;
  let max = Math.min(a.length, b.length);
  while (i < max && a[i] === b[i]) i++;
  let from = Math.max(0, i - 60);
  return [
    `  legacy: …${a.slice(from, i + 90)}…`,
    `  new:    …${b.slice(from, i + 90)}…`,
  ].join('\n');
}

function run_case({ name, code, extra }) {
  let diffs = [];
  if (mode === 'parse') {
    let a = normalize(JSON.stringify(strip_ast(legacy_parse(code, make_extra(extra)))));
    let b = normalize(JSON.stringify(strip_ast(adapt(new_parse(code, make_extra(extra))))));
    if (a !== b) diffs.push(`ast\n${first_diff(a, b)}`);
    return diffs;
  }
  for (let grid of GRIDS) {
    // Fresh parse per generate: the legacy generator mutates the AST.
    let a = normalize_result(
      fresh(legacy_generate, legacy_parse(code, make_extra(extra)), { ...grid }, SEED, MAX_GRID));
    let b = mode === 'cross'
      ? normalize_result(
          fresh(legacy_generate, adapt(new_parse(code, make_extra(extra))), { ...grid }, SEED, MAX_GRID))
      : normalize_result(
          fresh(new_generate, new_parse(code, make_extra(extra)), { ...grid }, SEED, MAX_GRID));
    if (a !== b) {
      diffs.push(`grid ${grid.x}x${grid.y}x${grid.z}\n${first_diff(a, b)}`);
    }
    if (mode === 'mutate') {
      // Reusing one AST across generations must give identical output.
      // (Fails on the legacy generator by design: token.skip mutation.)
      let ast = new_parse(code, make_extra(extra));
      let g1 = normalize_result(fresh(new_generate, ast, { ...grid }, SEED, MAX_GRID));
      let g2 = normalize_result(fresh(new_generate, ast, { ...grid }, SEED, MAX_GRID));
      if (g1 !== g2) {
        diffs.push(`double-generate not identical (grid ${grid.x}x${grid.y}x${grid.z})\n${first_diff(g1, g2)}`);
      }
    }
  }
  return diffs;
}

let cases = all_cases();
if (only) {
  cases = cases.filter(c => c.name.includes(only));
}

let pass = 0, diverged = 0, failed = [];
for (let c of cases) {
  let diffs, error;
  try {
    diffs = run_case(c);
  } catch (e) {
    error = e;
  }
  if (error) {
    failed.push(`✗ ${c.name} threw: ${error.message}\n${error.stack.split('\n')[1] ?? ''}`);
  } else if (diffs.length === 0) {
    pass += 1;
  } else if (expected.has(c.name)) {
    diverged += 1;
    if (only) {
      console.log(`~ ${c.name} diverged (expected: ${expected.get(c.name)})`);
    }
  } else {
    failed.push(`✗ ${c.name}\n${diffs.join('\n')}`);
  }
}

console.log(`[diff:${mode}] ${cases.length} cases: ${pass} identical, ${diverged} expected divergences, ${failed.length} unexpected`);
if (failed.length) {
  console.log();
  console.log(failed.slice(0, 20).join('\n\n'));
  if (failed.length > 20) console.log(`\n… and ${failed.length - 20} more`);
  process.exit(1);
}
