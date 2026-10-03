import parseCss from '../parser/parse-css.js';
import { memo } from '../lib/cache.js';

// only @use reads the element's variables while parsing
const parseCached = memo(code => parseCss(code));

export function parseCssCached(code, extra) {
    return code.includes('@use') ? parseCss(code, extra) : parseCached(code);
}
