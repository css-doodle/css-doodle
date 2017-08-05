export default
Object.getOwnPropertyNames(Math).reduce((expose, n) => {
  expose[n] = function() {
    return function(...args) {
      if (typeof Math[n] === 'number') return Math[n];
      return Math[n].apply(null, args.map(eval));
    }
  }
  return expose;
}, {});
