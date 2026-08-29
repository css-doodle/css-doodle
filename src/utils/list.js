import { is_nil, is_invalid_number } from './type.js';
import { clamp } from './math.js';

export function sequence(count, fn) {
  let [x, y = 1] = String(count).split(/[x-]/);
  let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
  if (is_invalid_number(cx)) cx = 1;
  if (is_invalid_number(cy)) cy = 1;
  x = clamp(cx, 0, 65536);
  y = clamp(cy, 0, 65536);
  let max = x * y;
  let ret = [];
  let index = 1;
  if (/x/.test(count)) {
    for (let i = 1; i <= y; ++i) {
      for (let j = 1; j <= x; ++j) {
        ret.push(fn(index, j, i, max, x, y, index));
        index++;
      }
    }
  } else if (/-/.test(count)) {
    max = Math.abs(x - y) + 1;
    if (x <= y) {
      for (let i = x; i <= y; ++i) {
        ret.push(fn(i, i, 1, max, max, 1, index++));
      }
    } else {
      for (let i = x; i >= y; --i) {
        ret.push(fn(i, i, 1, max, max, 1, index++));
      }
    }
  } else {
    for (let i = 1; i <= x; ++i) {
      ret.push(fn(i, i, 1, x, x, 1, index++));
    }
  }
  return ret;
}

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
