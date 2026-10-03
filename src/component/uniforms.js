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
    host._umouse_flags = { mousex, mousey, mouse };
    let init = !host._umouse_fn;
    if (init) {
        host._umouse_fn = e => {
            let { mousex, mousey, mouse } = host._umouse_flags;
            if (mouse) {
                host._umouse = { x: e.offsetX, y: e.offsetY };
            }
            if (mousex || mousey) {
                host.style.setProperty(umousex, e.offsetX);
                host.style.setProperty(umousey, e.offsetY);
            }
        }
        host.addEventListener('pointermove', host._umouse_fn);
    }
    if (init || (mouse && !host._umouse)) {
        host._umouse_fn({ offsetX: 0, offsetY: 0 });
    }
}

function offUmouse(host) {
    if (host._umouse_fn) {
        host.style.removeProperty(umousex);
        host.style.removeProperty(umousey);
        host.removeEventListener('pointermove', host._umouse_fn);
        host._umouse_fn = null;
        host._umouse_flags = null;
        delete host._umouse;
    }
}

function regUsize(host) {
    if (!host._usize_observer) {
        host._usize_observer = new ResizeObserver(() => {
            let box = host.getBoundingClientRect();
            host.style.setProperty(uwidth, box.width);
            host.style.setProperty(uheight, box.height);
        });
        host._usize_observer.observe(host);
    }
}

function offUsize(host) {
    if (host._usize_observer) {
        host.style.removeProperty(uwidth);
        host.style.removeProperty(uheight);
        host._usize_observer.unobserve(host);
        host._usize_observer = null;
    }
}
