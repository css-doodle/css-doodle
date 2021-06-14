import calc from '../calc';

export default function nth(input, curr, max) {
  for (let i = 0; i <= max; ++i) {
    if (calc(input, { n: i }) == curr) return true;
  }
}
