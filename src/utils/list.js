import { is_nil } from './type.js';

export function make_array(arr) {
  if (is_nil(arr)) return [];
  return Array.isArray(arr) ? arr : [arr];
}

export function join(arr, splitter = '\n') {
  return (arr || []).join(splitter);
}

export function last(arr, n = 1) {
  if (is_nil(arr)) return '';
  return arr[arr.length - n];
}

export function first(arr) {
  return arr[0];
}

export function remove_empty_values(arr) {
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
