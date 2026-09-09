const TIME_UNITS = { ms: 1, s: 1000, min: 60000, h: 3600000 };
const PAUSED_RULE = '*,*::before,*::after{animation-play-state:paused!important}';
const RE_CSS_CLOCK = /\banimation(?:-name)?\s*:/;
const RE_IMAGE_CLOCK = /%3Canimate|animation(?:-name)?%3A/;
const RE_TIME = /(?<![\w.-])(-?\d*\.?\d+)(ms|s)(?![\w-])/g;
const RE_ATTR = /([\w:-]+)=("[^"]*"|'[^']*')/g;

export function hasImageClock(sheet) {
    return RE_IMAGE_CLOCK.test(sheet);
}

function clockValue(value = '') {
    let m = /^\s*(-?\d*\.?\d+)(ms|s|min|h)?\s*$/.exec(value);
    return m ? parseFloat(m[1]) * TIME_UNITS[m[2] ?? 's'] : null;
}

function setAttr(tag, name, value) {
    let re = new RegExp(`\\s${name}=("[^"]*"|'[^']*')`);
    return re.test(tag)
        ? tag.replace(re, ` ${name}="${value}"`)
        : tag.replace(/\s*\/?>$/, m => ` ${name}="${value}"${m.trim()}`);
}

function shiftSmil(tag, t, paused) {
    let attrs = {};
    for (let [, name, quoted] of tag.matchAll(RE_ATTR)) {
        attrs[name] = quoted.slice(1, -1);
    }
    let begin = clockValue(attrs.begin ?? '0');
    if (begin === null) return tag;
    let elapsed = Math.round(t - begin);
    if (elapsed < 0) {
        return setAttr(tag, 'begin', paused ? 'indefinite' : -elapsed + 'ms');
    }
    tag = setAttr(tag, 'begin', -elapsed + 'ms');
    let dur = clockValue(attrs.dur);
    let repeat = attrs.repeatCount === 'indefinite' ? Infinity : (parseFloat(attrs.repeatCount) || 1);
    let active = dur === null || elapsed < dur * repeat;
    if (paused && active) {
        // SMIL drops an interval that does not end after document time 0,
        // so the cut-off sits one ms in and the value there is held
        tag = setAttr(setAttr(tag, 'end', '1ms'), 'fill', 'freeze');
    }
    return tag;
}

export function shiftCssAnimations(css, t) {
    if (!t) return css;
    return css.replace(/(\banimation(-delay)?\s*:\s*)([^;}]+)/g, (m, head, longhand, value) => {
        if (/\b(var|calc)\(|\([^)]*\(/.test(value)) return m;
        // commas inside timing functions do not split the list
        let items = value.split(/,(?![^(]*\))/).map(item => {
            // in the shorthand the second time is the delay, the first the duration
            let count = 0;
            let out = item.replace(RE_TIME, (m, num, unit) => {
                let ms = parseFloat(num) * TIME_UNITS[unit];
                return (longhand || ++count === 2) ? Math.round(ms - t) + 'ms' : m;
            });
            if (!longhand && count === 1) {
                out = out.replace(RE_TIME, m => `${m} ${Math.round(-t)}ms`);
            }
            return out;
        });
        return head + items.join(',');
    });
}

export function stampSvgImages(host, sheet) {
    let paused = host.hasAttribute('cssd-paused');
    if ((!paused && !host._clock.base) || !hasImageClock(sheet)) {
        return sheet;
    }
    let t = host.clockNow();
    return sheet.replace(/url\("data:image\/svg\+xml;utf8,([^"#]*)(#[^"]*)?"\)/g, (m, data, hash = '') => {
        if (!hasImageClock(data)) return m;
        let svg = decodeURIComponent(data)
            .replace(/<animate\w*\b[^>]*>/g, tag => shiftSmil(tag, t, paused))
            .replace(/<style[^>]*>[\s\S]*?<\/style>|\sstyle=(?:"[^"]*"|'[^']*')/g, s => shiftCssAnimations(s, t));
        if (paused && RE_CSS_CLOCK.test(svg)) {
            svg = svg.replace(/<\/svg>\s*$/, `<style>${PAUSED_RULE}</style></svg>`);
        }
        return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}${hash}")`;
    });
}

export function stampSheet(host, sheet) {
    let paused = host.hasAttribute('cssd-paused');
    if (!paused && !host._clock.base) return sheet;
    sheet = shiftCssAnimations(stampSvgImages(host, sheet), host.clockNow());
    return paused ? sheet + PAUSED_RULE : sheet;
}
