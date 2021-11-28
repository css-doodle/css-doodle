import test from 'ava';

import parseShaders from '../src/parser/parse-shaders';
import compare from './_compare';
compare.use(parseShaders);

test('empty content', t => {
  let input = '';
  let result = {
    fragment: '',
    textures: []
  }
  compare(t, input, result);
});

test('basic sturcture', t => {
  let input = `
    fragment {}
    vertex {}
    texture {}
  `;
  let result = {
    fragment: '',
    textures: []
  }
  compare(t, input, result);
});

test('read content', t => {
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
  compare(t, input, result);
});

test('read fragment shader by default', t => {
  let input = `void main() {}`;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(t, input, result);
});

test('should break line on #define ', t => {
  let input = `
    #define CONST2
    void main() {}
  `;
  let result = {
    fragment: '\n#define CONST2\n void main(){}',
    textures: []
  }
  compare(t, input, result);
});

test('should break line on any starts with # ', t => {
  let input = `
    #define CONST2 xxx;
    void main() {}
  `;
  let result = {
    fragment: '\n#define CONST2 xxx;\nvoid main(){}',
    textures: []
  }
  compare(t, input, result);
});

test('handle parens around raw fragment', t => {
  let input = `(
    void main() {}
  )`;
  let result = {
    fragment: 'void main(){}',
    textures: []
  }
  compare(t, input, result);
});

test('handle parens around group values', t => {
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
  compare(t, input, result);
});

test('handle nested parens', t => {
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
  compare(t, input, result);
});
