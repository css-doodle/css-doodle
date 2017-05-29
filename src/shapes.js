import { minmax, memo } from './utils';

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
  return polygon({ split: 240 }, t => [
    cos(k * t) * cos(t),
    cos(k * t) * sin(t)
  ]);
}

export function hypocycloid(k = 3) {
  k = minmax(k, 3, 6);
  var m = 1 - k;
  return polygon({ scale: 1 / k  }, t => [
    m * cos(t) + cos(m * (t - PI)),
    m * sin(t) + sin(m * (t - PI))
  ]);
}

export function astroid() {
  return hypocycloid(4);
}

export function tie() {
  return polygon(t => [
    cos(t), sin(t * 2) / 2
  ]);
}

export function eternity() {
  return polygon(t => {
    var a = .7 * sqrt(2) * cos(t);
    var b = (pow(sin(t), 2) + 1);
    return [
      a / b, a * sin(t) / b
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
    return [
      (-x - y * sin(PI)),
      (-y + x * sin(PI)) - .2
    ];
  });
}
