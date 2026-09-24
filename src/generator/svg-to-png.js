import { cacheImage, isSafari } from '../lib/browser.js';

export default function svgToPng(svg, width, height, scale) {
    return new Promise((resolve, reject) => {
        let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
        function action() {
            let img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = source;

            img.onerror = reject;

            img.onload = () => {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');

                // scale with devicePixelRatio only when the scale equals 1
                let dpr = scale === 1 ? devicePixelRatio || 1 : 1;

                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                try {
                    canvas.toBlob(blob => resolve({ blob, source }));
                } catch (e) {
                    reject(e);
                }
            }
        }

        if (isSafari()) {
            cacheImage(source, action, 200);
        } else {
            action();
        }
    });
}
