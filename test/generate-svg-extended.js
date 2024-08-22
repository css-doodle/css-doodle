import it from 'node:test';
import compare from './_compare.js';

import parseSvg from '../src/parser/parse-svg.js';
import generate_svg_extended from '../src/generator/svg-extended.js';

compare.use(input => {
  return generate_svg_extended(parseSvg(input));
});

it('code transformation', () => {

  compare(
    `circle {}`,
    `svg{circle{}}`
  ,);

  compare(
    `circle*10 {}`,
    `svg{@M10(circle{})}`
  );

  compare(
    `g circle*10x10 {}`,
    `svg{g{@M10x10(circle{})}}`
  );

  compare(
    `path {
       href: defs g circle*2 {}
    }`,
    `svg{path{href:defs{g{@M2(circle{})}}}}`
  );

});
