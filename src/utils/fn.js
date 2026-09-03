export function addAlias(obj, names) {
    for (let [alias, name] of Object.entries(names)) {
        obj[alias] = obj[name];
    }
    return obj;
}

export function lazy(fn) {
    let wrap = (upstream) => {
        return (...args) => fn(...[upstream, ...args]);
    }
    wrap.lazy = true;
    return wrap;
}

export function debounce(fn, delay = 100) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function nextId(scope = '') {
    let id = 0;
    return (prefix = '') => `${prefix}${scope}-${++id}`;
}

export function uniqueId(prefix = '') {
    return prefix + Math.random().toString(32).slice(2);
}
