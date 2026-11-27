import calc, { randomOf } from './calc.js';
import parseLinearExpr from '../parser/parse-linear-expr.js';
import { addAlias } from '../lib/fn.js';

function odd(n) {
    return n % 2 !== 0;
}

function even(n) {
    return n % 2 === 0;
}

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
        if (matched === undefined) env.rules.warn(`invalid an+b ${expr}`);
        return matched;
    });
}

function drawing(vars, random) {
    vars = vars();
    vars.random = randomOf(random);
    return vars;
}

function randomCell({ count, grid }, { context, random }, position, n) {
    if (n >= 1) {
        let key = 'random-cells' + position;
        let cells = context[key] ??= new Set(randomN(grid.count, n, random));
        return cells.has(count);
    }
    return random() < n;
}

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

Selector.at = ({ x, y }) => (x1, y1) => (x == x1 && y == y1);

for (let [name, key] of [['nth', 'count'], ['row', 'y'], ['col', 'x'], ['depth', 'z']]) {
    Selector[name] = (cell, env) => (...exprs) => matchAny(cell[key], exprs, env);
}

Selector.even = ({ x, y }) => _ => odd(x + y);

Selector.odd = ({ x, y }) => _ => even(x + y);

Selector.random = (cell, env, position) => (vars, ratio = .5) => {
    let n = Number(ratio);
    if (Number.isNaN(n)) {
        n = calc(ratio, drawing(vars, env.random));
    }
    if (n >= cell.grid.count) return true;
    if (n <= 0) return false;
    return randomCell(cell, env, position, n);
};

Selector.match = (cell, { random }) => (vars, expr) => !!calc(expr, drawing(vars, random));

Selector.cell = (cell, env, position) => (vars, ...args) => {
    if (!args.length) return true;
    return args.map((arg, i) => {
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
                return randomCell(cell, env, position + ':' + i, n);
            }
        }
        return !!calc(arg, drawing(vars, env.random));
    }).some(Boolean);
};

Selector.random.vars = Selector.match.vars = Selector.cell.vars = true;

export const alias = {
    x: 'col',
    y: 'row',
    z: 'depth',
};

export default addAlias(Selector, alias);
