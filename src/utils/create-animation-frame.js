const STEP60 = 1000 / 60; // 60fps
const STEP8 = 1000 / 8;   // 8fps

function createAnimationFrame(fn) {
  let id;
  let time = 0;
  let last = 0;
  let paused = false;
  function loop(stamp) {
    if (!time) time = stamp;
    fn(time);
    let step = (stamp - last);
    if (step < STEP60) step = STEP60;
    if (step > STEP8) step = STEP8;
    if (last) time += step;
    last = stamp;
    id = requestAnimationFrame(loop);
  }
  id = requestAnimationFrame(loop);
  return {
    resume() {
      if (id && paused) {
        paused = false;
        id = requestAnimationFrame(loop);
      }
    },
    pause() {
      if (id) {
        cancelAnimationFrame(id);
        paused = true;
      }
    },
    cancel() {
      if (id) {
        paused = false;
        cancelAnimationFrame(id);
        id = null;
      }
    },
  }
}

export default createAnimationFrame;
