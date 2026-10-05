import { CSSDoodle, define } from '../../component/index.js';

function create(code = '') {
    define('css-doodle', CSSDoodle);
    const el = document.createElement('css-doodle');
    if (typeof code === 'string' && code) {
        el.textContent = code;
    }
    return el;
}

export {
    CSSDoodle, define, create
}
