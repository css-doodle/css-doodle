export function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function cacheImage(src) {
    let img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
}
