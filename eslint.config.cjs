const nx = require('@nx/eslint-plugin');
const ts = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const eslint = require('@eslint/js');
//const typescript = require('@typescript-eslint/eslint-plugin');
const cypress = require('eslint-plugin-cypress');
const react = require('eslint-plugin-react');
const globals = require('globals');

delete globals.browser['AudioWorkletGlobalScope ']; // some weird bug

const baseConfig = {
  ...eslint.configs.recommended,
  name: 'Base Config',
  files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  //ignores: ["**/*.cy.ts"],
  plugins: { nx, react, '@typescript-eslint': ts },
  languageOptions: {
    ecmaVersion: 2022,
    parser: tsParser,
    //sourceType: "module",
    parserOptions: {
      project: '{projectRoot}tsconfig.json',
      ecmaFeatures: {
        jsx: true,
        modules: true,
      },
    },
    globals: {
      __dirname: 'readonly',
      ...globals.browser,
    },
  },
  rules: {
    ...ts.configs['eslint-recommended'].rules,
    ...ts.configs['recommended'].rules,
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    'nx/enforce-module-boundaries': [
      'error',
      {
        enforceBuildableLibDependency: true,
        allow: [],
        depConstraints: [
          {
            sourceTag: '*',
            onlyDependOnLibsWithTags: ['*'],
          },
        ],
      },
    ],
  },
};

const cypressConfig = {
  name: 'E2E Cypress Config',
  ...baseConfig,
  ...cypress.recommended,
  //plugins: { ...baseConfig.plugins, cypress },
  files: ['e2e/**/*.cy.ts'],
  //ignores: [],
};

// order here specific to least specific
module.exports = [
  baseConfig,
  cypressConfig,
];
