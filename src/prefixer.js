import get_props from './utils/get-props';

function build_mapping(prefix) {
  let reg = new RegExp(`\\-?${ prefix }\\-?`);
  return get_props(reg)
    .map(n => n.replace(reg, ''))
    .reduce((obj, n) => { return obj[n] = n, obj }, {});
}

const props_webkit_mapping = build_mapping('webkit');
const props_moz_mapping = build_mapping('moz');

export default function(prop, rule) {
  if (props_webkit_mapping[prop]) {
    return `-webkit-${ rule } ${ rule }`;
  }
  else if (props_moz_mapping[prop]) {
    return `-moz-${ rule } ${ rule }`;
  }
  return rule;
}
