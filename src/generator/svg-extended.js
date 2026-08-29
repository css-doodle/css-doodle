function generate(token, last) {
  let result = '';
  if (token.type === 'block') {
    if (token.times) {
      result += ('@M' + token.times + '(' + token.pureName + '{');
    } else {
      result += token.name + '{';
    }
    if (token.name === 'style') {
      result += token.value;
    }
    else if (Array.isArray(token.value) && token.value.length) {
      let lastGroup = null;
      for (let t of token.value) {
        result += generate(t, lastGroup);
        lastGroup = t.origin || null;
      }
    }
    result += token.times ? '})' : '}';
  } else if (token.type === 'statement') {
    // statements expanded from one group share the same origin object;
    // compare identity so a later group with the same names isn't dropped
    let skip = (token.origin && last === token.origin);
    let name = token.origin ? token.origin.name.join(',') : token.name;
    let value = token.origin ? token.origin.value : token.value;
    if (!skip) {
      result += (value && value.type)
        ? (name + ':' + generate(value))
        : (name + ':' + value + ';');
    }
  }
  return result;
}

export default function generate_svg_extended(token) {
  return generate(token).trim();
}
