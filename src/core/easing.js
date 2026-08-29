import calc from './calc.js';
import { memo } from '../utils/cache.js';

const EPSILON = 1e-6;
const MAX_NEWTON = 8;
const MAX_BISECT = 20;

function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;

  const bezier = (a, b, c, t) => ((a * t + b) * t + c) * t;
  const deriv = (a, b, c, t) => (3 * a * t + 2 * b) * t + c;

  function solve(x) {
    let t = x;
    for (let i = 0; i < MAX_NEWTON; i++) {
      const err = bezier(ax, bx, cx, t) - x;
      if (Math.abs(err) < EPSILON) return t;
      const d = deriv(ax, bx, cx, t);
      if (Math.abs(d) < EPSILON) break;
      t = Math.max(0, Math.min(1, t - err / d));
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < MAX_BISECT; i++) {
      t = (lo + hi) / 2;
      const val = bezier(ax, bx, cx, t);
      if (Math.abs(val - x) < EPSILON) break;
      val < x ? lo = t : hi = t;
    }
    return t;
  }

  return x => x <= 0 ? 0 : x >= 1 ? 1 : bezier(ay, by, cy, solve(x));
}

export const linear = t => t;
export const ease = cubicBezier(0.25, 0.1, 0.25, 1);
export const easeIn = cubicBezier(0.42, 0, 1, 1);
export const easeOut = cubicBezier(0, 0, 0.58, 1);
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1);

const presets = {
  linear, ease,
  easein: easeIn,
  easeout: easeOut,
  easeinout: easeInOut,
};

function parseCubicBezier(str) {
  if (!/^cubic-bezier\s*\(/i.test(str)) {
    return null;
  }
  const values = str.match(/-?[\d.]+/g)?.map(Number);
  if (values?.length === 4 && values.every(n => !isNaN(n))) {
    return values;
  }
  return null;
}

const resolve = memo('easing', str => {
  const preset = presets[str.toLowerCase().replace(/[-\s]/g, '')];
  if (preset) return preset;
  const bezierValues = parseCubicBezier(str);
  if (bezierValues) return cubicBezier(...bezierValues);
  return t => calc(str, { t });
});

export function getEasingFunction(easing) {
  if (typeof easing === 'function') return easing;
  return resolve(String(easing).trim());
}
