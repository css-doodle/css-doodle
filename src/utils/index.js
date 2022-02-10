export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function maybe(cond, value) {
  if (!cond) return '';
  return (typeof value === 'function') ? value() : value;
}

export function range(start, stop, step) {
  let count = 0, old = start;
  let initial = n => (n > 0 && n < 1) ? .1 : 1;
  let length = arguments.length;
  if (length == 1) [start, stop] = [initial(start), start];
  if (length < 3) step = initial(start);
  let range = [];
  while ((step >= 0 && start <= stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
    if (count++ >= 1000) break;
  }
  if (!range.length) range.push(old);
  return range;
}

export function alias_for(obj, names) {
  Object.keys(names).forEach(n => {
    obj[n] = obj[names[n]];
  });
  return obj;
}

export function is_letter(c) {
  return /^[a-zA-Z]$/.test(c);
}

export function is_nil(s) {
  return s === undefined || s === null;
}

export function is_invalid_number(v) {
  return is_nil(v) || Number.isNaN(v);
}

export function is_empty(value) {
  return is_nil(value) || value === '';
}

export function lazy(fn) {
  let wrap = () => fn;
  wrap.lazy = true;
  return wrap;
}

export function sequence(count, fn) {
  let [x, y = 1] = String(count).split('x');
  x = clamp(parseInt(x) || 1, 1, 65536);
  y = clamp(parseInt(y) || 1, 1, 65536);
  let max = x * y;
  let ret = [];
  let index = 1;
  for (let i = 1; i <= y; ++i) {
    for (let j = 1; j <= x; ++j) {
      ret.push(fn(index++, j, i, max, x, y));
    }
  }
  return ret;
}

export function cell_id(x, y, z) {
  return 'c-' + x + '-' + y + '-' + z;
}

export function get_value(input) {
  while (input && input.value) {
    return get_value(input.value);
  }
  return is_nil(input) ? '' : input;
}

export function normalize_png_name(name) {
  let prefix = is_nil(name)
    ? Date.now()
    : String(name).replace(/\/.png$/g, '');
  return prefix + '.png';
}

export function cache_image(src, fn, delay = 0) {
  let img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  img.onload = function() {
    setTimeout(fn, delay);
  }
}

export function is_safari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function un_entity(code) {
  let textarea = document.createElement('textarea');
  textarea.innerHTML = code;
  return textarea.value;
}

export function entity(code) {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* cyrb53 */
export function hash(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
  h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1>>>0);
}

export function make_tag_function(fn) {
  let get_value = v => is_nil(v) ? '' : v;
  return (input, ...vars) => {
    let string = input.reduce((s, c, i) => s + c + get_value(vars[i]), '');
    return fn(string);
  };
}

export function next_id() {
  let id = 0;
  return (prefix = '') => `${prefix}-${++id}`;
}
