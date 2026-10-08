export function memo(fn) {
    let cache = new Map(), size = 0;
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? args[0]
            : args.join('\0');
        let value = cache.get(key);
        if (value === undefined) {
            if (cache.size >= 4096 || size > 1 << 20) {
                cache.clear();
                size = 0;
            }
            value = fn(...args);
            cache.set(key, value);
            size += key.length;
        }
        return value;
    }
}
