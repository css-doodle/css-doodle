# Tests

`npm test` runs every file under `core/`, `parser/`, `generator/`,
`component/`, `utils/` and `fuzz/` with `node:test`; `npm run test:dev`
prints the full spec output. A single file runs with
`node --test test/parser/parse-css.js`.

Each test file covers the source file of the same path:
`test/parser/parse-css.js` tests `src/parser/parse-css.js`,
`test/generator/css.js` tests `src/generator/css.js`, and so on.

- `corpus/` — the fixture cases plus every `<css-doodle>` in the `*.html`
  files at the repo root. Shared by the fuzz tests, the perf scripts and
  the local golden harness; not a test itself.
- `fuzz/` — seeded mutation and equivalence fuzzing. `FUZZ_TEMPLATE_SEED`
  and `FUZZ_TEMPLATE_ROUNDS` tune the calc template one.
- `perf/`, `local/` — benchmarks and the golden/pixel harness. Both are
  gitignored and run by hand, for example `node test/perf/generate-bench.js 40`.
