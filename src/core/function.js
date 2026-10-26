import parseValueGroup from '../parser/parse-value-group.js';
import parseSvg from '../parser/parse-svg.js';
import parseSvgPath from '../parser/parse-svg-path.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands, { spaced } from '../parser/parse-shape-commands.js';
import parseDirection from '../parser/parse-direction.js';
import svgSourceOf from '../parser/svg-source.js';

import generateSvg from '../generator/svg.js';
import generateShape, { shapeWarnings } from '../generator/shapes.js';
import generateSvgGradient from '../generator/svg-gradient.js';
import { expandFilter, FILTER_COMMANDS } from '../generator/svg-filter.js';

import Noise from '../lib/noise.js';
import seedrandom from '../lib/seedrandom.js';
import calc, { defaultContext, binary, withUnit, pickIndex } from './calc.js';
import { memo } from '../lib/cache.js';

import { calcContext } from './selector.js';
import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { createSvgUrl, normalizeSvg } from '../lib/svg.js';
import { sequence, expand, carry, byUnit, byCharcode, getNamedArguments, MAX_SEQUENCE } from './arguments.js';
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
const RE_LIVE = /\b(var|calc)\(/;
const RE_LETTER = /^[a-zA-Z]/;

const MAX_SCATTER = 8192;
const SCATTER_OUTLINE = 360;
const NO_TILE = 'polygon(0 0)';

// layout of the sequence tuples pushed onto `extra` (see arguments.js)
export const SEQ = {
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
    if (typeof base === 'string' && RE_LIVE.test(base)) {
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
        return withUnit(tidyNumber(base), unit);
    }
}

function calcWithEasing(t) {
    return (head = '', ...args) => {
        if (RE_LETTER.test(head)) {
            return calcWith(getEasingFunction(head)(t))(...args);
        }
        return calcWith(t)(head, ...args);
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
        if (/\D/.test(count) && !/^\d+[x-]\d+$|^\s*\d+\s*x\s*\d+\s*$/.test(count)) {
            evaluated = calc(count);
            if (evaluated === 0) {
                sequence(count, run);
                return '';
            }
            evaluated = Math.ceil(evaluated);
        }
        let seen = new Set();
        let outer = env.extra.reduce((n, e) => {
            let key = e?.[SEQ.sig] ?? e;
            if (seen.has(key)) return n;
            seen.add(key);
            return n * (Number(e?.[SEQ.max]) || 1);
        }, 1);
        return sequence(evaluated, run, Math.max(1, Math.floor(MAX_SEQUENCE / outer))).join(c);
    });
}

function seq(token, make) {
    return (cell, { extra }) => {
        let e = last(extra);
        return (e && e.length) ? make(e) : token;
    };
}

function createPlot(unit, kind, pieces) {
    let plot = memo((commands, max, seed) => {
        let make = count => generateShape(commands, {min: 1, max: MAX_SEQUENCE, preset: pieces && 'square', seed}, (rules, preset) => {
            delete rules['frame'];
            if (kind) {
                let count = Math.trunc(calc('points', rules));
                rules.split = rules.split || SCATTER_OUTLINE;
                delete rules.points;
                if (isEmpty(rules.seed)) {
                    rules.seed = Math.floor(seedrandom('scatter:' + seed)() * 1e4);
                }
                rules.tile = kind;
                rules.dots = !pieces;
                rules.hasPoints = count > 0 && !pieces;
                let points = kind == 'delaunay' ? Math.ceil(max / 2 + Math.sqrt(max)) : max;
                rules.scatter = clamp(count > 0 && (!pieces || count < points) ? count : points, 1, MAX_SCATTER);
                rules.count = max;
            } else {
                delete rules['fill'];
                delete rules['fill-rule'];
                delete rules['round'];
                delete rules['grow'];
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
        if (!shape.rules.hasPoints && !shape.rules.blocks && rings?.length > 1) {
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
    return (cell, { extra, seed, rules }) => {
        let e = last(extra) || [];
        return (...args) => {
            let [idx, max] = e[SEQ.index] ? [e[SEQ.n], e[SEQ.max]] : [cell.count, cell.grid.count];
            let input = args.join(',');
            shapeWarnings(input).forEach(m => rules?.warn(m));
            let { points, rules: { hasPoints } } = plot(input, max, String(seed ?? ''));
            if (hasPoints) return points;
            if (!pieces) return points[idx - 1] ?? '';
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

const countOf = (cell, e) => e?.[SEQ.index] ? e[SEQ.max] : cell.grid.count;

function createPick(name, fn, random = false, upstream = false) {
    return (cell, { context, extra, upextra, shuffle, level }, position) => {
        let lastExtra = upstream
            ? last(upextra.length ? upextra : extra)
            : last(extra);
        let sig = lastExtra?.[SEQ.sig] ?? '';
        let index = lastExtra?.[SEQ.index];
        let counter = `${name}-counter${position}:${level}`;
        let valuesKey = `${name}-values${position}:${sig}`;
        let count = fn !== pickN && countOf(cell, lastExtra);

        return expand((...args) => {
            let source = random ? (context[valuesKey] ??= shuffle(args)) : args;
            let max = args.length;
            let idx = index ?? (context[counter] = (context[counter] || 0) + 1);
            let value = fn(source, (idx - 1) % max, max, idx - 1);
            return pushStack(context, 'lastPick', value);
        }, count);
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
        : `polygon { ${props} points: ${rings?.[0] || points}; }`;
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
Function.p = (cell, { context, pick, extra }) => {
    return expand((...args) => {
        if (!args.length) {
            args = context.lastPickArgs || [];
        }
        context.lastPickArgs = args;
        return pushStack(context, 'lastPick', pick(args));
    }, countOf(cell, last(extra)));
};

Function.P = (cell, { context, pick, extra }, position) => {
    let counter = 'P-counter' + position;
    return expand((...args) => {
        let own = args.length > 0;
        if (!own) {
            args = context.lastPickArgs || [];
        }
        let memory = own ? (context[counter] ??= {}) : null;
        let last = own ? memory.lastPick : lastOf(context.lastPick);
        context.lastPickArgs = args;
        let rest = args.filter(n => n !== last);
        if (rest.length) {
            args = rest;
        }
        let picked = pick(args);
        if (own) {
            memory.lastPick = picked;
        }
        return pushStack(context, 'lastPick', picked);
    }, countOf(cell, last(extra)));
};

function pickN(args, pos, max, i) {
    let at = args[max - 1] === '...' && carry(args[max - 3], args[max - 2]);
    return !at ? args[pos] : i < max - 1 ? args[i] : at(i - max + 2);
}

Function.pn = createPick('pn', pickN);

Function.PN = createPick('PN', pickN, false, true);

Function.pnr = createPick('pnr', (args, pos, max) => args[max - pos - 1]);

Function.PNR = createPick('PNR', (args, pos, max) => args[max - pos - 1], false, true);

Function.pd = createPick('pd', (args, pos) => args[pos], true);

Function.PD = createPick('PD', (args, pos) => args[pos], true, true);

Function.lp = (_, { context }) => (n = 1) => lastOf(context.lastPick, n);

Function.r = (_, { context, rand }) => (...args) => {
    let transform = (args.length && args.every(isLetter)) ? byCharcode : byUnit;
    return pushStack(context, 'lastRand', transform(rand)(...args));
};

// @r drawing whole numbers
Function.ri = (cell, env) => Function.r(cell, { ...env, rand: (...range) => Math.round(env.rand(...range)) });

function createNoise(outline) {
    return ({ x, y, grid }, { context, extra, random }, position) => {
        let counter = (outline ? 'noise-t' : 'noise-2d') + position;
        let e = last(extra) || [];
        let [cx, cy, X, Y] = (e[SEQ.index] && e[SEQ.n]) ? [e[SEQ.x], e[SEQ.y], e[SEQ.X], e[SEQ.Y]] : e.shared ? [1, 1, 1, 1] : [x, y, grid.x, grid.y];
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

            let t = noise2d.fbm(_x * frequency, _y * frequency, octave, scale);
            let fn = transform((from = 0, to = 1) => map2d(t, from, to, scale));
            return pushStack(context, 'lastRand', fn(from, to));
        };
    };
}

Function.R = createNoise();
Function.R.t = createNoise(true);

Function.lr = (_, { context }) => (n = 1) => lastOf(context.lastRand, n);

function sequenceContext(cell, e, vars) {
    let variables = calcContext(cell, vars);
    if (e.length) {
        variables.n = e[SEQ.n];
        variables.nx = e[SEQ.x];
        variables.ny = e[SEQ.y];
        variables.N = e[SEQ.max];
    }
    return variables;
}

Function.match = lazy((cell, { extra }, position, vars, ...args) => {
    if (args.length <= 1) {
        return '';
    }
    let e = last(extra) || [];
    let variables = sequenceContext(cell, e, vars);
    let value = i => getValue(args[i](...e));
    for (let i = 0; i < args.length; i += 2) {
        if (i + 1 === args.length) {
            return value(i);
        }
        if (calc(value(i), variables)) {
            return value(i + 1);
        }
    }
});

export const pickAt = lazy((cell, { context, extra }, position, vars, ...args) => {
    if (args.length <= 1) {
        return '';
    }
    let e = last(extra) || [];
    let k = calc(getValue(args[0](...e)), sequenceContext(cell, e, vars));
    return Number.isFinite(k) ? pushStack(context, 'lastPick', getValue(args[1 + pickIndex(k, args.length - 1)](...e))) : '';
});

export const pickAtList = (cell, { context, extra }) => (vars, k, ...items) => {
    k = calc(k, sequenceContext(cell, last(extra) || [], vars));
    return Number.isFinite(k) && items.length ? expand((...list) => pushStack(context, 'lastPick',
        pickN(list, pickIndex(k, list.length), list.length, Math.max(Math.round(k) - 1, 0))))(...items) : '';
};

Function.match.vars = pickAt.vars = pickAtList.vars = true;

Function.calc = () => (value = '', context) => tidyNumber(calc(value, typeof context === 'object' ? context : undefined, 1));

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

function paletteAnchor(r, hues = [], e = 1, x = r()) {
    let i = ~~(x * 10), h;
    let L = lerp(x * 10 - i, PALETTE_LIGHTNESS[i], PALETTE_LIGHTNESS[i + 1]);
    if (hues.length && r() < .6) {
        h = hues[~~(r() * hues.length)] + (r() - .5) / 2;
    } else {
        let row = PALETTE_HUES[L < .5 ? 0 : L < .75 ? 1 : 2];
        let y = r() * row[11], j = row.findIndex(v => v > y);
        h = ((j + r()) * 30) * Math.PI / 180;
    }
    let H = h + hueTurn(h, (L > .6 ? 70 : 250) * Math.PI / 180) * .875 * Math.abs(L - .6);
    let z = r() ** e;
    let C = maxChroma(L, H) * (z < .15 ? z / 3 : .05 + .95 * ((z - .15) / .85) ** .5);
    return [L, C * Math.cos(H), C * Math.sin(H), h];
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

const labDistance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

const palette = memo((key, n, color, lab) => {
    let r = seedrandom(key), colors = [], base = lab && lab.split(' ').map(Number);
    if (base) base.push(Math.atan2(base[2], base[1]));
    if (r() < .75 || base) {
        let e = lerp(r(), .5, 1.2), hues = base && Math.hypot(base[1], base[2]) > .02 ? [base[3]] : [];
        let w = r() < .2 ? .3 + .3 * r() : 1, lo = r() * (1 - w), ground;
        for (let k = 0; k < 8; ++k) {
            let g = r(), t = g < .6 ? .85 + .15 * r() : g < .72 ? .05 * r() : .3 + .5 * r();
            let [L, a, b, h] = paletteAnchor(r, hues, .3, lo + t * w);
            let tint = L > .85 || L < .3 ? .35 * r() : .3 + .4 * r();
            ground = [L, a * tint, b * tint, h];
            if (!base || labDistance(ground, base) >= .3) break;
        }
        colors.push(ground);
        hues.push(ground[3]);
        if (base) colors.push(base);
        while (colors.length < n) {
            let best, far = -1;
            for (let k = 0; k < 8 && (colors.length < 2 || far < .1); ++k) {
                let c = paletteAnchor(r, hues, e, lo + r() * w);
                let d = Math.min(...colors.map(o => labDistance(o, c)));
                if (Math.hypot(c[1], c[2]) < .03 && c[0] > .35 && c[0] < .85) d /= 2;
                if (d > far) best = c, far = d;
            }
            colors.push(best);
            hues.push(best[3]);
        }
        colors = colors.slice(0, n).map(([L, a, b]) => [L, Math.hypot(a, b), Math.atan2(b, a)]);
    } else {
        let anchors;
        r = seedrandom(key);
        for (let i = 0; i < 24; ++i) {
            anchors = [0, 0, 0].map(() => paletteAnchor(r));
            let five = samplePalette(anchors, 5);
            if (five.every((c, k) => !k || colorDistance(c, five[k - 1]) >= .08)
                && colorDistance(five[0], five[4]) >= .25) break;
        }
        colors = samplePalette(anchors, n);
    }
    return colors.map(([L, C, h], i) => base && i == 1 ? color :
        `oklch(${+L.toFixed(3)} ${+C.toFixed(3)} ${+((h * 180 / Math.PI + 360) % 360).toFixed(1)})`);
});

Function.palette = (_, { seed, rules, host }) => (...args) => {
    let n = 5, color = '', lab = '';
    for (let arg of args) {
        if (/[a-z#]/i.test(arg)) color = String(arg).trim(); else n = arg;
    }
    if (color) {
        let read = rules.colors ??= new Map();
        if (!read.has(color)) {
            read.set(color, host?.getRgbaColor?.(color, 'oklab')?.slice(0, 3).map(v => v.toFixed(2)).join(' ') || '');
        }
        lab = read.get(color);
        if (!lab) rules.warn(`unknown color ${color}`), color = '';
    }
    return [...palette('palette:' + seed, ~~clamp(calc(n), 1, 256), color, lab)];
};


Function.cycle = () => (...args) => {
    let separator = args.length == 1 ? ' ' : ',';
    let list = parseValueGroup(args.join(separator), { symbol: separator });
    return list.map((_, i) => list.slice(i).concat(list.slice(0, i)).join(separator));
};

Function.mirror = createMirror(true);

Function.Mirror = createMirror(false);

Function.code = () => (...args) => args.map(code => String.fromCharCode(code));

const shapePolygon = memo((input, seed) => {
    if (input.trim() == 'circle') return 'ellipse(50% 50%)';
    return generateShape(input, { seed }).clip;
});

const shaped = compose => (_, { seed, rules } = {}) => (...args) => {
    let input = args.join(',');
    shapeWarnings(input).forEach(m => rules?.warn(m));
    return compose(input, seed);
};

Function.shape = shaped(shapePolygon);

Function.plot = createPlot(false);
Function.Plot = createPlot(true);
for (let kind of ['scatter', 'hex', 'grid', 'penrose']) {
    Function.plot[kind] = createPlot(false, kind);
    Function.Plot[kind] = createPlot(true, kind);
}

Function.tile = createPlot(false, 'slice', true);
Function.tile.slice = Function.tile;
for (let kind of ['voronoi', 'delaunay', 'hex', 'triangle', 'grid', 'circle', 'cube', 'penrose']) {
    Function.tile[kind] = createPlot(false, kind, true);
}
Function.tile.x = tileAxis(0);
Function.tile.y = tileAxis(1);
Function.tile.xy = cell => () => cellTiles.get(cell)?.origin ?? '';
Function.tile.k = cell => () => cellTiles.get(cell)?.kind ?? '';
Function.tile.r = cell => () => cellTiles.get(cell)?.r ?? '';

const arcPath = memo((...args) => {
    let c = parseShapeCommands(args.join(','));
    let [rx, ry = rx] = spaced(c.r ?? '0').map(v => calc(v));
    let [cx, cy = cx] = spaced(c.move ?? '0').map(v => calc(v));
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

Function.invert = () => transformPath(0, 1, 1, 0);

Function.flipH = () => transformPath(-1, 0, 0, 1);

Function.flipV = () => transformPath(1, 0, 0, -1);

Function.flip = () => transformPath(-1, 0, 0, -1);

Function.reverse = () => (...args) => {
    let { valid, commands } = parseSvgPath(args.join(','));
    if (!valid) return args.reverse();
    let list = commands.map(({ name, value }) => name + value.join(' '));
    let head = /^[ml]/i.test(list[0]) ? list.shift() : '';
    let tail = /^z$/i.test(list[list.length - 1]) ? list.pop() : '';
    return [head, ...list.reverse(), tail].filter(Boolean).join(' ');
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

Function['svg-polygon'] = shaped(composeSvgPolygonUrl);

Function.linearGradient = lazy((cell, env, position, ...args) => generateSvgGradient('linearGradient', args));

Function.radialGradient = lazy((cell, env, position, ...args) => generateSvgGradient('radialGradient', args));

Function.doodle = Function.shaders = Function.pattern = Function.scene = () => {};

Function.once = lazy((cell, { context }, position, ...args) => {
    let counter = 'once-counter' + position;
    return context[counter] ??= args.map(input => getValue(input())).join(',');
});

Function.raw = (cell, { rules }) => (...args) => {
    let raw = args.join(',');
    let id = placeholderId(raw);
    if (id && rules.doodles[id]) {
        return `<css-doodle>${rules.doodles[id].doodle}</css-doodle>`
    }
    if (raw.startsWith('url("data:image/svg+xml;utf8')) {
        try {
            return raw.replace(/url\("data:image\/svg\+xml;utf8,([^"]*)"\)(,\s*)?/g, (_, svg) => decodeURIComponent(svg));
        } catch (e) {}
    }
    return raw;
};

// the component loads the collected names
Function['google-font'] = (cell, { rules }) => (name = '') => {
    rules.addFont(name);
    return name && `"${name.split(':')[0]}"`;
};

Function.id = ({ id }) => () => id;

// @x and @X: the cell's column and the grid's; @xX and @Xx: the way along from either end, eased
for (let [k, v] of [['i', 'count'], ['x', 'x'], ['y', 'y'], ['z', 'z']]) {
    let K = k.toUpperCase();
    Function[k] = c => calcWith(c[v]);
    Function[K] = c => calcWith(c.grid[v]);
    if (k === 'z') break;
    Function[k + K] = c => calcWithEasing(c[v] / c.grid[v]);
    Function[K + k] = c => calcWithEasing((c.grid[v] - c[v] + 1) / c.grid[v]);
}

for (let name of ['dx', 'dy', 'dr', 'dc', 'dm', 'da', 'db']) {
    Function[name] = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid)[name]);
}

for (let [name, u] of Object.entries({ t: utime, T: UTime, uw: uwidth, uh: uheight, ux: umousex, uy: umousey })) {
    Function[name] = () => calcWith(`var(${u})`);
}

Function.ts = () => calcWith(`calc(var(${utime}) / 1000)`);
Function.TS = () => calcWith(`calc(var(${UTime}) / 1000)`);

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
        : () => (...args) => tidyNumber(args.some(n => RE_LIVE.test(n))
            ? calc(`${name}(${args})`, 0, 1)
            : member(...args.map(n => calc(n))));
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
