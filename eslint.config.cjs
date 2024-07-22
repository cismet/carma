const nx = require("@nx/eslint-plugin");
const ts = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const eslint = require("@eslint/js");
//const typescript = require('@typescript-eslint/eslint-plugin');
const react = require("eslint-plugin-react");
const globals = require("globals");

delete globals.browser["AudioWorkletGlobalScope "] // some weird bug

module.exports = [
  eslint.configs.recommended,
  //  ...reactConfig,

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: { nx: nx, react: react, "@typescript-eslint": ts },
    languageOptions: {
      ecmaVersion: 2022,
      parser: tsParser,
      //sourceType: "module",
      parserOptions: {
        project: "{projectRoot}tsconfig.json",
        ecmaFeatures: {
          jsx: true,
          modules: true,
        },
      },
      globals: {
        __dirname: "readonly",
        ...globals.browser,
      },
    },
    rules: {
      ...ts.configs['eslint-recommended'].rules,
      ...ts.configs['recommended'].rules,
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
  },
];
