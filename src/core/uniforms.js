const ticks = 1000 * 60 * 60 * 24; /* 24 hours in ms */
const steps = ticks / (1000 / 120);

/* time elapsed since the beginning of the day */
const DELAY = new Date().setHours(0, 0, 0, 0) - Date.now();

function createTimeUniform(name, delay) {
    return {
        name, ticks,
        'animation-name': `${name}-animation`,
        animation: `${ticks}ms steps(${steps}) ${delay} infinite ${name}-animation`
    }
}

export const utime = createTimeUniform('cssd-utime', '0s');
export const UTime = createTimeUniform('cssd-UTime', DELAY + 'ms');

export const timePrefix = {
    'animation': `${utime.animation},${UTime.animation}`,
    'animation-name': `${utime['animation-name']},${UTime['animation-name']}`,
    'animation-duration': `${ticks}ms,${ticks}ms`,
    'animation-timing-function': `steps(${steps}),steps(${steps})`,
    'animation-delay': `0s,${DELAY}ms`,
};

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
