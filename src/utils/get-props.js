let all = [];

export default function get_props(arg) {
  if (!all.length) {
    let props = new Set();
    for (let n in document.head.style) {
      if (!n.startsWith('-')) {
        props.add(n.replace(/[A-Z]/g, '-$&').toLowerCase());
      }
    }
    if (!props.has('grid-gap')) {
      props.add('grid-gap');
    }
    all = Array.from(props);
  }
  return (arg && arg.test)
    ? all.filter(n => arg.test(n))
    : all;
}
