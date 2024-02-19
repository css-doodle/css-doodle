const presets = {
  a0: [ 841, 1189 ],
  a1: [ 594, 841 ],
  a2: [ 420, 594 ],
  a3: [ 297, 420 ],
  a4: [ 210, 297 ],
  a5: [ 148, 210 ],
  a6: [ 105, 148 ],

  b0: [ 1000, 1414 ],
  b1: [ 707, 1000 ],
  b2: [ 500, 707 ],
  b3: [ 353, 500 ],
  b4: [ 250, 353 ],
  b5: [ 176, 250 ],
  b6: [ 125, 176 ],

  c0: [ 917, 1297 ],
  c1: [ 648, 917 ],
  c2: [ 458, 648 ],
  c3: [ 324, 458 ],
  c4: [ 229, 324 ],
  c5: [ 162, 229 ],

  d0: [ 764, 1064 ],
  d1: [ 532, 760 ],
  d2: [ 380, 528 ],
  d3: [ 264, 376 ],
  d4: [ 188, 260 ],
  d5: [ 130, 184 ],
  d6: [ 92, 126 ],

  letter:   [ 216, 279 ],
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
