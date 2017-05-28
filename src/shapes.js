import { minmax } from './utils';
const DEG = Math.PI / 180;

export function circle() {
  return 'circle(50%)';
}

export function siogon(sides) {
  sides = minmax(sides, 3, 24);
  return `polygon(${ points(sides).join(',') })`;
}

export function triangle() {
  var start = DEG * -90;
  return `polygon(${ points(3, start).join(',') })`;
}

export function rhombus() {
  return siogon(4);
}

export function pentagon() {
  var start = DEG * 54;
  return `polygon(${ points(5, start).join(',') })`;
}

export function hexgon() {
  var start = DEG * 30;
  return `polygon(${ points(6, start).join(',') })`;
}

export function star() {
  var start = DEG * 54;
  var radius = DEG * 144;
  return `polygon(${ points(5, start, radius).join(',') })`;
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

function points(sides, start = 0, radius) {
  radius = radius || (Math.PI / (sides / 2));
  var points = [];
  for (var i = 0; i < sides; ++i) {
    var theta = start + radius * i;
    points.push(`
      ${ Math.cos(theta) * 50 + 50 }%  ${ Math.sin(theta) * 50 + 50}%
    `);
  }
  return points;
}
