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

export function svg_to_png(svg, width, height) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
    img.src = source;
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');

      let scale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        try {
          resolve({
            source,
            url: URL.createObjectURL(blob)
          });
        } catch (e) {
          reject(e);
        }
      });
    }
  });
}
