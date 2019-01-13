export default function by_unit(fn) {
  return (...args) => {
    let unit = get_unit(args);
    return restore(fn, unit).apply(null, args);
  }
}

function restore(fn, unit) {
  return (...args) => {
    args = args.map(str => Number(
      String(str).replace(/\D+$/g, '')
    ));
    let result = fn.apply(null, args);
    if (!unit.length) {
      return result;
    }
    if (Array.isArray(result)) {
      return result.map(n => n + unit);
    }
    return result + unit;
  }
}

function get_unit(values) {
  let unit = '';
  values.some(str => {
    let input = String(str).trim();
    if (!input) return '';
    let matched = input.match(/\d(\D+)$/);
    return (unit = matched ? matched[1] : '');
  });
  return unit;
}
