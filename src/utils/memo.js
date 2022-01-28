import Cache from './cache.js';

export default function(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');;
    return Cache.get(key) || Cache.set(key, fn.apply(null, args));
  }
}
