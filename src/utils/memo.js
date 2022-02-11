import Cache from './cache.js';

function memo(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');;
    return Cache.get(key) || Cache.set(key, fn(...args));
  }
}

export {
  memo,
}
