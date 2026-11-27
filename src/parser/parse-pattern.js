import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import { parseBody, readRaw, readValue, namesOf, rowsOf, callOf, readMatch } from './parse-body.js';

// `k*3 {`, `i*2 j*1-n {`: each loop's name and count, a name glued from words, digits and `_`
export function loopHeads(head) {
    let parts = [], loops = [], spaced = false;
    for (let t of head) {
        let last = parts.at(-1), glue = t.isWord() || t.isNumber() || t.isSymbol('_');
        if (t.isSpace()) spaced = true;
        else if (glue && last?.glue && !spaced) last.value += t.value;
        else parts.push({ value: t.value, glue, name: glue && !t.isNumber(), spaced }), spaced = false;
    }
    for (let k = 0; k < parts.length; k += 3) {
        let [word, star, count, dash, end] = parts.slice(k, k + 5);
        if (k && !word.spaced || !word.name || star?.value !== '*' || !count?.glue) return [];
        let range = dash?.value === '-' && end?.glue && !dash.spaced && !end.spaced;
        if (range) k += 2;
        loops.push([word.value, `${count.value}${range ? '-' + end.value : ''}`]);
    }
    return loops;
}

function readMatchBlocks(iter, head) {
    let name = textOf(head);
    if (/^texture\w*$/.test(name)) {
        return [{ type: 'texture', name, value: textOf(readRaw(iter)) }];
    }
    let match = readMatch(iter, head, pattern);
    if (match) return [match];
    let loops = loopHeads(head).map(([word, count]) => ({ type: 'block', name: 'repeat', args: [`${count} as ${word}`] }));
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
