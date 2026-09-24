import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';

import { clamp, tidyNumber } from '../lib/math.js';
import { isEmpty } from '../lib/type.js';
import calc from '../core/calc.js';
import { css } from '../lib/tagged-template.js';

const { cos, sin, atan2, sqrt, ceil, min, max, PI } = Math;

const SCATTER_SAMPLES = 16;
const SCATTER_ROUNDS = 10;
const SCATTER_BANDS = 256;

function ngon(n) {
    return `r: cos(π/${n}) / cos(t % (2π/${n}) - π/${n})`;
}

const presetShapes = {
    __proto__: null,

    pentagon: css`split: 5; ${ngon(5)}; rotate: 54`,
    circle:   css`split: 180; scale: .99`,
    hexagon:  css`split: 6; ${ngon(6)}; rotate: 30; scale: .98`,
    octagon:  css`split: 8; ${ngon(8)}; rotate: 22.5; scale: .99`,
    triangle: css`split: 3; ${ngon(3)}; rotate: 30; scale: 1.1; move: 0 .2`,
    star:     css`split: 10; r: cos(5t); rotate: -18; scale: .99`,
    bean:     css`split: 180; r: sin(t)^3 + cos(t)^3; move: -.35 .35`,
    bicorn:   css`split: 180; x: cos(t); y: sin(t)^2 / (2 + sin(t)) - .5`,
    fish:     css`split: 240; x: cos(t) - sin(t)^2 / sqrt(2) - .04; y: sin(2t)/2`,
    infinity: css`split: 180; scale: .99; x: cos(t)*.99 / (sin(t)^2 + 1); y: x * sin(t)`,
    drop:     css`split: 180; rotate: 90; scale: .95; x: sin(t); y: (1 + sin(t)) * cos(t) / 1.6`,
    vase:     css`split: 240; scale: .3; x: sin(4t) + sin(t) * 1.4; y: cos(t) + cos(t) * 4.8 + .3`,
    windmill: css`split: 18; R: seq(.618, 1, 0); T: seq(t-.55, t, t); x: R * cos(T); y: R * sin(T)`,
    whale:    css`split: 240; rotate: 180; R: 3.4 * (sin(t)^2 - .5) * cos(t); x: cos(t) * R + .75; y: sin(t) * R * 1.2`,
    heart:    css`split: 180; rotate: 180; a: cos(t)*13/18 - cos(2t)*5/18; b: cos(3t)/18 + cos(4t)/18; x: (.75 * sin(t)^3) * 1.2; y: (a - b + .2) * -1.1`,
    clover(k = 3) {
        k = clamp(k, 3, 5);
        if (k == 4) k = 2;
        return css`split: 240; r: cos(${k}t); scale: .98`;
    },
    hypocycloid(k = 3) {
        k = clamp(k, 3, 5);
        let scale = [.34, .25, .19][k - 3];
        return css`split: 240; scale: ${scale}; k: ${k}; x: (k-1)*cos(t) + cos((k-1)*t); y: (k-1)*sin(t) - sin((k-1)*t)`;
    },
    bud(k = 3) {
        k = clamp(k, 3, 10);
        return css`split: 240; scale: .8; r: 1 + .2 * cos(${k}t)`;
    },
};

class Point {
    constructor(value, angle) {
        this.value = value;
        this.extra = angle;
    }
    toString() {
        return this.value;
    }
}

function parsePair(input, fallback) {
    let [a, b = a] = parseValueGroup(input);
    a = parseFloat(a) || fallback;
    b = parseFloat(b) || fallback;
    return [a, b];
}

function createPointFunction(props, split) {
    let px = isEmpty(props.x) ? 'cos(t)' : props.x;
    let py = isEmpty(props.y) ? 'sin(t)' : props.y;
    let pr = isEmpty(props.r) ? '' : props.r;
    let pt = isEmpty(props.t) ? '' : props.t;

    let rotate = Number(props.rotate) || 0;
    let rad = -PI / 180 * rotate;
    let cosR = cos(rad), sinR = sin(rad);

    let index = 0;
    let context = Object.assign({}, props, {
        't': 0,
        'θ': 0,
        'i': 0,
        seq(...list) {
            return list.length ? list[index % list.length] : '';
        },
        range(a, b = 0) {
            a = Number(a) || 0;
            b = Number(b) || 0;
            if (a > b) [a, b] = [b, a];
            let step = split > 1 ? (b - a) / (split - 1) : 0;
            return a + step * index;
        }
    });

    return (t, i) => {
        index = i;
        context['i'] = i + 1;
        context['t'] = context['θ'] = t;
        // a `t:` command rewrites the angle, in terms of the angle and index
        if (pt) {
            context['t'] = context['θ'] = t = calc(pt, context);
        }
        let x, y;
        if (pr) {
            let r = calc(pr, context) || .00001;
            x = r * cos(t);
            y = r * sin(t);
        } else {
            x = calc(px, context);
            y = calc(py, context);
        }
        if (rotate) {
            let rx = x * cosR - y * sinR;
            y = y * cosR + x * sinR;
            x = rx;
        }
        return [x, y];
    };
}

function insideTest(outline, y0, h) {
    let bands = Array.from({ length: SCATTER_BANDS }, () => []);
    let band = y => min(SCATTER_BANDS - 1, (y - y0) / h * SCATTER_BANDS | 0);
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        let [ax, ay] = outline[j], [bx, by] = outline[i];
        for (let r = band(min(ay, by)); r <= band(max(ay, by)); ++r) {
            bands[r].push([ax, ay, bx, by]);
        }
    }
    return (x, y) => {
        let n = 0;
        for (let [ax, ay, bx, by] of bands[band(y)]) {
            if ((ay <= y) != (by <= y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) {
                n += by > ay ? 1 : -1;
            }
        }
        return n;
    };
}

function scatter(outline, count) {
    let xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    let x0 = min(...xs), y0 = min(...ys);
    let w = max(...xs) - x0, h = max(...ys) - y0;
    let inside = insideTest(outline, y0, h);
    let total = max(1024, SCATTER_SAMPLES * count), samples = [], tried = 0;
    for (; samples.length < total && tried < total * 100; ++tried) {
        let x = x0 + (.5 + tried * .7548776662) % 1 * w;
        let y = y0 + (.5 + tried * .5698402909) % 1 * h;
        if (inside(x, y)) samples.push([x, y]);
    }
    let points = samples.slice(0, count);
    let size = sqrt(w * h * samples.length / tried / count) || 1;
    let cols = ceil(w / size) || 1, rows = ceil(h / size) || 1;
    let col = x => min(cols - 1, (x - x0) / size | 0);
    let row = y => min(rows - 1, (y - y0) / size | 0);
    let head = new Int32Array(cols * rows), next = new Int32Array(count);
    for (let r = 0; r < SCATTER_ROUNDS; ++r) {
        head.fill(-1);
        let sums = points.map(([x, y], k) => {
            let c = col(x) + cols * row(y);
            next[k] = head[c];
            head[c] = k;
            return [0, 0, 0];
        });
        for (let [x, y] of samples) {
            let cx = col(x), cy = row(y), near = -1, best = Infinity;
            for (let ring = 1; near < 0; ++ring) {
                for (let j = max(0, cy - ring); j <= min(rows - 1, cy + ring); ++j) {
                    for (let i = max(0, cx - ring); i <= min(cols - 1, cx + ring); ++i) {
                        for (let k = head[i + cols * j]; k >= 0; k = next[k]) {
                            let d = (x - points[k][0]) ** 2 + (y - points[k][1]) ** 2;
                            if (d < best) best = d, near = k;
                        }
                    }
                }
            }
            let s = sums[near];
            s[0] += x; s[1] += y; s[2]++;
        }
        points = points.map((p, k) => {
            let [x, y, n] = sums[k];
            return n && inside(x /= n, y /= n) ? [x, y] : p;
        });
    }
    return points.sort((a, b) => b[1] - a[1]);
}

function createShapePoints(props, {min, max}) {
    let split = clamp(parseInt(props.vertices || props.points || props.split), min, max);
    if (props.degree) props.rotate = props.degree;
    if (props.origin) props.move = props.origin;

    // `r: 10px` carries the unit, but `2t` and `2i` are products
    let { unit, value } = parseCompoundValue(isEmpty(props.r) ? '' : props.r);
    if (unit && !props[unit] && !/^[tθi]$/.test(unit)) {
        if (isEmpty(props.unit)) props.unit = unit;
        props.r = value;
    }
    props.split = split;

    let point = createPointFunction(props, split);

    let turn = Number(props.turn) || 1;
    let frame = props.frame;
    let fill = props['fill'] || props['fill-rule'];
    let dir = props['direction'] || props['dir'] || '';
    let direction = parseDirection(dir);
    let [fx, fy] = parsePair(props.scale, 1);
    let [dx, dy] = parsePair(props.move, 0);
    // percentages of the element by default, else the unit or none
    let percent = props.unit === undefined || props.unit === '%';
    let suffix = percent ? '%' : (props.unit === 'none' ? '' : props.unit);
    let staticAngle = props.scatter && !dir ? 0
        : direction.direction ? null : 90 + direction.angle;

    let rad = (PI * 2) * turn / split;
    let points = [];

    let add = ([x, y]) => {
        // the direction of the unmoved point, clockwise from the x axis
        let angle = staticAngle;
        if (angle === null) {
            angle = atan2(-y * fy, x * fx) * 180 / PI;
            if (direction.direction === 'reverse') angle -= 180;
            angle = tidyNumber(angle + direction.angle);
        }
        // to screen coordinates, y grows downwards
        x = (x + dx) * fx;
        y = -(y - dy) * fy;
        if (percent) {
            x = (x + 1) * 50;
            y = (y + 1) * 50;
        }
        points.push(new Point(tidyNumber(x) + suffix + ' ' + tidyNumber(y) + suffix, angle));
    };

    if (props.scatter) {
        let outline = [];
        for (let i = 0; i < split; ++i) {
            outline.push(point(rad * i, i));
        }
        scatter(outline, props.scatter).forEach(add);
        return points;
    }

    if (fill == 'nonzero' || fill == 'evenodd') {
        points.push(new Point(fill, ''));
    }

    let first;
    for (let i = 0; i < split; ++i) {
        let p = point(rad * i, i);
        if (!i) first = p;
        add(p);
    }

    // an outline: back to the first point, then the inner ring in reverse
    if (frame !== undefined) {
        add(first);
        let w = frame / 100;
        if (turn > 1) w *= 2;
        if (!w) w = .002;
        let firstInner;
        for (let i = 0; i < split; ++i) {
            let [x, y] = point(-rad * i, i);
            let theta = atan2(y, x);
            let p = [x - w * cos(theta), y - w * sin(theta)];
            if (!i) firstInner = p;
            add(p);
        }
        add(firstInner);
        add(first);
    }

    return points;
}

// The callers memoize: the results are shared and read-only.
export default function generateShape(input, range = {}, modifier) {
    let min = range.min || 3;
    let max = range.max || 3600;
    let [name, ...args] = parseValueGroup(input);
    let preset = presetShapes[name];
    if (typeof preset === 'function') {
        preset = preset(...args);
    }
    let rules = parseShapeCommands(preset ?? input);
    if (typeof modifier === 'function') {
        rules = modifier(rules, preset !== undefined);
    }
    let points = createShapePoints(rules, {min, max});
    return { rules, points, preset: preset !== undefined };
}
