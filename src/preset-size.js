const presets = {

 '4a0': [ 1682, 2378 ],
 '2a0': [ 1189, 1682 ],
  a0:   [ 841, 1189 ],
  a1:   [ 594, 841 ],
  a2:   [ 420, 594 ],
  a3:   [ 297, 420 ],
  a4:   [ 210, 297 ],
  a5:   [ 148, 210 ],
  a6:   [ 105, 148 ],
  a7:   [ 74, 105 ],
  a8:   [ 52, 74 ],
  a9:   [ 37, 52 ],
  a10:  [ 26, 37 ],

  b0:  [ 1000, 1414 ],
  b1:  [ 707, 1000 ],
  b2:  [ 500, 707 ],
  b3:  [ 353, 500 ],
  b4:  [ 250, 353 ],
  b5:  [ 176, 250 ],
  b6:  [ 125, 176 ],
  b7:  [ 88, 125 ],
  b8:  [ 62, 88 ],
  b9:  [ 44, 62 ],
  b10: [ 31, 44 ],
  b11: [ 22, 32 ],
  b12: [ 16, 22 ],

  c0:  [ 917, 1297 ],
  c1:  [ 648, 917 ],
  c2:  [ 458, 648 ],
  c3:  [ 324, 458 ],
  c4:  [ 229, 324 ],
  c5:  [ 162, 229 ],
  c6:  [ 114, 162 ],
  c7:  [ 81, 114 ],
  c8:  [ 57, 81 ],
  c9:  [ 40, 57 ],
  c10: [ 28, 40 ],
  c11: [ 22, 32 ],
  c12: [ 16, 22 ],

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
  let [h, w] = presets[name] || [];

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
