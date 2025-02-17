const baseConfig = require("../../../eslint.config.cjs");

module.exports = [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    parserOptions: {
      EXPERIMENTAL_useProjectService: {
        // Increase this value to allow more files
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 1000,
      },
    },
    rules: {},
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    parserOptions: {
      EXPERIMENTAL_useProjectService: {
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 1000,
      },
    },
    rules: {},
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {},
  },
];
