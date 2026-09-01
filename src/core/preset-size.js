const presets = {
    __proto__: null,

    a0: [ 841, 1189 ],
    a1: [ 594, 841 ],
    a2: [ 420, 594 ],
    a3: [ 297, 420 ],
    a4: [ 210, 297 ],
    a5: [ 148, 210 ],
    a6: [ 105, 148 ],

    postcard: [ 100, 148 ],
    poster:   [ 390, 540 ],
}

const modes = {
    __proto__: null,

    portrait: 'p',
    pt: 'p',
    p: 'p',

    landscape: 'l',
    ls: 'l',
    l: 'l',
}

const unit = 'mm';

function getPreset(name, mode) {
    name = String(name).toLowerCase();

    // Default to landscape mode
    let [h, w] = presets[name] ?? [];

    if (modes[mode] == 'p') {
        [w, h] = [h, w];
    }

    return [w, h].map(n => n + unit);
}

function isPreset(name) {
    name = String(name).toLowerCase();
    return name in presets;
}

export {
    getPreset,
    isPreset
}
