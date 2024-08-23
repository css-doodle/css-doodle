import test from 'node:test';

import generate_svg from '../src/generator/svg.js';
import parse_svg from '../src/parser/parse-svg.js';

import compare from './_compare.js';

compare.use(input => {
  return generate_svg(parse_svg(input));
});

function trim(input) {
  return input.split(/\n+/g).map(n => n.trim()).join('');
}

test('empty', () => {
  compare(
    '',
    trim(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)
  );
});

test('svg namespace', () => {
  compare(
    'svg {}',
    trim(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)
  );
});

test('wrapped by default', () => {
  compare(
    'g {}',
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g/>
      </svg>
    `)
  );
});

test('inline svg element', () => {
  compare(
    `svg {
      circle {
        filter: defs linearGradient {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="linearGradient-1"/>
        </defs>
        <circle filter="url(#linearGradient-1)"/>
      </svg>
    `)
  );
});

test('inline href', () => {
  compare(
    `svg {
      use {
        href: defs circle {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <circle id="circle-2"/>
        </defs>
        <use href="#circle-2"/>
      </svg>
    `)
  );
});

test('id shorthand', () => {
  compare(
    `circle#id {}`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle id="id"/>
      </svg>
    `)
  );
});

test('text node', () => {
  compare(
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

test('title and desc', () => {
  compare(
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

test('multiple content', () => {
  compare(
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

test('remove quotes around text', () => {
  compare(
    `text {
      content: "hello";
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text>hello</text>
      </svg>
    `)
  );

  compare(
    `text {
      content: 'hello';
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text>hello</text>
      </svg>
    `)
  );
});


test('special character inside quotes', () => {
  compare(
    `text {
      content: "}";
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text>}</text>
      </svg>
    `)
  );
});


test('style tag', () => {
  compare(
    `svg {
      circle {}
      style {
        circle {
          fill: red;
        }
        circle:nth-child(1) {
        }
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle/>
        <style>
          circle{fill:red;}
          circle:nth-child(1){}
        </style>
      </svg>
    `)
  );
});

test('inline style', () => {
  compare(
    `svg {
      circle {
        style fill: red;
        style r: 1;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle style="fill:red;r:1;"/>
      </svg>
    `)
  );
});

test('group id', () => {
  compare(
    `svg {
      g#id { circle {} }
      g#id { rect {} }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="id">
          <circle/>
          <rect/>
        </g>
      </svg>
    `)
  );
});

test('group ids only when they are at the same level', () => {
  compare(
    `svg {
      g g#id { circle {} }
      g#id { rect {} }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g>
          <g id="id">
            <circle/>
          </g>
        </g>
        <g id="id">
          <rect/>
        </g>
      </svg>
    `)
  );
});

test('group id and all its attributes', () => {
  compare(
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
        <circle fill="red" id="a" cx="5" cy="5" r="5"/>
      </svg>
    `)
  );
});

test('grouped text node', () => {
  compare(
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

test('grouped text node with tspan', () => {
  compare(
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

test('do not group elements for empty id', () => {
  compare(
    `svg {
      circle {
        fill: red
      }
      circle {
        cx, cy, r: 5;
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle fill="red"/>
        <circle cx="5" cy="5" r="5"/>
      </svg>
    `)
  );
});

test('Normalize quoted attribute values', () => {
  compare(
    `circle {
        name: "hello";
      }
    `,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle name="hello"/>
      </svg>
    `)
  );
  compare(
    `circle {
        name: 'hello';
      }
    `,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle name="hello"/>
      </svg>
    `)
  );
});

test('draw', () => {
  compare(
    `path {
      draw: 2s;
    }`,

    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path stroke-dasharray="10" pathLength="10">
          <animate attributeName="stroke-dashoffset" from="10" to="0" dur="2s"/>
        </path>
      </svg>

    `)
  );
});

test('combile defs elements into one', () => {
  compare(
    `defs {}
     defs {}`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs/>
      </svg>
    `)
  );

  compare(
    `defs g {}
     defs path {}`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g/>
          <path/>
        </defs>
      </svg>
    `)
  );
});

test('handle nested defs', () => {
  compare(
    `path {
      fill: defs g {
        mask: defs g {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="g-3"/>
          <g mask="url(#g-3)" id="g-4"/>
        </defs>
        <path fill="url(#g-4)"/>
      </svg>
    `)
  );
});

test('generate single defs id', () => {
  compare(
    `defs g#1 {}
     defs g#1 {}`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="1"/>
        </defs>
      </svg>
    `)
  );

  compare(
    `path {
      href: defs g#1 {}
    }
    path {
      href: defs g#1 {}
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="1"/>
        </defs>
        <path href="#1"/>
        <path href="#1"/>
      </svg>
    `)
  );
});

test('put id at right element', () => {
  compare(
    `svg {
      circle {
        filter: defs g circle {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="g-5">
            <circle/>
          </g>
        </defs>
        <circle filter="url(#g-5)"/>
      </svg>
    `)
  );

  compare(
    `svg {
      circle {
        filter: defs g g g circle {}
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="g-6">
            <g>
              <g>
                <circle/>
              </g>
            </g>
          </g>
        </defs>
        <circle filter="url(#g-6)"/>
      </svg>
    `)
  );
});

test('no id for multiple inline defs child elements', () => {
  compare(
    `svg {
      circle {
        filter: defs {
          a {}
          b {}
        }
      }
    }`,
    trim(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <a/>
          <b/>
        </defs>
        <circle filter=""/>
      </svg>
    `)
  );
});
