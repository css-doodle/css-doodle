// Pixel goldens for the cases in cases.js, compared by hand rather than in
// CI: fonts, the GPU and the Chrome version all move pixels, so goldens
// are kept per machine under test/browser/golden/<gpu>/ and gitignored.
//
//   node test/browser/pixel.js           compare
//   node test/browser/pixel.js update    rewrite the goldens
//   node test/browser/pixel.js <name>    only cases whose name contains it
//
// Screenshots of the cases that differ go to /tmp/cssd-pixel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GPU, launch, mount, settle, decode, difference } from './chrome.js';
import cases from './cases.js';

const goldenDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden', GPU);
const out = '/tmp/cssd-pixel';
const MAX_DIFF = .002;

let arg = process.argv[2];
let update = arg === 'update';
let selected = update || !arg ? cases : cases.filter(c => c.name.includes(arg));

fs.mkdirSync(goldenDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });

let chrome = await launch();
let page = await chrome.page();
let fails = 0;
for (let c of selected) {
    await page.reload();
    let el = await mount(page, c.code, { seed: c.seed ?? 1 });
    let { png } = await settle(page, el);
    let file = path.join(goldenDir, `${c.name}.png`);
    let name = c.name.padEnd(22);
    if (update || !fs.existsSync(file)) {
        fs.writeFileSync(file, png);
        console.log(`✎ ${name} recorded`);
        continue;
    }
    let share = difference(await decode(page, png), await decode(page, fs.readFileSync(file)));
    if (share > MAX_DIFF) {
        fails++;
        fs.writeFileSync(path.join(out, `${c.name}.png`), png);
    }
    console.log(`${share > MAX_DIFF ? '✖' : '✔'} ${name} ${(100 * share).toFixed(2)}% differ`);
}
await chrome.close();
console.log(fails ? `${fails} case(s) differ, see ${out}` : `${selected.length} cases match (${GPU})`);
process.exit(fails ? 1 : 0);
