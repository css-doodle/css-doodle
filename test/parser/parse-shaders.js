import test from 'node:test';
import assert from 'node:assert/strict';

import parseShaders from '../../src/parser/parse-shaders.js';

const shader = (fragment, textures = []) => ({ fragment, textures });

test('empty input and empty sections', () => {
    assert.deepEqual(parseShaders(''), shader(''));
    assert.deepEqual(parseShaders('fragment {} vertex {} texture {}'), shader(''));
});

test('the fragment section is read compacted', () => {
    assert.deepEqual(parseShaders(`
        fragment {
          void main() {
            float PI = 3.14159;
          }
        }
        vertex {}
        texture {}
    `), shader('void main(){float PI = 3.14159;}'));
});

test('bare source is the fragment shader', () => {
    assert.deepEqual(parseShaders('void main() {}'), shader('void main(){}'));
});

test('preprocessor lines keep their line breaks', () => {
    assert.deepEqual(
        parseShaders('\n#define CONST2\nvoid main() {}\n'),
        shader('\n#define CONST2\n\nvoid main(){}')
    );
    assert.deepEqual(
        parseShaders('\n#define CONST2 xxx;\nvoid main() {}\n'),
        shader('\n#define CONST2 xxx;\nvoid main(){}')
    );
    // a directive at the very end of the source has no following line
    assert.deepEqual(parseShaders('#endif'), shader('\n#endif'));
    assert.deepEqual(parseShaders('void main(){}\n#endif'), shader('void main(){}\n#endif'));
});

test('a # inside a texture section is a color, not a directive', () => {
    assert.deepEqual(parseShaders(`
        texture_0 {
          background: #000;
        }
        fragment {
          void main() {}
        }
    `), shader('void main(){}', [{ name: 'texture_0', value: 'background:#000;' }]));
});

test('parens around the source or a section are unwrapped', () => {
    assert.deepEqual(parseShaders('(\n void main() {}\n)'), shader('void main(){}'));
    assert.deepEqual(parseShaders('(\n fragment {\n (\n void main() {}\n )\n }\n)'), shader('void main(){}'));
    assert.deepEqual(parseShaders('fragment {\n ((\n void main() {}\n ))\n }'), shader('void main(){}'));
});

test('line and block comments are dropped', () => {
    assert.deepEqual(parseShaders(`
        // this is inline comment
        // this is another inline comment
        fragment {
          void main() {
            /**
             * more comments
             */
            float PI = /*pi value*/3.14159;
          }
        }
    `), shader('void main(){float PI = 3.14159;}'));
});
