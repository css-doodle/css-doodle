import { utime, UTime, umousex, umousey, uwidth, uheight } from '../core/uniforms.js';

export function bind_uniforms(host, { time, mousex, mousey, mouse, width, height }) {
  if (time) {
    reg_utime(host);
  }
  if (mousex || mousey || mouse) {
    reg_umouse(host, mousex, mousey, mouse);
  } else {
    off_umouse(host);
  }
  if (width || height) {
    reg_usize(host, width, height);
  } else {
    off_usize(host);
  }
}

function reg_utime(host) {
  if (!host.is_utime_set) {
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
    host.is_utime_set = true;
  }
}

function reg_umouse(host, mousex, mousey, mouse) {
  if (!host.umouse_fn) {
    host.umouse_fn = e => {
      let data = e.detail || e;
      if (mouse) {
        host._umouse = { x: data.offsetX, y: data.offsetY };
      }
      if (mousex || mousey) {
        host.style.setProperty('--' + umousex.name, data.offsetX);
        host.style.setProperty('--' + umousey.name, data.offsetY);
      }
    }
    host.addEventListener('pointermove', host.umouse_fn);
    let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0 }});
    host.dispatchEvent(event);
  } else if (!(mousex || mousey || mouse)) {
    off_umouse(host);
  }
}

function off_umouse(host) {
  if (host.umouse_fn) {
    host.style.removeProperty('--' + umousex.name);
    host.style.removeProperty('--' + umousey.name);
    host.removeEventListener('pointermove', host.umouse_fn);
    host.umouse_fn = null;
    delete host._umouse;
  }
}

function reg_usize(host, width, height) {
  if (!host.usize_observer) {
    host.usize_observer = new ResizeObserver(() => {
      let box = host.getBoundingClientRect();
      if (width || height) {
        host.style.setProperty('--' + uwidth.name, box.width);
        host.style.setProperty('--' + uheight.name, box.height);
      }
    });
    host.usize_observer.observe(host);
  } else if (!(width || height)) {
    off_usize(host);
  }
}

function off_usize(host) {
  if (host.usize_observer) {
    host.style.removeProperty('--' + uwidth.name);
    host.style.removeProperty('--' + uheight.name);
    host.usize_observer.unobserve(host);
    host.usize_observer = null;
  }
}
