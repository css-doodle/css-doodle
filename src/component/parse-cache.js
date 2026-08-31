import parseCss from '../parser/parse-css.js';

const parseCache = new Map();

export function parseCssCached(code, extra) {
    if (code.includes('@use')) {
        return parseCss(code, extra);
    }
    let parsed = parseCache.get(code);
    if (!parsed) {
        if (parseCache.size >= 64) {
            parseCache.clear();
        }
        parsed = parseCss(code, extra);
        parseCache.set(code, parsed);
    }
    return parsed;
}
