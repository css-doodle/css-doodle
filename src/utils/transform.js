import parse_compound_value from '../parser/parse-compound-value.js';

export function by_unit(fn) {
  return (...args) => {
    let units = [], values = [];
    for (let arg of args) {
      let { unit, value } = parse_compound_value(arg);
      if (unit !== undefined) {
        units.push(unit);
      }
      if (value !== undefined) {
        values.push(value);
      }
    }
    let result = fn(...values);
    let unit = units.find(n => n !== undefined);
    if (unit === undefined) {
      return result;
    }
    if (Array.isArray(result)) {
      return result.map(n => n + unit);
    }
    return result + unit;
  }
}

export function by_charcode(fn) {
  return (...args) => {
    let codes = args.map(n => String(n).charCodeAt(0));
    let result = fn(...codes);
    return Array.isArray(result)
      ? result.map(n => String.fromCharCode(n))
      : String.fromCharCode(result);
  }
}
