import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import swc from '@swc/core';
import packageInfo from '../package.json' with { type: 'json' };
import { TAG_RE, stripTaggedTemplates } from './tagged-template.js';

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
    minify: true,
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
        unsafe_arrows: true
    },
    mangle: {
        props: { regex: '^_' },
    },
    format: {
        asciiOnly: true,
    },
});

const output = `/*! css-doodle v${packageInfo.version} MIT licensed */\n${code.replace(/\n/g, '\\n')}`;
await fs.writeFile(outputFile, output, 'utf8');

console.log(await esbuild.analyzeMetafile(metafile));
console.log(`${basename(outputFile)} - ${readableSize(output)}`);
console.timeEnd('Build time');

function readableSize(text) {
    const kb = n => `${(n / 1024).toFixed(1)} KB`;
    return `${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzipped)`;
}
