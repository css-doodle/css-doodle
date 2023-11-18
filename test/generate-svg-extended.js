import test from 'ava';

import parseSvg from '../src/parser/parse-svg.js';
import { generate_svg_extended } from '../src/generator/svg-extended.js';
import compare from './_compare.js';

compare.use(input => {
  return generate_svg_extended(parseSvg(input));
});

test('code transformation', t => {

  compare(t,
    `circle {}`,
    `svg{circle{}}`
  ,);

  compare(t,
    `circle*10 {}`,
    `svg{@M10(circle{})}`
  );

  compare(t,
    `g circle*10x10 {}`,
    `svg{g{@M10x10(circle{})}}`
  );

  compare(t,
    `path {
       href: defs g circle*2 {}
    }`,
    `svg{path{href:defs{g{@M2(circle{})}}}`
  );

});
