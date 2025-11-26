export default function createAnimationFrame(fn, fps = 60) {
  let id = null;
  let paused = false;
  let duration = 1000 / fps;
  let time = 0;
  let last = 0;

  function loop(now) {
    if (!time) {
      time = now;
    }
    let delta = now - last;
    if (last) {
      time += delta;
    }
    if (delta >= duration) {
      fn(time);
      last = now;
    }
    id = requestAnimationFrame(loop);
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
    }
  };
}
