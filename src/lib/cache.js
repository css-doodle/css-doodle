let caches = [];

export function clearMemos() {
    caches.forEach(clear => clear());
}

export function memo(fn) {
    let cache = new Map(), size = 0;
    let clear = () => {
        cache.clear();
        size = 0;
    };
    caches.push(clear);
    return (...args) => {
        let key = (args.length === 1 && typeof args[0] === 'string')
            ? args[0]
            : args.join('\0');
        let value = cache.get(key);
        if (value === undefined) {
            // string results count too: a polygon can be 100k characters
            if (cache.size >= 4096 || size > 1 << 22) {
                clear();
            }
            value = fn(...args);
            cache.set(key, value);
            size += key.length + (typeof value === 'string' ? value.length : 0);
        }
        return value;
    }
}
