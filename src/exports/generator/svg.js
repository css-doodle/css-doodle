import { generate_css } from '../../generator/css.js';
import parse_css from './../../parser/parse-css.js';

export default function svg(rules) {
  let result = generate_css(
    parse_css(`@content: @svg(${rules});`),
    { x: 1, y: 1, z: 1, count: 1, ratio: 1 }
  );
  if (!result) return '';
  return result.content['#c-1-1-1'] || '';
}

svg.element = function(rules) {
  const output = svg(rules);
  if (typeof DOMParser !== 'undefined') {
    const doc = (new DOMParser()).parseFromString(output, 'image/svg+xml');
    const errorNode = doc.querySelector('parsererror');
    if (!errorNode) {
      return doc.firstChild;
    }
  }
}
