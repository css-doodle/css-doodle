/* Memoizes values that repeat across cells and renders. All memoized
 * functions share one map — hence the key prefix — so that wrappers
 * created per cell (e.g. @shape) still hit the same entries. */

const cache = new Map();

export function memo(prefix, fn) {
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? prefix + args[0]
            : prefix + args.join(',');
        let value = cache.get(key);
        if (value === undefined) {
            if (cache.size >= 4096) {
                cache.clear();
            }
            value = fn(...args);
            cache.set(key, value);
        }
        return value;
    }
}
