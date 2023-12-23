export const NS = `xmlns="http://www.w3.org/2000/svg"`;
export const NSXHtml = `xmlns="http://www.w3.org/1999/xhtml"`;
export const NSXLink = `xmlns:xlink="http://www.w3.org/1999/xlink"`;

export function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function normalize_svg(input) {
  if (!input.includes('<svg')) {
    input = `<svg ${NS} ${NSXLink}>${input}</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${NS} ${NSXLink}$1`);
  }
  return input;
}
