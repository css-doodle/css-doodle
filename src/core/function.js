import parseValueGroup from '../parser/parse-value-group.js';
import parseSvg from '../parser/parse-svg.js';
import parseSvgPath from '../parser/parse-svg-path.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import parseShapeCommands from '../parser/parse-shape-commands.js';
import parseDirection from '../parser/parse-direction.js';

import generateSvg from '../generator/svg.js';
import generateShape from '../generator/shapes.js';
import generateSvgGradient from '../generator/svg-gradient.js';

import Noise from '../lib/noise.js';
import calc from './calc.js';
import { memo } from '../lib/cache.js';

import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { createSvgUrl, normalizeSvg } from '../lib/svg.js';
import { sequence, expand, byUnit, byCharcode, getNamedArguments } from './arguments.js';
import { cellMetrics } from '../lib/cell.js';
import { isLetter, isNil, isEmpty, getValue } from '../lib/type.js';
import { addAlias, lazy } from '../lib/fn.js';
import { placeholderId } from '../lib/placeholder.js';
import { lerp, clamp, tidyNumber } from '../lib/math.js';
import { last } from '../lib/list.js';
import { getEasingFunction } from './easing.js';
import { css } from '../lib/tagged-template.js';

const RE_OP_PREFIX = /^[\+\*\-\/%][\-\.\d\s]/;
const RE_OP_SUFFIX = /[\+\*\-\/%]$/;
const RE_VAR = /var\(/;
const RE_CALC = /^calc\(/;
const RE_LETTER = /^[a-zA-Z]/;

const MAX_SEQUENCE = 65536;

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

function compute(op, a, b) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        default: return 0;
    }
}

// an operator argument ('*10', '%360deg', '-.5') parses once; computing
// against a base — which runs per cell and per sequence iteration — is
// then plain arithmetic
const operations = new Map();

function parseOperation(input) {
    let v = (typeof input === 'string') ? input : String(input);
    let parsed = operations.get(v);
    if (parsed === undefined) {
        let prefix = RE_OP_PREFIX.test(v);
        let suffix = !prefix && RE_OP_SUFFIX.test(v);
        let op = '';
        let rest = v;
        if (prefix || suffix) {
            op = prefix ? v[0] : v.slice(-1);
            rest = (prefix ? v.slice(1) : v.slice(0, -1)).trim();
        }
        let { unit = '', value } = parseCompoundValue(rest || 0);
        parsed = { op, prefix, value, unit };
        if (operations.size >= 512) {
            operations.clear();
        }
        operations.set(v, parsed);
    }
    return parsed;
}

function calcValue(base, v) {
    if (isEmpty(v) || isEmpty(base)) {
        return [];
    }
    let { op, prefix, value, unit } = parseOperation(v);
    if (op) {
        // prefix op: base comes first; suffix op: base comes last
        let [a, b] = prefix ? [base, value] : [value, base];
        if (typeof base === 'string' && RE_VAR.test(base)) {
            let expr = (op === '%') ? `mod(${a}, ${b})` : `${a} ${op} ${b}`;
            return [`calc(${expr})`, unit];
        }
        return [compute(op, Number(a), Number(b)), unit];
    }
    return [(Number(base) + (Number(value) || 0)), unit];
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
            let easing = getEasingFunction(head);
            return calcWith(easing(t))(...args);
        }
        let _args = [].concat(head, args).filter(n => n !== '');
        return calcWith(t)(..._args);
    }
}

function map2d(value, min, max, amp = 1) {
    let v = Math.sqrt(2 / 4) * amp;
    let normalized = (value + v) / (2 * v);
    normalized = clamp(normalized, 0, 1);
    return lerp(normalized, min * amp, max * amp);
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
        let count = getValue(input());
        let evaluated = count;
        // Anything but plain numbers and 2x3/1-5 range forms goes through calc
        if (/\D/.test(count) && !/\d+[x-]\d+/.test(count)) {
            evaluated = calc(count);
            if (evaluated === 0) {
                evaluated = count;
            }
        }
        let signature = ++seqUid;
        let run = actions.length === 1
            ? (n, x, y, max, X, Y, index) =>
                getValue(actions[0](n, x, y, max, X, Y, index, signature))
            : (n, x, y, max, X, Y, index) => actions.map(action =>
                    getValue(action(n, x, y, max, X, Y, index, signature))).join(',');
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

// @plot / @Plot: nth point (or all points) of a generated shape;
// `unit` keeps units on the output values (the @Plot variant)
function createPlot(unit) {
    // the last shape stays around: a sequence calls this once per item
    // with the same commands, and generateShape's key is a long string
    let lastCommands, lastMax, lastResult;
    return ({ count, grid }, { extra }) => {
        let e = last(extra) || [];
        return (...args) => {
            let commands = args.join(',');
            let idx = e[SEQ.n] ?? count;
            let max = e[SEQ.max] ?? grid.count;
            if (commands !== lastCommands || max !== lastMax) {
                lastCommands = commands;
                lastMax = max;
                lastResult = generateShape(commands, {min: 1, max: MAX_SEQUENCE, count: max, unit}, rules => {
                    delete rules['fill'];
                    delete rules['fill-rule'];
                    delete rules['frame'];
                    if (rules.split || rules.points) {
                        rules.hasPoints = true;
                    } else {
                        rules.points = max;
                    }
                    if (unit) {
                        rules.unit = rules.unit || 'none';
                    }
                    return rules;
                });
            }
            let { points, rules } = lastResult;
            return rules.hasPoints ? points : points[idx - 1];
        };
    };
}

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

// fn picks from the args by counter position; `random` shuffles the args
// once per position, `upstream` reads the outer composition's sequence
// context (the uppercase variants)
function createPick(name, fn, random = false, upstream = false) {
    return (cell, { context, extra, upextra, shuffle }, position) => {
        let lastExtra = upstream
            ? last(upextra.length ? upextra : extra)
            : last(extra);
        let sig = lastExtra ? last(lastExtra) : '';
        let prefix = upstream ? name.toUpperCase() : name;
        let suffix = position + sig;
        let counter = `${prefix}-counter${suffix}`;
        let valuesKey = `${prefix}-values${suffix}`;

        return expand((...args) => {
            if (!context[counter]) context[counter] = 0;
            context[counter] += 1;
            let source = args;
            if (random) {
                if (!context[valuesKey]) {
                    context[valuesKey] = shuffle(args || []);
                }
                source = context[valuesKey];
            }
            let max = args.length;
            let idx = lastExtra && lastExtra[SEQ.index];
            idx ??= context[counter];
            let pos = (idx - 1) % max;
            let value = fn(source, pos, max);
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
        // a leading relative moveto is absolute as well
        let first = commands[0];
        let [ox = 0, oy = 0] = /^m$/i.test(first.name) ? first.value : [];
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

const flipH_path = transformPath(-1, 0, 0, 1);
const flipV_path = transformPath(1, 0, 0, -1);
const flip_path = transformPath(-1, 0, 0, -1);
const invertPath = transformPath(0, 1, 1, 0);

function tryDecode(raw, decode) {
    let cut = raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")'));
    try {
        return decode(cut);
    } catch (e) {
        return raw;
    }
}

// the url is memoized, so the warnings travel with it to be reported per call
const composeSvgUrl = memo('svg-function', value => {
    let warnings = [];
    if (!value.startsWith('<')) {
        value = generateSvg(parseSvg(value), message => warnings.push(message));
    }
    return { url: createSvgUrl(normalizeSvg(value)), warnings };
});

const composeSvgPolygonUrl = memo('svg-polygon-function', commands => {
    let { rules, points } = generateShape(commands, {min: 3, max: MAX_SEQUENCE}, rules => {
        delete rules.frame;
        rules['unit'] = 'none';
        rules['stroke-width'] ??= .01;
        rules['stroke'] ??= 'currentColor';
        rules['fill'] ??= 'none';
        return rules;
    });
    let style = `points: ${points};`;
    let props = '';
    let p = rules.padding ?? Number(rules['stroke-width']) / 2;
    for (let name of Object.keys(rules)) {
        if (/^(stroke|fill|clip|marker|mask|animate|draw)/.test(name)) {
            props += `${name}: ${rules[name]};`
        }
    };
    let parsed = parseSvg(css`
    viewBox: -1 -1 2 2 p ${p};
    polygon {
      ${props} ${style}
    }
  `);
    return createSvgUrl(generateSvg(parsed));
});

const composeSvgPatternUrl = memo('svg-pattern-function', value => {
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

Function.p = (_, { context, pick }) => {
    return expand((...args) => {
        if (!args.length) {
            args = context.lastPickArgs || [];
        }
        let picked = pick(args);
        context.lastPickArgs = args;
        return pushStack(context, 'lastPick', picked);
    });
};

Function.P = (_, { context, pick }, position) => {
    let counter = 'P-counter' + position;
    return expand((...args) => {
        let normal = true;
        if (!args.length) {
            args = context.lastPickArgs || [];
            normal = false;
        }
        let last = lastOf(context.lastPick);
        if (normal) {
            if (!context[counter]) {
                context[counter] = {};
            }
            last = context[counter].lastPick;
        }
        context.lastPickArgs = args;
        if (args.length > 1) {
            let i = args.findIndex(n => n === last);
            if (i !== -1) {
                args = args.filter((_, j) => j !== i);
            }
        }
        let picked = pick(args);
        if (normal) {
            context[counter].lastPick = picked;
        }
        return pushStack(context, 'lastPick', picked);
    });
};

Function.pn = createPick('pn', (args, pos) => args[pos]);

Function.PN = createPick('pn', (args, pos) => args[pos], false, true);

Function.pnr = createPick('pnr', (args, pos, max) => args[max - pos - 1]);

Function.PNR = createPick('pnr', (args, pos, max) => args[max - pos - 1], false, true);

Function.pd = createPick('pd', (args, pos) => args[pos], true);

Function.PD = createPick('pd', (args, pos) => args[pos], true, true);

Function.lp = (_, { context }) => {
    return (n = 1) => {
        return lastOf(context.lastPick, n);
    };
};

Function.r = (_, { context, rand }) => {
    return (...args) => {
        let transform = (args.length && args.every(isLetter))
            ? byCharcode
            : byUnit;
        let value = transform(rand)(...args);
        return pushStack(context, 'lastRand', value);
    };
};

Function.ri = (_, { context, rand }) => {
    return (...args) => {
        let transform = args.length && args.every(isLetter)
            ? byCharcode
            : byUnit;
        let randInt = (...args) => Math.round(rand(...args));
        let value = transform(randInt)(...args);
        return pushStack(context, 'lastRand', value);
    }
};

Function.rn = ({ x, y, grid }, { context, extra, random }, position) => {
    let counter = 'noise-2d' + position;
    let counterX = counter + 'offset-x';
    let counterY = counter + 'offset-y';
    let e = last(extra) || [];
    let [nx, ny, NX, NY] = [e[SEQ.x], e[SEQ.y], e[SEQ.X], e[SEQ.Y]];
    let isSeqContext = (e[SEQ.n] && e[SEQ.max]);
    return (...args) => {
        let {from = 0, to = from, frequency = 1, scale = 1, octave = 1} = getNamedArguments(args, [
            'from', 'to', 'frequency', 'scale', 'octave'
        ]);

        frequency = clamp(frequency, 0, Infinity);
        scale = clamp(scale, 0, Infinity);
        octave = clamp(octave, 1, 100);

        if (args.length == 1) [from, to] = [0, from];
        if (!context[counter]) context[counter] = new Noise(random);
        if (!context[counterX]) context[counterX] = random();
        if (!context[counterY]) context[counterY] = random();

        let transform = (isLetter(from) && isLetter(to)) ? byCharcode : byUnit;
        let noise2d = context[counter];
        let offsetX = context[counterX];
        let offsetY = context[counterY];
        let _x = (isSeqContext ? ((nx - 1) / NX) : ((x - 1) / grid.x)) + offsetX;
        let _y = (isSeqContext ? ((ny - 1) / NY) : ((y - 1) / grid.y)) + offsetY;

        // 1-dimensional - use offset to avoid x=0 degenerate case
        if (NX <= 1 || grid.x <= 1) _x = offsetX + 0.5;
        if (NY <= 1 || grid.y <= 1) _y = offsetY + 0.5;

        // 1x1
        if (_x == 0 && _y == 0) {
            _x = offsetX;
            _y = offsetY;
        }

        let t = noise2d.noise(_x * frequency, _y * frequency, 0) * scale;

        for (let i = 1; i < octave; ++i) {
            let i2 = i * 2;
            t += noise2d.noise(_x * frequency * i2, _y * frequency * i2, 0) * (scale / i2);
        }
        let fn = transform((from, to) => map2d(t, from, to, scale));
        return pushStack(context, 'lastRand', fn(from, to));
    };
};

Function.lr = (_, { context }) => {
    return (n = 1) => {
        return lastOf(context.lastRand, n);
    };
};

Function.match = ({ x, y, z, count, grid }, { extra }) => {
    let e = last(extra) || [];
    let variables = {
        x, y, z, i: count, I: grid.count, X: grid.x, Y: grid.y, Z: grid.z,
        ...cellMetrics(x, y, grid),
    };
    if (!isNil(e[SEQ.n])) variables.n = e[SEQ.n];
    if (!isNil(e[SEQ.x])) variables.nx = e[SEQ.x];
    if (!isNil(e[SEQ.y])) variables.ny = e[SEQ.y];
    if (!isNil(e[SEQ.max])) variables.N = e[SEQ.max];
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
            if (!!calc(expr, variables)) {
                return pass;
            }
        }
    }
};

Function.calc = () => {
    return (value = '', context) => {
        return tidyNumber(calc(value, context));
    }
};

Function.hex = () => {
    return (value = '') => {
        let n = parseInt(value);
        return Number.isNaN(n) ? value : n.toString(16);
    };
};

Function.var = () => {
    return (value = '') => `var(${value})`;
};

Function.stripe = () => {
    return (...input) => {
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
        let defaultSize = customSizes.length
            ? `(100% - ${customSizes.join(' - ')}) / ${defaultCount}`
            : `100% / ${max}`
        let prev;
        return pairs.map(([color, size], i) => {
            if (customSizes.length) {
                let prefix = prev ? (prev + ' + ') : '';
                prev = prefix + (size !== undefined ? size : defaultSize);
                return `${color} 0 calc(${ prev })`
            }
            return `${colors[i]} 0 ${100 / max * (i + 1)}%`
        })
        .join(',');
    }
};

// list — argument list transforms

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

Function.shape = () => {
    return memo('shape-function', (...args) => {
        let commands = args.join(',');
        let { points } = generateShape(commands);
        return `polygon(${points.join(',')})`;
    });
};

Function.plot = createPlot(false);

Function.Plot = createPlot(true);

Function.arc = () => {
    return memo('arc-function', (...args) => {
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
            return `M ${point(from)} ${arc} 1 ${dir} ${point(from + sweep / 2)} ${arc} 1 ${dir} ${point(from)}`;
        }
        return `M ${point(from)} ${arc} ${Math.abs(sweep) > 180 ? 1 : 0} ${dir} ${point(from + sweep)}`;
    });
};

Function.invert = () => {
    return invertPath;
};

Function.flipH = () => {
    return flipH_path;
};

Function.flipV = () => {
    return flipV_path;
};

Function.flip = () => {
    return flip_path;
};

Function.reverse = () => {
    return (...args) => {
        let { valid, commands } = parseSvgPath(args.join(','));
        if (!valid) return args.reverse();
        let list = commands.map(({ name, value }) => name + value.join(' '));
        let head = /^m/i.test(list[0]) ? list.shift() : '';
        let tail = /^z$/i.test(list[list.length - 1]) ? list.pop() : '';
        return [head, ...list.reverse(), tail].filter(Boolean).join(' ');
    }
};

Function.svg = lazy((_, env, position, ...args) => {
    let value = args.map(input => getValue(input())).join(',');
    let { url, warnings } = composeSvgUrl(value);
    for (let message of warnings) {
        env.rules.warn(message);
    }
    return url;
});

Function['svg-filter'] = lazy((_, env, position, ...args) => {
    let values = args.map(input => getValue(input()));
    let value = values.join(',');
    let id = env.rules.nextId('filter');
    // shorthand
    if (values.every(n => /^[\-\d.]/.test(n) || (/^(\w+)/.test(n) && !/[{}<>]/.test(n)))) {
        let { frequency, scale, octave, seed = env.seed, blur, erode, dilate } = getNamedArguments(values, [
            'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
        ]);
        value = css`x: -20%; y: -20%; width: 140%; height: 140%;`;
        if (!isNil(dilate)) {
            value += css`feMorphology { operator: dilate; radius: ${dilate}}`
        }
        if (!isNil(erode)) {
            value += css`feMorphology { operator: erode; radius: ${erode}}`
        }
        if (!isNil(blur)) {
            value += css`feGaussianBlur { stdDeviation: ${blur}}`
        }
        if (!isNil(frequency)) {
            let [bx, by = bx] = parseValueGroup(frequency);
            octave = octave ? `numOctaves: ${octave};` : '';
            value += css`feTurbulence { type: fractalNoise; baseFrequency: ${bx} ${by}; seed: ${seed}; ${octave}}`;
            if (scale) {
                value += css`feDisplacementMap { in: SourceGraphic; scale: ${scale}}`;
            }
        }
    }
    // new svg syntax
    if (!value.startsWith('<')) {
        let parsed = parseSvg(value, {
            type: 'block',
            name: 'filter'
        });
        value = generateSvg(parsed, message => env.rules.warn(message));
    }
    let svg = normalizeSvg(value).replace(
        /<filter([\s>])/,
        `<filter id="${ id }"$1`
    );
    if (env.rules?.filters) {
        env.rules.filters[id] = svg;
        return `url(#${ id })`;
    }
    return createSvgUrl(svg, id);
});

Function['svg-pattern'] = lazy((_, env, position, ...args) => {
    let value = args.map(input => getValue(input())).join(',');
    return composeSvgPatternUrl(value);
});

Function['svg-polygon'] = lazy((cell, env, position, ...args) => {
    let commands = args.map(input => getValue(input())).join(',');
    return composeSvgPolygonUrl(commands);
});

Function.linearGradient = lazy((cell, env, position, ...args) => generateSvgGradient('linearGradient', args));

Function.radialGradient = lazy((cell, env, position, ...args) => generateSvgGradient('radialGradient', args));

Function.doodle = Function.shaders = Function.pattern = () => {
    return (...args) => args.join(',');
};

Function.once = lazy((cell, { context }, position, ...args) => {
    let counter = 'once-counter' + position;
    return context[counter] ??= args.map(input => getValue(input())).join(',');
});

Function.raw = (cell, { rules }) => {
    return (...args) => {
        let raw = args.join(',');
        let id = placeholderId(raw);
        if (id && rules.doodles && rules.doodles[id]) {
            return `<css-doodle>${rules.doodles[id].doodle}</css-doodle>`
        }
        if (raw.startsWith('url("data:image/svg+xml;utf8')) {
            return tryDecode(raw, decodeURIComponent);
        }
        if (raw.startsWith('url("data:image/svg+xml;base64')) {
            return tryDecode(raw, atob);
        }
        // future forms
        if (raw.startsWith('url("data:image/png;base64')) {
            return `<img src="${raw}" alt="" />`;
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

Function.dx = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).dx);
Function.dy = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).dy);
Function.dr = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).dr);
Function.dc = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).dc);
Function.dm = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).dm);
Function.da = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).da);
Function.db = ({ x, y, grid }) => calcWith(cellMetrics(x, y, grid).db);

Function.ut = () => calcWith(`var(${utime})`);
Function.ts = () => calcWith(`calc(var(${utime}) / 1000)`);

Function.UT = () => calcWith(`var(${UTime})`);
Function.TS = () => calcWith(`calc(var(${UTime}) / 1000)`);

Function.uw = () => calcWith(`var(${uwidth})`);
Function.uh = () => calcWith(`var(${uheight})`);

Function.ux = () => calcWith(`var(${umousex})`);
Function.uy = () => calcWith(`var(${umousey})`);

/**
 * expose JS Math functions with css-doodle calc/value semantics
 */
export const MathFunc = Object.create(null);

for (let name of Object.getOwnPropertyNames(Math)) {
    MathFunc[name] = () => (...args) => {
        if (typeof Math[name] === 'number') {
            return tidyNumber(Math[name]);
        }
        args = args.map(n => calc(n));
        return tidyNumber(Math[name](...args));
    }
}

export const alias = {

    'index': 'i',
    'col': 'x',
    'row': 'y',
    'depth': 'z',
    'rand': 'r',
    'pick': 'p',
    'R': 'rn',
    'T': 'UT',
    't': 'ut',

    // error prone
    'stripes': 'stripe',
    'strip': 'stripe',
    'patern': 'pattern',
    'flipv': 'flipV',
    'fliph': 'flipH',

    // legacy names, keep them before 1.0
    'filter': 'svg-filter',
    'multiple': 'm',
    'repeat': 'rep',
    'ms': 'M',
    'size': 'I',
    'Svg': 'svg',
    'pl': 'pn',
    'pr': 'pnr',
    'PL': 'PN',
    'PR': 'PNR',
    'pick-n': 'pn',
    'pick-d': 'pd',
    'offset': 'plot',
    'point': 'plot',
    'unicode': 'code'
};

export default addAlias(Function, alias);
