import test from 'node:test';

import parseShaders from '../src/parser/parse-shaders.js';
import compare from './_compare.js';

compare.use(parseShaders);

test('empty content', () => {
  let input = '';
  let result = {
    fragment: '',
    textures: []
  }
  compare(input, result);
});

test('basic sturcture', () => {
  let input = `
    fragment {}
    vertex {}
    texture {}
  `;
  let result = {
    fragment: '',
    textures: []
  }
  compare(input, result);
});

test('read content', () => {
  let input = `
    fragment {
      void main() {
        float PI = 3.14159;
      }
    }
    vertex {}
    texture {}
  `;
  let result = {
    fragment: 'void main(){float PI = 3.14159;}',
    textures: []
  }
  compare(input, result);
});

test('read fragment shader by default', () => {
  let input = `void main() {}`;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(input, result);
});

test('should break line on #define ', () => {
  let input = `
    #define CONST2
    void main() {}
  `;
  let result = {
    fragment: '\n#define CONST2\n\nvoid main(){}',
    textures: []
  }
  compare(input, result);
});

test('should break line on any starts with # ', () => {
  let input = `
    #define CONST2 xxx;
    void main() {}
  `;
  let result = {
    fragment: '\n#define CONST2 xxx;\nvoid main(){}',
    textures: []
  }
  compare(input, result);
});

test('should ignore # inside textures', () => {
  let input = `
    texture_0 {
      background: #000;
    }
    fragment {
      void main() {}
    }
  `;
  let result = {
    fragment: 'void main(){}',
    textures: [
      {
        name: 'texture_0',
        value: 'background:#000;'
      }
    ]
  }
  compare(input, result);
});

test('handle parens around raw fragment', () => {
  let input = `(
    void main() {}
  )`;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(input, result);
});

test('handle parens around group values', () => {
  let input = `(
    fragment {
      (
        void main() {}
      )
    }
  )`;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(input, result);
});

test('handle nested parens', () => {
  let input = `
    fragment {
      ((
        void main() {}
      ))
    }
  `;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(input, result);
});

test('ignore comments', () => {
  let input = `
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
  `;
  let result = {
    fragment: 'void main(){float PI = 3.14159;}',
    textures: []
  }
  compare(input, result);
});
