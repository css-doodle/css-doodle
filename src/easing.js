export function ease(t) {
  return cubicBezier(0.25, 0.1, 0.25, 1)(t);
}

export function easeInOut(t) {
  return cubicBezier(0.42, 0, 0.58, 1)(t);
}

export function easeIn(t) {
  return cubicBezier(0.42, 0, 1, 1)(t);
}

export function easeOut(t) {
  return cubicBezier(0, 0, 0.58, 1)(t);
}

export function linear(t) {
  return t;
}

function cubicBezier(p1x, p1y, p2x, p2y) {
  const ax = 3 * p1x - 3 * p2x + 1;
  const bx = -6 * p1x + 3 * p2x;
  const cx = 3 * p1x;

  const ay = 3 * p1y - 3 * p2y + 1;
  const by = -6 * p1y + 3 * p2y;
  const cy = 3 * p1y;

  const EPSILON = 1e-6;
  const MAX_NEWTON_ITER = 8;
  const MAX_BISECT_ITER = 20;

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

  function evalCurve(a, b, c, t) {
    return ((a * t + b) * t + c) * t;
  }

  function evalDerivative(a, b, c, t) {
    return (3 * a * t + 2 * b) * t + c;
  }

  function solveTforX(x) {
    let t = x;
    // Try Newton–Raphson
    for (let i = 0; i < MAX_NEWTON_ITER; i++) {
      const xAtT = evalCurve(ax, bx, cx, t) - x;
      if (Math.abs(xAtT) < EPSILON) return t;

      const dx = evalDerivative(ax, bx, cx, t);
      if (Math.abs(dx) < EPSILON) break;

      t = clamp(t - xAtT / dx);
    }
    // Fallback to bisection
    let t0 = 0, t1 = 1;
    for (let i = 0; i < MAX_BISECT_ITER; i++) {
      t = (t0 + t1) / 2;
      const xAtT = evalCurve(ax, bx, cx, t);

      if (Math.abs(xAtT - x) < EPSILON) break;
      if (xAtT < x) t0 = t;
      else t1 = t;
    }
    return t;
  }

  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const t = solveTforX(x);
    return evalCurve(ay, by, cy, t);
  };
}

function normalize(str) {
  return str
    .trim()
    .toLowerCase()
    .replace('easein', 'ease-in')
    .replace('easeout', 'ease-out')
    .replace('easeinout', 'ease-in-out')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

const easingFunctions = {
  ease,
  easeIn,
  easeOut,
  easeInOut,
  linear,
};

export function getEasingFunction(easing) {
  const name = normalize(easing);
  return easingFunctions[name] || linear;
}
