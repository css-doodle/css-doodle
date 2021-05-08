import { clamp, is_nil } from './utils/index';
import calc from './utils/calc';
import parse_shape_commands from './parser/parse-shape-commands';

const { cos, sin, sqrt, atan2, pow, PI } = Math;
const DEG = PI / 180;

function polygon(option, fn) {
  if (typeof arguments[0] == 'function') {
    fn = option;
    option = {};
  }

  if (!fn) {
    fn = t => [ cos(t), sin(t) ];
  }

  let split = option.split || 120;
  let scale = option.scale || 1;
  let start = DEG * (option.start || 0);
  let deg = option.deg ? (option.deg * DEG) : (PI / (split / 2));

  let points = [];
  let add_point = ([x, y], scale) => {
    points.push(
      ((x * 50 * scale) + 50 + '% ') +
      ((y * 50 * scale) + 50 + '%')
    );
  }

  let first, first2;

  for (let i = 0; i < split; ++i) {
    let t = start - deg * i;
    let point = fn(t, i);
    if (!i) first = point;
    add_point(point, scale);
  }

  if (option.frame !== undefined) {
    add_point(first, scale);
    let w = (option.frame || 1) / 100;
    if (w <= 0) w = 2 / 1000;
    for (let i = 0; i < split; ++i) {
      let t = start + deg * i;
      let [x, y] = fn(t, i);
      let theta = atan2(y, x);
      let point = [
        x - w * cos(theta),
        y - w * sin(theta)
      ];
      if (!i) first2 = point;
      add_point(point, scale);
    }
    add_point(first2, scale);
    add_point(first, scale);
  }

  option.type = read_fillrule(option['fill-rule']);

  return option.type
    ? `polygon(${ option.type }, ${ points.join(',') })`
    : `polygon(${ points.join(',') })`;
}

function read_fillrule(value) {
  return (value === 'nonzero' || value == 'evenodd')
    ? value
    : '';
}

function rotate(x, y, deg) {
  let rad = DEG * deg;
  return [
    x * cos(rad) - y * sin(rad),
    y * cos(rad) + x * sin(rad)
  ];
}

function translate(x, y, offset) {
  let [dx, dy = dx] = String(offset).split(/[,\s]/).map(Number);
  return [
    x + (dx || 0),
    y + (dy || 0)
  ];
}

function commands(c) {
  return custom_shape(parse_shape_commands(c));
}

const shapes =  {

  circle() {
    return 'circle(49%)';
  },

  triangle() {
    return commands(`
      rotate: 30;
      scale: 1.1;
      origin: 0 .2
    `);
  },

  pentagon() {
    return polygon({ split: 5, start: 54 });
  },

  hexagon() {
    return polygon({ split: 6, start: 30 });
  },

  octagon() {
    return polygon({ split: 8, start: 22.5 });
  },

  star() {
    return commands(`
      split: 10;
      r: cos(5t);
      rotate: -18
    `);
  },

  clover(k = 3) {
     k = clamp(k, 3, 5);
    if (k == 4) k = 2;
    return commands(`
      split: 200;
      r: cos(${k}t);
      scale: .98
    `);
  },

  hypocycloid(k = 3) {
    k = clamp(k, 3, 5);
    let scale = [0, 0, 0, .34, .25, .19][k];
    return commands(`
      split: 200;
      scale: ${scale};
      k: ${k};
      x: (k-1)*cos(t) + cos((k-1)*t);
      y: (k-1)*sin(t) - sin((k-1)*t);
    `);
  },

  infinity() {
    return commands(`
      split: 180;
      x: cos(t)*.99 / (sin(t)^2 + 1);
      y: x * sin(t)
    `);
  },

  heart() {
    return commands(`
      split: 180;
      rotate: 180;
      a: cos(t)*13/18 - cos(2t)*5/18;
      b: cos(3t)/18 + cos(4t)/18;
      x: (.75 * sin(t)^3) * 1.2;
      y: (a - b + .2) * 1.1
    `);
  },

  bean() {
    return commands(`
      split: 180;
      a: sin(t)^3;
      b: cos(t)^3;
      x: (a + b) * cos(t) * 1.3 - .45;
      y: (a + b) * sin(t) * 1.3 - .45;
      rotate: -90
    `);
  },

  bicorn() {
    return polygon(t => rotate(
      cos(t),
      pow(sin(t), 2) / (2 + sin(t)) - .5,
      180
    ));
  },

  drop() {
    return commands(`
      split: 200;
      rotate: 90;
      scale: .95;
      x: sin(t);
      y: (1 + sin(t)) * cos(t) / 1.6
    `);
  },

  pear() {
    return polygon(t => [
      sin(t),
      (1 + sin(t)) * cos(t) / 1.4
    ]);
  },

  fish() {
    return polygon(t => [
      cos(t) - pow(sin(t), 2) / sqrt(2),
      sin(2 * t) / 2
    ]);
  },

  whale() {
    return polygon({ split: 240 }, t => {
      let r = 3.4 * (pow(sin(t), 2) - .5) * cos(t);
      return rotate(
        cos(t) * r + .75,
        sin(t) * r * 1.2,
        180
      );
    });
  },

  bud(n = 3) {
    n = clamp(n, 3, 10);
    return polygon({ split: 240 }, t => [
      ((1 + .2 * cos(n * t)) * cos(t)) * .8,
      ((1 + .2 * cos(n * t)) * sin(t)) * .8
    ]);
  },

  windmill() {
    return commands(`
      split: 18;
      R: seq(.618, 1, 0);
      T: seq(t+.55, t, t);
      x: R * cos(T);
      y: R * sin(T);
    `)
  },

  bottle() {
    return commands(`
      split: 200;
      scale: .3;
      rotate: 180;
      x: sin(4t) + sin(t) * 1.4;
      y: cos(t) + cos(t) * 4.8 + .3
    `);
  }
}

function is_empty(value) {
  return is_nil(value) || value === '';
}

function custom_shape(props) {
  let option = Object.assign({}, props, {
    split: clamp(parseInt(props.points || props.split) || 0, 3, 3600),
    start: 0
  });

  if (props.degree) {
    props.rotate = props.degree;
  }

  let px = is_empty(props.x) ? 'cos(t)' : props.x;
  let py = is_empty(props.y) ? 'sin(t)' : props.y;
  let pr = is_empty(props.r) ? ''       : props.r;

  return polygon(option, (t, i) => {
    let context = Object.assign({}, props, {
      't': t,
      'θ': t,
      'seq': (...list) => {
        if (!list.length) return '';
        return list[i % list.length];
      }
    });

    let x = calc(px, context);
    let y = calc(py, context);

    if (pr) {
      let r = calc(pr, context);
      x = r * Math.cos(t);
      y = r * Math.sin(t);
    }
    if (props.rotate) {
      [x, y] = rotate(x, y, Number(props.rotate) || 0);
    }
    if (props.origin) {
      [x, y] = translate(x, y, props.origin);
    }
    return [x, y];
  });
}

export {
  shapes,
  custom_shape
}
