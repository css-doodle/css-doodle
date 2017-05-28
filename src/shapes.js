import { minmax, memo } from './utils';
const DEG = Math.PI / 180;

const polygon = memo(function polygon(sides, start = 0, radius) {
  radius = radius || (Math.PI / (sides / 2));
  var points = [];
  for (var i = 0; i < sides; ++i) {
    var theta = start + 3 * i;
    points.push(`
      ${ Math.cos(theta) * 50 + 50 }%  ${ Math.sin(theta) * 50 + 50}%
    `);
  }
  return `polygon(${ points.join(',') })`;
});

export function circle() {
  return 'circle(50%)';
}

export function siogon(sides) {
  return polygon(minmax(sides, 3, 24));
}

export function triangle() {
  return polygon(3, DEG * -90);
}

export function rhombus() {
  return siogon(4);
}

export function pentagon() {
  return polygon(5, DEG * 54);
}

export function hexgon() {
  return polygon(6, DEG * 30);
}

export function star() {
  return polygon(5, DEG * 54, DEG * 144);
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

export const hypocycloid = memo('hypocycloid', function(k = 3) {
  k = minmax(k, 3, 6);
  var split = 120;
  var deg = Math.PI / (split / 2);
  var R = 50;
  var r = R / k;
  var points = [];
  for (var i = 0; i < split; ++i) {
    var theta = deg * i;
    var x = r * (1 - k) * Math.cos(theta) + r * Math.cos((1 - k) * theta);
    var y = r * (1 - k) * Math.sin(theta) + r * Math.sin((1 - k) * theta);
    points.push((x + 50 + '% ') +  (y + 50+ '%'));
  }
  return `polygon(${ points.join(',') })`;
});
