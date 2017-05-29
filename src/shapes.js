import { minmax, memo } from './utils';

const { cos, sin, PI } = Math;
const DEG = PI / 180;

function polygon(option, fn) {
  if (typeof arguments[0] == 'function') {
    fn = option;
    option = {};
  }

  if (!fn) {
    fn = theta => [ cos(theta), sin(theta) ];
  }

  var split = option.split || 120;
  var scale = option.scale || 1;
  var start = DEG * (option.start || 0);
  var deg = option.deg ? (option.deg * DEG) : (PI / (split / 2));
  var points = [];

  for (var i = 0; i < split; ++i) {
    var theta = start + deg * i;
    var [x, y] = fn(theta);
    points.push(
      ((x * 50 * scale) + 50 + '% ') +
      ((y * 50 * scale) + 50 + '%')
    );
  }

  return `polygon(${ points.join(',') })`;
}


export function circle() {
  return 'circle(49.5%)';
}

export function siogon(sides = 3) {
  return polygon({ split: minmax(sides, 3, 12) });
}

export function triangle() {
  return polygon({ split: 3, start: -90 });
}

export function rhombus() {
  return siogon(4);
}

export function pentagon() {
  return polygon({ split: 5, start: 54 });
}

export function hexgon() {
  return polygon({ split: 6, start: 30 });
}

export function star() {
  return polygon({ split: 5, start: 54, deg: 144 });
}

export function diamond() {
  return 'polygon(50% 5%, 80% 50%, 50% 95%, 20% 50%)';
}

export function cross() {
  return `polygon(
    5% 35%,  35% 35%, 35% 5%,  65% 5%,
    65% 35%, 95% 35%, 95% 65%, 65% 65%,
    65% 95%, 35% 95%, 35% 65%, 5% 65%
  )`;
}

export function clover(k = 3) {
  k = minmax(k, 3, 5);
  if (k == 4) k = 2;
  return polygon({ split: 240 }, theta => [
    cos(k * theta) * cos(theta),
    cos(k * theta) * sin(theta)
  ]);
}

export function hypocycloid(k = 3) {
  k = minmax(k, 3, 6);
  var m = 1 - k;
  return polygon({ scale: 1 / k  }, theta => [
    m * cos(theta) + cos(m * (theta - PI)),
    m * sin(theta) + sin(m * (theta - PI))
  ]);
}

export function astroid() {
  return hypocycloid(4);
}
