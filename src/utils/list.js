import { isNil } from './type.js';

export function join(arr, splitter = '\n') {
    return (arr || []).join(splitter);
}

export function last(arr) {
    if (isNil(arr)) return;
    return arr[arr.length - 1];
}

export function removeEmptyValues(arr) {
    return arr.filter(v => v != null && String(v).trim().length > 0);
}
