import parseGrid from '../parser/parse-grid.js';
import parseShaders from '../parser/parse-shaders.js';

import generateShaders from '../generator/shaders.js';
import generatePattern from '../generator/pattern.js';

import createAnimation from './animation.js';
import { cacheImage, isSafari } from '../lib/browser.js';
import { debounce } from '../lib/fn.js';
import { doodleToImage, svgUrl, frameSvg } from './doodle-image.js';

export const draw = {
    shader: (host, value) => shaderToImage(host, value),
    pattern: (host, value) => patternToImage(host, value),
    url: safariImage,
};

function safariImage(svg, width, height) {
    if (!isSafari()) {
        return svgUrl(svg);
    }
    let url = svgUrl((width && height) ? frameSvg(svg, width, height) : svg);
    cacheImage(url);
    return url;
}

function patternToImage(host, pattern) {
    let name = '@pattern';
    let source = generatePattern(pattern.source, host.extra, message => {
        name = '';
        host.report([{ message }]);
    });
    return shaderToImage(host, { ...pattern, name, source });
}

export async function shaderToImage(host, { source, cell, id, arg, target, compiled, name = '@shaders' }) {
    // restamping the sheet resolves its placeholders again; a rendered shader stays
    if (host.shaderRenders.has(id)) return;
    let elements;
    if (target.selector === ':host') {
        elements = [host];
    } else if (target.selector === ':container') {
        elements = [host.shadowRoot.querySelector('grid')];
    } else {
        let byId = host.shadowRoot.getElementById(cell);
        elements = byId ? [byId] : [...host.shadowRoot.querySelectorAll('.' + cell)];
    }
    let element = elements[0];

    let fixed = arg ? parseGrid(arg, Infinity) : null;
    if (fixed && !(fixed.x && fixed.y)) {
        fixed = null;
    }
    const measure = () => fixed
        ? { width: fixed.x, height: fixed.y }
        : element.getBoundingClientRect();

    let { width, height } = measure();
    let generation = host._generation;
    let parsed = typeof source === 'string' ? parseShaders(source) : source;
    let textures = [];

    const tick = drawing => {
        if (host._generation !== generation) {
            drawing.dispose();
            return;
        }
        drawing.draw(0, width, height, host._umouse, textures);

        let present;
        if (target.type === 'content') {
            // the WebGL canvas is shared, so each cell keeps a copy of each frame
            let views = elements.map(el => {
                let view = document.createElement('canvas');
                el.replaceChildren(view);
                return [view, view.getContext('2d')];
            });
            present = () => {
                let { canvas } = drawing;
                for (let [view, ctx] of views) {
                    if (view.width !== canvas.width || view.height !== canvas.height) {
                        view.width = canvas.width;
                        view.height = canvas.height;
                    }
                    // resizing resets the context, so this is set per frame
                    ctx.globalCompositeOperation = 'copy';
                    ctx.drawImage(canvas, 0, 0);
                }
            }
        } else {
            present = () => host.style.setProperty(id, `url("${drawing.canvas.toDataURL()}")`);
        }

        present();

        if (drawing.animated) {
            // a new loop starts in the host's current state
            let animation = createAnimation(t => {
                drawing.draw(t, width, height, host._umouse, textures);
                present();
            });
            if (host._offscreen || host.hasAttribute('cssd-paused')) {
                animation.pause();
            }
            host.animations.push(animation);
        } else {
            drawing.dispose();
        }
        host.shaderRenders.set(id, drawing);

        if (!fixed && !host.observers.has(id)) {
            watch();
        }
    }

    // the texture doodles, rendered at the drawing size
    const loadTextures = () => {
        let dpr = devicePixelRatio || 1;
        return Promise.all(parsed.textures.map(({ name, value }) => {
            let options = { width, height, instance: `${id.slice(2)}-${name}`, compiled };
            return doodleToImage(host, value, options).then(src => new Promise(resolve => {
                if (!src) {
                    return resolve({ name, value: null });
                }
                let img = new Image();
                img.width = width * dpr;
                img.height = height * dpr;
                img.onload = () => resolve({ name, value: img });
                img.onerror = () => resolve({ name, value: null });
                img.src = src;
            }));
        }));
    }

    const render = async initial => {
        if (parsed.textures.length) {
            textures = await loadTextures();
            if (initial && host.shaderRenders.has(id)) return;
        }
        try {
            tick(generateShaders({ ...parsed, textures, width, height }, host.seed, cell, () => {
                host.report([{ message: 'WebGL context lost' }]);
            }));
        } catch (err) {
            if (name) {
                let line = name == '@shaders' && err.line;
                host.report([{ message: `${name}: ${err.message}` + (line ? ` in "${line}"` : '') }]);
            }
            host.shaderRenders.set(id, { dispose() {} });
        }
    }

    // a size change redraws; a running loop only needs its textures refreshed
    const watch = () => {
        let observer = new ResizeObserver(debounce(() => {
            if (host.observers.get(id) !== observer) return;
            let size = measure();
            if (size.width === width && size.height === height) return;
            width = size.width;
            height = size.height;
            if (host.shaderRenders.get(id).animated) {
                loadTextures().then(result => { textures = result; });
            } else {
                render();
            }
        }));
        observer.observe(element);
        host.observers.set(id, observer);
    }

    await render(true);
}
