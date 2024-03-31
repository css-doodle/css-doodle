import info from './package.json' assert { type: 'json' };

export default {
  input: 'src/index.js',
  output: {
    format: 'iife',
    file: 'css-doodle.js',
    banner: `/*! css-doodle v${info.version} MIT licensed */`
  }
}
