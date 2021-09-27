function compare(t, input, output, print) {
  if (typeof compare._compare !== 'function') {
    throw new Error("Missing comparison function.");
  }
  let applied;
  if (Array.isArray(input)) {
    applied = compare._compare(...input);
  } else {
    applied = compare._compare(input);
  }
  if (print) console.log(JSON.stringify(applied, null, 2));
  t.deepEqual(output, applied);
}

compare.use = _compare => {
  compare._compare = _compare;
};

export default compare;
