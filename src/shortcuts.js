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
  }

}

