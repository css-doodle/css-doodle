import parse_value_group from './parser/parse-value-group';
import parse_size  from './parser/parse-size';

export default {

  ['@size'](value) {
    var [w, h = w] = parse_value_group(value);
    return `width: ${ w }; height: ${ h };`;
  },

  ['@min-size'](value) {
    var [w, h = w] = parse_value_group(value);
    return `min-width: ${ w }; min-height: ${ h };`;
  },

  ['@max-size'](value) {
    var [w, h = w] = parse_value_group(value);
    return `max-width: ${ w }; max-height: ${ h };`;
  },

  ['@place-absolute'](value) {
    var parsed = parse_value_group(value);
    if (parsed[0] !== 'center') return value;
    return `
      position: absolute;
      top: 0; bottom: 0;
      left: 0; right: 0;
      margin: auto !important;
    `;
  },

  ['@grid'](value) {
    return parse_size(value);
  }

}
