import { CSSDoodle, define } from '../../component.js';

function create(code = '') {
  define('css-doodle', CSSDoodle);
  const el = document.createElement('css-doodle');
  if (typeof code === 'string') {
    if (code.length) {
      el.textContent = code;
    }
  }
  return el;
}

export {
  CSSDoodle, define, create
}
