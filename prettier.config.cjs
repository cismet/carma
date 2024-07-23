// if nx ever supports prettier 3 change this to mjs
// this is for 2.8
// https://github.com/prettier/prettier/blob/1b7fad52558e16444399d11ff2d89aa8ed895c77/docs/configuration.md

// defaults commented out
// github.com/prettier/prettier/blob/1b7fad52558e16444399d11ff2d89aa8ed895c77/docs/options.md

module.exports = {
  //arrowParens: "always",
  //bracketSpacing: 'true',
  singleQuote: true,
  trailingComma: 'all',
  //semi: true,
  //tabWidth: 2,
  //useTabs: false,
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
  ],
};
