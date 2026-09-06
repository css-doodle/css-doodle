const ticks = 1000 * 60 * 60 * 24;
const steps = ticks / (1000 / 120);

// time elapsed since the beginning of the day
const DELAY = new Date().setHours(0, 0, 0, 0) - Date.now();

function createTimeUniform(name, delay) {
    return {
        name, ticks, delay,
        'animation-name': `${name}-animation`,
        animation: `${ticks}ms steps(${steps}) ${delay}ms infinite ${name}-animation`
    }
}

export const utime = createTimeUniform('cssd-utime', 0);
export const UTime = createTimeUniform('cssd-UTime', DELAY);

export const timePrefix = {
    'animation': `${utime.animation},${UTime.animation}`,
    'animation-name': `${utime['animation-name']},${UTime['animation-name']}`,
    'animation-duration': `${ticks}ms,${ticks}ms`,
    'animation-timing-function': `steps(${steps}),steps(${steps})`,
    'animation-delay': `${utime.delay}ms,${UTime.delay}ms`,
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
