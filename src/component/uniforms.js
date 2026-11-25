import { u, U, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bindUniforms(host, uniforms) {
    let { mousex, mousey, width, height } = uniforms;
    if (host._uframe !== host.frame) {
        unbindUniforms(host);
        host._uframe = host.frame;
    }
    if (mousex || mousey) {
        regUmouse(host);
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
    let frames = host._hosts?.length ? host._hosts : [host];
    for (let animation of frames.flatMap(el => el.getAnimations?.() ?? [])) {
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

function regUmouse(host) {
    if (host._umouse_fn) return;
    host._umouse_fn = e => {
        let box = host._cells && e.currentTarget?.getBoundingClientRect();
        host.vars.setProperty(umousex, box ? e.clientX - box.left : e.offsetX);
        host.vars.setProperty(umousey, box ? e.clientY - box.top : e.offsetY);
    }
    host._uframe.addEventListener('pointermove', host._umouse_fn);
    host._umouse_fn({ offsetX: 0, offsetY: 0 });
}

function offUmouse(host) {
    if (host._umouse_fn) {
        host.vars.removeProperty(umousex);
        host.vars.removeProperty(umousey);
        host._uframe.removeEventListener('pointermove', host._umouse_fn);
        host._umouse_fn = null;
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
