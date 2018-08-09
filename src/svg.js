export function create_svg_url(svg, id) {
  if (id) {
    let blob = new Blob([svg], { type: 'image/svg+xml' });
    let url = URL.createObjectURL(blob);
    return `url(${ url }#${ id })`;
  }
  else {
    let encoded = encodeURIComponent(svg);
    return `url("data:image/svg+xml;utf8,${ encoded }")`;
  }
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
