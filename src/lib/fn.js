export function addAlias(obj, names) {
    for (let [alias, name] of Object.entries(names)) {
        obj[alias] = obj[name];
    }
    return obj;
}

export function lazy(fn) {
    let wrap = (cell, env, position) => (...args) => fn(cell, env, position, ...args);
    wrap.lazy = true;
    return wrap;
}

export function nextId(scope = '') {
    let id = 0;
    return (prefix = '') => `${prefix}${scope}-${++id}`;
}
