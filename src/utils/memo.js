import { getCache, setCache } from './cache';

export default function(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');;
    return getCache(key) || setCache(key, fn.apply(null, args));
  }
}
