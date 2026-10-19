export default function createAnimationFrame(fn, time) {
    let id = null;
    let paused = false;
    let last = 0;

    function loop(now) {
        if (last) {
            fn(time += now - last);
        }
        last = now;
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
        seek(t) {
            fn(time = t);
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
