export function is_host_selector(s) {
  return typeof s === 'string' && (s.startsWith(':host') || s.startsWith(':doodle'));
}

export function is_parent_selector(s) {
  return typeof s === 'string' && s.startsWith(':container');
}

export function is_special_selector(s) {
  return is_host_selector(s) || is_parent_selector(s);
}

export function is_pseudo_selector(s) {
  return /\:before|\:after/.test(s);
}
