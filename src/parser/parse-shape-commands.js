import { scan, iterator, textOf } from './tokenizer.js';
import { parseBody, readValue, readRaw } from './parse-body.js';

const GROUPS = ['union', 'subtract', 'intersect'];

// `-x: sin(t)` negates the value; `-: 10` and dashed names like `--x` do not
function readShapeStatement(iter, head) {
    let negative = head.length > 1 && head[0].isSymbol('-') && !head[1].isSymbol('-');
    let name = textOf(negative ? head.slice(1) : head);
    return [{ type: 'statement', name, value: textOf(readValue(iter)), negative }];
}

function copies(head) {
    let [, name, x, y = 1] = head.match(/^([^]*?)\s*\*\s*(\d+)(?:\s*x\s*(\d+))?$/) || [, head, 0];
    let out = [];
    for (let j = 1; j <= y; ++j) for (let i = 1; i <= x; ++i) {
        out.push({ n: String(out.length + 1), N: String(x * y), nx: String(i), ny: String(j) });
    }
    return [name, x && out];
}

function repeat(body, list) {
    return list ? list.map(v => body + ';' + Object.entries(v).map(e => e.join(':')).join(';')) : [body];
}

function readBlock(iter, text) {
    let [head, list] = copies(text);
    if (!GROUPS.includes(head)) return repeat(head + ';' + textOf(readRaw(iter)), list);
    let pending = '', open = 0;
    let glue = head => {
        for (let t of head) open += t.isSymbol('(') - t.isSymbol(')');
        pending += textOf(head);
        let text = pending.trim();
        if (open < 1) pending = '';
        return open < 1 && text;
    };
    let { value } = parseBody(iter, {}, {
        readStatement: readShapeStatement,
        readBlocks: (iter, head) => {
            let text = glue(head);
            if (text !== false) return readBlock(iter, text);
            pending += '{' + textOf(readRaw(iter)) + '}';
            return [];
        },
        readTail: head => {
            let text = glue(head);
            if (text === false) pending += ';';
            return text ? repeat(...copies(text)) : [];
        },
    });
    let group = collect(value, head);
    return list ? list.map(v => ({ ...group, ...v })) : [group];
}

const shape = {
    readBlocks: (iter, head) => readBlock(iter, textOf(head).trim()),
    readStatement: readShapeStatement,
};

function collect(rules, op) {
    let commands = {}, items = [];
    for (let rule of rules) {
        if (rule.type !== 'statement') {
            items.push(rule);
        } else {
            let { name, value, negative } = rule;
            commands[name] = (negative && value && name !== 'fill')
                ? `-1 * (${value})`
                : value;
        }
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
