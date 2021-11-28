import { un_entity } from './utils/index';

let counter = 1;
let cache = {};

function make_paint(code, random) {
  if (cache[code]) {
    return Promise.resolve(cache[code]);
  }

  let name = 'css-doodle-paint-' + counter++;
  let wrapped = `
    registerPaint('${name}', class {
      ${ un_entity(code) }
    })
  `;
  let blob = new Blob([wrapped], { type: 'text/javascript' });
  try {
    if (CSS.paintWorklet) {
      CSS.paintWorklet.addModule(URL.createObjectURL(blob));
    }
  } catch(e) {}

  return Promise.resolve(cache[code] = `paint(${name})`);
}

export {
  make_paint
}
