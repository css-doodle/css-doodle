import { isNil } from './type.js';

export function makeArray(arr) {
    if (isNil(arr)) return [];
    return Array.isArray(arr) ? arr : [arr];
}

export function join(arr, splitter = '\n') {
    return (arr || []).join(splitter);
}

export function last(arr) {
    if (isNil(arr)) return;
    return arr[arr.length - 1];
}

export function removeEmptyValues(arr) {
    return arr.filter(v => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'number') return true;
        if (typeof v === 'string') return v.trim().length > 0;
        return String(v).trim().length > 0;
    });
}
