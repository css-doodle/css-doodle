import { u, U, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bindUniforms(host, { mousex, mousey, mouse, width, height }) {
    if (host._uframe !== host.frame) {
        unbindUniforms(host);
        host._uframe = host.frame;
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

export function syncUTime(host) {
    if (!host.compiled?.uniforms.time) return;
    for (let animation of host.getAnimations?.() ?? []) {
        if (animation.animationName === U) {
            animation.effect.updateTiming({ delay: 0 });
            animation.currentTime = Date.now() - new Date().setHours(0, 0, 0, 0);
        } else if (animation.animationName === u) {
            animation.currentTime = host.clockNow();
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
            let box = host._cells && e.currentTarget?.getBoundingClientRect();
            let x = box ? e.clientX - box.left : e.offsetX, y = box ? e.clientY - box.top : e.offsetY;
            if (mouse) {
                host._umouse = { x, y };
            }
            if (mousex || mousey) {
                host.vars.setProperty(umousex, x);
                host.vars.setProperty(umousey, y);
            }
        }
        host._uframe.addEventListener('pointermove', host._umouse_fn);
    }
    if (init || (mouse && !host._umouse)) {
        host._umouse_fn({ offsetX: 0, offsetY: 0 });
    }
}

function offUmouse(host) {
    if (host._umouse_fn) {
        host.vars.removeProperty(umousex);
        host.vars.removeProperty(umousey);
        host._uframe.removeEventListener('pointermove', host._umouse_fn);
        host._umouse_fn = null;
        host._umouse_flags = null;
        delete host._umouse;
    }
}

function regUsize(host) {
    if (!host._usize_observer) {
        host._usize_observer = new ResizeObserver(() => {
            let box = host._uframe.getBoundingClientRect();
            host.vars.setProperty(uwidth, box.width);
            host.vars.setProperty(uheight, box.height);
        });
        host._usize_observer.observe(host._uframe);
    }
}

function offUsize(host) {
    if (host._usize_observer) {
        host.vars.removeProperty(uwidth);
        host.vars.removeProperty(uheight);
        host._usize_observer.disconnect();
        host._usize_observer = null;
    }
}
