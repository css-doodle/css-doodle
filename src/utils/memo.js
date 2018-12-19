const store = {};

export default function(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');
    if (store[key]) return store[key];
    return (store[key] = fn.apply(null, args));
  }
}
