/* Read computed values (CSS variables, resolved colors) off live elements. */

export function getVariable(element, name) {
  if (typeof getComputedStyle === 'undefined') {
    return '';
  }
  return getComputedStyle(element).getPropertyValue(name)
    .trim()
    .replace(/^\(|\)$/g, '');
}

export function getAllVariables(element) {
  if (typeof getComputedStyle === 'undefined') {
    return '';
  }
  let ret = {};
  if (element.computedStyleMap) {
    for (let [prop, value] of element.computedStyleMap()) {
      if (prop.startsWith('--')) {
        ret[prop] = value[0][0];
      }
    }
  } else {
    let styles = getComputedStyle(element);
    for (let prop of styles) {
      if (prop.startsWith('--')) {
        ret[prop] = styles.getPropertyValue(prop);
      }
    }
  }
  return inline(ret);
}

export function getRgbaColor(root, value) {
  if (typeof CSS !== 'undefined' && !CSS.supports('color', value)) {
    return null;
  }
  let element = root.querySelector('style');
  if (!element) {
    return { r: 0, g: 0, b: 0, a: 1 }
  }
  element.style.color = value;
  return splitRgba(getComputedStyle(element).color);
}

function splitRgba(color) {
  let [r, g, b, a = 1] = color
    .replace(/rgba?\((.+)\)/, (_, v) => v)
    .split(/,\s*/)
  return {r, g, b, a};
}

function inline(map) {
  let result = [];
  for (let [prop, value] of Object.entries(map)) {
    result.push(prop + ':' + value);
  }
  return result.join(';');
}
