const props_mapping = build_mapping(get_props());

export default function(prop, rule) {
  if (props_mapping[prop]) {
    return `-webkit-${ rule } ${ rule }`;
  }
  return rule;
}

function build_mapping(items) {
  return items.reduce((obj, n) => { return obj[n] = n, obj }, {});
}

function get_props() {
  const props = Object.keys(document.head.style)
    .filter(n => n.startsWith('webkit'))
    .map(n => n.replace(/[A-Z]/g, "-$&")
      .toLowerCase()
      .replace('webkit-', ''));

  // for safari
  props.push('clip-path');
  return props;
}
