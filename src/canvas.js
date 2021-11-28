import { un_entity } from './utils/index';
import Cache from './utils/cache';

function draw_canvas(code, width, height, random) {
  let result = Cache.get(code);
  if (result) {
    return Promise.resolve(result);
  }

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let ratio = window.devicePixelRatio || 1;

  canvas.style.width = canvas.width +'px';
  canvas.style.height = canvas.height +'px';
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  ctx.scale(ratio, ratio);

  try {
    let fn = new Function(`return (ctx, width, height, random) => {${un_entity(code)}}`)();
    fn(ctx, width, height, random);
  } catch(e) {
    // ignore
  }
  return Promise.resolve(Cache.set(code, canvas.toDataURL()));
}

export {
  draw_canvas
}
