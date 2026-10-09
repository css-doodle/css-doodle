import parseValueGroup from '../parser/parse-value-group.js';
import parseSvg from '../parser/parse-svg.js';
import parseSvgPath from '../parser/parse-svg-path.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';
import parseDirection from '../parser/parse-direction.js';
import svgSourceOf from '../parser/svg-source.js';

import generateSvg from '../generator/svg.js';
import generateShape from '../generator/shapes.js';
import generateSvgGradient from '../generator/svg-gradient.js';
import { expandFilter, FILTER_COMMANDS } from '../generator/svg-filter.js';

import Noise from '../lib/noise.js';
import seedrandom from '../lib/seedrandom.js';
import calc, { defaultContext, binary } from './calc.js';
import { memo } from '../lib/cache.js';

import { calcContext } from './selector.js';
import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { createSvgUrl, normalizeSvg } from '../lib/svg.js';
import { sequence, expand, byUnit, byCharcode, getNamedArguments } from './arguments.js';
import { cellMetrics } from '../lib/cell.js';
import { isLetter, isNil, isEmpty, getValue } from '../lib/type.js';
import { addAlias, lazy } from '../lib/fn.js';
import { placeholderId } from '../lib/placeholder.js';
import { lerp, clamp, tidyNumber, map2d } from '../lib/math.js';
import { last } from '../lib/list.js';
import { getEasingFunction } from './easing.js';
import { css } from '../lib/tagged-template.js';

const RE_OP_PREFIX = /^[\+\*\-\/%][\-\.\d\s]/;
const RE_OP_SUFFIX = /[\+\*\-\/]$|\D%$/;
const RE_VAR = /var\(/;
const RE_CALC = /^calc\(/;
const RE_LETTER = /^[a-zA-Z]/;

const MAX_SEQUENCE = 65536;
const MAX_SCATTER = 8192;
const SCATTER_OUTLINE = 360;
const NO_TILE = 'polygon(0 0)';

// layout of the sequence tuples pushed onto `extra` (see arguments.js)
const SEQ = {
    n: 0,     // current value            → @n
    x: 1,     // column, for 2x3 forms    → @nx
    y: 2,     // row, for 2x3 forms       → @ny
    max: 3,   // total iterations         → @N
    X: 4,     // sequence grid columns
    Y: 5,     // sequence grid rows
    index: 6, // iteration index, overrides pick counters
    sig: 7    // invocation signature, separates pick counters across @m calls
};

// an operator argument ('*10', '%360deg', '-.5') parses once; computing
// against a base — which runs per cell and per sequence iteration — is
// then plain arithmetic
const parseOperation = memo(input => {
    let v = String(input);
    let prefix = RE_OP_PREFIX.test(v);
    let suffix = !prefix && RE_OP_SUFFIX.test(v);
    let op = '';
    let rest = v;
    if (prefix || suffix) {
        op = prefix ? v[0] : v.slice(-1);
        rest = (prefix ? v.slice(1) : v.slice(0, -1)).trim();
    }
    let { unit = '', value } = parseCompoundValue(rest || 0);
    return op
        ? { op, prefix, value, unit }
        : { op: '+', prefix: true, value: Number(value) || 0, unit };
});

function calcValue(base, v) {
    let { op, prefix, value, unit } = parseOperation(v);
    // prefix op: base comes first; suffix op: base comes last
    let [a, b] = prefix ? [base, value] : [value, base];
    if (typeof base === 'string' && RE_VAR.test(base)) {
        let expr = (op === '%') ? `mod(${a}, ${b})` : `${a} ${op} ${b}`;
        return [`calc(${expr})`, unit];
    }
    return [binary[op](Number(a), Number(b)), unit];
}

function calcWith(base) {
    let unit = '';
    return (...args) => {
        for (let v of args) {
            let [output, outputUnit] = calcValue(base, v);
            base = output;
            if (!unit && outputUnit) {
                unit = outputUnit;
            }
        }
        if (typeof base === 'string' && RE_CALC.test(base)) {
            return `calc(${base} * 1${unit})`;
        }
        if (typeof base === 'number') {
            base = tidyNumber(base);
        }
        return base + unit;
    }
}

function calcWithEasing(t) {
    return (head = '', ...args) => {
        if (RE_LETTER.test(head)) {
            return calcWith(getEasingFunction(head)(t))(...args);
        }
        return calcWith(t)(...[].concat(head, args).filter(n => n !== ''));
    }
}

const STACK_LIMIT = 1024;

function pushStack(context, name, value) {
    let stack = context[name] || (context[name] = []);
    stack.push(value);
    // trim in batches: a shift() per push costs O(limit) on every @r/@p
    if (stack.length >= STACK_LIMIT * 2) {
        stack.splice(0, STACK_LIMIT);
    }
    return value;
}

function lastOf(stack, n = 1) {
    if (stack === undefined) return '';
    // lookback stops at the window edge, as if older values were shifted out
    let i = Math.max(stack.length - n, stack.length - STACK_LIMIT, 0);
    return stack[i];
}

let seqUid = 0;

function makeSequence(c) {
    return lazy((cell, env, position, input, ...actions) => {
        if (!input || !actions.length) return '';
        let count = getValue(input(...(last(env.extra) || [])));
        let evaluated = count;
        let signature = ++seqUid;
        let run = actions.length === 1
            ? (n, x, y, max, X, Y, index) =>
                getValue(actions[0](n, x, y, max, X, Y, index, signature))
            : (n, x, y, max, X, Y, index) => actions.map(action =>
                    getValue(action(n, x, y, max, X, Y, index, signature))).join(',');
        if (/\D/.test(count) && !/\d+[x-]\d+|^\s*\d+\s*x\s*\d+\s*$/.test(count)) {
            evaluated = calc(count);
            // a zero count repeats nothing; the text form still runs for its
            // random draws, so every later random value stays the same
            if (evaluated === 0) {
                sequence(count, run);
                return '';
            }
        }
        return sequence(evaluated, run).join(c);
    });
}

// The @n family: with no sequence tuple in scope the source token is
// echoed back as-is (a non-function return passes through callFunc).
// Argument composition pushes an empty tuple, which is no context either.
function seq(token, make) {
    return (cell, { extra }) => {
        let e = last(extra);
        return (e && e.length) ? make(e) : token;
    };
}

function createPlot(unit, scatter, tile) {
    let plot = memo((commands, max, seed) => {
        let make = count => generateShape(commands, {min: 1, max: MAX_SEQUENCE, preset: tile && 'square', seed}, (rules, preset) => {
            delete rules['frame'];
            if (scatter) {
                let count = Math.trunc(calc('points', Object.assign(Object.create(defaultContext), rules)));
                rules.split = rules.split || SCATTER_OUTLINE;
                delete rules.points;
                if (isEmpty(rules.seed)) {
                    rules.seed = Math.floor(seedrandom('scatter:' + seed)() * 1e4);
                }
                rules.tile = tile;
                rules.hasPoints = count > 0 && !tile;
                let points = tile == 'delaunay' ? Math.ceil(max / 2 + Math.sqrt(max)) : max;
                rules.scatter = clamp(count > 0 && (!tile || count < points) ? count : points, 1, MAX_SCATTER);
                rules.count = max;
            } else {
                delete rules['fill'];
                delete rules['round'];
                delete rules['edge'];
                if (!preset && (rules.split || rules.points)) {
                    rules.hasPoints = true;
                } else {
                    rules.points = count;
                }
            }
            if (unit) {
                rules.unit = rules.unit || 'none';
            }
            return rules;
        });
        let shape = make(max), { rings } = shape.points;
        // the cells spread over the contours by their lengths
        if (!shape.rules.hasPoints && rings?.length > 1) {
            let xy = p => String(p).split(' ').map(parseFloat), total = 0, done = 0;
            // running totals of the lengths
            let runs = rings.map(ring => total += ring.reduce((sum, p, i) => {
                let [x, y] = xy(p), [a, b] = xy(ring.at(i - 1));
                return sum + Math.hypot(x - a, y - b);
            }, 0));
            if (total) shape = make(runs.map(run => {
                let n = Math.round(max * run / total) - done;
                done += n;
                return n;
            }).join(','));
        }
        return shape;
    });
    return (cell, { extra, seed }) => {
        let e = last(extra) || [];
        return (...args) => {
            let idx = e[SEQ.n] ?? cell.count;
            let max = e[SEQ.max] ?? cell.grid.count;
            let { points, rules } = plot(args.join(','), max, String(seed ?? ''));
            if (rules.hasPoints) return points;
            if (!tile) return points[idx - 1];
            let point = points[idx - 1] ?? NO_TILE;
            cellTiles.set(cell, point);
            return point;
        };
    };
}

const cellTiles = new WeakMap();
const tileAxis = i => cell => () => cellTiles.get(cell)?.origin?.split(' ')[i] ?? '';

// appends the args in reverse; `even` repeats the turning point:
// @mirror 1 2 3 → 1 2 3 3 2 1, @Mirror 1 2 3 → 1 2 3 2 1
function createMirror(even) {
    let offset = even ? 1 : 2;
    return () => (...args) => {
        for (let i = args.length - offset; i >= 0; --i) {
            args.push(args[i]);
        }
        return args;
    };
}

function createPick(name, fn, random = false, upstream = false) {
    return (cell, { context, extra, upextra, shuffle, level }, position) => {
        let lastExtra = upstream
            ? last(upextra.length ? upextra : extra)
            : last(extra);
        let sig = lastExtra?.[SEQ.sig] ?? '';
        let index = lastExtra?.[SEQ.index];
        let counter = `${name}-counter${position}:${level}`;
        let valuesKey = `${name}-values${position}:${sig}`;

        return expand((...args) => {
            let source = random ? (context[valuesKey] ??= shuffle(args)) : args;
            let max = args.length;
            let idx = index ?? (context[counter] = (context[counter] || 0) + 1);
            let value = fn(source, (idx - 1) % max, max);
            return pushStack(context, 'lastPick', value);
        });
    };
}

const INVERT_COMMAND = { v: 'h', V: 'H', h: 'v', H: 'V' };

function transformPath(xx, xy, yx, yy) {
    let swap = xx === 0;
    // a reflection reverses the turning direction of the arcs
    let reflect = xx * yy - xy * yx < 0;
    return (...args) => {
        let input = args.join(',');
        let { valid, commands } = parseSvgPath(input);
        if (!valid || !commands.length) return input;
        let first = commands[0];
        let [ox = 0, oy = 0] = /^[ml]$/i.test(first.name) ? first.value : [];
        let point = (x, y, abs) => {
            let dx = abs ? x - ox : x;
            let dy = abs ? y - oy : y;
            let px = xx * dx + xy * dy;
            let py = yx * dx + yy * dy;
            if (abs) { px += ox; py += oy; }
            return [tidyNumber(px), tidyNumber(py)];
        };
        return commands.map(({ name, value, type }, i) => {
            let abs = type === 'absolute';
            let lower = name.toLowerCase();
            let out = [];
            if (lower === 'h' || lower === 'v') {
                // one coordinate, which lands on the other axis under a swap
                let isH = lower === 'h';
                for (let n of value) {
                    let [px, py] = isH ? point(n, abs ? oy : 0, abs) : point(abs ? ox : 0, n, abs);
                    out.push(isH === swap ? py : px);
                }
                if (swap) name = INVERT_COMMAND[name];
            } else if (lower === 'a') {
                for (let j = 0; j < value.length; j += 7) {
                    let [rx, ry, rot, large, sweep, x, y] = value.slice(j, j + 7);
                    out.push(
                        swap ? ry : rx, swap ? rx : ry, reflect ? -rot : rot,
                        large, reflect ? 1 - sweep : sweep, ...point(x, y, abs)
                    );
                }
            } else {
                for (let j = 0; j < value.length; j += 2) {
                    out.push(...point(value[j], value[j + 1], abs || (i === 0 && j === 0)));
                }
            }
            return name + out.join(' ');
        }).join(' ');
    };
}

const flipHPath = transformPath(-1, 0, 0, 1);
const flipVPath = transformPath(1, 0, 0, -1);
const flipPath = transformPath(-1, 0, 0, -1);
const invertPath = transformPath(0, 1, 1, 0);

const composeSvgUrl = memo(value => {
    let warnings = [];
    if (!value.startsWith('<')) {
        value = generateSvg(parseSvg(value), message => warnings.push(message));
    }
    return { url: createSvgUrl(normalizeSvg(value)), warnings };
});

const composeSvgPolygonUrl = memo((commands, seed) => {
    let { rules, points } = generateShape(commands, {min: 3, max: MAX_SEQUENCE, seed}, rules => {
        delete rules.frame;
        rules['unit'] = 'none';
        rules['stroke-width'] ??= .01;
        rules['stroke'] ??= 'currentColor';
        rules['fill'] ??= 'none';
        return rules;
    });
    let props = '';
    let p = rules.padding ?? Number(rules['stroke-width']) / 2;
    for (let name of Object.keys(rules)) {
        if (/^(stroke|fill|clip|marker|mask|animate|draw)/.test(name)) {
            props += `${name}: ${rules[name]};`
        }
    }
    let { rings } = points, shape = rings?.length > 1
        ? `path { ${props} d: ${rings.map(ring => 'M' + ring.join('L') + 'Z').join('')}; }`
        : `polygon { ${props} points: ${points}; }`;
    let parsed = parseSvg(css`viewBox: -1 -1 2 2 p ${p}; ${shape}`);
    return createSvgUrl(generateSvg(parsed));
});

const composeSvgPatternUrl = memo(value => {
    let parsed = parseSvg(css`
    viewBox: 0 0 1 1;
    preserveAspectRatio: xMidYMid slice;
    rect {
      width, height: 100%;
      fill: defs pattern { ${ value } }
    }
  `);
    return createSvgUrl(generateSvg(parsed));
});

const Function = Object.create(null);

Function.m = makeSequence(',');

Function.M = makeSequence(' ');

Function.rep = makeSequence('');

Function.n = seq('@n', e => calcWith(e[SEQ.n]));

Function.nx = seq('@nx', e => calcWith(e[SEQ.x]));

Function.ny = seq('@ny', e => calcWith(e[SEQ.y]));

Function.N = seq('@N', e => calcWith(e[SEQ.max]));

Function.nN = seq('@nN', e => calcWithEasing(e[SEQ.n] / e[SEQ.max]));

Function.Nn = seq('@Nn', e => calcWithEasing((e[SEQ.max] - e[SEQ.n] + 1) / e[SEQ.max]));

Function.nd = seq('@nd', e => d => {
    d = Number(d) || 0;
    return calcWith(e[SEQ.n] - .5 - d - e[SEQ.max] / 2)();
});

// @p and @P with no arguments reuse the arguments of the last pick
Function.p = (_, { context, pick }) => {
    return expand((...args) => {
        if (!args.length) {
            args = context.lastPickArgs || [];
        }
        context.lastPickArgs = args;
        return pushStack(context, 'lastPick', pick(args));
    });
};

Function.P = (_, { context, pick }, position) => {
    let counter = 'P-counter' + position;
    return expand((...args) => {
        let own = args.length > 0;
        if (!own) {
            args = context.lastPickArgs || [];
        }
        let memory = own ? (context[counter] ??= {}) : null;
        let last = own ? memory.lastPick : lastOf(context.lastPick);
        context.lastPickArgs = args;
        let i = args.length > 1 ? args.indexOf(last) : -1;
        if (i !== -1) {
            args = args.filter((_, j) => j !== i);
        }
        let picked = pick(args);
        if (own) {
            memory.lastPick = picked;
        }
        return pushStack(context, 'lastPick', picked);
    });
};

Function.pn = createPick('pn', (args, pos) => args[pos]);

Function.PN = createPick('PN', (args, pos) => args[pos], false, true);

Function.pnr = createPick('pnr', (args, pos, max) => args[max - pos - 1]);

Function.PNR = createPick('PNR', (args, pos, max) => args[max - pos - 1], false, true);

Function.pd = createPick('pd', (args, pos) => args[pos], true);

Function.PD = createPick('PD', (args, pos) => args[pos], true, true);

Function.lp = (_, { context }) => (n = 1) => lastOf(context.lastPick, n);

Function.r = (_, { context, rand }) => (...args) => {
    let transform = (args.length && args.every(isLetter)) ? byCharcode : byUnit;
    return pushStack(context, 'lastRand', transform(rand)(...args));
};

Function.ri = (_, { context, rand }) => (...args) => {
    let transform = (args.length && args.every(isLetter)) ? byCharcode : byUnit;
    let randInt = (...range) => Math.round(rand(...range));
    return pushStack(context, 'lastRand', transform(randInt)(...args));
};

function createNoise(outline) {
    return ({ x, y, grid }, { context, extra, random }, position) => {
        let counter = (outline ? 'noise-t' : 'noise-2d') + position;
        let e = last(extra) || [];
        let [cx, cy, X, Y] = (e[SEQ.n] && e[SEQ.max]) ? [e[SEQ.x], e[SEQ.y], e[SEQ.X], e[SEQ.Y]] : e.shared ? [1, 1, 1, 1] : [x, y, grid.x, grid.y];
        let u = X <= 1 ? .5 : (cx - 1) / X;
        let v = Y <= 1 ? .5 : (cy - 1) / Y;
        return (...args) => {
            let {from, to, frequency = 1, scale = 1, octave = 1} = getNamedArguments(args, [
                'from', 'to', 'frequency', 'scale', 'octave'
            ]);

            frequency = clamp(frequency, 0, Infinity);
            scale = clamp(scale, 0, Infinity);
            octave = clamp(octave, 1, 100);

            if (to === undefined) [from, to] = [0, from ?? 1];
            from ??= 0;

            if (outline) {
                let { offsetX, offsetY } = context[counter] ??= {
                    offsetX: random() * 256, offsetY: random() * 256
                };
                let at = [(offsetX + u) * frequency, (offsetY + v) * frequency, octave, scale, parseFloat(from), parseFloat(to), frequency];
                return `noise(t,${at.map(tidyNumber)})`;
            }

            let { noise2d, offsetX, offsetY } = context[counter] ??= {
                noise2d: new Noise(random), offsetX: random(), offsetY: random()
            };
            let transform = (isLetter(from) && isLetter(to)) ? byCharcode : byUnit;
            let _x = offsetX + u;
            let _y = offsetY + v;

            let t = noise2d.noise(_x * frequency, _y * frequency) * scale;

            for (let i = 1; i < octave; ++i) {
                let i2 = i * 2;
                t += noise2d.noise(_x * frequency * i2, _y * frequency * i2) * (scale / i2);
            }
            let fn = transform((from, to) => map2d(t, from, to, scale));
            return pushStack(context, 'lastRand', fn(from, to));
        };
    };
}

Function.R = createNoise();
Function.R.t = createNoise(true);

Function.lr = (_, { context }) => (n = 1) => lastOf(context.lastRand, n);

Function.match = (cell, { extra }) => {
    let e = last(extra);
    let variables = calcContext(cell);
    if (e && e.length) {
        variables.n = e[SEQ.n];
        variables.nx = e[SEQ.x];
        variables.ny = e[SEQ.y];
        variables.N = e[SEQ.max];
    }
    return (...args) => {
        if (args.length <= 1) {
            return '';
        }
        for (let i = 0; i < args.length; i += 2) {
            let expr = args[i];
            let pass = args[i + 1];
            if (isNil(pass)) {
                return expr;
            }
            if (calc(expr, variables)) {
                return pass;
            }
        }
    }
};

Function.calc = () => (value = '', context) => tidyNumber(calc(value, context));

Function.hex = () => (value = '') => {
    let n = parseInt(value);
    return Number.isNaN(n) ? value : n.toString(16);
};

Function.var = () => (value = '') => `var(${value})`;

Function.stripe = () => (...input) => {
    let colors = input.flat();
    let max = colors.length;
    if (!max) {
        return '';
    }
    let defaultCount = 0;
    let customSizes = [];
    let pairs = colors.map(step => {
        let [color, size] = parseValueGroup(step);
        if (size !== undefined) customSizes.push(size);
        else defaultCount += 1;
        return [color, size];
    });
    if (!customSizes.length) {
        return colors.map((color, i) => `${color} 0 ${100 / max * (i + 1)}%`).join(',');
    }
    let defaultSize = `(100% - ${customSizes.join(' - ')}) / ${defaultCount}`;
    let end = '';
    return pairs.map(([color, size]) => {
        end += (end ? ' + ' : '') + (size ?? defaultSize);
        return `${color} 0 calc(${end})`;
    }).join(',');
};

function maxChroma(L, h) {
    let x = Math.cos(h), y = Math.sin(h);
    let ax = .3963377774 * x + .2158037573 * y;
    let am = .1055613458 * x + .0638541728 * y;
    let as = .0894841775 * x + 1.291485548 * y;
    let inside = c => {
        let l = (L + c * ax) ** 3;
        let m = (L - c * am) ** 3;
        let s = (L - c * as) ** 3;
        return [
            4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
            -.0041960863 * l - .7034186147 * m + 1.707614701 * s
        ].every(v => v >= -1e-4 && v <= 1.0001);
    };
    let lo = 0, hi = .4;
    for (let i = 0; i < 12; ++i) {
        let c = (lo + hi) / 2;
        inside(c) ? lo = c : hi = c;
    }
    return lo;
}

const PALETTE_HUES = [
    [16, 30, 32, 33, 38, 42, 45, 49, 70, 84, 93, 101],
    [29, 55, 61, 63, 69, 74, 79, 84, 91, 94, 96, 101],
    [6, 15, 48, 72, 81, 86, 92, 95, 96, 97, 98, 101]
];

const PALETTE_LIGHTNESS = [.2, .37, .48, .58, .65, .72, .78, .84, .89, .94, .98];
const TAU = Math.PI * 2;
const hueTurn = (a, b) => ((b - a) % TAU + TAU + Math.PI) % TAU - Math.PI;

function paletteAnchor(r) {
    let x = r(), i = ~~(x * 10);
    let L = lerp(x * 10 - i, PALETTE_LIGHTNESS[i], PALETTE_LIGHTNESS[i + 1]);
    let row = PALETTE_HUES[L < .5 ? 0 : L < .75 ? 1 : 2];
    let y = r() * row[11], j = row.findIndex(v => v > y);
    let h = ((j + r()) * 30) * Math.PI / 180;
    h += hueTurn(h, (L > .6 ? 70 : 250) * Math.PI / 180) * .875 * Math.abs(L - .6);
    let z = r();
    let C = maxChroma(L, h) * (z < .15 ? z / 3 : .05 + .95 * ((z - .15) / .85) ** .5);
    return [L, C * Math.cos(h), C * Math.sin(h)];
}

function samplePalette([a, b, c], n) {
    let colors = [];
    for (let k = 0; k < n; ++k) {
        let t = n > 1 ? k / (n - 1) : .5;
        let [L, x, y] = a.map((v, i) =>
            v * (1 - t) * (1 - 2 * t) + 4 * b[i] * t * (1 - t) + c[i] * t * (2 * t - 1));
        L = clamp(L, .15, .98);
        let h = Math.atan2(y, x);
        colors.push([L, Math.min(Math.hypot(x, y), maxChroma(L, h)), h]);
    }
    return colors;
}

const colorDistance = ([L1, C1, h1], [L2, C2, h2]) =>
    Math.sqrt((L1 - L2) ** 2 + C1 * C1 + C2 * C2 - 2 * C1 * C2 * Math.cos(h1 - h2));

const palette = memo((key, n) => {
    let r = seedrandom(key), anchors;
    for (let i = 0; i < 24; ++i) {
        anchors = [r, r, r].map(paletteAnchor);
        let five = samplePalette(anchors, 5);
        if (five.every((c, k) => !k || colorDistance(c, five[k - 1]) >= .08)
            && colorDistance(five[0], five[4]) >= .25) break;
    }
    return samplePalette(anchors, n).map(([L, C, h]) =>
        `oklch(${+L.toFixed(3)} ${+C.toFixed(3)} ${+((h * 180 / Math.PI + 360) % 360).toFixed(1)})`);
});

Function.palette = (_, { seed }) => (n = 5) =>
    [...palette('palette:' + seed, ~~clamp(calc(n), 1, 256))];


Function.cycle = () => {
    return (...args) => {
        // one argument rotates its words, several rotate the arguments
        let separator = args.length == 1 ? ' ' : ',';
        let list = parseValueGroup(args.join(separator), { symbol: separator });
        let result = [];
        for (let i = 0; i < list.length; ++i) {
            result.push(list.slice(i).concat(list.slice(0, i)).join(separator));
        }
        return result;
    }
};

Function.mirror = createMirror(true);

Function.Mirror = createMirror(false);

Function.code = () => {
    return (...args) => {
        return args.map(code => String.fromCharCode(code));
    }
};

const shapePolygon = memo((input, seed) => {
    if (input.trim() == 'circle') return 'ellipse(50% 50%)';
    return generateShape(input, { seed }).clip;
});

Function.shape = (_, { seed } = {}) => (...args) => shapePolygon(args.join(','), seed);

Function.plot = createPlot(false);
Function.plot.scatter = createPlot(false, true);

Function.tile = createPlot(false, true, 'slice');
Function.tile.slice = Function.tile;
for (let kind of ['voronoi', 'delaunay', 'hex', 'triangle', 'grid', 'circle', 'cube', 'penrose']) {
    Function.tile[kind] = createPlot(false, true, kind);
}
Function.tile.x = tileAxis(0);
Function.tile.y = tileAxis(1);
Function.tile.kind = cell => () => cellTiles.get(cell)?.kind ?? '';
Function.tile.r = cell => () => {
    let { rx, ry } = cellTiles.get(cell) || {};
    return rx ? (parseFloat(rx) < parseFloat(ry) ? ry : rx) : '';
};

Function.Plot = createPlot(true);
Function.Plot.scatter = createPlot(true, true);

const arcPath = memo((...args) => {
    let c = parseShapeCommands(args.join(','));
    let [rx, ry = rx] = parseValueGroup(c.r ?? '0').map(calc);
    let [cx, cy = cx] = parseValueGroup(c.move ?? '0').map(calc);
    let from = parseDirection(c.from ?? '0').angle;
    let sweep = parseDirection(c.to ?? '360').angle - from;
    let full = Math.abs(sweep) >= 360;
    if (full) {
        sweep = sweep < 0 ? -360 : 360;
    }
    let point = a => {
        let t = a * Math.PI / 180;
        return tidyNumber(cx + rx * Math.cos(t)) + ' ' + tidyNumber(cy + ry * Math.sin(t));
    };
    let arc = `A ${tidyNumber(rx)} ${tidyNumber(ry)} 0`;
    let dir = sweep > 0 ? 1 : 0;
    if (full) {
        return `L ${point(from)} ${arc} 1 ${dir} ${point(from + sweep / 2)} ${arc} 1 ${dir} ${point(from)}`;
    }
    return `L ${point(from)} ${arc} ${Math.abs(sweep) > 180 ? 1 : 0} ${dir} ${point(from + sweep)}`;
});

Function.arc = () => arcPath;

Function.invert = () => invertPath;

Function.flipH = () => flipHPath;

Function.flipV = () => flipVPath;

Function.flip = () => flipPath;

Function.reverse = () => {
    return (...args) => {
        let { valid, commands } = parseSvgPath(args.join(','));
        if (!valid) return args.reverse();
        let list = commands.map(({ name, value }) => name + value.join(' '));
        let head = /^[ml]/i.test(list[0]) ? list.shift() : '';
        let tail = /^z$/i.test(list[list.length - 1]) ? list.pop() : '';
        return [head, ...list.reverse(), tail].filter(Boolean).join(' ');
    }
};

Function.svg = lazy((_, env, position, ...args) => {
    let outer = env.svg;
    env.svg = true;
    let value = args.map(input => getValue(input())).join(',');
    env.svg = outer;
    let { url, warnings } = composeSvgUrl(value);
    for (let message of warnings) {
        env.rules.warn(message);
    }
    return url;
});

Function['svg-filter'] = lazy((_, env, position, ...args) => {
    let values = args.map(input => getValue(input()));
    let value = values.join(',');
    // the positional / name=value short form
    let shorthand = values.every(n =>
        !/[{}<>]/.test(n) && (/^[\-\d.]/.test(n) || /^\w+=/.test(n))
    );
    if (shorthand) {
        let named = getNamedArguments(values, FILTER_COMMANDS);
        value = FILTER_COMMANDS
            .filter(name => !isNil(named[name]))
            .map(name => `${name}: ${named[name]};`)
            .join('');
    }
    if (!value.startsWith('<')) {
        let warn = message => env.rules.warn(message);
        let parsed = parseSvg(value, {
            type: 'block',
            name: 'filter'
        });
        let expanded = expandFilter(parsed, env.seed, warn, {
            chainInput: !shorthand
        });
        if (env.svg) {
            return svgSourceOf(expanded, { repeat: false });
        }
        value = generateSvg(expanded, warn);
    }
    let markup = normalizeSvg(value);
    let rules = env.rules;
    let id = rules.filterIds.get(markup);
    if (!id) {
        id = rules.nextId('filter');
        rules.filters[id] = markup.replace(/<filter([\s>])/, `<filter id="${ id }"$1`);
        rules.filterIds.set(markup, id);
    }
    return `url(#${ id })`;
});

Function['svg-pattern'] = lazy((_, env, position, ...args) => {
    let value = args.map(input => getValue(input())).join(',');
    return composeSvgPatternUrl(value);
});

Function['svg-polygon'] = (_, { seed } = {}) => (...args) => composeSvgPolygonUrl(args.join(','), seed);

Function.linearGradient = lazy((cell, env, position, ...args) => generateSvgGradient('linearGradient', args));

Function.radialGradient = lazy((cell, env, position, ...args) => generateSvgGradient('radialGradient', args));

Function.doodle = Function.shaders = Function.pattern = () => {};

Function.once = lazy((cell, { context }, position, ...args) => {
    let counter = 'once-counter' + position;
    return context[counter] ??= args.map(input => getValue(input())).join(',');
});

Function.raw = (cell, { rules }) => {
    return (...args) => {
        let raw = args.join(',');
        let id = placeholderId(raw);
        if (id && rules.doodles[id]) {
            return `<css-doodle>${rules.doodles[id].doodle}</css-doodle>`
        }
        if (raw.startsWith('url("data:image/svg+xml;utf8')) {
            try {
                return decodeURIComponent(raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")')));
            } catch (e) {}
        }
        return raw;
    }
};

Function['google-font'] = (cell, { rules }) => {
    return name => {
        // the component loads the collected names
        rules.addFont(name);
        return name;
    };
};

Function.id = ({ id }) => {
    return _ => id;
};

Function.i = c => calcWith(c.count);
Function.I = c => calcWith(c.grid.count);

Function.x = c => calcWith(c.x);
Function.X = c => calcWith(c.grid.x);

Function.y = c => calcWith(c.y);
Function.Y = c => calcWith(c.grid.y);

Function.z = c => calcWith(c.z);
Function.Z = c => calcWith(c.grid.z);


Function.iI = c => calcWithEasing(c.count / c.grid.count);
Function.Ii = c => calcWithEasing((c.grid.count - c.count + 1) / c.grid.count);

Function.xX = c => calcWithEasing(c.x / c.grid.x);
Function.Xx = c => calcWithEasing((c.grid.x - c.x + 1) / c.grid.x);

Function.yY = c => calcWithEasing(c.y / c.grid.y);
Function.Yy = c => calcWithEasing((c.grid.y - c.y + 1) / c.grid.y);

for (let name of ['dx', 'dy', 'dr', 'dc', 'dm', 'da', 'db']) {
    Function[name] = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid)[name]);
}

Function.t =  () => calcWith(`var(${utime})`);
Function.ts = () => calcWith(`calc(var(${utime}) / 1000)`);

Function.T =  () => calcWith(`var(${UTime})`);
Function.TS = () => calcWith(`calc(var(${UTime}) / 1000)`);

Function.uw = () => calcWith(`var(${uwidth})`);
Function.uh = () => calcWith(`var(${uheight})`);

Function.ux = () => calcWith(`var(${umousex})`);
Function.uy = () => calcWith(`var(${umousey})`);

Function.udx = ({ x, grid }) => calcWith(`calc(${tidyNumber((x - .5) / grid.x)} * var(${uwidth}) - var(${umousex}))`);
Function.udy = ({ y, grid }) => calcWith(`calc(${tidyNumber((y - .5) / grid.y)} * var(${uheight}) - var(${umousey}))`);

/**
 * expose JS Math functions with css-doodle calc/value semantics
 */
export const MathFunc = Object.create(null);

for (let name of Object.getOwnPropertyNames(Math)) {
    let member = defaultContext[name];
    MathFunc[name] = (typeof member === 'number')
        ? () => () => tidyNumber(member)
        : () => (...args) => tidyNumber(member(...args.map(n => calc(n))));
}

export const alias = {
    'index': 'i',
    'col': 'x',
    'row': 'y',
    'depth': 'z',
    'rand': 'r',
    'pick': 'p',
    'rn': 'R',

    // legacy names, keep them before 1.0
    'filter': 'svg-filter',
    'multiple': 'm',
    'repeat': 'rep',
    'ms': 'M',
    'size': 'I',
    'pl': 'pn',
    'pr': 'pnr',
    'PL': 'PN',
    'PR': 'PNR',
    'pick-n': 'pn',
    'pick-d': 'pd'
};

export default addAlias(Function, alias);
