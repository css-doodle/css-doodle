import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';

import { clamp } from '../utils/math.js';
import { isEmpty } from '../utils/type.js';
import calc from '../core/calc.js';
import { cache } from '../utils/cache.js';
import { css } from '../utils/tagged-template.js';

const { cos, sin, abs, atan2, PI } = Math;

const presetShapes = {
  circle: css`
    split: 180;
    scale: .99
  `,

  triangle: css`
    rotate: 30;
    scale: 1.1;
    move: 0 .2
  `,

  pentagon: css`
    split: 5;
    rotate: 54
  `,

  hexagon: css`
    split: 6;
    rotate: 30;
    scale: .98
  `,

  octagon: css`
    split: 8;
    rotate: 22.5;
    scale: .99
  `,

  star: css`
    split: 10;
    r: cos(5t);
    rotate: -18;
    scale: .99
  `,

  infinity: css`
    split: 180;
    scale: .99;
    x: cos(t)*.99 / (sin(t)^2 + 1);
    y: x * sin(t)
  `,

  heart: css`
    split: 180;
    rotate: 180;
    a: cos(t)*13/18 - cos(2t)*5/18;
    b: cos(3t)/18 + cos(4t)/18;
    x: (.75 * sin(t)^3) * 1.2;
    y: (a - b + .2) * -1.1
  `,

  bean: css`
    split: 180;
    r: sin(t)^3 + cos(t)^3;
    move: -.35 .35;
  `,

  bicorn: css`
    split: 180;
    x: cos(t);
    y: sin(t)^2 / (2 + sin(t)) - .5
  `,

  drop: css`
    split: 180;
    rotate: 90;
    scale: .95;
    x: sin(t);
    y: (1 + sin(t)) * cos(t) / 1.6
  `,

  fish: css`
    split: 240;
    x: cos(t) - sin(t)^2 / sqrt(2) - .04;
    y: sin(2t)/2
  `,

  whale: css`
    split: 240;
    rotate: 180;
    R: 3.4 * (sin(t)^2 - .5) * cos(t);
    x: cos(t) * R + .75;
    y: sin(t) * R * 1.2
  `,

  windmill: css`
    split: 18;
    R: seq(.618, 1, 0);
    T: seq(t-.55, t, t);
    x: R * cos(T);
    y: R * sin(T)
  `,

  vase: css`
    split: 240;
    scale: .3;
    x: sin(4t) + sin(t) * 1.4;
    y: cos(t) + cos(t) * 4.8 + .3
  `,

  clover(k = 3) {
    k = clamp(k, 3, 5);
    if (k == 4) k = 2;
    return css`
      split: 240;
      r: cos(${k}t);
      scale: .98
    `;
  },

  hypocycloid(k = 3) {
    k = clamp(k, 3, 5);
    let scale = [.34, .25, .19][k - 3];
    return css`
      split: 240;
      scale: ${scale};
      k: ${k};
      x: (k-1)*cos(t) + cos((k-1)*t);
      y: (k-1)*sin(t) - sin((k-1)*t)
    `;
  },

  bud(k = 3) {
    k = clamp(k, 3, 10);
    return css`
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

function createPolygonPoints(option, fn) {
  let split = option.split || 180;
  let turn = option.turn || 1;
  let frame = option.frame;
  let fill = option['fill'] || option['fill-rule'];
  let direction = parseDirection(option['direction'] || option['dir'] || '');
  let unit = option.unit;

  let rad = (PI * 2) * turn / split;
  let points = [];
  let firstPoint, firstPoint2;

  let factor = (option.scale === undefined) ? 1 : option.scale;
  let [fx, fy] = parseScaleFactor(factor);
  // A bare angle like "dir: 30" is constant; auto/reverse need atan2 per point
  let staticAngle = direction.direction ? null : 90 + (direction.angle || 0);
  let add = ([x1, y1, dx = 0, dy = 0]) => {
    if (x1 == 'evenodd' || x1 == 'nonzero') {
      return points.push(new Point(x1, '', ''));
    }
    let x = x1 * fx;
    let y = -y1 * fy;
    let dx1 = dx * fx;
    let dy2 = -dy * fy;
    let angle = (staticAngle === null)
      ? calcAngle(x, y, dx1, dy2, direction)
      : staticAngle;
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
    add([fill, '', '']);
  }

  for (let i = 0; i < split; ++i) {
    let t = rad * i;
    let point = fn(t, i);
    if (!i) firstPoint = point;
    add(point);
  }

  if (frame !== undefined) {
    add(firstPoint);
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
      if (!i) firstPoint2 = point;
      add(point);
    }
    add(firstPoint2);
    add(firstPoint);
  }

  return points;
}

function calcAngle(x, y, dx, dy, option) {
  let base = atan2(y + dy, x - dx) * 180 / PI;
  if (option.direction === 'reverse') {
    base -= 180;
  }
  if (option.angle) {
    base += option.angle;
  }
  return base;
}

function parseScaleFactor(factor) {
  let parsed = parseValueGroup(factor);
  let fx = parseFloat(parsed[0]) || 1;
  let fy = parsed[1] !== undefined ? parseFloat(parsed[1]) || 1 : fx;
  return [fx, fy];
}

function parseMoveOffset(offset) {
  let parsed = parseValueGroup(offset);
  let dx = parseFloat(parsed[0]) || 0;
  let dy = parsed[1] !== undefined ? parseFloat(parsed[1]) || 0 : dx;
  return [dx, dy];
}

function createShapePoints(props, {min, max}) {
  let split = clamp(parseInt(props.vertices || props.points || props.split) || 0, min, max);
  let px = isEmpty(props.x) ? 'cos(t)' : props.x;
  let py = isEmpty(props.y) ? 'sin(t)' : props.y;
  let pr = isEmpty(props.r) ? ''       : props.r;
  let pt = isEmpty(props.t) ? ''       : props.t;

  let { unit, value } = parseCompoundValue(pr);
  if (unit && !props[unit] && unit !== 't') {
    if (isEmpty(props.unit)) {
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

  props.split = split;

  let rotateAngle = props.rotate ? Number(props.rotate) || 0 : 0;
  let cosR = 1, sinR = 0;
  if (rotateAngle) {
    let rad = -PI / 180 * rotateAngle;
    cosR = cos(rad);
    sinR = sin(rad);
  }
  let move = props.move ? parseMoveOffset(props.move) : null;
  let currentIndex = 0;
  let context = Object.assign({}, props, {
    't': 0,
    'θ': 0,
    'i': 0,
    seq(...list) {
      if (!list.length) return '';
      return list[currentIndex % list.length];
    },
    range(a, b = 0) {
      a = Number(a) || 0;
      b = Number(b) || 0;
      if (a > b) [a, b] = [b, a];
      let step = abs(b - a) / (split - 1);
      return a + step * currentIndex;
    }
  });

  return createPolygonPoints(props, (t, i) => {
    currentIndex = i;
    context['t'] = context['θ'] = pt || t;
    context['i'] = i + 1;

    let x = calc(px, context);
    let y = calc(py, context);
    let dx = 0;
    let dy = 0;
    if (pr) {
      let r = calc(pr, context);
      if (r == 0) {
        r = .00001;
      }
      if (pt) {
        t = calc(pt, context);
      }
      x = r * cos(t);
      y = r * sin(t);
    }
    if (rotateAngle) {
      let rx = x * cosR - y * sinR;
      y = y * cosR + x * sinR;
      x = rx;
    }
    if (move) {
      [dx, dy] = move;
      x += dx;
      y -= dy;
    }
    return [x, y, dx, dy];
  });
}

export default function generateShape(input, range = {}, modifier) {
  let min = range.min || 3;
  let max = range.max || 3600;
  // count/unit distinguish modifiers that close over caller state (@plot/@Plot)
  let key = input + '|' + min + '|' + max
    + (range.count ? '|' + range.count : '')
    + (range.unit ? '|u' : '')
    + (modifier ? '|m' : '');
  if (cache.has(key)) {
    return cache.get(key);
  }
  let commands = '';
  let [name, ...args] = parseValueGroup(input);
  let preset = false;
  switch (typeof presetShapes[name]) {
    case 'function':
      commands = presetShapes[name](...args);
      preset = true;
      break;
    case 'string':
      commands = presetShapes[name];
      preset = true;
      break;
    default: {
      commands = input;
    }
  }
  let rules = parseShapeCommands(commands);
  if (typeof modifier === 'function') {
    rules = modifier(rules);
  }
  let points = createShapePoints(rules, {min, max});
  return cache.set(key, {
    rules, points, preset
  });
}
