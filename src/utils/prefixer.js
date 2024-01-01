let all_props = [];

function get_props(arg) {
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

function build_mapping(prefix) {
  let reg = new RegExp(`\\-?${ prefix }\\-?`);
  return get_props(reg)
    .map(n => n.replace(reg, ''))
    .reduce((obj, n) => { return obj[n] = n, obj }, {});
}

const props_webkit_mapping = build_mapping('webkit');
const props_moz_mapping = build_mapping('moz');

export default function prefixer(prop, rule) {
  if (props_webkit_mapping[prop]) {
    return `-webkit-${ rule } ${ rule }`;
  }
  else if (props_moz_mapping[prop]) {
    return `-moz-${ rule } ${ rule }`;
  }
  return rule;
}
