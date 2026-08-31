import { isNil } from './type.js';

export function makeArray(arr) {
    if (isNil(arr)) return [];
    return Array.isArray(arr) ? arr : [arr];
}

export function join(arr, splitter = '\n') {
    return (arr || []).join(splitter);
}

export function last(arr, n = 1) {
    if (isNil(arr)) return '';
    return arr[arr.length - n];
}

export function first(arr) {
    return arr[0];
}

export function removeEmptyValues(arr) {
    return arr.filter(v => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'number') return true;
        if (typeof v === 'string') return v.trim().length > 0;
        return String(v).trim().length > 0;
    });
}

export function unique(arr) {
    return arr.filter(function(v, i, self) {
        return self.indexOf(v) === i;
    });
}
