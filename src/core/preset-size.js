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

export function getPreset(name, mode) {
    let size = presets[String(name).toLowerCase()];
    if (!size) return;

    // Default to landscape mode
    let [h, w] = size;

    if (mode === 'p' || mode === 'portrait') {
        [w, h] = [h, w];
    }
    return [w + 'mm', w + '/' + h];
}
