import { isEmpty } from '../utils/type.js';
import { scan, iterator, textOf } from './tokenizer.js';

function parse(input, option = {symbol: ',', noSpace: false, verbose: false }) {
    let group = [];
    let skip = false;
    let tokens = [];
    let parenStack = [];
    let quoteStack = [];
    let lastGroupName = '';
    let symbolList = option.symbol || ',';
    let symbolCounter = {};
    let symbolCounterMax = {};
    let symbolsToCompare = [];

    if (isEmpty(input)) {
        return group;
    }
    if (!Array.isArray(symbolList)) {
        symbolList = [symbolList];
    }
    symbolList.forEach(item => {
        let [symbol, max = Infinity] = String(item).split(/\s+/);
        symbolCounter[symbol] = 0;
        symbolCounterMax[symbol] = max;
    });

    const allSymbols = Object.keys(symbolCounterMax);
    const iter = iterator(scan(input));
    updateSymbols();

    function updateSymbols() {
        symbolsToCompare = allSymbols.filter(s => {
            return symbolCounter[s] < symbolCounterMax[s];
        });
    }

    function isSeperator(token) {
        return option.noSpace
              ? token.isSymbol(symbolsToCompare)
              : (token.isSymbol(symbolsToCompare) || token.isSpace());
    }

    function addGroup(tokens) {
        let value = textOf(tokens);
        if (option.verbose) {
            if (lastGroupName.length || value.length) {
                group.push({ group: lastGroupName, value });
            }
        } else {
            group.push(value);
        }
    }

    while (iter.next()) {
        let { prev, curr, next }  = iter.get();
        if (curr.isSymbol('(')) {
            parenStack.push(curr.value);
        }
        if (curr.isSymbol(')')) {
            parenStack.pop();
        }
        if (curr.status === 'open') {
            quoteStack.push(curr.value);
        }
        if (curr.status === 'close') {
            quoteStack.pop();
        }
        let emptyStack = (!parenStack.length && !quoteStack.length);
        if (emptyStack) {
            let isNextSpace = option.noSpace && curr.isSpace() && isSeperator(next);
            let isPrevSpace = option.noSpace && curr.isSpace() && isSeperator(prev);
            if (curr.isSpace() && !tokens.length) {
                continue;
            }
            if (isNextSpace || isPrevSpace) {
                continue;
            }
        }
        if (emptyStack && isSeperator(curr)) {
            symbolCounter[curr.value] += 1;
            let groupName = lastGroupName;
            addGroup(tokens);
            lastGroupName = curr.value;
            tokens = [];
            updateSymbols();
        } else {
            tokens.push(curr);
        }
    }
    if (tokens.length) {
        addGroup(tokens);
    }

    return group;
}

// Composed values repeat across cells and generations, so each unique
// (input, options) pair is parsed once. Results are shared: read-only.
const memo = new Map();

const RE_PLAIN = /[,()'"`\s]/;
const RE_SIMPLE = /^[\w.%#+\-\s,]*$/;

function parseSimple(input, noSpace) {
    let group = [];
    input = input.trim();
    if (!input) return group;
    let pieces = input.split(',');
    if (pieces.length > 1 && pieces[pieces.length - 1].trim() === '') {
        pieces.pop();
    }
    for (let piece of pieces) {
        let t = piece.trim();
        if (noSpace) {
            group.push(t.replace(/\s+/g, ' '));
        } else if (t === '') {
            group.push('');
        } else {
            group.push(...t.split(/\s+/));
        }
    }
    return group;
}

function parseCached(input, option) {
    let symbol = option && option.symbol;
    if ((symbol === undefined || symbol === ',')
            && !(option && option.verbose)
            && typeof input === 'string' && input.length
            && !RE_PLAIN.test(input)) {
        return [input];
    }
    if ((symbol === undefined || symbol === ',')
            && !(option && option.verbose)
            && (typeof input === 'number' || (typeof input === 'string' && input.length))
            && RE_SIMPLE.test(input)) {
        return parseSimple(String(input), option && option.noSpace);
    }
    let optKey = option
        ? (Array.isArray(symbol) ? symbol.join('\x01') : String(symbol))
            + (option.noSpace ? 'n' : '') + (option.verbose ? 'v' : '')
        : '';
    let inner = memo.get(optKey);
    if (!inner) {
        memo.set(optKey, inner = new Map());
    }
    let result = inner.get(input);
    if (result === undefined) {
        if (inner.size >= 512) {
            inner.clear();
        }
        result = parse(input, option);
        inner.set(input, result);
    }
    return result;
}

export default parseCached;
