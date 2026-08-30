import { utime, UTime, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bindUniforms(host, { time, mousex, mousey, mouse, width, height }) {
  if (time) {
    regUtime(host);
  }
  if (mousex || mousey || mouse) {
    regUmouse(host, mousex, mousey, mouse);
  } else {
    offUmouse(host);
  }
  if (width || height) {
    regUsize(host, width, height);
  } else {
    offUsize(host);
  }
}

function regUtime(host) {
  if (!host.isUtimeSet) {
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
    host.isUtimeSet = true;
  }
}

function regUmouse(host, mousex, mousey, mouse) {
  if (!host.umouseFn) {
    host.umouseFn = e => {
      let data = e.detail || e;
      if (mouse) {
        host._umouse = { x: data.offsetX, y: data.offsetY };
      }
      if (mousex || mousey) {
        host.style.setProperty('--' + umousex.name, data.offsetX);
        host.style.setProperty('--' + umousey.name, data.offsetY);
      }
    }
    host.addEventListener('pointermove', host.umouseFn);
    let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0 }});
    host.dispatchEvent(event);
  } else if (!(mousex || mousey || mouse)) {
    offUmouse(host);
  }
}

function offUmouse(host) {
  if (host.umouseFn) {
    host.style.removeProperty('--' + umousex.name);
    host.style.removeProperty('--' + umousey.name);
    host.removeEventListener('pointermove', host.umouseFn);
    host.umouseFn = null;
    delete host._umouse;
  }
}

function regUsize(host, width, height) {
  if (!host.usizeObserver) {
    host.usizeObserver = new ResizeObserver(() => {
      let box = host.getBoundingClientRect();
      if (width || height) {
        host.style.setProperty('--' + uwidth.name, box.width);
        host.style.setProperty('--' + uheight.name, box.height);
      }
    });
    host.usizeObserver.observe(host);
  } else if (!(width || height)) {
    offUsize(host);
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
