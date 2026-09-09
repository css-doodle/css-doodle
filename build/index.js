import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import swc from '@swc/core';
import packageInfo from '../package.json' with { type: 'json' };

const TAGS = ['css', 'svg', 'glsl'];
const TAG_RE = new RegExp(String.raw`\b(?:${TAGS.join('|')})\``);

const GLSL_PUNCT = /[-+*/%<>=!&|?:,;(){}\[\]]/;
const GLSL_GLUE = /^(\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\/[/*])$/;

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

function cssCollapse(s) {
    return s
        .replace(/([:;><{])\s+/g, '$1')
        .replace(/\s+([:;><}{])/g, '$1')
        .replace(/\s+([{}])\s+/g, '$1')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ');
}

function glslSqueeze(line) {
    return line.replace(/\s+/g, ' ').replace(/(.) (?=(.))/g, (space, before, after) =>
        (GLSL_PUNCT.test(before) || GLSL_PUNCT.test(after)) && !GLSL_GLUE.test(before + after)
            ? before
            : space
    );
}

function glslCollapse(s) {
    const lines = s.split('\n').map(l => l.replace(/\/\/.*$/, '').trim());
    const kept = lines.filter((line, i) => line || i === 0 || i === lines.length - 1);
    let out = kept[0] ?? '';
    for (let i = 1; i < kept.length; i++) {
        // `#` directives own their line, so they keep the newline on both sides.
        const directive = /^#/.test(kept[i - 1]) || /^#/.test(kept[i]);
        out += (directive ? '\n' : ' ') + kept[i];
    }
    return out.split('\n').map(l => /^#/.test(l) ? l : glslSqueeze(l)).join('\n');
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

function stripTaggedTemplates(src) {
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const edits = [];
    walk(ast, node => {
        if (node.type !== 'TaggedTemplateExpression') return;
        if (node.tag.type !== 'Identifier' || !TAGS.includes(node.tag.name)) return;
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
    return src.trim()
}
