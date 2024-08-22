import it from 'node:test';

import compare from './_compare.js';
import get_named_arguments from '../src/utils/get-named-arguments.js';

compare.use(get_named_arguments);

it('named arguments', () => {

  compare([['a', 'b'], ['a', 'b']], {
    a: 'a',
    b: 'b'
  });

  compare([['a=8', 'b=9'], ['a', 'b']], {
    a: '8',
    b: '9'
  });

  compare([['8', '7', 'b=9'], ['a', 'b']], {
    a: '8',
    b: '9'
  });

  compare([['a=8', '9'], ['a', 'b']], {
    a: '8'
  });

  compare([['a=8', 'c=9'], ['a', 'b']], {
    a: '8'
  });

  compare([['a=8', 'c=9'], ['a', 'b', 'x']], {
    a: '8'
  });

  compare([['a=8', 'c=9'], ['a', 'b', 'x']], {
    a: '8'
  });

  compare([['a=@r(100 = 3)', 'b=9'], ['a', 'b', 'x']], {
    a: '@r(100 = 3)',
    b: '9'
  });

});
