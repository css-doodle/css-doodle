import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import { parseBody, readRaw, readValue, namesOf, rowsOf, callOf, readMatch } from './parse-body.js';

function readMatchBlocks(iter, head) {
    let name = textOf(head);
    if (/^texture\w*$/.test(name)) {
        return [{ type: 'texture', name, value: textOf(readRaw(iter)) }];
    }
    let match = readMatch(iter, head, pattern);
    if (match) return [match];
    let copy = name.trim().match(/^(\w+)\s*\*\s*(\w+(?:-\w+)?)$/);
    if (copy) return [parseBody(iter, { type: 'block', name: 'repeat', args: [`${copy[2]} as ${copy[1]}`] }, pattern)];
    let call = callOf(head);
    if (!call) {
        readRaw(iter);
        return readTail([...head, { value: ' {}' }]);
    }
    return [parseBody(iter, { type: 'block', name: call.name, args: call.inner ? itemsOf(call.inner).map(textOf) : [] }, pattern)];
}

function readPatternStatement(iter, head) {
    return rowsOf(namesOf(head), readValue(iter), itemsOf).map(({ name, value }) => ({ type: 'statement', name, value: textOf(value) }));
}

function readTail(head) {
    return [{ type: 'text', value: textOf(head).trim() }];
}

const pattern = {
    readBlocks: readMatchBlocks,
    readStatement: readPatternStatement,
    readTail,
};

function parse(source) {
    return parseBody(iterator(scan(source, { ignoreInlineComment: true })), null, pattern);
}

export default parse;
