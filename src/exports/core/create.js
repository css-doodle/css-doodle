export default function create(rules) {
  if (typeof document !== 'undefined') {
    let doodle = document.createElement('css-doodle');
    if (doodle.update) {
      doodle.update(rules);
    }
    return doodle;
  }
}
