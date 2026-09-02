import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import swc from '@swc/core';
import packageInfo from '../package.json' with { type: 'json' };

const TAGS = new Set(['css', 'svg', 'glsl']);
const TAG_RE = /\b(?:css|svg|glsl)`/;

// css`` / svg`` / glsl`` are identity tags at runtime; collapse their
// whitespace here and leave a plain template literal behind.
const collapseTaggedTemplates = {
  name: 'collapse-tagged-templates',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      if (!TAG_RE.test(source)) return null;
      return { contents: stripTaggedTemplates(source), loader: 'js' };
    });
  },
};

const outputFile = join(import.meta.dirname, '../css-doodle.min.js');
console.time('Build time');

const { metafile, outputFiles } = await esbuild.build({
  entryPoints: ['./src/index.js'],
  bundle: true,
  write: false,
  platform: 'browser',
  metafile: true,
  plugins: [collapseTaggedTemplates],
});

const { code } = await swc.minify(outputFiles[0].text, {
  ecma: 2020,
  module: false,
  compress: {
    passes: 3,
    ecma: 2020,
    pure_getters: true,
    unsafe_proto: true,
    // no unsafe_arrows: swc turns functions that read `arguments` into arrows
  },
  mangle: {
    props: { regex: '^_' },
  },
  format: {
    asciiOnly: true,
  },
});

// swc prints newlines inside template literals raw (the only place a minified
// bundle can have one); escape them so the bundle stays on a single line.
const output = `/*! css-doodle v${packageInfo.version} MIT licensed */\n${code.replace(/\n/g, '\\n')}`;
await fs.writeFile(outputFile, output, 'utf8');

console.log(await esbuild.analyzeMetafile(metafile));
console.log(`${basename(outputFile)} - ${readableSize(output)}`);
console.timeLog('Build time');

function readableSize(text) {
  const kb = n => `${(n / 1024).toFixed(1)} KB`;
  return `${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzipped)`;
}

function cssCollapse(s) {
  return s
    .replace(/([:;><{])\s+/g, '$1')
    .replace(/\s+([:;><}{])/g, '$1')
    .replace(/\s+([{}])\s+/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ');
}

function glslCollapse(s) {
  const lines = s.split('\n')
    .map(l => l.replace(/\/\/.*$/, '').replace(/[^\S\n]{2,}/g, ' ').replace(/^\s+|\s+$/g, ''));
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    // Drop interior blank lines only: the first and last line of a quasi may
    // continue a line split by an interpolation, so their boundaries stay.
    if (lines[i] === '' && i > 0 && i < lines.length - 1) continue;
    kept.push(lines[i]);
  }
  let out = kept[0] ?? '';
  for (let i = 1; i < kept.length; i++) {
    const keepNewline = /^#/.test(kept[i - 1]) || /^#/.test(kept[i]);
    out += (keepNewline ? '\n' : ' ') + kept[i];
  }
  return out;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  if (node.type) visit(node);
  for (const key in node) walk(node[key], visit);
}

// Drop the tag and collapse each quasi in place. Quasi ranges never contain
// other nodes, so one descending pass is enough even for nested tags.
function stripTaggedTemplates(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  walk(ast, node => {
    if (node.type !== 'TaggedTemplateExpression') return;
    if (node.tag.type !== 'Identifier' || !TAGS.has(node.tag.name)) return;
    const collapse = node.tag.name === 'glsl' ? glslCollapse : cssCollapse;
    edits.push({ start: node.tag.start, end: node.quasi.start, text: '' });
    for (const quasi of node.quasi.quasis) {
      edits.push({ start: quasi.start, end: quasi.end, text: collapse(quasi.value.raw) });
    }
  });
  edits.sort((a, b) => b.start - a.start);
  for (const { start, end, text } of edits) {
    src = src.slice(0, start) + text + src.slice(end);
  }
  return src;
}
