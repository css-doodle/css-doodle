import { is_nil } from './index.js';

export function make_array(arr) {
  if (is_nil(arr)) return [];
  return Array.isArray(arr) ? arr : [arr];
}

export function join(arr, spliter = '\n') {
  return (arr || []).join(spliter);
}

export function last(arr, n = 1) {
  if (is_nil(arr)) return '';
  return arr[arr.length - n];
}

export function first(arr) {
  return arr[0];
}

export function remove_empty_values(arr) {
  return arr.filter(v => (
    !is_nil(v) && String(v).trim().length
  ));
}
