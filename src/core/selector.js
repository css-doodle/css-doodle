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

function matchAny(value, exprs) {
    return exprs.some(expr => compare(expr, value));
}

// the variable scope for arithmetic selector expressions
function calcContext({ x, y, count, grid }, random) {
    return {
        __proto__: defaultContext,
        x, X: grid.x,
        y, Y: grid.y,
        i: count, I: grid.count,
        ...cellMetrics(x, y, grid),
        random,
    };
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

Selector.nth = ({ count }) => {
    return (...exprs) => matchAny(count, exprs);
};

Selector.y = ({ y }) => {
    return (...exprs) => matchAny(y, exprs);
};

Selector.x = ({ x }) => {
    return (...exprs) => matchAny(x, exprs);
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

Selector.cond = (cell, { random }) => {
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
    col: 'x',
    row: 'y',
    match: 'cond',
};

export default addAlias(Selector, alias);
