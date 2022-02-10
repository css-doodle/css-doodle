const NS = 'http://www.w3.org/2000/svg';
const NSXLink = 'http://www.w3.org/1999/xlink';

function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

function normalize_svg(input) {
  const xmlns = `xmlns="${ NS }"`;
  const xmlnsXLink = `xmlns:xlink="${ NSXLink }"`;
  if (!input.includes('<svg')) {
    input = `<svg ${ xmlns } ${ xmlnsXLink }>${ input }</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${ xmlns } ${ xmlnsXLink }$1`);
  }
  return input;
}

export {
  create_svg_url,
  normalize_svg,
}
