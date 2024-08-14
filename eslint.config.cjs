const nx = require("@nx/eslint-plugin");
const tseslint = require("typescript-eslint");
const a11y = require("eslint-plugin-jsx-a11y");
const cypress = require("eslint-plugin-cypress");
const importPlugin = require("eslint-plugin-import");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");
const globals = require("globals");

delete globals.browser["AudioWorkletGlobalScope "]; // some weird bug

const baseConfig = {
  name: "Base Config",
  files: ["**/*.ts", "**/*.tsx"],
  plugins: {
    import: importPlugin,
    "jsx-a11y": a11y,
    nx,
    react,
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "@typescript-eslint": tseslint.plugin,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      tsconfigRootDir: __dirname,
      EXPERIMENTAL_useProjectService: true,
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
    ...tseslint.configs.strictTypeChecked.rules,
    ...react.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    ...a11y.configs.recommended.rules,
    ...importPlugin.configs.recommended.rules,
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "jsx-a11y/anchor-is-valid": "warn",
    "jsx-a11y/alt-text": "warn",
    "jsx-a11y/aria-role": ["warn",
      {
        "allowedInvalidRoles": ["sync"], // TODO update react-cismap to use other name for role prop
      }
    ],
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/interactive-supports-focus": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/no-autofocus": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "react/display-name": "off",
    "react/jsx-key": "warn",
    "react/jsx-no-undef": ["error", { allowGlobals: true }],
    "react/jsx-uses-react": "error",
    "react/jsx-uses-vars": "error",
    "react/jsx-no-target-blank": "off", // noopener now set by browsers
    "react/no-unescaped-entities": "off", // TODO discuss template format
    "react/prop-types": "warn",
    "react/react-in-jsx-scope": "off", // not needed with jsx since react 17
    "react-hooks/exhaustive-deps": "warn",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
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
      "@typescript-eslint/parser": [".ts", ".tsm", ".tsx"],
    },
    "import/resolver": {
      ...importPlugin.configs.typescript.settings["import/resolver"],
      typescript: {
        project: ["./tsconfig.*.json"],
      },
    },
    react: {
      version: "detect",
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
