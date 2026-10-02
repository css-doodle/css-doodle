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

export function unbindUniforms(host) {
    offUmouse(host);
    offUsize(host);
}

// registered per document, not per host
let isUtimeSet = false;

function regUtime() {
    if (!isUtimeSet) {
        for (let name of [utime, UTime]) {
            try {
                CSS.registerProperty({ name, syntax: '<integer>', initialValue: 0, inherits: true });
            } catch (e) {}
        }
        isUtimeSet = true;
    }
}

function regUmouse(host, mousex, mousey, mouse) {
    host.umouseFlags = { mousex, mousey, mouse };
    let init = !host.umouseFn;
    if (init) {
        host.umouseFn = e => {
            let { mousex, mousey, mouse } = host.umouseFlags;
            if (mouse) {
                host._umouse = { x: e.offsetX, y: e.offsetY };
            }
            if (mousex || mousey) {
                host.style.setProperty(umousex, e.offsetX);
                host.style.setProperty(umousey, e.offsetY);
            }
        }
        host.addEventListener('pointermove', host.umouseFn);
    }
    if (init || (mouse && !host._umouse)) {
        host.umouseFn({ offsetX: 0, offsetY: 0 });
    }
}

function offUmouse(host) {
    if (host.umouseFn) {
        host.style.removeProperty(umousex);
        host.style.removeProperty(umousey);
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
            host.style.setProperty(uwidth, box.width);
            host.style.setProperty(uheight, box.height);
        });
        host.usizeObserver.observe(host);
    }
}

function offUsize(host) {
    if (host.usizeObserver) {
        host.style.removeProperty(uwidth);
        host.style.removeProperty(uheight);
        host.usizeObserver.unobserve(host);
        host.usizeObserver = null;
    }
}
