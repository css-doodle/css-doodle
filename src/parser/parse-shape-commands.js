import { scan, iterator, textOf } from './tokenizer.js';
import { parseBody, readValue, readRaw } from './parse-body.js';

const GROUPS = ['union', 'subtract', 'intersect', 'exclude'];

// `-x: sin(t)` negates the value; `-: 10` and dashed names like `--x` do not
function readShapeStatement(iter, head) {
    let negative = head.length > 1 && head[0].isSymbol('-') && !head[1].isSymbol('-');
    let name = textOf(negative ? head.slice(1) : head), value = textOf(readValue(iter));
    return [{ type: 'statement', name, value: negative && value && name !== 'fill' ? `-1 * (${value})` : value }];
}

function copies(head) {
    let [, name, x, y = 1] = head.match(/^([^]*?)\s*\*\s*(\d+)(?:\s*x\s*(\d+))?$/) || [, head, 0];
    let out = [];
    for (let j = 1; j <= y; ++j) for (let i = 1; i <= x; ++i) {
        out.push({ n: String(out.length + 1), N: String(x * y), nx: String(i), ny: String(j) });
    }
    return [name, x && out];
}

function copy(body, v) {
    return typeof body == 'string' ? body + ';' + Object.entries(v).map(e => e.join(':')).join(';') : { ...body, ...v };
}

function repeat(body, list) {
    return list ? list.map(v => copy(body, v)) : [body];
}

function readBlock(iter, text) {
    let [head, list] = copies(text);
    let read = iter => GROUPS.includes(head)
        ? collect(parseBody(iter, {}, { ...shape, readTail: head => repeat(...copies(textOf(head).trim())) }).value, head)
        : head + ';' + textOf(readRaw(iter));
    if (!list || !iter.curr(1)?.isSymbol('{')) return repeat(read(iter), list);
    let tokens = readRaw(iter), bodies = [], depth = 0, from;
    tokens.forEach((t, i) => {
        if (t.isSymbol('{') && !depth++) from = i + 1;
        else if (t.isSymbol('}') && !--depth) bodies.push(read(iterator(tokens.slice(from, i))));
    });
    return list.slice(0, bodies.length).map((v, i) => copy(bodies[i], v));
}

const shape = {
    readBlocks: (iter, head) => readBlock(iter, textOf(head).trim()),
    readStatement: readShapeStatement,
};

function collect(rules, op) {
    let commands = {}, items = [];
    for (let rule of rules) {
        if (rule.type !== 'statement') items.push(rule);
        else commands[rule.name] = rule.value;
    }
    if (op || items.length) {
        commands.blocks = { op: op || 'union', items };
    }
    return commands;
}

function parse(input) {
    return collect(parseBody(iterator(scan(input)), null, shape));
}

export default parse;
