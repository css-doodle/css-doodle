function createAnimationFrame(fn) {
  let id;
  function _loop(stamp) {
    fn(stamp);
    id = requestAnimationFrame(_loop);
  }
  id = requestAnimationFrame(_loop);
  return {
    cancel() {
      cancelAnimationFrame(id);
    }
  }
}

export default createAnimationFrame;
