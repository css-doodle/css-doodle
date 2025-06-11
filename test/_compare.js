import assert from 'node:assert/strict';

function compare(input, output, print, _fn) {
  let fn = _fn ?? compare._compare;
  if (typeof fn !== 'function') {
    throw new Error("Missing comparison function.");
  }
  let applied;
  if (Array.isArray(input)) {
    applied = fn(...input);
  } else {
    applied = fn(input);
  }
  if (print) console.log(JSON.stringify(applied, null, 2));
  if (typeof output === 'string') {
    assert.equal(applied, output);
  } else {
    assert.deepStrictEqual(applied, output);
  }
}

compare.use = (_compare, modifier) => {
  if (typeof _compare === 'function') {
    compare._compare = _compare;
  } else if (typeof _compare === 'object') {
    Object.entries(_compare).forEach(([name, fn]) => {
      if (typeof fn === 'function') {
        compare[name] = (input, output, print) => {
          if (modifier) {
            return compare(input, output, print, modifier(fn));
          }
          return compare(input, output, print, fn);
        };
      } else {
        throw new Error(`Invalid comparison function for ${name}`);
      }
    });
  }
};

export default compare;
