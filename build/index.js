import fs from 'node:fs/promises';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import { minify } from 'terser';
import * as acorn from 'acorn';
import packageInfo from '../package.json' with { type: 'json' };

const TAGS = new Set(['css', 'svg', 'glsl']);

const collapseTaggedTemplates = {
  name: 'collapse-tagged-templates',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      if (!hasTag(source)) return null;
      return { contents: stripTaggedTemplates(source), loader: 'js' };
    });
  },
};

try {
  const outputFile = join(import.meta.dirname, '../css-doodle.min.js');
  console.time('Build time');

  const { metafile, outputFiles } = await esbuild.build({
    entryPoints: ['./src/index.js'],
    bundle: true,
    write: false,
    platform: 'browser',
    metafile: true,
    plugins: [collapseTaggedTemplates],
    banner: {
      js: `/*! css-doodle v${packageInfo.version} MIT licensed */`,
    },
  });

  const { code } = await minify(outputFiles[0].text, {
    compress: {
      passes: 3,
      unsafe_arrows: true,
      unsafe_methods: true,
      unsafe_proto: true,
      unsafe_undefined: true,
      unsafe_symbols: true,
      pure_getters: true,
      hoist_funs: true,
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/,
      },
    },
    format: {
      ascii_only: true,
    },
  });

  await fs.writeFile(outputFile, code, 'utf8');

  console.log(await esbuild.analyzeMetafile(metafile));
  console.log(`${basename(outputFile)} - ${await getReadableSize(outputFile)}`);
  console.timeLog(`Build time`);
} catch (e) {
  console.log(e);
  process.exit(1);
}

function hasTag(src) {
  return /\b(?:css|svg|glsl)`/.test(src);
}

// CSS / SVG / css-doodle declarations: all whitespace is insignificant.
function cssCollapse(s) {
  return s
    .replace(/([:;><{])\s+/g, '$1')
    .replace(/\s+([:;><}{])/g, '$1')
    .replace(/\s+([{}])\s+/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ');
}

// Shader source: trim indentation and collapse horizontal runs, but keep a
// newline whenever either adjacent line needs one (a `#` preprocessor directive
// or a `//` line comment), which GLSL requires to stay valid.
function glslCollapse(s) {
  const lines = s.split('\n').map(l => l.replace(/[^\S\n]{2,}/g, ' ').replace(/^\s+|\s+$/g, ''));
  let out = lines[0] ?? '';
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1], cur = lines[i];
    const keepNewline = /^#/.test(prev) || prev.includes('//') || /^#/.test(cur);
    out += (keepNewline ? '\n' : ' ') + cur;
  }
  return out;
}

function collapse(raw, tag) {
  return tag === 'glsl' ? glslCollapse(raw) : cssCollapse(raw);
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  if (node.type) visit(node);
  for (const key in node) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    walk(node[key], visit);
  }
}

function stripTaggedTemplates(src) {
  for (let pass = 0; pass < 20 && hasTag(src); pass++) {
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch {
      break;
    }
    const edits = [];
    const outer = [];
    walk(ast, node => {
      if (node.type !== 'TaggedTemplateExpression') return;
      if (node.tag.type !== 'Identifier' || !TAGS.has(node.tag.name)) return;
      // skip tags nested inside a tag already picked up in this pass
      if (outer.some(([s, e]) => node.start > s && node.end <= e)) return;
      outer.push([node.start, node.end]);
      const tag = node.tag.name;
      const { quasis, expressions } = node.quasi;
      let out = '`';
      quasis.forEach((quasi, i) => {
        out += collapse(quasi.value.raw, tag);
        if (i < expressions.length) {
          out += '${' + src.slice(expressions[i].start, expressions[i].end) + '}';
        }
      });
      out += '`';
      edits.push({ start: node.start, end: node.end, replacement: out });
    });
    if (!edits.length) break;
    edits.sort((a, b) => b.start - a.start);
    for (const { start, end, replacement } of edits) {
      src = src.slice(0, start) + replacement + src.slice(end);
    }
  }
  return src;
}

async function getReadableSize(file) {
  const { size } = await fs.stat(file);
  return `${(size / 1024).toFixed(1)} KB`;
}
