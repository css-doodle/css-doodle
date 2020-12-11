export function get_all_variables(element) {
  if (element.computedStyleMap) {
    return read_style_map(element);
  }
  return read_computed_stle(element);
}

export function get_all_variables_inline(element) {
  let variables = get_all_variables(element);
  let ret = [];
  for (let prop in variables) {
    ret.push(prop + ':' + variables[prop]);
  }
  return ret.join(';');
}

export function get_variable(element, name) {
  return getComputedStyle(element).getPropertyValue(name)
    .trim()
    .replace(/^\(|\)$/g, '');

}

function read_style_map(element) {
  let ret = {};
  for (const [prop, value] of element.computedStyleMap()) {
    if (prop.startsWith('--')) {
      ret[prop] = value[0][0];
    }
  }
  return ret;
}

function read_computed_stle(element) {
  let ret = {};
  let styles = getComputedStyle(element);
  for (let i = 0; i < styles.length; ++i) {
    let prop = styles[i];
    if (prop.startsWith('--')) {
      ret[prop] = styles.getPropertyValue(prop);
    }
  }
  return ret;
}
