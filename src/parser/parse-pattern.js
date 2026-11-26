import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import { parseBody, readRaw, readValue, namesOf, rowsOf, callOf, readMatch } from './parse-body.js';

function readMatchBlocks(iter, head) {
    let name = textOf(head);
    if (/^texture\w*$/.test(name)) {
        return [{ type: 'texture', name, value: textOf(readRaw(iter)) }];
    }
    let match = readMatch(iter, head, pattern);
    if (match) return [match];
    let tokens = head.filter(t => !t.isSpace()), loops = [];
    let spaced = t => head[head.indexOf(t) - 1]?.isSpace();
    for (let k = 0; k < tokens.length; k += 3) {
        let [word, star, count, dash, end] = tokens.slice(k, k + 5);
        if (k && !spaced(word) || !word.isWord() || !star?.isSymbol('*') || !(count?.isNumber() || count?.isWord())) {
            loops = [];
            break;
        }
        let range = dash?.isSymbol('-') && (end?.isNumber() || end?.isWord()) && !spaced(dash) && !spaced(end);
        if (range) k += 2;
        loops.push({ type: 'block', name: 'repeat', args: [`${count.value}${range ? '-' + end.value : ''} as ${word.value}`] });
    }
    if (loops.length) {
        loops.reduce((a, b) => (a.value = [b], b));
        parseBody(iter, loops.at(-1), pattern);
        return [loops[0]];
    }
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
