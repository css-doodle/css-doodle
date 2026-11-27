import { hash } from '../../lib/math.js';
import { doodleToImage, svgUrl } from '../../component/doodle-image.js';

export default async function image(code = '', options = {}) {
    let { width, height } = options;
    let seed = options.seed ?? hash(code);
    let needs = new Set();
    let warnings = [];
    let skip = () => (needs.add('shader'), Promise.resolve());
    let svg = '';
    let host = {
        extra: { getVariable: () => '', getRgbaColor: () => void needs.add('color') },
        getMaxGrid: () => 64,
        report: list => warnings.push(...list),
        hasAttribute: () => false,
        clockNow: () => 0,
        _clock: { base: 0 },
        draw: { pattern: skip, url: text => (svg = text, svgUrl(text)) },
    };
    let url = await doodleToImage(host, code, {
        arg: (width && height) ? `${parseFloat(width)}x${parseFloat(height)}` : '',
        compiled: { seed },
        instance: 'i' + hash(seed + code).toString(36),
    });
    return { svg: url ? svg : '', seed, needs: [...needs], warnings };
}
