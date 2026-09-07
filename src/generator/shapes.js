import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';

import { clamp, tidyNumber } from '../lib/math.js';
import { isEmpty } from '../lib/type.js';
import calc from '../core/calc.js';
import { css } from '../lib/tagged-template.js';

const { cos, sin, atan2, PI } = Math;

const presetShapes = {
    __proto__: null,

    pentagon: css`split: 5; rotate: 54`,
    circle:   css`split: 180; scale: .99`,
    hexagon:  css`split: 6; rotate: 30; scale: .98`,
    octagon:  css`split: 8; rotate: 22.5; scale: .99`,
    triangle: css`rotate: 30; scale: 1.1; move: 0 .2`,
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
            let step = (b - a) / (split - 1);
            return a + step * index;
        }
    });

    return (t, i) => {
        index = i;
        context['t'] = context['θ'] = pt || t;
        context['i'] = i + 1;
        let x, y;
        if (pr) {
            let r = calc(pr, context);
            if (r == 0) r = .00001;
            if (pt) t = calc(pt, context);
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

function createShapePoints(props, {min, max}) {
    // legacy command names
    let split = clamp(parseInt(props.vertices || props.points || props.split) || 0, min, max);
    if (props.degree) props.rotate = props.degree;
    if (props.origin) props.move = props.origin;

    let { unit, value } = parseCompoundValue(isEmpty(props.r) ? '' : props.r);
    if (unit && !props[unit] && unit !== 't') {
        if (isEmpty(props.unit)) props.unit = unit;
        props.r = value;
    }
    props.split = split;

    let point = createPointFunction(props, split);

    let turn = Number(props.turn) || 1;
    let frame = props.frame;
    let fill = props['fill'] || props['fill-rule'];
    let direction = parseDirection(props['direction'] || props['dir'] || '');
    let [fx, fy] = parsePair(props.scale, 1);
    let [dx, dy] = parsePair(props.move, 0);
    // percentages of the element by default, else the unit or none
    let percent = props.unit === undefined || props.unit === '%';
    let suffix = percent ? '%' : (props.unit === 'none' ? '' : props.unit);
    // a bare angle like "direction: 30" is constant; auto/reverse need atan2 per point
    let staticAngle = direction.direction ? null : 90 + direction.angle;

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
        if (w == 0) w = .002;
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

const cache = new Map();

export default function generateShape(input, range = {}, modifier) {
    let min = range.min || 3;
    let max = range.max || 3600;
    // count/unit distinguish modifiers that close over caller state (@plot/@Plot)
    let key = input + '|' + min + '|' + max
        + (range.count ? '|' + range.count : '')
        + (range.unit ? '|u' : '')
        + (modifier ? '|m' : '');
    let cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }
    let [name, ...args] = parseValueGroup(input);
    let preset = presetShapes[name];
    if (typeof preset === 'function') {
        preset = preset(...args);
    }
    let rules = parseShapeCommands(preset ?? input);
    if (typeof modifier === 'function') {
        rules = modifier(rules);
    }
    let points = createShapePoints(rules, {min, max});
    if (cache.size >= 4096) {
        cache.clear();
    }
    let result = { rules, points, preset: preset !== undefined };
    cache.set(key, result);
    return result;
}
