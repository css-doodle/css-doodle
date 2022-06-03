import test from 'ava';
import compare from './_compare.js';
import get_named_arguments from '../src/utils/get-named-arguments.js';

compare.use(get_named_arguments);

test.only('named arguments', t => {

  compare(t, [['a', 'b'], ['a', 'b']], {
    a: 'a',
    b: 'b'
  });

  compare(t, [['a=8', 'b=9'], ['a', 'b']], {
    a: '8',
    b: '9'
  });

  compare(t, [['8', '7', 'b=9'], ['a', 'b']], {
    a: '8',
    b: '9'
  });

  compare(t, [['a=8', '9'], ['a', 'b']], {
    a: '8'
  });

  compare(t, [['a=8', 'c=9'], ['a', 'b']], {
    a: '8'
  });

  compare(t, [['a=8', 'c=9'], ['a', 'b', 'x']], {
    a: '8'
  });

  compare(t, [['a=8', 'c=9'], ['a', 'b', 'x']], {
    a: '8'
  });

  compare(t, [['a=@r(100 = 3)', 'b=9'], ['a', 'b', 'x']], {
    a: '@r(100 = 3)',
    b: '9'
  });

});
