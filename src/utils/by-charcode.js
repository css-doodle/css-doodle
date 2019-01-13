export default function by_charcode(fn) {
  return (...args) => {
    let codes = args.map(n => String(n).charCodeAt(0));
    let result = fn.apply(null, codes);
    return Array.isArray(result)
      ? result.map(n => String.fromCharCode(n))
      : String.fromCharCode(result);
  }
}
