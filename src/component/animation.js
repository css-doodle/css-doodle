export default function createAnimationFrame(fn, fps = 60) {
    let id = null;
    let paused = false;
    let duration = 1000 / fps;
    let time = 0;
    let last = 0;
    let due = 0;

    function loop(now) {
        if (last) {
            time += now - last;
        }
        last = now;
        if (time >= due) {
            fn(time);
            due += duration;
            if (due <= time) {
                due = time + duration;
            }
        }
        if (!paused && id) {
            id = requestAnimationFrame(loop);
        }
    }

    id = requestAnimationFrame(loop);

    return {
        pause() {
            if (!paused && id) {
                paused = true;
                cancelAnimationFrame(id);
                id = null;
                last = 0;
            }
        },
        resume() {
            if (paused) {
                paused = false;
                id = requestAnimationFrame(loop);
            }
        },
        cancel() {
            paused = false;
            if (id) {
                cancelAnimationFrame(id);
                id = null;
            }
        }
    };
}
