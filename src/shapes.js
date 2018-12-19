import { clamp } from './utils/index';

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

  let split = option.split || 120;
  let scale = option.scale || 1;
  let start = DEG * (option.start || 0);
  let deg = option.deg ? (option.deg * DEG) : (PI / (split / 2));
  let points = [];

  for (let i = 0; i < split; ++i) {
    let t = start + deg * i;
    let [x, y] = fn(t);
    points.push(
      ((x * 50 * scale) + 50 + '% ') +
      ((y * 50 * scale) + 50 + '%')
    );
  }

  return option.type
    ? `polygon(${ option.type }, ${ points.join(',') })`
    : `polygon(${ points.join(',') })`;
}

function rotate(x, y, deg) {
  let rad = DEG * deg;
  return [
    x * cos(rad) - y * sin(rad),
    y * cos(rad) + x * sin(rad)
  ];
}

const shapes =  {

  circle() {
    return 'circle(49%)';
  },

  triangle() {
    return polygon({ split: 3, start: -90 }, t => [
      cos(t) * 1.1,
      sin(t) * 1.1 + .2
    ]);
  },

  rhombus() {
    return polygon({ split: 4 });
  },

  pentagon() {
    return polygon({ split: 5, start: 54 });
  },

  hexgon() {
    return polygon({ split: 6, start: 30 });
  },

  hexagon() {
    return polygon({ split: 6, start: 30 });
  },

  heptagon() {
    return polygon({ split: 7, start: -90 });
  },

  octagon() {
    return polygon({ split: 8, start: 22.5 });
  },

  star() {
    return polygon({ split: 5, start: 54, deg: 144 });
  },

  diamond() {
    return 'polygon(50% 5%, 80% 50%, 50% 95%, 20% 50%)';
  },

  cross() {
    return `polygon(
      5% 35%,  35% 35%, 35% 5%,  65% 5%,
      65% 35%, 95% 35%, 95% 65%, 65% 65%,
      65% 95%, 35% 95%, 35% 65%, 5% 65%
    )`;
  },

  clover(k = 3) {
    k = clamp(k, 3, 5);
    if (k == 4) k = 2;
    return polygon({ split: 240 }, t => {
      let x = cos(k * t) * cos(t);
      let y = cos(k * t) * sin(t);
      if (k == 3) x -= .2;
      if (k == 2) {
        x /= 1.1;
        y /= 1.1;
      }
      return [x, y];
    });
  },

  hypocycloid(k = 3) {
    k = clamp(k, 3, 6);
    let m = 1 - k;
    return polygon({ scale: 1 / k  }, t => {
      let x = m * cos(t) + cos(m * (t - PI));
      let y = m * sin(t) + sin(m * (t - PI));
      if (k == 3) {
        x = x * 1.1 - .6;
        y = y * 1.1
      }
      return [x, y];
    });
  },

  astroid() {
    return shapes.hypocycloid(4);
  },

  infinity() {
    return polygon(t => {
      let a = .7 * sqrt(2) * cos(t);
      let b = (pow(sin(t), 2) + 1);
      return [
        a / b,
        a * sin(t) / b
      ]
    });
  },

  heart() {
    return polygon(t => {
      let x = .75 * pow(sin(t), 3);
      let y =
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
  },

  bean() {
    return polygon(t => {
      let [a, b] = [pow(sin(t), 3), pow(cos(t), 3)];
      return rotate(
        (a + b) * cos(t) * 1.3 - .45,
        (a + b) * sin(t) * 1.3 - .45,
        -90
      );
    });
  },

  bicorn() {
    return polygon(t => rotate(
      cos(t),
      pow(sin(t), 2) / (2 + sin(t)) - .5,
      180
    ));
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

  alien(...args) {
    let [a = 1, b = 1, c = 1, d = 1, e = 1]
      = args.map(n => clamp(n, 1, 9));
    return polygon({ split: 480, type: 'evenodd' }, t => [
      (cos(t * a) + cos(t * c) + cos(t * e)) * .31,
      (sin(t * b) + sin(t * d) + sin(t)) * .31
    ]);
  }

}

export default shapes;
