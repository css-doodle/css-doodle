import calc from './utils/calc';

// Expose all Math functions and constants.
const methods = Object.getOwnPropertyNames(Math);

export default methods.reduce((expose, n) => {
  expose[n] = () => (...args) => {
    if (typeof Math[n] === 'number') return Math[n];
    return Math[n].apply(null, args.map(calc));
  }
  return expose;
}, {});
