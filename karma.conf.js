module.exports = function(config) {
  config.set({
    browsers: ['ChromeHeadless'],

    frameworks: ['jasmine'],

    files: [
      'test/**/*.js'
    ],

    logLevel: config.LOG_ERROR,

    reporters: ['mocha'],
    mochaReporter: {
      ignoreSkipped: true
    },

    preprocessors: {
      'src/**/*.js': ['rollup'],
      'test/**/*.js': ['rollup']
    },

    rollupPreprocessor: {
      output: {
        format: 'iife',
        sourcemap: 'inline'
      }
    }
  })
}
