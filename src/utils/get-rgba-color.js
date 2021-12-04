export function transform(color) {
  let [r, g, b, a = 1] = color
    .replace(/rgba?\((.+)\)/, (_, v) => v)
    .split(/,\s*/)
  return {r, g, b, a};
}

export function get_rgba_color(root, value) {
  let element = root.querySelector('#defs');
  if (!element) {
    return { r: 0, g: 0, b: 0, a: 1 }
  }
  element.style.color = value;
  return transform(getComputedStyle(element).color);
}
