import { clamp, is_empty, make_tag_function } from './utils/index';
import parse_shape_commands from './parser/parse-shape-commands';
import parse_value_group from './parser/parse-value-group';
import parse_direction from './parser/parse-direction';
import parse_compound_value from './parser/parse-compound-value';
import calc from './calc';

const { cos, sin, abs, atan2, PI } = Math;

const _ = make_tag_function(c => {
  return create_shape_points(
    parse_shape_commands(c), {min: 3, max: 3600}
  );
});

const shapes = {
  circle: () => _`
    split: 180;
    scale: .99
  `,

  triangle: () => _`
    rotate: 30;
    scale: 1.1;
    move: 0 .2
  `,

  pentagon: () => _`
    split: 5;
    rotate: 54
  `,

  hexagon: () => _`
    split: 6;
    rotate: 30;
    scale: .98
  `,

  octagon: () => _`
    split: 8;
    rotat: 22.5;
    scale: .99
  `,

  star: () => _`
    split: 10;
    r: cos(5t);
    rotate: -18;
    scale: .99
  `,

  infinity: () => _`
    split: 180;
    scale: .99;
    x: cos(t)*.99 / (sin(t)^2 + 1);
    y: x * sin(t)
  `,

  heart: () => _`
    split: 180;
    rotate: 180;
    a: cos(t)*13/18 - cos(2t)*5/18;
    b: cos(3t)/18 + cos(4t)/18;
    x: (.75 * sin(t)^3) * 1.2;
    y: (a - b + .2) * -1.1
  `,

  bean: () => _`
    split: 180;
    r: sin(t)^3 + cos(t)^3;
    move: -.35 .35;
  `,

  bicorn: () => _`
    split: 180;
    x: cos(t);
    y: sin(t)^2 / (2 + sin(t)) - .5
  `,

  drop: () => _`
    split: 180;
    rotate: 90;
    scale: .95;
    x: sin(t);
    y: (1 + sin(t)) * cos(t) / 1.6
  `,

  fish: () => _`
    split: 240;
    x: cos(t) - sin(t)^2 / sqrt(2) - .04;
    y: sin(2t)/2
  `,

  whale: () => _`
    split: 240;
    rotate: 180;
    R: 3.4 * (sin(t)^2 - .5) * cos(t);
    x: cos(t) * R + .75;
    y: sin(t) * R * 1.2
  `,

  windmill:  () => _`
    split: 18;
    R: seq(.618, 1, 0);
    T: seq(t-.55, t, t);
    x: R * cos(T);
    y: R * sin(T)
  `,

  vase: () => _`
    split: 240;
    scale: .3;
    x: sin(4t) + sin(t) * 1.4;
    y: cos(t) + cos(t) * 4.8 + .3
  `,

  clover: (k = 3) => {
    k = clamp(k, 3, 5);
    if (k == 4) k = 2;
    return _`
      split: 240;
      r: cos(${k}t);
      scale: .98
    `;
  },

  hypocycloid: (k = 3) => {
    k = clamp(k, 3, 5);
    let scale = [0, 0, 0, .34, .25, .19][k];
    return _`
      split: 240;
      scale: ${scale};
      k: ${k};
      x: (k-1)*cos(t) + cos((k-1)*t);
      y: (k-1)*sin(t) - sin((k-1)*t)
    `;
  },

  bud: (k = 3) => {
    k = clamp(k, 3, 10);
    return _`
      split: 240;
      scale: .8;
      r: 1 + .2 * cos(${k}t)
    `;
  },
};

class Point {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.extra = angle;
  }
  valueOf() {
    return this.x + ' ' + this.y;
  }
  toString() {
    return this.valueOf();
  }
}

function create_polygon_points(option, fn) {
  if (typeof arguments[0] == 'function') {
    fn = option;
    option = {};
  }

  if (!fn) {
    fn = t => [ cos(t), sin(t) ];
  }

  let split = option.split || 180;
  let turn = option.turn || 1;
  let frame = option.frame;
  let fill = option['fill'] || option['fill-rule'];
  let direction = parse_direction(option['direction'] || option['dir'] || '');
  let unit = option.unit;

  let rad = (PI * 2) * turn / split;
  let points = [];
  let first_point, first_point2;

  let factor = (option.scale === undefined) ? 1 : option.scale;
  let add = ([x1, y1, dx = 0, dy = 0]) => {
    let [x, y] = scale(x1, -y1, factor);
    let [dx1, dy2] = scale(dx, -dy, factor);
    let angle = calc_angle(x, y, dx1, dy2, direction);
    if (unit !== undefined && unit !== '%') {
      if (unit !== 'none') {
        x += unit;
        y += unit;
      }
    } else {
      x = (x + 1) * 50 + '%';
      y = (y + 1) * 50 + '%';
    }
    points.push(new Point(x, y, angle));
  }

  if (fill == 'nonzero' || fill == 'evenodd') {
    add([fill, '', 0]);
  }

  for (let i = 0; i < split; ++i) {
    let t = rad * i;
    let point = fn(t, i);
    if (!i) first_point = point;
    add(point);
  }

  if (frame !== undefined) {
    add(first_point);
    let w = frame / 100;
    if (turn > 1) w *= 2;
    if (w == 0) w = .002;
    for (let i = 0; i < split; ++i) {
      let t = -rad * i;
      let [x, y, dx = 0, dy = 0] = fn(t, i);
      let theta = atan2(y + dy, x - dx);
      let point = [
        x - w * cos(theta),
        y - w * sin(theta)
      ];
      if (!i) first_point2 = point;
      add(point);
    }
    add(first_point2);
    add(first_point);
  }

  return points;
}

function calc_angle(x, y, dx, dy, option) {
  let base = atan2(y + dy, x - dx) * 180 / PI;
  if (option.direction === 'reverse') {
    base -= 180;
  }
  if (!option.direction) {
    base = 90;
  }
  if (option.angle) {
    base += option.angle;
  }
  return base;
}

function rotate(x, y, deg) {
  let rad = -PI / 180 * deg;
  return [
    x * cos(rad) - y * sin(rad),
    y * cos(rad) + x * sin(rad)
  ];
}

function translate(x, y, offset) {
  let [dx, dy = dx] = parse_value_group(offset).map(Number);
  return [
    x + (dx || 0),
    y - (dy || 0),
    dx,
    dy
  ];
}

function scale(x, y, factor) {
  let [fx, fy = fx] = parse_value_group(factor).map(Number);
  return [
    x * fx,
    y * fy
  ];
}

function create_shape_points(props, {min, max}) {
  let split = clamp(parseInt(props.vertices || props.points || props.split) || 0, min, max);
  let px = is_empty(props.x) ? 'cos(t)' : props.x;
  let py = is_empty(props.y) ? 'sin(t)' : props.y;
  let pr = is_empty(props.r) ? ''       : props.r;
  let { unit, value } = parse_compound_value(pr);
  if (unit) {
    if (is_empty(props.unit)) {
      props.unit = unit;
    }
    pr = props.r = value;
  }

  if (props.degree) {
    props.rotate = props.degree;
  }

  if (props.origin) {
    props.move = props.origin;
  }

  let option = Object.assign({}, props, { split });

  return create_polygon_points(option, (t, i) => {
    let context = Object.assign({}, props, {
      't': t,
      'θ': t,
      'seq': (...list) => {
        if (!list.length) return '';
        return list[i % list.length];
      },
      'range': (a, b = 0) => {
        a = Number(a) || 0;
        b = Number(b) || 0;
        if (a > b) [a, b] = [b, a];
        let step = abs(b - a) / (split - 1);
        return a + step * i;
      }
    });
    let x = calc(px, context);
    let y = calc(py, context);
    let dx = 0;
    let dy = 0;
    if (pr) {
      let r = calc(pr, context);
      x = r * cos(t);
      y = r * sin(t);
    }
    if (props.rotate) {
      [x, y] = rotate(x, y, Number(props.rotate) || 0);
    }
    if (props.move) {
      [x, y, dx, dy] = translate(x, y, props.move);
    }
    return [x, y, dx, dy];
  });
}

export {
  create_polygon_points,
  create_shape_points,
  shapes
}
