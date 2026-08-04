import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fixtures from './fixtures.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// src/utils un_entity needs a DOM; decode the entities that appear in
// doodle sources by hand
function un_entity(code) {
  return code
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function html_cases() {
  let cases = [];
  for (let file of fs.readdirSync(root).sort()) {
    if (!file.endsWith('.html')) continue;
    let content = fs.readFileSync(path.join(root, file), 'utf8');
    let re = /<css-doodle[^>]*>([\s\S]*?)<\/css-doodle>/g;
    let match, i = 0;
    while ((match = re.exec(content)) !== null) {
      let code = un_entity(match[1]).trim();
      if (code.length) {
        cases.push({ name: `${file}#${i}`, code });
      }
      i += 1;
    }
  }
  return cases;
}

export function all_cases() {
  return [...fixtures, ...html_cases()];
}
