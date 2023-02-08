function clamp(num, min, max) {
  num = Number(num) || 0;
  return Math.max(min, Math.min(max, num));
}

function maybe(cond, value) {
  if (!cond) return '';
  return (typeof value === 'function') ? value() : value;
}

function range(start, stop, step) {
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
    if (count++ >= 65535) break;
  }
  if (!range.length) range.push(old);
  return range;
}

function add_alias(obj, names) {
  for (let [alias, name] of Object.entries(names)) {
    obj[alias] = obj[name];
  }
  return obj;
}

function is_letter(c) {
  return /^[a-zA-Z]$/.test(c);
}

function is_nil(s) {
  return s === undefined || s === null;
}

function is_invalid_number(v) {
  return is_nil(v) || Number.isNaN(v);
}

function is_empty(value) {
  return is_nil(value) || value === '';
}

function lazy(fn) {
  let wrap = (upstream) => {
    return (...args) => fn(...[upstream, ...args]);
  }
  wrap.lazy = true;
  return wrap;
}

function sequence(count, fn) {
  let [x, y = 1] = String(count).split(/[x-]/);
  x = clamp(Math.ceil(x) || 1, 1, 65536);
  y = clamp(Math.ceil(y) || 1, 1, 65536);
  let max = x * y;
  let ret = [];
  let index = 1;

  if (/x/.test(count)) {
    for (let i = 1; i <= y; ++i) {
      for (let j = 1; j <= x; ++j) {
        ret.push(fn(index++, j, i, max, x, y, index));
      }
    }
  }

  else if (/-/.test(count)) {
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
  }

  else {
    for (let i = 1; i <= x; ++i) {
      ret.push(fn(i, i, 1, x, x, 1, index++));
    }
  }

  return ret;
}

function cell_id(x, y, z) {
  return 'c-' + x + '-' + y + '-' + z;
}

function get_value(input) {
  let v = input;
  while (v && !is_nil(v.value)) v = v.value;
  return is_nil(v) ? '' : v;
}

function normalize_png_name(name) {
  let prefix = is_nil(name)
    ? Date.now()
    : String(name).replace(/\/.png$/g, '');
  return prefix + '.png';
}

function cache_image(src, fn, delay = 0) {
  let img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  img.onload = function() {
    setTimeout(fn, delay);
  }
}

function is_safari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function un_entity(code) {
  let textarea = document.createElement('textarea');
  textarea.innerHTML = code;
  return textarea.value;
}

function entity(code) {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* cyrb53 */
function hash(str, seed = 0) {
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

function make_tag_function(fn) {
  let get_value = v => is_nil(v) ? '' : v;
  return (input, ...vars) => {
    let string = make_array(input).reduce((s, c, i) => s + c + get_value(vars[i]), '');
    return fn(string);
  };
}

function next_id() {
  let id = 0;
  return (prefix = '') => `${prefix}-${++id}`;
}

function lerp(t, a, b) {
  return a + t * (b - a);
}

function unique_id(prefix = '') {
  return prefix + Math.random().toString(32).substr(2);
}

function make_array(arr) {
  if (is_nil(arr)) return [];
  return Array.isArray(arr) ? arr : [arr];
}

export {
  clamp,
  maybe,
  range,
  add_alias,
  is_letter,
  is_nil,
  is_invalid_number,
  is_empty,
  lazy,
  sequence,
  cell_id,
  get_value,
  normalize_png_name,
  cache_image,
  is_safari,
  un_entity,
  entity,
  hash,
  make_tag_function,
  next_id,
  lerp,
  unique_id,
}
