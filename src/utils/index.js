function clamp(num, min, max) {
  num = Number(num) || 0;
  return Math.max(min, Math.min(max, num));
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

export {
  clamp,
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
  next_id,
  lerp,
  unique_id,
}
