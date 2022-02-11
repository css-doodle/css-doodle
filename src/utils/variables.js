function get_all_variables(element) {
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

function get_variable(element, name) {
  if (typeof getComputedStyle === 'undefined') {
    return '';
  }
  return getComputedStyle(element).getPropertyValue(name)
    .trim()
    .replace(/^\(|\)$/g, '');
}

function inline(map) {
  let result = [];
  for (let [prop, value] of Object.entries(map)) {
    result.push(prop + ':' + value);
  }
  return result.join(';');
}

export {
  get_all_variables,
  get_variable,
}
