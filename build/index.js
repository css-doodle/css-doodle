import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import * as esbuild from 'esbuild';
import swc from '@swc/core';
import packageInfo from '../package.json' with { type: 'json' };
import { TAG_RE, stripTaggedTemplates, mangleGlsl } from './tagged-template.js';

const GLSL_FILES = /(?:^|[/\\])(pattern|scene|glsl-math-transformer)\.js$/;

const collapseTaggedTemplates = {
    name: 'collapse-tagged-templates',
    setup(build) {
        build.onLoad({ filter: /\.js$/ }, async (args) => {
            let source = await fs.readFile(args.path, 'utf8');
            let changed = false;
            if (TAG_RE.test(source)) {
                source = stripTaggedTemplates(source);
                changed = true;
            }
            if (GLSL_FILES.test(args.path)) {
                source = mangleGlsl(source);
                changed = true;
            }
            return changed ? { contents: source, loader: 'js' } : null;
        });
    },
};

const outputFile = join(import.meta.dirname, '../css-doodle.min.js');
console.time('Build time');

const INTERNAL_PROPS = [
    // Token predicates
    'isSymbol', 'isSpace', 'isWord', 'isNumber',
    // Generator private methods (src/generator/css.js)
    'addRule', 'addRaw', 'addFont', 'scopedVars', 'isRef', 'groupVar',
    'calcContext', 'condContext', 'frameContext', 'callFunc', 'composeSelector',
    'readVar', 'composeComposable', 'composeArgument', 'injectVariables',
    'getComposedValue', 'composeRule', 'composeRuleValue', 'composeVars',
    'preCompose', 'scanTokens', 'condInfo', 'condSelector', 'addCellRule',
    'layoutCells', 'composeGroup', 'printGroups', 'compose',
    // CSSDoodle internal-only methods & fields (src/component/index.js)
    'waitForViewport', 'waitForSource', 'reducesMotion', 'syncMotion',
    'watchViewport', 'getMaxGrid', 'getGrid', 'cellRules', 'pauseCells',
    'getUse', 'triggerEvent', 'dispatchCellClick', 'bindClickToUpdate',
    'shouldRebuild', 'buildGrid', 'applyStyles', 'clockNow', 'restamp',
    'mountFilters', 'setStyle', 'reflow', 'syncSvgAnimations', 'report',
    'shaderRenders', 'observers', 'gridSize',
    // Internal parser, AST, SVG, shader & calc properties (bundle-only)
    'headIndex', 'findSpareDefs', 'ignoreInlineComment', 'lineCommentsIn',
    'preserveLineBreak', 'contextVariable', 'readStatement', 'readBlocks',
    'readTail', 'rawValue', 'noSpace', 'hasTransition',
    'getRgbaColor', 'getVariable', 'signSensitive', 'branched', 'readonly',
    'declared', 'disposed', 'onLost', 'fname', 'fallback', 'segments',
    'verbose', 'copies', 'selectors', 'warnings', 'addons', 'patterns',
    'filters', 'doodles', 'styles', 'tokens', 'origin', 'params', 'defaults',
    'targets', 'parallel', 'shaders', 'program', 'programs', 'users',
    'transfer', 'animated', 'inside', 'extra', 'context', 'property',
    'inline', 'attrs', 'rows', 'arms', 'alts', 'commands', 'clip',
    'rules', 'peek', 'selector', 'attr', 'args', 'constant',
    'composed', 'cluster', 'coefficients', 'lastPickArgs', 'updateRandom',
    'columnRule', 'rowRule', 'calcTemplate', 'cellPrefix', 'spaced',
    'expanded', 'rings', 'hasFunc', 'keyword', 'ruleOrder', 'dispose',
    'groups', 'prefix', 'suffix', 'misses',
];
const MANGLE_PROPS = new RegExp(`^(_|(?:${INTERNAL_PROPS.join('|')})$)`);

const { metafile, outputFiles } = await esbuild.build({
    entryPoints: ['./src/index.js'],
    bundle: true,
    write: false,
    platform: 'browser',
    metafile: true,
    minify: true,
    mangleProps: MANGLE_PROPS,
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
    mangle: true,
    format: {
        asciiOnly: true,
    },
});

const unrenamed = code.match(/g_(?!place\b|to\b)[a-zA-Z]\w+/);
if (unrenamed) throw new Error(`unrenamed ${unrenamed[0]}`);

const output = `/*! css-doodle v${packageInfo.version} MIT licensed */\n${code.replace(/\n/g, '\\n')}`;
await fs.writeFile(outputFile, output, 'utf8');

console.log(await esbuild.analyzeMetafile(metafile));
console.log(`${basename(outputFile)} - ${readableSize(output)}`);
console.timeEnd('Build time');

function readableSize(text) {
    const kb = n => `${(n / 1024).toFixed(1)} KB`;
    return `${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzipped)`;
}
