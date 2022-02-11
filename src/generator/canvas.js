import { un_entity, next_id } from '../utils/index.js';
import Cache from '../utils/cache.js';

const nextId = next_id();

function draw_canvas(code) {
  let result = Cache.get(code);
  if (result) {
    return Promise.resolve(result);
  }
  let name = nextId('css-doodle-paint');
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
  draw_canvas,
}
