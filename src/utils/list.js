export function make_array(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

export function join(arr, spliter = '\n') {
  return (arr || []).join(spliter);
}

export function last(arr) {
  return arr[arr.length - 1];
}

export function first(arr) {
  return arr[0];
}

export function shuffle(arr) {
  let ret = Array.from ? Array.from(arr) : arr.slice();
  let m = arr.length;
  while (m) {
    let i = ~~(Math.random() * m--);
    let t = ret[m];
    ret[m] = ret[i];
    ret[i] = t;
  }
  return ret;
}

export function flat_map(arr, fn) {
  if (Array.prototype.flatMap) return arr.flatMap(fn);
  return arr.reduce((acc, x) => acc.concat(fn(x)), []);
}
