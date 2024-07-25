const nx = require("@nx/eslint-plugin");
const ts = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const eslint = require("@eslint/js");
const a11y = require("eslint-plugin-jsx-a11y");
const cypress = require("eslint-plugin-cypress");
const importPlugin = require("eslint-plugin-import");
const react = require("eslint-plugin-react");
const hooksPlugin = require("eslint-plugin-react-hooks");
const globals = require("globals");

delete globals.browser["AudioWorkletGlobalScope "]; // some weird bug

const baseConfig = {
  ...eslint.configs.recommended,
  name: "Base Config",
  files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  //ignores: ["**/*.cy.ts"],
  plugins: {
    import: importPlugin,
    "jsx-a11y": a11y,
    nx,
    react,
    "react-hooks": hooksPlugin,
    "@typescript-eslint": ts,
  },
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2022,
      project: "{projectRoot}tsconfig.json",
      ecmaFeatures: {
        jsx: true,
        modules: true,
      },
      sourceType: "module",
    },
    globals: {
      __dirname: "readonly",
      ...globals.browser,
    },
  },
  rules: {
    ...ts.configs["eslint-recommended"].rules,
    ...ts.configs["recommended"].rules,
    ...a11y.configs["recommended"].rules,
    //...importPlugin.configs["recommended"].rules,
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "jsx-a11y/anchor-is-valid": "warn",
    "jsx-a11y/alt-text": "warn",
    "jsx-a11y/aria-role": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/interactive-supports-focus": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/no-autofocus": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "react/jsx-uses-react": "error",
    "react/jsx-uses-vars": "error",
    "nx/enforce-module-boundaries": [
      "error",
      {
        enforceBuildableLibDependency: true,
        allow: [],
        depConstraints: [
          {
            sourceTag: "*",
            onlyDependOnLibsWithTags: ["*"],
          },
        ],
      },
    ],
  },
  settings: {
    "import/parsers": {
      espree: [".js", ".cjs", ".mjs", ".jsx"],
      "@typescript-eslint/parser": [".ts", ".mts", ".mtx"],
    },
    "import/resolver": {
      ...importPlugin.configs.typescript.settings["import/resolver"],
    },
  },
};

const cypressConfig = {
  name: "E2E Cypress Config",
  ...baseConfig,
  ...cypress.recommended,
  //plugins: { ...baseConfig.plugins, cypress },
  files: ["e2e/**/*.cy.ts"],
  //ignores: [],
};

// order here specific to least specific
module.exports = [baseConfig, cypressConfig];
