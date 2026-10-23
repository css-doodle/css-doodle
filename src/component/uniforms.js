import { U, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bindUniforms(host, { mousex, mousey, mouse, width, height }) {
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

export function syncUTime(host) {
    if (!host.compiled?.uniforms.time) return;
    for (let animation of host.getAnimations?.() ?? []) {
        if (animation.animationName === U) {
            animation.effect.updateTiming({ delay: 0 });
            animation.currentTime = Date.now() - new Date().setHours(0, 0, 0, 0);
        }
    }
}

export function unbindUniforms(host) {
    offUmouse(host);
    offUsize(host);
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
