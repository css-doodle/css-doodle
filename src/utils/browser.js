import { is_nil } from './type.js';

export function is_safari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function cache_image(src, fn, delay = 0) {
  let img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  img.onload = function() {
    setTimeout(fn, delay);
  }
}

export function un_entity(code) {
  let textarea = document.createElement('textarea');
  textarea.innerHTML = code;
  return textarea.value;
}

export function get_png_name(name) {
  let prefix = is_nil(name)
    ? Date.now()
    : String(name).replace(/\/.png$/g, '');
  return prefix + '.png';
}
