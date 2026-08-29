import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The last commit before the parser/generator rewrite.
// Override with DIFF_BASELINE=<sha> to compare against another baseline.
export const BASELINE = process.env.DIFF_BASELINE || '597da30';

// Snapshots are written next to the originals so their relative imports
// (parse-var.js, ...) resolve against the working tree. function.js is
// snapshotted too, and the legacy generator is rewired to use it so the
// harness compares legacy vs rewritten function.js as well.
// The baseline predates the src/core + src/component layout, so legacy
// snapshots need their imports remapped (some statement-wise, where a
// default export became a named one) to where those modules live now.
function remap(content, mapping, statements = {}) {
  for (let [from, to] of Object.entries(statements)) {
    content = content.replace(from, to);
  }
  for (let [from, to] of Object.entries(mapping)) {
    content = content.replaceAll(`'${from}'`, `'${to}'`);
  }
  return content;
}

const snapshots = [
  ['src/parser/parse-css.js', 'src/parser/_legacy-parse-css.mjs'],
  ['src/generator/css.js', 'src/generator/_legacy-css.mjs',
    content => remap(content, {
      '../function.js': '../_legacy-function.mjs',
      '../property.js': '../core/property.js',
      '../selector.js': '../core/selector.js',
      '../calc.js': '../core/calc.js',
      '../uniforms.js': '../core/uniforms.js',
      '../cache.js': '../utils/cache.js',
    })],
  ['src/function.js', 'src/_legacy-function.mjs',
    content => remap(content, {
      './calc.js': './core/calc.js',
      './cache.js': './utils/cache.js',
      './uniforms.js': './core/uniforms.js',
      './easing.js': './core/easing.js',
      './utils/transform.js': './core/arguments.js',
    }, {
      [`import expand from './utils/expand.js';`]:
        `import { expand } from './core/arguments.js';`,
      [`import get_named_arguments from './utils/get-named-arguments.js';`]:
        `import { get_named_arguments } from './core/arguments.js';`,
      // utils/stack.js was removed; the working tree uses plain arrays now
      [`import Stack from './utils/stack.js';`]: [
        `class Stack {`,
        `  constructor(limit = 20) { this._limit = limit; this._data = []; }`,
        `  push(data) {`,
        `    if (this._data.length >= this._limit) this._data.shift();`,
        `    this._data.push(data);`,
        `  }`,
        `  last(n = 1) { return this._data[Math.max(this._data.length - n, 0)]; }`,
        `}`,
      ].join('\n'),
    })],
];

export default function setup() {
  return snapshots.map(([orig, copy, transform]) => {
    let target = path.join(root, copy);
    let content = execFileSync('git', ['show', `${BASELINE}:${orig}`], {
      cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    fs.writeFileSync(target, transform ? transform(content) : content);
    return target;
  });
}
