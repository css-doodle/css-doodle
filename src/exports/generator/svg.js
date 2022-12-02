import { generate_css } from '../../generator/css.js';
import parse_css from './../../parser/parse-css.js';
import parse_svg from './../../parser/parse-svg.js';
import parse_grid from './../../parser/parse-grid.js';
import { make_tag_function } from '../../utils/index.js';

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
    parse_grid('1x1')
  );
  let raw = result && result.styles && result.styles.cells || '';
  let cut = raw.substring(raw.indexOf('%3'), raw.lastIndexOf('");'));
  try {
    return decodeURIComponent(cut);
  } catch (e) {
    return '';
  }
}
