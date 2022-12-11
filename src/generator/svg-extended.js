function generate(token, last) {
  let result = '';
  if (token.type === 'block') {
    let isInline = Array.isArray(token.value) && token.value[0] && token.value[0].inline;
    if (token.times) {
      result += ('@M' + token.times + '(' + token.pureName + '{');
    } else {
      result += token.name + (isInline ? ' ' : '{');
    }
    if (token.name === 'style') {
      result += token.value;
    }
    else if (Array.isArray(token.value) && token.value.length) {
      let lastGroup = '';
      for (let t of token.value) {
        result += generate(t, lastGroup);;
        if (t.origin) {
          lastGroup = t.origin.name.join(',');
        }
      }
    }
    if (token.times) {
      result += '})';
    } else if (!isInline) {
      result += '}';
    }
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
