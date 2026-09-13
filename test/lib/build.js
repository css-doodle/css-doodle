import test from 'node:test';
import assert from 'node:assert/strict';

import { stripTaggedTemplates } from '../../build/tagged-template.js';

test('glsl template substitutions keep spaces needed between tokens', () => {
    let source = stripTaggedTemplates(`
        const loop = glsl\`for (float \${counter} = 0.0; \${counter} < \${times}; \${counter}++) { \${body} }\`;
    `);
    let loop = Function('counter', 'times', 'body', `${source}; return loop`)('cssd1', '8.0', 'cssd2 = cssd1;');
    assert.equal(loop, 'for(float cssd1 =0.0; cssd1 < 8.0; cssd1++){ cssd2 = cssd1; }');
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
