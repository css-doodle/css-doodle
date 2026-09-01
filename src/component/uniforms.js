import { utime, UTime, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bindUniforms(host, { time, mousex, mousey, mouse, width, height }) {
    if (time) {
        regUtime();
    }
    if (mousex || mousey || mouse) {
        regUmouse(host, mousex, mousey, mouse);
    } else {
        offUmouse(host);
    }
    if (width || height) {
        regUsize(host);
    } else {
        offUsize(host);
    }
}

// registered per document, not per host
let isUtimeSet = false;

function regUtime() {
    if (!isUtimeSet) {
        try {
            CSS.registerProperty({
                name: '--' + utime.name,
                syntax: '<integer>',
                initialValue: 0,
                inherits: true
            });
            CSS.registerProperty({
                name: '--' + UTime.name,
                syntax: '<integer>',
                initialValue: 0,
                inherits: true
            });
        } catch (e) {}
        isUtimeSet = true;
    }
}

function regUmouse(host, mousex, mousey, mouse) {
    // the handler reads the flags from the host so that
    // an update with different uniforms takes effect
    host.umouseFlags = { mousex, mousey, mouse };
    let init = !host.umouseFn;
    if (init) {
        host.umouseFn = e => {
            let data = e.detail || e;
            let { mousex, mousey, mouse } = host.umouseFlags;
            if (mouse) {
                host._umouse = { x: data.offsetX, y: data.offsetY };
            }
            if (mousex || mousey) {
                host.style.setProperty('--' + umousex.name, data.offsetX);
                host.style.setProperty('--' + umousey.name, data.offsetY);
            }
        }
        host.addEventListener('pointermove', host.umouseFn);
    }
    if (init || (mouse && !host._umouse)) {
        let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0 }});
        host.dispatchEvent(event);
    }
}

function offUmouse(host) {
    if (host.umouseFn) {
        host.style.removeProperty('--' + umousex.name);
        host.style.removeProperty('--' + umousey.name);
        host.removeEventListener('pointermove', host.umouseFn);
        host.umouseFn = null;
        host.umouseFlags = null;
        delete host._umouse;
    }
}

function regUsize(host) {
    if (!host.usizeObserver) {
        host.usizeObserver = new ResizeObserver(() => {
            let box = host.getBoundingClientRect();
            host.style.setProperty('--' + uwidth.name, box.width);
            host.style.setProperty('--' + uheight.name, box.height);
        });
        host.usizeObserver.observe(host);
    }
}

function offUsize(host) {
    if (host.usizeObserver) {
        host.style.removeProperty('--' + uwidth.name);
        host.style.removeProperty('--' + uheight.name);
        host.usizeObserver.unobserve(host);
        host.usizeObserver = null;
    }
}
