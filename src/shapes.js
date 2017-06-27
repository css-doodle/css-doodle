import { minmax } from './utils';

const { cos, sin, sqrt, pow, PI } = Math;
const DEG = PI / 180;

function polygon(option, fn) {
  if (typeof arguments[0] == 'function') {
    fn = option;
    option = {};
  }

  if (!fn) {
    fn = t => [ cos(t), sin(t) ];
  }

  var split = option.split || 120;
  var scale = option.scale || 1;
  var start = DEG * (option.start || 0);
  var deg = option.deg ? (option.deg * DEG) : (PI / (split / 2));
  var points = [];

  for (var i = 0; i < split; ++i) {
    var t = start + deg * i;
    var [x, y] = fn(t);
    points.push(
      ((x * 50 * scale) + 50 + '% ') +
      ((y * 50 * scale) + 50 + '%')
    );
  }

  return `polygon(${ points.join(',') })`;
}

function rotate(x, y, deg) {
  var rad = DEG * deg;
  return [
    x * cos(rad) - y * sin(rad),
    y * cos(rad) + x * sin(rad)
  ];
}

export function circle() {
  return 'circle(49%)';
}

export function triangle() {
  return polygon({ split: 3, start: -90 }, t => [
    cos(t) * 1.1,
    sin(t) * 1.1 + .2
  ]);
}

export function rhombus() {
  return polygon({ split: 4 });
}

export function pentagon() {
  return polygon({ split: 5, start: 54 });
}

export function hexgon() {
  return polygon({ split: 6, start: 30 });
}
export function hexagon() {
  return polygon({ split: 6, start: 30 });
}

export function heptagon() {
  return polygon({ split: 7, start: -90});
}

export function octagon() {
  return polygon({ split: 8});
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
  return polygon({ split: 240 }, t => {
    var x = cos(k * t) * cos(t);
    var y = cos(k * t) * sin(t);
    if (k == 3) x -= .2;
    if (k == 2) {
      x /= 1.1;
      y /= 1.1;
    }
    return [x, y];
  });
}

export function hypocycloid(k = 3) {
  k = minmax(k, 3, 6);
  var m = 1 - k;
  return polygon({ scale: 1 / k  }, t => {
    var x = m * cos(t) + cos(m * (t - PI));
    var y = m * sin(t) + sin(m * (t - PI));
    if (k == 3) {
      x = x * 1.1 - .6;
      y = y * 1.1
    }
    return [x, y];
  });
}

export function astroid() {
  return hypocycloid(4);
}

export function infinity() {
  return polygon(t => {
    var a = .7 * sqrt(2) * cos(t);
    var b = (pow(sin(t), 2) + 1);
    return [
      a / b,
      a * sin(t) / b
    ]
  });
}

export function heart() {
  return polygon(t => {
    var x = .75 * pow(sin(t), 3);
    var y =
        cos(1 * t) * (13 / 18)
      - cos(2 * t) * (5 / 18)
      - cos(3 * t) / 18
      - cos(4 * t) / 18;
    return rotate(
      x * 1.2,
      (y + .2) * 1.1,
      180
    );
  });
}

export function bean() {
  return polygon(t => {
    var [a, b] = [pow(sin(t), 3), pow(cos(t), 3)];
    return rotate(
      (a + b) * cos(t) * 1.3 - .45,
      (a + b) * sin(t) * 1.3 - .45,
      -90
    );
  });
}

export function bicorn() {
  return polygon(t => rotate(
    cos(t),
    pow(sin(t), 2) / (2 + sin(t)) - .5,
    180
  ));
}

export function pear() {
  return polygon(t => [
    sin(t),
    (1 + sin(t)) * cos(t) / 1.4
  ]);
}

export function fish() {
  return polygon(t => [
    cos(t) - pow(sin(t), 2) / sqrt(2),
    sin(2 * t) / 2
  ]);
}

export function whale() {
  return polygon({ split: 240 }, t => {
    var r = 3.4 * (pow(sin(t), 2) - .5) * cos(t);
    return rotate(
      cos(t) * r + .75,
      sin(t) * r * 1.2,
      180
    );
  });
}

export function bud(n = 3) {
  n = minmax(n, 3, 10);
  return polygon({ split: 240 }, t => [
    ((1 + .2 * cos(n * t)) * cos(t)) * .8,
    ((1 + .2 * cos(n * t)) * sin(t)) * .8
  ]);
}
