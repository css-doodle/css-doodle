function generate(token, last, repeat) {
    let result = '';
    if (token.type === 'block') {
        let times = repeat ? token.times : null;
        if (times) {
            // id and class already sit in the body as statements
            result += '@M(' + times + ',' + token.name + '{';
        } else {
            result += token.name + '{';
        }
        if (token.name === 'style') {
            result += token.value;
        }
        else if (Array.isArray(token.value) && token.value.length) {
            let lastGroup = null;
            for (let t of token.value) {
                result += generate(t, lastGroup, repeat);
                lastGroup = t.origin || null;
            }
        }
        result += times ? '})' : '}';
    } else if (token.type === 'statement') {
        // statements expanded from one group share the same origin object;
        // compare identity so a later group with the same names isn't dropped
        let skip = (token.origin && last === token.origin);
        let name = token.origin ? token.origin.name.join(',') : token.name;
        let value = token.origin ? token.origin.value : token.value;
        if (!skip) {
            if (value && value.type) {
                result += name + ':' + generate(value, null, repeat);
            } else if (token.raw) {
                // read from braces, so written back in them
                result += name + ':{' + value + '};';
            } else {
                result += name + ':' + value + ';';
            }
        }
    }
    return result;
}

export default function sourceOf(token, { repeat = true } = {}) {
    return generate(token, null, repeat).trim();
}
