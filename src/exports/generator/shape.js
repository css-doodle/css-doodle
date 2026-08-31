import generateShape from '../../generator/shapes.js';

export default function shape(...args) {
    let commands = args.join(',');
    let { points } = generateShape(commands);
    return `polygon(${points.join(',')})`;
}
