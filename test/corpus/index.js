// The corpus: the hand-written fixtures plus every <css-doodle> found in
// the *.html files at the repo root. Shared by the fuzz tests, the perf
// scripts and the local golden harness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fixtures from './fixtures.js';

export { fixtures };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// src/utils unEntity needs a DOM; decode the entities that appear in
// doodle sources by hand
function unEntity(code) {
    return code
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&');
}

export function htmlCases() {
    let cases = [];
    for (let file of fs.readdirSync(root).sort()) {
        if (!file.endsWith('.html')) continue;
        let content = fs.readFileSync(path.join(root, file), 'utf8');
        let re = /<css-doodle[^>]*>([\s\S]*?)<\/css-doodle>/g;
        let match, i = 0;
        while ((match = re.exec(content)) !== null) {
            let code = unEntity(match[1]).trim();
            if (code.length) {
                cases.push({ name: `${file}#${i}`, code });
            }
            i += 1;
        }
    }
    return cases;
}

export function allCases() {
    return [...fixtures, ...htmlCases()];
}
