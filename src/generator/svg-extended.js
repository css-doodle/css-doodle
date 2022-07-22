function generate(token, last) {
  let result = '';
  if (token.type === 'block') {
    result += token.times
      ? ('@M' + token.times + '(' + token.pureName + '{')
      : (token.name + '{');
    if (Array.isArray(token.value) && token.value.length) {
      let lastGroup = '';
      for (let t of token.value) {
        result += generate(t, lastGroup);;
        if (t.origin) {
          lastGroup = t.origin.name.join(',');
        }
      }
    }
    result += token.times ? '})' : '}';
  } else if (token.type === 'statement') {
    let skip = (token.origin && last === token.origin.name.join(','));
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

function generate_svg_extended(token) {
  return generate(token).trim();
}

export {
  generate_svg_extended,
}
