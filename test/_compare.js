import parseVar from '../src/parser/parse-var';

function compare(t, input, output, print) {
  let applied = compare._compare(input);
  if (print) console.log(JSON.stringify(applied, null, 2));
  t.deepEqual(output, applied);
}

compare._compare = function() {};

compare.use = _compare => {
  compare._compare = _compare;
};

export default compare;
