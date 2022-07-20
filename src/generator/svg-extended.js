function generate(token, indent = 0) {
  let result = '';
  if (token.type === 'block') {
    if (token.times) {
      result += '@M' + token.times + '(' + token.pureName + '{';
    } else {
      result += token.name + '{';
    }
    if (Array.isArray(token.value) && token.value.length) {
      for (let t of token.value) {
        result += generate(t, indent + 2);
      }
    }
    if (token.times) {
      result += '})';
    } else {
      result += '}';
    }
  } else if (token.type === 'statement') {
    if (token.value && token.value.type) {
      result += token.name + ':' + generate(token.value, indent);
    } else {
      result += token.name + ':' + token.value + ';';
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
