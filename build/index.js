import fs from 'node:fs/promises';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import packageInfo from '../package.json' with { type: 'json' };

try {
  const outputFile = join(import.meta.dirname, '../css-doodle.min.js');
  console.time('Build time');

  const result = await esbuild.build({
    entryPoints: ['./src/index.js'],
    outfile: outputFile,
    bundle: true,
    minify: true,
    platform: 'browser',
    metafile: true,
    banner: {
      js: `/*! css-doodle v${packageInfo.version} MIT licensed */`,
    },
  });

  console.log(await esbuild.analyzeMetafile(result.metafile));

  await minifyWhitespace(outputFile);
  const size = await getReadableSize(outputFile);
  console.log(`${basename(outputFile)} - ${size}`);
  console.timeLog(`Build time`);
} catch {
  process.exit(1);
}

async function minifyWhitespace(file) {
  const text = await fs.readFile(file, 'utf8');
  const minified = text
    .replace(/([>;{}])\n/g, '$1')
    .replace(/([:;><{`])\s+/g, '$1')
    .replace(/\s+([:;><}`])/g, '$1')
    .replace(/\s+([{}])\s+/g, '$1')
    .replace(/(\})\s+/g, '$1 ')
    .replace(/>\s+</g, '><')
  await fs.writeFile(file, minified, 'utf8');
}

async function getReadableSize(file) {
  const { size } = await fs.stat(file);
  return `${(size / 1024).toFixed(1)} KB`;
}
