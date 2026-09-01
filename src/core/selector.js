import calc from './calc.js';
import parseLinearExpr from '../parser/parse-linear-expr.js';
import { addAlias } from '../utils/fn.js';
import { cellMetrics } from '../utils/cell.js';

function odd(n) {
    return n % 2 !== 0;
}

function even(n) {
    return n % 2 === 0;
}

function matchAny(value, exprs) {
    return exprs.some(expr => compare(expr, value).value);
}

// n >= 1 selects that many distinct cells, drawn once per call site
// (cached in `context` under `counter`); n < 1 is a per-cell probability
function randomCell(context, counter, grid, count, random, n) {
    if (n >= 1) {
        if (!context[counter]) {
            context[counter] = randomN(grid.count, n, random);
        }
        return context[counter].includes(count);
    }
    return random() < n;
}

// one nth-style expression against a value: even/odd, bare `n` matches
// all, anything else reads as an+b; with x and y given the parity rules
// switch to checkerboard mode over x+y instead
function compare(rule, value, x, y) {
    let local = x == undefined || y == undefined;
    if (rule === 'even') {
        return { value: local ? even(value) : odd(x + y) }
    }
    if (rule === 'odd') {
        return { value: local ? odd(value) : even(x + y) }
    }
    if (rule === 'n') {
        return { value: true }
    }
    let { a, b, error } = parseLinearExpr(rule);
    if (error) {
        return { value: false, error }
    }
    if (a === 0) {
        return { value: value === b }
    } else {
        let result = (value - b) / a;
        return {
            value: result >= 0 && Number.isInteger(result),
        }
    }
}

// the variable scope for arithmetic selector expressions
function calcContext({ x, y, count, grid, random }) {
    return {
        x, X: grid.x,
        y, Y: grid.y,
        i: count, I: grid.count,
        ...cellMetrics(x, y, grid),
        random,
    };
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

Selector.random = ({ random, count, x, y, grid, context, position }) => {
    let counter = 'random-cells' + position;
    return (ratio = .5) => {
        let value = Number(ratio);
        if (Number.isNaN(value)) {
            value = calc('(0 + ' + ratio + ')', calcContext({ x, y, count, grid, random }));
        }
        if (value >= grid.count) {
            return true;
        }
        if (value <= 0) {
            return false;
        }
        return randomCell(context, counter, grid, count, random, value);
    }
};

Selector.match = ({ count, grid, x, y, random }) => {
    return expr => {
        return !!calc('(' + expr + ')', calcContext({ x, y, count, grid, random }));
    }
};

Selector.cell = ({ count, grid, x, y, random, context, position }) => {
    let counter = 'random-cells' + position;
    return (...args) => {
        if (!args.length) {
            return true;
        }
        let result = args.map(arg => {
            let { value, error } = compare(arg, count, x, y);
            if (!error) {
                return value;
            }
            if (arg.startsWith('random')) {
                let num = arg.slice(6).trim();
                if (!num) {
                    return random() < 0.5;
                }
                num = Number(num);
                if (!Number.isNaN(num)) {
                    return randomCell(context, counter, grid, count, random, num);
                }
            }
            return !!calc('(' + arg + ')', calcContext({ x, y, count, grid, random }));
        });
        return result.some(Boolean);
    }
};

export default addAlias(Selector, {
    col: 'x',
    row: 'y',
});
