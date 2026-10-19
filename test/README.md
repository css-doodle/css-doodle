# Tests

`npm test` runs every file under `core/`, `parser/`, `generator/`,
`component/`, `lib/` and `fuzz/` with `node:test`; `npm run test:dev`
prints the full spec output. A single file runs with
`node --test test/parser/parse-css.js`.

Each test file covers the source file of the same path:
`test/parser/parse-css.js` tests `src/parser/parse-css.js`,
`test/generator/css.js` tests `src/generator/css.js`, and so on.

- `corpus/` — the fixture cases plus every `<css-doodle>` in the `*.html`
  files at the repo root. Shared by the fuzz tests, the perf scripts and
  the local golden harness; not a test itself.
- `fuzz/` — seeded mutation and equivalence fuzzing; `grammar.js`
  generates valid doodles from the productions of `docs/grammar.md`.
  `FUZZ_TEMPLATE_SEED`/`FUZZ_TEMPLATE_ROUNDS` and
  `FUZZ_GRAMMAR_SEED`/`FUZZ_GRAMMAR_ROUNDS` tune those two.
- `browser/` — `npm run test:browser` draws the source tree in the
  installed Chrome: each case in `cases.js` must draw, warn and look as
  its entry says, `prerender()` and `image()` must paint the same pixels
  as the element, and `component.js` drives updates, pause/resume,
  resizing and `export()`. macOS draws on the GPU, anywhere else on
  SwiftShader (`CSSD_GPU=swiftshader` forces it, `CHROME_PATH` picks a
  binary). `npm run test:pixel` compares the cases with goldens of this
  machine in the gitignored `browser/golden/`.
- `perf/`, `local/` — benchmarks and the AST/output golden harness. Both
  are gitignored and run by hand, for example
  `node test/perf/generate-bench.js 40`.
