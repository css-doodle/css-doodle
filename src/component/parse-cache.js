import parse_css from '../parser/parse-css.js';

const parse_cache = new Map();

export function parse_css_cached(code, extra) {
  if (code.includes('@use')) {
    return parse_css(code, extra);
  }
  let parsed = parse_cache.get(code);
  if (!parsed) {
    if (parse_cache.size >= 64) {
      parse_cache.clear();
    }
    parsed = parse_css(code, extra);
    parse_cache.set(code, parsed);
  }
  return parsed;
}
