import parseValueGroup from './parse-value-group.js';

// `x [y] / width [height]`
// or positive percenage: 20% => `-20% -20% / 140% 140%`.
export default function parseFilterRegion(input) {
    let value = String(input).trim();
    if (!value.includes('/')) {
        let amount = parseFloat(value);
        let size = 100 + amount * 2;
        if (!/%$/.test(value) || !(amount >= 0) || !Number.isFinite(size)) return;
        return {
            x: `${-amount}%`,
            y: `${-amount}%`,
            width: `${size}%`,
            height: `${size}%`,
        };
    }
    let slash = parseValueGroup(value, { symbol: '/', noSpace: true });
    if (slash.length !== 2) return;
    let [position, size] = slash.map(part => parseValueGroup(part));
    if (!position[0] || !size[0] || position.length > 2 || size.length > 2
        || ![...position, ...size].every(c => Number.isFinite(parseFloat(c)))) return;
    return {
        x: position[0],
        y: position[1] ?? position[0],
        width: size[0],
        height: size[1] ?? size[0],
    };
}
