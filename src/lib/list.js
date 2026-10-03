import { isNil } from './type.js';

export function join(arr, splitter = '\n') {
    return (arr || []).join(splitter);
}

export function last(arr) {
    if (isNil(arr)) return;
    return arr[arr.length - 1];
}

// Fisher-Yates over a copy, drawing from the given random source
export function shuffle(arr, random) {
    let ret = [...arr];
    let m = arr.length;
    while (m) {
        let i = ~~(random() * m--);
        let t = ret[m];
        ret[m] = ret[i];
        ret[i] = t;
    }
    return ret;
}

export function removeEmptyValues(arr) {
    return arr.filter(v => {
        if (isNil(v)) return false;
        if (typeof v ===  'number') return true;
        return String(v).trim().length > 0;
    });
}
