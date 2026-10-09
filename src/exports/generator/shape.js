import generateShape from '../../generator/shapes.js';

export default function shape(...args) {
    return generateShape(args.join(',')).clip;
}
