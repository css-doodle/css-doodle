import { isNil } from './type.js';

class CacheValue {
    constructor(limit = 16384) {
        this.cache = new Map();
        this.clearFns = [];
        this.limit = limit;
    }
    clear() {
        this.cache.clear();
        for (let fn of this.clearFns) fn();
    }
    onClear(fn) {
        this.clearFns.push(fn);
    }
    set(input, value) {
        if (isNil(input)) {
            return '';
        }
        let key = this.getKey(input);
        this.cache.set(key, value);
        if (this.cache.size > this.limit) {
            let n = this.limit >> 1;
            for (let stale of this.cache.keys()) {
                this.cache.delete(stale);
                if (--n === 0) break;
            }
        }
        return value;
    }
    has(input) {
        let key = this.getKey(input);
        return this.cache.has(key);
    }
    get(input) {
        let key = this.getKey(input);
        let value = this.cache.get(key);
        if (value !== undefined && this.cache.size >= (this.limit >> 1)) {
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    getKey(input) {
        if (isNil(input)) {
            return '';
        }
        return (typeof input === 'string')
            ? input
            : JSON.stringify(input);
    }
}

export const cache = new CacheValue();

export function memo(prefix, fn) {
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? prefix + args[0]
            : prefix + args.join('-');
        let value = cache.get(key);
        if (value === undefined) {
            value = cache.set(key, fn(...args));
        }
        return value;
    }
}
