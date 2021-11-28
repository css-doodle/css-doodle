import { un_entity } from './utils/index';
import Cache from './utils/cache';

let counter = 1;

function make_paint(code) {
  let result = Cache.get(code);
  if (result) {
    return Promise.resolve(result);
  }
  let name = 'css-doodle-paint-' + (counter++);
  let wrapped = generate(name, code);

  let blob = new Blob([wrapped], { type: 'text/javascript' });
  try {
    if (CSS.paintWorklet) {
      CSS.paintWorklet.addModule(URL.createObjectURL(blob));
    }
  } catch(e) {}

  return Promise.resolve(Cache.set(code, `paint(${name})`));
}

function generate(name, code) {
  code = un_entity(code);
  // make it so
  if (!code.includes('paint(')) {
    code = `
      paint(ctx, {width, height}, props) {
        ${code}
      }
    `
  }
  return `
    registerPaint('${name}', class {
      ${ code }
    })
  `;
}

export {
  make_paint
}
