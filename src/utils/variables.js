export function get_all_variables(element) {
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

export function get_variable(element, name) {
  return getComputedStyle(element).getPropertyValue(name)
    .trim()
    .replace(/^\(|\)$/g, '');

}

function inline(map) {
  let result = [];
  for (let prop in map) {
    result.push(prop + ':' + map[prop]);
  }
  return result.join(';');
}

