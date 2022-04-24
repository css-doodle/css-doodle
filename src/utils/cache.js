import { is_nil } from './index.js';

class CacheValue {
  constructor() {
    this.cache = new WeakMap();
  }
  clear() {
    this.cache = new WeakMap();
  }
  set(key, value) {
    if (is_nil(key)) {
      return '';
    }
    this.cache.set(key, value);
    return value;
  }
  get(key) {
    return this.cache.get(key);
  }
}

export default new CacheValue();
