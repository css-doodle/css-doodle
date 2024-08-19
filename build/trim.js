#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const target = process.argv[2];
if (!target) {
  console.log('missing <target>');
  process.exit(0);
}

try {
  const content = fs.readFileSync(target, 'utf8')
    .replace(/([>;{}])\\n/g, '$1')
    .replace(/([:;><{\`])\s+/g, '$1')
    .replace(/\s+([:;><}{\`])/g, '$1')
    .replace(/\s+([{}])\s+/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ');

  if (content) {
    fs.writeFileSync(target, content, 'utf8');
  }
} catch (e) {
  // it's ok
}
