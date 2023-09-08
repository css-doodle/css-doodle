import info from './package.json' assert { type: 'json' };

export default {
  input: 'src/index.js',
  output: {
    format: 'umd',
    file: 'css-doodle.js',
    name: 'CSSDoodle',
    banner: `/*! css-doodle@${ info.version } */`
  }
}
