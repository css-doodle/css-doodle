const reg_size = /[,，\/\s]+\s*/;

export default {

  ['size'](value) {
    var [w, h = w] = value.split(reg_size);
    return `width: ${ w }; height: ${ h };`;
  },

  ['min-size'](value) {
    var [w, h = w] = value.split(reg_size);
    return `min-width: ${ w }; min-height: ${ h };`;
  },

  ['max-size'](value) {
    var [w, h = w] = value.split(reg_size);
    return `max-width: ${ w }; max-height: ${ h };`;
  },

  ['place-absolute'](value) {
    if (value !== 'center') return value;
    return `
      position: absolute;
      top: 0; bottom: 0;
      left: 0; right: 0;
      margin: auto !important;
    `;
  }
}
