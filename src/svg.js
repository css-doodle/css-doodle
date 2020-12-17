import { cache_image, is_safari } from './utils/index';

export function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function normalize_svg(input) {
  const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
  if (!input.includes('<svg')) {
    input = `<svg ${ xmlns }>${ input }</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${ xmlns }$1`);
  }
  return input;
}

export function svg_to_png(svg, width, height, scale) {
  return new Promise((resolve, reject) => {
    let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;

    function action() {
      let img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = source;

      img.onload = () => {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        let dpr = window.devicePixelRatio || 1;
        /* scale with devicePixelRatio only when the scale equals 1 */
        if (scale != 1) {
          dpr = 1;
        }

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
          try {
            resolve({
              blob,
              source,
              url: URL.createObjectURL(blob)
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    }

    if (is_safari) {
      cache_image(source, action, 200);
    } else {
      action();
    }
  });
}
