const NS = `xmlns="http://www.w3.org/2000/svg"`;
const NSXHtml = `xmlns="http://www.w3.org/1999/xhtml"`;
const NSXLink = `xmlns:xlink="http://www.w3.org/1999/xlink"`;

function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

function normalize_svg(input) {
  if (!input.includes('<svg')) {
    input = `<svg ${NS} ${NSXLink}>${input}</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${NS} ${NSXLink}$1`);
  }
  return input;
}

export {
  create_svg_url,
  normalize_svg,
  NS,
  NSXLink,
  NSXHtml
}
