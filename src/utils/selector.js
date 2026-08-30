export function isHostSelector(s) {
  return typeof s === 'string' && (s.startsWith(':host') || s.startsWith(':doodle'));
}

export function isParentSelector(s) {
  return typeof s === 'string' && s.startsWith(':container');
}

export function isSpecialSelector(s) {
  return isHostSelector(s) || isParentSelector(s);
}

export function isPseudoSelector(s) {
  return /\:before|\:after/.test(s);
}
