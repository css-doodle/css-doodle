#!/usr/bin/env node

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const target = process.argv[2];
if (!target) {
  console.log('missing <target>');
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '../package.json');
const { version } = JSON.parse(fs.readFileSync(file));
const banner = `/*! css-doodle v${version} MIT licensed */\n`

try {
  const content = fs.readFileSync(target, 'utf8');
  if (content) {
    fs.writeFileSync(target, banner + content, 'utf8');
  }
} catch (e) {
  // it's ok
}
