import { hash } from '../../lib/math.js';
import { doodleToImage, svgUrl } from '../../component/doodle-image.js';

/*
 * Renders a doodle to one standalone SVG, the way a nested @doodle is drawn,
 * for an <img>, a CSS background or a file. Animations keep running in it.
 *
 * `width` and `height` are in pixels and give the image its size and viewBox;
 * without them it takes the size it is drawn at.
 * `needs` has 'shader' when @shaders and @pattern images are left out.
 */
export default async function image(code = '', options = {}) {
    let { width, height } = options;
    let seed = options.seed ?? hash(code);
    let needs = new Set();
    let warnings = [];
    let skip = () => (needs.add('shader'), Promise.resolve());
    let svg = '';
    let host = {
        extra: { getVariable: () => '' },
        getMaxGrid: () => 64,
        report: list => warnings.push(...list),
        hasAttribute: () => false,
        clockNow: () => 0,
        _clock: { base: 0 },
        // nested images resolve first, so the last one drawn is the outer image
        draw: { shader: skip, pattern: skip, url: text => (svg = text, svgUrl(text)) },
    };
    let url = await doodleToImage(host, code, {
        arg: (width && height) ? `${parseFloat(width)}x${parseFloat(height)}` : '',
        compiled: { seed },
        instance: 'i' + hash(seed + code).toString(36),
    });
    return { svg: url ? svg : '', seed, needs: [...needs], warnings };
}
