module.exports = function(config) {
  config.set({
    browsers: ['ChromeHeadless', 'Firefox'],

    frameworks: ['jasmine'],

    files: [
      'test/*.js'
    ],

    preprocessors: {
      'src/**/*.js': ['rollup'],
      'test/**/*.js': ['rollup'],
    },

    rollupPreprocessor: {
      output: {
        format: 'iife',
        sourcemap: 'inline'
      }
    }
  })
}
