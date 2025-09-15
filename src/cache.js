import { hash, is_nil } from './utils/index.js';

class CacheValue {
  constructor() {
    this.cache = new Map();
  }
  clear() {
    this.cache.clear();
  }
  set(input, value) {
    if (is_nil(input)) {
      return '';
    }
    let key = this.getKey(input);
    this.cache.set(key, value);
    return value;
  }
  has(input) {
    let key = this.getKey(input);
    return this.cache.has(key);
  }
  get(input) {
    let key = this.getKey(input);
    return this.cache.get(key);
  }
  getKey(input) {
    if (is_nil(input)) {
      return '';
    }
    return (typeof input === 'string')
      ? hash(input)
      : hash(JSON.stringify(input));
  }
}

export const cache = new CacheValue();

export function memo(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');
    return cache.get(key) || cache.set(key, fn(...args));
  }
}
