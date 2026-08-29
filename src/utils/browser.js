export function is_safari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function cache_image(src, fn, delay = 0) {
  let img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  if (fn) {
    img.onload = function() {
      setTimeout(fn, delay);
    }
  }
}
