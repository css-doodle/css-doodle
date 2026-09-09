export const utime = '--cssd-utime';
export const UTime = '--cssd-UTime';
export const umousex = '--cssd-umousex';
export const umousey = '--cssd-umousey';
export const uwidth = '--cssd-uwidth';
export const uheight = '--cssd-uheight';

const ticks = 1000 * 60 * 60 * 24;
const steps = `steps(${ticks / (1000 / 120)})`;
const delay = new Date().setHours(0, 0, 0, 0) - Date.now();
const u = 'cssd-u-ani';
const U = 'cssd-U-ani';

export const timeKeyframes =
    `@keyframes ${u} {from {${utime}:0} to {${utime}:${ticks}}}` +
    `@keyframes ${U} {from {${UTime}:0} to {${UTime}:${ticks}}}`;

export const timePrefix = {
    'animation': `${ticks}ms ${steps} 0ms infinite ${u},${ticks}ms ${steps} ${delay}ms infinite ${U}`,
    'animation-name': `${u},${U}`,
    'animation-duration': `${ticks}ms,${ticks}ms`,
    'animation-timing-function': `${steps},${steps}`,
    'animation-delay': `0ms,${delay}ms`,
};
