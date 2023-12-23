const utime = {
  'name': 'cssd-utime',
  'animation-name': 'cssd-utime-animation',
  'animation-duration': 31536000000, /* one year in ms */
  'animation-iteration-count': 'infinite',
  'animation-delay': '0s',
  'animation-direction': 'normal',
  'animation-fill-mode': 'none',
  'animation-play-state': 'running',
  'animation-timing-function': 'linear',
};

utime['animation'] = `
  ${utime['animation-duration']}ms
  ${utime['animation-timing-function']}
  ${utime['animation-delay']}
  ${utime['animation-iteration-count']}
  ${utime['animation-name']}
`;

const umousex = {
  name: 'cssd-umousex',
};

const umousey = {
  name: 'cssd-umousey',
};

const uwidth = {
  name: 'cssd-uwidth',
};

const uheight = {
  name: 'cssd-uheight',
};

export {
  utime,
  umousex,
  umousey,
  uwidth,
  uheight,
}
