import parseValueGroup from '../parser/parse-value-group.js';
import parseSvg from '../parser/parse-svg.js';
import parseSvgPath from '../parser/parse-svg-path.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

import generateSvg from '../generator/svg.js';
import generateShape from '../generator/shapes.js';
import generateSvgGradient from '../generator/svg-gradient.js';

import Noise from '../lib/noise.js';
import calc from './calc.js';
import { memo } from '../utils/cache.js';

import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { createSvgUrl, normalizeSvg } from '../utils/svg.js';
import { sequence, expand, byUnit, byCharcode, getNamedArguments } from './arguments.js';
import { cellId, cellMetrics } from '../utils/cell.js';
import { isLetter, isNil, isEmpty, getValue } from '../utils/type.js';
import { addAlias, uniqueId, lazy } from '../utils/fn.js';
import { lerp, clamp, tidyNumber } from '../utils/math.js';
import { last } from '../utils/list.js';
import { getEasingFunction } from './easing.js';
import { css } from '../utils/tagged-template.js';

const RE_OP_PREFIX = /^[\+\*\-\/%][\-\.\d\s]/;
const RE_OP_SUFFIX = /[\+\*\-\/%]$/;
const RE_VAR = /var\(/;
const RE_CALC = /^calc\(/;
const RE_LETTER = /^[a-zA-Z]/;

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

function computeVar(input, unit) {
    return [`calc(${input})`, unit];
}

// an operator argument ('*10', '%360deg', '-.5') parses once; computing
// against a base — which runs per cell and per sequence iteration — is
// then plain arithmetic
const operations = new Map();

function parseOperation(v) {
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
            return op === '%'
                ? computeVar(`mod(${a}, ${b})`, unit)
                : computeVar(`${a} ${op} ${b}`, unit);
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

function flipValue(num) {
    return -1 * num;
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
    return lazy((_, n, ...actions) => {
        if (!n || !actions.length) return '';
        let count = getValue(n());
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
            ? (...args) => getValue(actions[0](...args, signature))
            : (...args) => actions.map(action => {
                    return getValue(action(...args, signature))
                }).join(',');
        return sequence(evaluated, run).join(c);
    });
}

// The @n family: with no sequence tuple in scope the source token is
// echoed back as-is (a non-function return passes through applyFunc).
// Argument composition pushes an empty tuple, which is no context either.
function seq(token, make) {
    return ({ extra }) => {
        let e = last(extra);
        return (e && e.length) ? make(e) : token;
    };
}

// @plot / @Plot: nth point (or all points) of a generated shape;
// `unit` keeps units on the output values (the @Plot variant)
function createPlot(unit) {
    let lastCommands, lastMax, lastResult;
    return ({ count, extra, grid }) => {
        let e = last(extra) || [];
        return (...args) => {
            let commands = args.join(',');
            let idx = e[SEQ.n] ?? count;
            let max = e[SEQ.max] ?? grid.count;
            if (commands !== lastCommands || max !== lastMax) {
                lastCommands = commands;
                lastMax = max;
                lastResult = generateShape(commands, {min: 1, max: 65536, count: max, unit}, rules => {
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
    return ({ context, extra, upextra, position, shuffle }) => {
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

function transformPath(tr) {
    return commands => {
        let parsed = parseSvgPath(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
            let [n, v] = tr(name, value);
            return n + v.join(' ');
        }).join(' ');
    };
}

const INVERT_COMMAND = { v: 'h', V: 'H', h: 'v', H: 'V' };

const invertPath = transformPath((name, value) =>
    [INVERT_COMMAND[name] || name, value]);

const flipH_path = transformPath((name, value) =>
    (name === 'h' || name === 'H') ? [name, value.map(flipValue)] : [name, value]);

const flipV_path = transformPath((name, value) =>
    (name === 'v' || name === 'V') ? [name, value.map(flipValue)] : [name, value]);

function tryDecode(raw, decode) {
    let cut = raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")'));
    try {
        return decode(cut);
    } catch (e) {
        return raw;
    }
}

const composeSvgUrl = memo('svg-function', value => {
    if (!value.startsWith('<')) {
        value = generateSvg(parseSvg(value));
    }
    return createSvgUrl(normalizeSvg(value));
});

const composeSvgPolygonUrl = memo('svg-polygon-function', commands => {
    let { rules, points } = generateShape(commands, {min: 3, max: 65536}, rules => {
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

Function.p = ({ context, pick }) => {
    return expand((...args) => {
        if (!args.length) {
            args = context.lastPickArgs || [];
        }
        let picked = pick(args);
        context.lastPickArgs = args;
        return pushStack(context, 'lastPick', picked);
    });
};

Function.P = ({ context, pick, position }) => {
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
        // store the full pool before excluding `last`: splicing the stored
        // array in place would shrink the shared pool on every @P() call
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

Function.pl = createPick('pl', (args, pos) => args[pos]);

Function.PL = createPick('pl', (args, pos) => args[pos], false, true);

Function.pr = createPick('pr', (args, pos, max) => args[max - pos - 1]);

Function.PR = createPick('pr', (args, pos, max) => args[max - pos - 1], false, true);

Function.pd = createPick('pd', (args, pos) => args[pos], true);

Function.PD = createPick('pd', (args, pos) => args[pos], true, true);

Function.lp = ({ context }) => {
    return (n = 1) => {
        return lastOf(context.lastPick, n);
    };
};

Function.r = ({ context, rand }) => {
    return (...args) => {
        let transform = (args.length && args.every(isLetter))
            ? byCharcode
            : byUnit;
        let value = transform(rand)(...args);
        return pushStack(context, 'lastRand', value);
    };
};

Function.ri = ({ context, rand }) => {
    return (...args) => {
        let transform = args.every(isLetter)
            ? byCharcode
            : byUnit;
        let randInt = (...args) => Math.round(rand(...args));
        let value = transform(randInt)(...args);
        return pushStack(context, 'lastRand', value);
    }
};

Function.rn = ({ x, y, context, position, grid, extra, random }) => {
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

Function.lr = ({ context }) => {
    return (n = 1) => {
        return lastOf(context.lastRand, n);
    };
};

Function.match = ({ extra, x, y, z, count, grid }) => {
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
        if (args.length <= 3) {
            let [expr, pass, fail = ''] = args;
            let result = !!calc(expr, variables);
            return result ? pass : fail;
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
    return (value, context) => {
        return tidyNumber(calc(getValue(value), context));
    }
};

Function.hex = () => {
    return value => {
        let n = parseInt(getValue(value));
        return Number.isNaN(n) ? getValue(value) : n.toString(16);
    };
};

Function.var = () => {
    return value => `var(${getValue(value)})`;
};

Function.stripe = () => {
    return (...input) => {
        let colors = input.map(getValue).flat();
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
        args = args.map(n => '<' + n + '>');
        let list = [];
        let separator;
        if (args.length == 1) {
            separator = ' ';
            list = parseValueGroup(args[0], { symbol: separator });
        } else {
            separator = ',';
            list = parseValueGroup(args.map(getValue).join(separator), { symbol: separator});
        }
        list = list.map(n => n.replace(/^\<|>$/g,''));
        let size = list.length;
        let result = [];
        for (let i = 0; i < size; ++i) {
            let rotated = list.slice(i).concat(list.slice(0, i));
            result.push(rotated.join(separator));
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
    return commands => flipV_path(flipH_path(commands));
};

Function.reverse = () => {
    return (...args) => {
        let commands = args.map(getValue);
        let parsed = parseSvgPath(commands.join(','));
        if (parsed.valid) {
            let result = [];
            for (let i = parsed.commands.length - 1; i >= 0; --i) {
                let { name, value } = parsed.commands[i];
                result.push(name + value.join(' '));
            }
            return result.join(' ');
        }
        return commands.reverse();
    }
};

Function.svg = lazy((_, ...args) => {
    let value = args.map(input => getValue(input())).join(',');
    return composeSvgUrl(value);
});

Function['svg-filter'] = lazy((upstream, ...args) => {
    let values = args.map(input => getValue(input()));
    let value = values.join(',');
    let id = uniqueId('filter-');
    // shorthand
    if (values.every(n => /^[\-\d.]/.test(n) || (/^(\w+)/.test(n) && !/[{}<>]/.test(n)))) {
        let { frequency, scale, octave, seed = upstream.seed, blur, erode, dilate } = getNamedArguments(values, [
            'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
        ]);
        value = css`
      x: -20%;
      y: -20%;
      width: 140%;
      height: 140%;
    `;
        if (!isNil(dilate)) {
            value += css`
        feMorphology {
          operator: dilate;
          radius: ${dilate};
        }
      `
        }
        if (!isNil(erode)) {
            value += css`
        feMorphology {
          operator: erode;
          radius: ${erode};
        }
      `
        }
        if (!isNil(blur)) {
            value += css`
        feGaussianBlur {
          stdDeviation: ${blur};
        }
      `
        }
        if (!isNil(frequency)) {
            let [bx, by = bx] = parseValueGroup(frequency);
            octave = octave ? `numOctaves: ${octave};` : '';
            value += css`
        feTurbulence {
          type: fractalNoise;
          baseFrequency: ${bx} ${by};
          seed: ${seed};
          ${octave}
        }
      `;
            if (scale) {
                value += css`
          feDisplacementMap {
            in: SourceGraphic;
            scale: ${scale};
          }
        `;
            }
        }
    }
    // new svg syntax
    if (!value.startsWith('<')) {
        let parsed = parseSvg(value, {
            type: 'block',
            name: 'filter'
        });
        value = generateSvg(parsed);
    }
    let svg = normalizeSvg(value).replace(
        /<filter([\s>])/,
        `<filter id="${ id }"$1`
    );
    if (upstream.rules?.filters) {
        upstream.rules.filters[id] = svg;
        return `url(#${ id })`;
    }
    return createSvgUrl(svg, id);
});

Function['svg-pattern'] = lazy((_, ...args) => {
    let value = args.map(input => getValue(input())).join(',');
    return composeSvgPatternUrl(value);
});

Function['svg-polygon'] = lazy((_, ...args) => {
    let commands = args.map(input => getValue(input())).join(',');
    return composeSvgPolygonUrl(commands);
});

Function.linearGradient = lazy((_, ...args) => generateSvgGradient('linearGradient', args));

Function.radialGradient = lazy((_, ...args) => generateSvgGradient('radialGradient', args));

Function.doodle = () => {
    return (...args) => args.join(',');
};

Function.shaders = () => {
    return (...args) => args.join(',');
};

Function.pattern = () => {
    return (...args) => args.join(',');
};

Function.once = lazy(({context, extra, position}, ...args) => {
    let counter = 'once-counter' + position;
    return context[counter] ??= args.map(input => getValue(input())).join(',');
});

Function.raw = ({ rules }) => {
    return (...args) => {
        let raw = args.join(',');
        if (raw.startsWith('${doodle') && raw.endsWith('}')) {
            let key = raw.substring(2, raw.length - 1);
            let doodles = rules.doodles;
            if (doodles && doodles[key]) {
                return `<css-doodle>${doodles[key].doodle}</css-doodle>`
            }
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

Function['google-font'] = () => {
    return (name) => {
        return { value: name, gf: true };
    }
};

Function.id = ({ x, y, z }) => {
    return _ => cellId(x, y, z);
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

Function.ut = () => calcWith(`var(--${utime.name})`);
Function.ts = () => calcWith(`calc(var(--${utime.name}) / 1000)`);

Function.UT = () => calcWith(`var(--${UTime.name})`);
Function.TS = () => calcWith(`calc(var(--${UTime.name}) / 1000)`);

Function.uw = () => calcWith(`var(--${uwidth.name})`);
Function.uh = () => calcWith(`var(--${uheight.name})`);

Function.ux = () => calcWith(`var(--${umousex.name})`);
Function.uy = () => calcWith(`var(--${umousey.name})`);

/**
 * expose JS Math functions with css-doodle calc/value semantics
 */
export const MathFunc = Object.create(null);

for (let name of Object.getOwnPropertyNames(Math)) {
    MathFunc[name] = () => (...args) => {
        if (typeof Math[name] === 'number') {
            return tidyNumber(Math[name]);
        }
        args = args.map(n => calc(getValue(n)));
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
    'pn': 'pl',
    'pnr': 'pr',
    'PN': 'PL',
    'PNR': 'PR',
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
    'last-rand': 'lr',
    'last-pick': 'lp',
    'multiple': 'm',
    'multi': 'm',
    'repeat': 'rep',
    'µ': 'rep',
    'ms': 'M',
    's': 'I',
    'size': 'I',
    'sx': 'X',
    'size-x': 'X',
    'size-col': 'X',
    'max-col': 'X',
    'sy': 'Y',
    'size-y': 'Y',
    'size-row': 'Y',
    'max-row': 'Y',
    'sz': 'Z',
    'size-z': 'Z',
    'size-depth': 'Z',
    'Svg': 'svg',
    'pick-by-turn': 'pl',
    'pick-n': 'pl',
    'pick-d': 'pd',
    'offset': 'plot',
    'Offset': 'Plot',
    'point': 'plot',
    'Point': 'Plot',
    'unicode': 'code'
};

export default addAlias(Function, alias);
