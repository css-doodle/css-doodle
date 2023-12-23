import parse_value_group from '../parser/parse-value-group.js';

export default function get_named_arguments(args, names) {
  let result = {};
  let order = true;
  for (let i = 0; i < args.length; ++i) {
    let arg = args[i];
    let arg_name = names[i];
    if (/=/.test(arg)) {
      let [name, value] = parse_value_group(arg, { symbol: '=', noSpace: true });
      if (value !== undefined) {
        if (names.includes(name)) {
          result[name] = value;
        }
        // ignore the rest unnamed arguments
        order = false;
      } else {
        result[arg_name] = arg;
      }
    } else if (order) {
      result[arg_name] = arg;
    }
  }
  return result;
}
