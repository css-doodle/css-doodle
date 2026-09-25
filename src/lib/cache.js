export function memo(fn) {
    let cache = new Map();
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? args[0]
            : args.join('\0');
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
