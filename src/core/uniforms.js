function createTimeUniform(name) {
  let ticks = 1000 * 60 * 60 * 24; /* 24 hours in ms */
  let steps = ticks / (1000 / 120);
  let aname = `${name}-animation`;
  return {
    name, ticks,
    'animation-name': aname,
    animation: (delay='0s') => `${ticks}ms steps(${steps}) ${delay} infinite ${aname}`
  }
}

export const utime = createTimeUniform('cssd-utime');
export const UTime = createTimeUniform('cssd-UTime');

export const umousex = {
  name: 'cssd-umousex',
};

export const umousey = {
  name: 'cssd-umousey',
};

export const uwidth = {
  name: 'cssd-uwidth',
};

export const uheight = {
  name: 'cssd-uheight',
};
