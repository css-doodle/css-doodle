import calc, { defaultContext } from './calc.js';
import parseLinearExpr from '../parser/parse-linear-expr.js';
import { addAlias } from '../lib/fn.js';
import { cellMetrics } from '../lib/cell.js';

function odd(n) {
    return n % 2 !== 0;
}

function even(n) {
    return n % 2 === 0;
}

// one nth-style expression against a value: even/odd parity or an+b
// with n from 0; undefined when the expression does not parse
function compare(rule, value) {
    if (rule === 'even') return even(value);
    if (rule === 'odd') return odd(value);
    let { a, b, error } = parseLinearExpr(rule);
    if (error) return;
    if (a === 0) return value === b;
    let n = (value - b) / a;
    return n >= 0 && Number.isInteger(n);
}

function matchAny(value, exprs, env) {
    return exprs.some(expr => {
        let matched = compare(expr, value);
        if (matched === undefined) env.rules.warn(`invalid an+b expression ${expr}`);
        return matched;
    });
}

// the cell variables of a calc expression; selectors draw random()
// from the main stream, @match from the math stream of calc
export function calcContext({ x, y, z, count, grid }, random) {
    // plain stores: a literal with __proto__ and a spread is several times slower
    let context = Object.create(defaultContext);
    context.x = x; context.X = grid.x;
    context.y = y; context.Y = grid.y;
    context.z = z; context.Z = grid.z;
    context.i = count; context.I = grid.count;
    Object.assign(context, cellMetrics(x, y, grid));
    if (random) context.random = random;
    return context;
}

function randomCell({ count, grid }, { context, random }, position, n) {
    if (n >= 1) {
        let key = 'random-cells' + position;
        let cells = context[key] ??= randomN(grid.count, n, random);
        return cells.includes(count);
    }
    return random() < n;
}

// n distinct integers from 1..N, partial Fisher-Yates over a sparse map
function randomN(N, n, random) {
    if (n > N) n = N;
    const map = new Map();
    const result = [];
    for (let i = 0; i < n; i++) {
        const r = Math.floor(random() * (N - i)) + 1;
        const x = map.get(r) ?? r;
        const y = map.get(N - i) ?? (N - i);
        map.set(r, y);
        result.push(x);
    }
    return result;
}

const Selector = Object.create(null);

Selector.at = ({ x, y }) => {
    return (x1, y1) => (x == x1 && y == y1);
};

Selector.nth = ({ count }, env) => {
    return (...exprs) => matchAny(count, exprs, env);
};

Selector.row = ({ y }, env) => {
    return (...exprs) => matchAny(y, exprs, env);
};

Selector.col = ({ x }, env) => {
    return (...exprs) => matchAny(x, exprs, env);
};

Selector.depth = ({ z }, env) => {
    return (...exprs) => matchAny(z, exprs, env);
};

Selector.even = ({ x, y }) => {
    return _ => odd(x + y);
};

Selector.odd = ({ x, y }) => {
    return _ => even(x + y);
};

// @random(ratio): ratio < 1 is a per-cell probability (default .5),
// ratio >= 1 a count of distinct cells; expressions are calc-ed with
// the cell variables in scope
Selector.random = (cell, env, position) => {
    return (ratio = .5) => {
        let n = Number(ratio);
        if (Number.isNaN(n)) {
            n = calc(ratio, calcContext(cell, env.random));
        }
        if (n >= cell.grid.count) return true;
        if (n <= 0) return false;
        return randomCell(cell, env, position, n);
    };
};

Selector.match = (cell, { random }) => {
    return expr => !!calc(expr, calcContext(cell, random));
};

// @cell(…): an argument is an an+b rule on the index, even/odd on the
// checkerboard, `random [n]`, or an expression; any one matching
// selects the cell.
Selector.cell = (cell, env, position) => {
    return (...args) => {
        if (!args.length) return true;
        return args.map(arg => {
            if (arg === 'even' || arg === 'odd') {
                return Selector[arg](cell)();
            }
            let matched = compare(arg, cell.count);
            if (matched !== undefined) {
                return matched;
            }
            if (arg.startsWith('random')) {
                let n = Number(arg.slice(6).trim() || .5);
                if (!Number.isNaN(n)) {
                    return randomCell(cell, env, position, n);
                }
            }
            return !!calc(arg, calcContext(cell, env.random));
        }).some(Boolean);
    };
};

export const alias = {
    x: 'col',
    y: 'row',
    z: 'depth',
};

export default addAlias(Selector, alias);
