import { get_props } from './utils';

function build_mapping(items) {
  return items.reduce((obj, n) => {
    return obj[n] = n, obj;
  }, {});
}

const props_mapping = build_mapping(
  get_props('webkit').map(n => n.replace('webkit-', ''))
);

export default function(prop, rule) {
  return props_mapping[prop]
    ? `-webkit-${ rule } ${ rule }` : rule;
}
