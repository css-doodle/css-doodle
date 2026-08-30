export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function cacheImage(src, fn, delay = 0) {
  let img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  if (fn) {
    img.onload = function() {
      setTimeout(fn, delay);
    }
  }
}
