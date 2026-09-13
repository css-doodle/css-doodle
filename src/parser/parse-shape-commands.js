import { scan, iterator, textOf } from './tokenizer.js';
import { parseBody } from './parse-body.js';

// commands whose leading `-` is dropped rather than applied to the value
const KEEP_NEGATIVE = ['fill-rule', 'fill'];

// `-x: sin(t)` negates the value; `-: 10` and dashed names like `--x` do not
function readShapeStatement(iter, head) {
    let negative = head.length > 1 && head[0].isSymbol('-') && !head[1].isSymbol('-');
    let name = textOf(negative ? head.slice(1) : head);
    let value = [];
    while (iter.next()) {
        let curr = iter.curr();
        let next = iter.curr(1);
        if (curr.isSymbol(';')) {
            break;
        }
        value.push(curr);
        if (!next || next.isSymbol('}')) {
            break;
        }
    }
    return [{ type: 'statement', name, value: textOf(value), negative }];
}

// declarations only: a `{` is no block here
const shape = {
    readBlocks: () => null,
    readStatement: readShapeStatement,
};

function parse(input) {
    let commands = {};
    for (let { name, value, negative } of parseBody(iterator(scan(input)), null, shape)) {
        commands[name] = (negative && value && !KEEP_NEGATIVE.includes(name))
            ? `-1 * (${value})`
            : value;
    }
    return commands;
}

export default parse;
