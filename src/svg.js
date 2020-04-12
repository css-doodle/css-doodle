const isFirefox = typeof InstallTrigger !== 'undefined';
const svgFilterContainerId = "svgFilterContainer";

export function create_svg_url(svg) {
  let encoded = encodeURIComponent(svg);
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function create_svg_filter_url(svg, id) {
  if(isFirefox) {
    return `url('data:image/svg+xml;utf8,${ svg }#${ id }')`;
  } else {
    const container = document.querySelector(`#${ svgFilterContainerId }`) || create_svg_filter_container();
    container.insertAdjacentHTML('beforeend', svg);
    return `url('#${ id }')`;
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

export function cleanup_svg_filters() {
  const container = document.querySelector(`#${ svgFilterContainerId }`);
  while (container && container.firstChild) {
    container.firstChild.remove();
  }
}

function create_svg_filter_container() {
  const container = document.createElement("div");
  container.id = svgFilterContainerId;
  container.setAttribute("style", "display: none;");
  document.body.insertAdjacentElement('beforeend', container);
  return container;
}