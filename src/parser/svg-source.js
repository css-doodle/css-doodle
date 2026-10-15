function generate(token, last, repeat) {
    let result = '';
    if (token.type === 'block') {
        let times = repeat ? token.times : null;
        if (times) result += '@M(' + times + ',';
        if (token.test === undefined) {
            result += token.name + '{';
        } else {
            result += '@ match(' + (repeat ? '$(' + token.test + ')' : token.test) + '){';
        }
        if (token.name === 'style') {
            result += token.value;
        }
        else if (Array.isArray(token.value)) {
            let lastGroup = null;
            for (let t of token.value) {
                result += generate(t, lastGroup, repeat);
                lastGroup = t.origin || null;
            }
        }
        result += times ? '})' : '}';
    } else if (token.type === 'statement') {
        let value = token.origin ? token.origin.value : token.value;
        if (repeat && token.from) {
            value = '@--(' + token.from.slice(2) + ')';
        }
        if (repeat && token.variable && typeof value === 'string') {
            return '@--(' + token.name.slice(2) + ',' + value + ')';
        }
        let skip = (token.origin && last === token.origin);
        let name = token.origin ? token.origin.name.join(',') : token.name;
        if (!skip) {
            if (value && value.type) {
                result += name + ':' + generate(value, null, repeat);
            } else if (token.raw) {
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
