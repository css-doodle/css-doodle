import parseGrid from '../parser/parse-grid.js';
import parseShaders from '../parser/parse-shaders.js';

import generateShaders from '../generator/shaders.js';
import generatePattern from '../generator/pattern.js';
import generateScene from '../generator/scene.js';
import Func from '../core/function.js';

import createAnimation from './animation.js';
import { cacheImage, isSafari } from '../lib/browser.js';
import { doodleToImage, svgUrl, frameSvg } from './doodle-image.js';

export const draw = {
    shader: shaderToImage,
    pattern: patternToImage,
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

const stills = new WeakMap();

const MAX_URL = 2 ** 21;

function toDataURL(canvas, scale) {
    if (scale === 1) return canvas.toDataURL();
    let small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL();
}

function canvasUrl(canvas, fit) {
    let url = toDataURL(canvas, fit.scale);
    while (url.length > MAX_URL && fit.scale > .1) {
        fit.scale *= .9 * Math.sqrt(MAX_URL / url.length);
        url = toDataURL(canvas, fit.scale);
    }
    return `url("${url}")`;
}

function patternToImage(host, pattern) {
    let name = '@' + (pattern.fname || 'pattern');
    let addon = pattern.fname?.split('.').reduce((fn, key) => fn?.[key], Func);
    let generate = pattern.fname === 'scene' ? generateScene : addon?.shader || generatePattern;
    let source = generate(pattern.source, host.extra, message => {
        name = '';
        host.report([{ message }]);
    });
    return shaderToImage(host, { ...pattern, name, source, seedCell: '' });
}

async function shaderToImage(host, { source, cell, seedCell = cell, id, arg, target, compiled, name = '@shaders', inside }) {
    let fixed = arg ? parseGrid(arg, Infinity) : null;
    let parsed, width = fixed?.x, height = fixed?.y, textures = [];
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
    };
    if (inside) {
        if (!fixed) {
            ({ width, height } = inside);
            if (!(width && height)) {
                let { x, y } = host.gridSize;
                width = (host.offsetWidth || 300) / x;
                height = (host.offsetHeight || 300) / y;
            }
            if (target.selector[0] !== ':') {
                width /= inside.grid.x;
                height /= inside.grid.y;
            }
        }
        parsed = typeof source === 'string' ? parseShaders(source) : source;
        textures = await loadTextures();
        let drawing;
        try {
            drawing = generateShaders({ ...parsed, textures, width, height }, compiled.seed, seedCell);
            drawing.draw(0, width, height, 0, textures, [0, 0]);
            return canvasUrl(drawing.canvas, { scale: 1 });
        } catch (err) {
            if (name) host.report([{ message: `${name}: ${err.message}` }]);
        } finally {
            drawing?.dispose();
        }
        return;
    }
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

    const measure = () => {
        if (target.pseudo) {
            let { width, height } = getComputedStyle(element, '::' + target.pseudo);
            if (width.endsWith('px') && height.endsWith('px')) {
                return { width: parseFloat(width), height: parseFloat(height) };
            }
        }
        return element.getBoundingClientRect();
    };

    let generation = host._generation;
    if (target.type === 'content' && !fixed) {
        await host._styleReady;
        if (host._generation !== generation || host.shaderRenders.has(id)) return;
    }
    if (!fixed) ({ width, height } = measure());
    parsed = typeof source === 'string' ? parseShaders(source) : source;
    let turned = [0, 0], redraw;

    const tick = drawing => {
        let present;
        if (target.type === 'content') {
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
            let urls = stills.get(compiled) || stills.set(compiled, new Map()).get(compiled);
            let key = !drawing.animated && !textures.length && !parsed.drag
                && [parsed.vertex, parsed.fragment, width, height, drawing.seeded && seedCell].join('\n');
            let fit = { scale: 1 };
            present = () => {
                let url = urls.get(key) || canvasUrl(drawing.canvas, fit);
                if (key) urls.set(key, url);
                host.style.setProperty(id, url);
            }
        }

        let now = host.clockNow();
        const frame = t => {
            if (!width || !height) return;
            drawing.draw(now = t, width, height, host._umouse, textures, turned);
            present();
        };

        frame(now);
        redraw = () => frame(now);

        if (drawing.animated) {
            let animation = createAnimation(frame, now);
            if (host._offscreen || host.hasAttribute('cssd-paused')) {
                animation.pause();
            }
            host.animations.push(animation);
        } else if (!parsed.drag) {
            drawing.dispose();
        }
        host.shaderRenders.get(id)?.dispose();
        host.shaderRenders.set(id, drawing);

        if (!fixed && !host.observers.has(id)) {
            watch();
        }
        if (parsed.drag && !host.observers.has(id + '-drag')) {
            grab();
        }
    }

    const grab = () => {
        let [base] = parsed.drag, controller = new AbortController(), { signal } = controller, queued;
        host.observers.set(id + '-drag', {
            disconnect() {
                controller.abort();
                elements.forEach(el => el.style.touchAction = '');
                host._dragged = false;
            }
        });
        host.addEventListener('pointerdown', () => host._dragged = false, { signal, capture: true });
        for (let el of elements) {
            let from, start;
            el.style.touchAction = 'none';
            el.addEventListener('pointerdown', e => {
                if (!e.isPrimary || e.button) return;
                e.preventDefault();
                el.setPointerCapture(e.pointerId);
                from = start = e;
            }, { signal });
            el.addEventListener('pointermove', e => {
                if (!el.hasPointerCapture(e.pointerId)) return;
                if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 3) host._dragged = true;
                let rate = Math.PI / Math.min(width, height), half = Math.PI / 2;
                turned[0] += (e.clientX - from.clientX) * rate;
                turned[1] = Math.min(Math.max(turned[1] + (e.clientY - from.clientY) * rate, -half - base), half - base);
                from = e;
                if (!host.shaderRenders.get(id).animated || host.hasAttribute('cssd-paused')) {
                    queued ||= requestAnimationFrame(() => {
                        queued = 0;
                        redraw();
                    });
                }
            }, { signal });
        }
    }

    let latest = 0;
    const isStale = token => token !== latest || host._generation !== generation;

    const render = async initial => {
        let token = ++latest;
        if (parsed.textures.length) {
            let result = await loadTextures();
            if (isStale(token) || (initial && host.shaderRenders.has(id))) return;
            textures = result;
        }
        try {
            tick(generateShaders({ ...parsed, textures, width, height }, host.seed, seedCell, () => {
                host.report([{ message: 'WebGL context lost' }]);
            }));
        } catch (err) {
            if (name) host.report([{ message: `${name}: ${err.message}` }]);
            host.shaderRenders.set(id, { dispose() {} });
        }
    }

    // a size change redraws; a running loop only needs its textures refreshed
    const watch = () => {
        let timer, observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (host.observers.get(id) !== observer) return;
                let size = measure();
                if (size.width === width && size.height === height) return;
                width = size.width;
                height = size.height;
                if (host.shaderRenders.get(id).animated) {
                    let token = ++latest;
                    loadTextures().then(result => {
                        if (!isStale(token)) textures = result;
                    });
                } else {
                    render();
                }
            }, 100);
        });
        observer.observe(element);
        host.observers.set(id, observer);
    }

    await render(true);
}
