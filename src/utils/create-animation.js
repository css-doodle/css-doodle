const STEP60 = 1000 / 60; // 60fps
const STEP1 = 1000 / 1;   // 1fps

export default function createAnimation(fn) {
  let id;
  let time = 0;
  let lastTime = 0;
  let lastStep = 0;
  let paused = false;
  function loop(stamp) {
    if (!time) time = stamp;
    fn(time);
    let step = (stamp - lastTime);
    if (step < STEP60) step = STEP60;
    if (step > STEP1) step = lastStep || STEP1;
    if (lastTime) time += step;
    lastStep = step;
    lastTime = stamp;
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
