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
