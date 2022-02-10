function nextId() {
  return () => {
    let id = 0;
    return () => (n = '') => `${n}-${++id}`;
  }
}
