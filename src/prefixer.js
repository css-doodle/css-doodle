const props_mapping = build_mapping(get_props());

export default function(prop, rule) {
  return props_mapping[prop]
    ? `-webkit-${ rule } ${ rule }` : rule;
}

function build_mapping(items) {
  return items.reduce((obj, n) => {
    return obj[n] = n, obj;
  }, {});
}

function get_props() {
  return Object.keys(document.head.style)
    .filter(n => n.startsWith('webkit'))
    .map(n => n.replace(/[A-Z]/g, "-$&")
      .toLowerCase()
      .replace('webkit-', ''));
}
