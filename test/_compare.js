import assert from 'node:assert/strict';

function compare(input, output, print) {
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
  if (typeof output === 'string') {
    assert.equal(applied, output);
  } else {
    assert.deepStrictEqual(applied, output);
  }
}

compare.use = _compare => {
  compare._compare = _compare;
};

export default compare;
