import test from 'ava';
import { generate_svg } from '../src/generator/svg.js';
import parse_svg from '../src/parser/parse-svg.js';

import compare from './_compare.js';

compare.use(input => {
  return generate_svg(parse_svg(input));
});

function trim(input) {
  return input.split(/\n+/g).map(n => n.trim()).join('');
}

test('empty', t => {
  compare(t,
    '',
    trim(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)
  );
});

test('svg namespace', t => {
  compare(t,
    'svg {}',
    trim(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)
  );
});

test('wrapped by default', t => {
  compare(t,
    'g {}',
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g></g>
      </svg>
    `)
  );
});

test('inline svg element', t => {
  compare(t,
    `svg {
      circle {
        filter: defs linearGradient {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="linearGradient-1"></linearGradient>
        </defs>
        <circle filter="url(#linearGradient-1)"></circle>
      </svg>
    `)
  );
});

test('inline href', t => {
  compare(t,
    `svg {
      use {
        href: defs circle {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <circle id="circle-2"></circle>
        </defs>
        <use href="#circle-2"></use>
      </svg>
    `)
  );
});

test('id shorthand', t => {
  compare(t,
    `circle#id {}`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle id="id"></circle>
      </svg>
    `)
  );
});

test('text node', t => {
  compare(t,
    `text {
      content: hello;
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text>hello</text>
      </svg>
    `)
  );
});

test('title and desc', t => {
  compare(t,
    `title {
      content: hello;
    }
    desc {
      content: world;
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <title>hello</title>
        <desc>world</desc>
      </svg>
    `)
  );
});

test('multiple content', t => {
  compare(t,
    `svg {
      text {
        content: hello;
        content: world;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text>helloworld</text>
      </svg>
    `)
  );
});

test('style tag', t => {
  compare(t,
    `svg {
      circle {}
      style {
        circle {
          fill: red;
        }
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle></circle>
        <style>
          circle{fill:red;}
        </style>
      </svg>
    `)
  );
});

test('inline style', t => {
  compare(t,
    `svg {
      circle {
        style fill: red;
        style r: 1;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle style="fill:red;r:1;"></circle>
      </svg>
    `)
  );
});

test('group id', t => {
  compare(t,
    `svg {
      g#id { circle {} }
      g#id { rect {} }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="id">
          <circle></circle>
          <rect></rect>
        </g>
      </svg>
    `)
  );
});

test('group id and all its attributes', t => {
  compare(t,
    `svg {
      circle#a {
        fill: red
      }
      circle#a {
        cx, cy, r: 5;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle fill="red" id="a" cx="5" cy="5" r="5"></circle>
      </svg>
    `)
  );
});

test('grouped text node', t => {
  compare(t,
    `svg {
      text#id {
        content: hello;
      }
      text#id {
        content: world;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text id="id">helloworld</text>
      </svg>
    `)
  );
});

test('grouped text node with tspan', t => {
  compare(t,
    `svg {
      text#id {
        content: hello;
        tspan {
          content: ok;
        }
      }
      text#id {
        content: world;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text id="id">hello<tspan>ok</tspan>world</text>
      </svg>
    `)
  );
});
