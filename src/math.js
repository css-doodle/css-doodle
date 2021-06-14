import calc from './calc';
import { get_value } from './utils/index';

// Expose all Math functions and constants.
const methods = Object.getOwnPropertyNames(Math);

export default methods.reduce((expose, n) => {
  expose[n] = () => (...args) => {
    args = args.map(get_value);
    if (typeof Math[n] === 'number') return Math[n];
    return Math[n].apply(null, args.map(calc));
  }
  return expose;
}, {});
