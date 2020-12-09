export function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function normalize_svg(input) {
  const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
  if (!input.includes('<svg')) {
    input = `<svg ${ xmlns }>${ input }</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${ xmlns }$1`);
  }
  return input;
}
