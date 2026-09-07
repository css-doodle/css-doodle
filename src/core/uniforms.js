export const utime = '--cssd-utime';
export const UTime = '--cssd-UTime';
export const umousex = '--cssd-umousex';
export const umousey = '--cssd-umousey';
export const uwidth = '--cssd-uwidth';
export const uheight = '--cssd-uheight';

const ticks = 1000 * 60 * 60 * 24;
const steps = ticks / (1000 / 120);
const delay = new Date().setHours(0, 0, 0, 0) - Date.now();

export const timeKeyframes =
    `@keyframes cssd-u-ani {from {${utime}:0} to {${utime}:${ticks}}}` +
    `@keyframes cssd-U-ani {from {${UTime}:0} to {${UTime}:${ticks}}}`;

export const timePrefix = {
    'animation': `${ticks}ms steps(${steps}) 0ms infinite cssd-u-ani,${ticks}ms steps(${steps}) ${delay}ms infinite cssd-UTime-ani`,
    'animation-name': 'cssd-u-ani,cssd-U-ani',
    'animation-duration': `${ticks}ms,${ticks}ms`,
    'animation-timing-function': `steps(${steps}),steps(${steps})`,
    'animation-delay': `0ms,${delay}ms`,
};
