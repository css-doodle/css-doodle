import { un_entity } from './utils/index';

function draw_canvas(code, width, height, random) {
  code = un_entity(code);

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let ratio = window.devicePixelRatio || 1;

  canvas.style.width = canvas.width +'px';
  canvas.style.height = canvas.height +'px';
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  ctx.scale(ratio, ratio);

  try {
    let fn = new Function(`return (ctx, width, height, random) => {${code}}`)();
    fn(ctx, width, height, random);
  } catch(e) {
    // ignore
  }
  return Promise.resolve(canvas.toDataURL());
}

export {
  draw_canvas
}
