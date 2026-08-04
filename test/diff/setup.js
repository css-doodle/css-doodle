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
const snapshots = [
  ['src/parser/parse-css.js', 'src/parser/_legacy-parse-css.mjs'],
  ['src/generator/css.js', 'src/generator/_legacy-css.mjs',
    content => content.replace(`'../function.js'`, `'../_legacy-function.mjs'`)],
  ['src/function.js', 'src/_legacy-function.mjs'],
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
