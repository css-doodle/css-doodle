const caches = new Map();

export function memo(prefix, fn) {
    let cache = caches.get(prefix);
    if (!cache) {
        caches.set(prefix, cache = new Map());
    }
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? args[0]
            : args.join(',');
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
