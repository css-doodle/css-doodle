import generateShape from '../../generator/shapes.js';
import { scan, textOf } from '../../parser/tokenizer.js';

export default function shape(...args) {
    return generateShape(textOf(scan(args.join(','), { ignoreInlineComment: true }))).clip;
}
