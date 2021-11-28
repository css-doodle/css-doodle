import { hash, is_nil } from './index.js';

class CacheValue {
  constructor() {
    this.cache = {};
  }
  clear() {
    this.cache = {};
  }
  set(input, value) {
    if (is_nil(input)) {
      return '';
    }
    let key = this.getKey(input);
    return this.cache[key] = value;
  }
  get(input) {
    let key = this.getKey(input);
    return this.cache[key];
  }
  getKey(input) {
    return (typeof input === 'string')
      ? hash(input)
      : hash(JSON.stringify(input));
  }
}

export default new CacheValue();
