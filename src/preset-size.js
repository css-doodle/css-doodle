const presets = {
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
  portrait: 'p',
  pt: 'p',
  p: 'p',

  landscape: 'l',
  ls: 'l',
  l: 'l',
}

const unit = 'mm';

function get_preset(name, mode) {
  name = String(name).toLowerCase();

  // Default to landscape mode
  let [h, w] = presets[name] ?? [];

  if (modes[mode] == 'p') {
    [w, h] = [h, w];
  }

  return [w, h].map(n => n + unit);
}

function is_preset(name) {
  return !!presets[name];
}

export {
  get_preset,
  is_preset
}
