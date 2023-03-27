import { generate_css } from '../../generator/css.js';
import parse_css from './../../parser/parse-css.js';
import parse_svg from './../../parser/parse-svg.js';

export default function svg(rules) {
  let parsedSvg = parse_svg(rules);
  let inlineVariable = '';
  for (let item of parsedSvg.value) {
    if (item.variable) {
      inlineVariable += `${item.name}: ${item.value};`;
    }
  }
  let result = generate_css(
    parse_css(`${inlineVariable} background: @svg(${rules});`),
    { x: 1, y: 1, z: 1, count: 1, ratio: 1 }
  );
  let raw = result && result.styles && result.styles.cells || '';
  let cut = raw.substring(raw.indexOf('%3'), raw.lastIndexOf('");'));
  try {
    return decodeURIComponent(cut);
  } catch (e) {
    return '';
  }
}

svg.element = function(rules) {
  const output = svg(rules);
  if (typeof DOMParser !== 'undefined') {
    const doc = (new DOMParser()).parseFromString(output, 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    if (!errorNode) {
      return doc.firstChild;
    }
  }
}
