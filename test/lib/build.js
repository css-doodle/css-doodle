import test from 'node:test';
import assert from 'node:assert/strict';

import { stripTaggedTemplates, mangleGlsl } from '../../build/tagged-template.js';

test('glsl template substitutions keep spaces needed between tokens', () => {
    let source = stripTaggedTemplates(`
        const loop = glsl\`for (float \${counter} = 0.0; \${counter} < \${times}; \${counter}++) { \${body} }\`;
    `);
    let loop = Function('counter', 'times', 'body', `${source}; return loop`)('cssd1', '8.0', 'cssd2 = cssd1;');
    assert.equal(loop, 'for(float cssd1 =0.; cssd1 < 8.0; cssd1++){ cssd2 = cssd1; }');
});

test('glsl # directives keep their own lines, even around substitutions', () => {
    let source = stripTaggedTemplates(`
        const shader = glsl\`#version 300 es
            #define PI \${pi}
            float x = PI; // tau who?
        \`;
    `);
    let shader = Function('pi', `${source}; return shader`)('3.14');
    assert.equal(shader, '#version 300 es\n#define PI 3.14\nfloat x=PI;\n');
});

test('glsl template substitutions cannot form operators or comments', () => {
    let source = stripTaggedTemplates(`
        const plus = glsl\`x + \${plusValue}\`;
        const minus = glsl\`x - \${minusValue}\`;
        const comment = glsl\`x / \${starValue}\`;
    `);
    let output = Function('plusValue', 'minusValue', 'starValue', `${source}; return [plus, minus, comment]`)(
        '+y', '-y', '*y'
    );
    assert.deepEqual(output, ['x+ +y', 'x- -y', 'x/ *y']);
});

test('mangleGlsl shortens static g_* names across strings, templates and regexes, including after \\n', () => {
    let source = mangleGlsl(`
        const re = /\\b(fwidth|g_shape)\\(/;
        const masked = /\\bg_masked\\b/;
        const a = 'g_dist = 1;\\ng_masked = true;\\n';
        const b = \`g_place = g_to; g_shape(g_dist, 1.0); \${x ? 'g_masked' : ''}\`;
    `);
    assert.ok(!source.includes('g_shape'));
    assert.ok(!source.includes('g_dist'));
    assert.ok(!source.includes('g_masked'));
    assert.ok(source.includes('g_place = g_to'));
    // g_masked after \n maps to the same name as standalone g_masked
    let match = source.match(/\\n(_[a-zA-Z]+) = true/);
    assert.ok(match && source.includes(`'${match[1]}'`));
});
