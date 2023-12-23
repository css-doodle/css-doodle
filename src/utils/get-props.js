let all_props = [];

export default function get_props(arg) {
  if (!all_props.length) {
    let props = new Set();
    if (typeof document !== 'undefined') {
      for (let n in document.head.style) {
        if (!n.startsWith('-')) {
          props.add(n.replace(/[A-Z]/g, '-$&').toLowerCase());
        }
      }
    }
    if (!props.has('grid-gap')) {
      props.add('grid-gap');
    }
    all_props = Array.from(props);
  }
  return (arg instanceof RegExp)
    ? all_props.filter(n => arg.test(n))
    : all_props;
}
