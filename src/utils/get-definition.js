const initial = {
  length: '0px',
  number: 0,
  color: 'black',
  url: 'url()',
  image: 'url()',
  integer: 0,
  angle: '0deg',
  time: '0ms',
  resolution: '0dpi',
  percentage: '0%',
  'length-percentage': '0%',
  'transform-function': 'translate(0)',
  'transform-list': 'translate(0)',
  'custom-ident': '_'
};

export default function get_definition(name) {
  let type = String(name).substr(2);
  if (initial[type] !== undefined) {
    return {
      name: name,
      syntax: `<${type}> | <${type}>+ | <${type}>#`,
      initialValue: initial[type],
      inherits: false
    }
  }
}
