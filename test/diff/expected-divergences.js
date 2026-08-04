/**
 * Cases allowed to differ between the legacy and rewritten pipelines,
 * keyed by case name, with the reason (see the divergence list in the
 * rewrite plan: D1 spacing, D2 trailing spaces, D3/D4 comment leaks,
 * D5 escaped quotes, D6 mixed quotes in args, D7 @use/probe fixes,
 * D8 pseudos inside non-selector conds; function.js rewrite: D9 @nd,
 * D10 @n outside sequences, D11 @m without actions, D12 @hex).
 */
export default new Map([
  ['func-nd',
    'D9: @nd computes its value; legacy leaked the calc_with closure source'],
  ['func-index-vars',
    'D10: @n/@nx/@ny in arguments echo their token outside sequences; legacy emitted "undefined"'],
  ['func-n-in-argument',
    'D10: @n/@nx/@ny in arguments echo their token outside sequences; legacy emitted "undefined"'],
  ['func-m-no-action',
    'D11: @m with no actions emits nothing; legacy emitted the bare joins (",,")'],
  ['func-hex',
    'D12: @hex echoes unparsable input; legacy emitted "NaN"'],
  ['comment-leading-tight',
    'D3: /*x*/color no longer parses as property "olor"'],
  ['content-escaped-quote',
    'D5: escaped quote no longer swallows the terminating ; and the next rule'],
  ['stray-semicolons',
    'legacy consumed one char after an at-rule, corrupting the next property (color -> olor)'],
  ['value-lt-in-word',
    'legacy re-parsed the tail after < as an at-rule "/b;"; the tag skip now eats it'],
  ['cond-media-pseudo',
    'D8: pseudo selectors inside @media/@supports are emitted now; legacy dropped them via a dead branch'],
]);
