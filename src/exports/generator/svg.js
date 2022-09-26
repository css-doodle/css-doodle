import { generate_css } from '../../generator/css.js';
import parse_css from './../../parser/parse-css.js';
import parse_grid from './../../parser/parse-grid.js';
import { make_tag_function } from '../../utils/index.js';

export default function svg(rules) {
  let result = generate_css(
    parse_css(`background: @svg(${rules});`),
    parse_grid('1x1')
  );
  let raw = result && result.styles && result.styles.cells || '';
  let cut = raw.substring(52, raw.length - 5);
  return decodeURIComponent(cut);
}
