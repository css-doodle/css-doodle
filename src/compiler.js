import generator from './generator';
import tokenizer from './tokenizer';

function compile(input, size) {
  return generator(tokenizer(input), size);
}

export { generator, tokenizer };
export default compile;
