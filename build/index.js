import fs from 'node:fs/promises';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import { minify } from 'terser';
import packageInfo from '../package.json' with { type: 'json' };

try {
  const outputFile = join(import.meta.dirname, '../css-doodle.min.js');
  console.time('Build time');

  const { metafile, outputFiles } = await esbuild.build({
    entryPoints: ['./src/index.js'],
    bundle: true,
    write: false,
    platform: 'browser',
    metafile: true,
    banner: {
      js: `/*! css-doodle v${packageInfo.version} MIT licensed */`,
    },
  });

  const { code } = await minify(outputFiles[0].text, {
    compress: true,
    mangle: true,
    format: {
      ascii_only: true,
    },
  });

  await fs.writeFile(outputFile, minifyWhitespace(code), 'utf8');

  console.log(await esbuild.analyzeMetafile(metafile));
  console.log(`${basename(outputFile)} - ${await getReadableSize(outputFile)}`);
  console.timeLog(`Build time`);
} catch (e) {
  console.log(e);
  process.exit(1);
}

function minifyWhitespace(input) {
  return input
    .replace(/([>;{}])\\n/g, '$1')
    .replace(/([:;><{\`])\s+/g, '$1')
    .replace(/\s+([:;><}{\`])/g, '$1')
    .replace(/\s+([{}])\s+/g, '$1')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ');
}

async function getReadableSize(file) {
  const { size } = await fs.stat(file);
  return `${(size / 1024).toFixed(1)} KB`;
}
