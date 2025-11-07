const nx = require("@nx/eslint-plugin");
const tseslint = require("typescript-eslint");
const a11y = require("eslint-plugin-jsx-a11y");
const importPlugin = require("eslint-plugin-import");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");
const globals = require("globals");
const carmaPlugin = require("./scripts/eslint/carma.eslint.plugin");
const { noReduxConfig, noReactConfig, allowlistConfig } = carmaPlugin;

delete globals.browser["AudioWorkletGlobalScope "]; // some weird bug

// ============================================================================
// CARMA-specific monorepo rules and configs
// ============================================================================

const TYPE_DECLARATIONS_PATTERN = "libraries/**/types/src/**/*.d.ts";


const typeDeclarationsConfig = {
  name: "CARMA Types Declarations (lightweight)",
  files: [TYPE_DECLARATIONS_PATTERN],
  plugins: {
    "@typescript-eslint": tseslint.plugin,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      EXPERIMENTAL_useProjectService: false,
    },
    globals: {
      ...globals.browser,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};

// ============================================================================
// Base configuration (generic rules, no paths)
// ============================================================================

const baseConfig = {
  name: "Base Config",
  plugins: {
    import: importPlugin,
    "jsx-a11y": a11y,
    nx,
    react,
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "@typescript-eslint": tseslint.plugin,
    carma: carmaPlugin,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      tsconfigRootDir: __dirname,
      // Use explicit central project to avoid default project fallback & perf warning
      project: ['./tsconfig.eslint.json', 'playgrounds/stories/tsconfig.storybook.json'],
      //allowDefaultProjectForFiles: [        "./*.json"      ], // TODO Limit Scope
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
    "react-hooks/exhaustive-deps": [
      "warn",


    ],
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "nx/enforce-module-boundaries": [
      "error",
      {
        enforceBuildableLibDependency: true,
        // type only is fine
        allow: [
          "@carma/types",
          "@carma/geo/types",
          "@carma/units/types",
          "@carma/cesium-types",
        ],
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
        alwaysTryTypes: true,
        project: [
          `${__dirname}/tsconfig.base.json`,
          `${__dirname}/tsconfig.*.json`,
        ],
      },
    },
    react: {
      version: "detect",
    },
  },
};

// ============================================================================
// Final configuration
// ============================================================================

function getCarmaConfigs(baseConfig) {
  return [
    // Strict rules for apps, libraries, and envirometrics
    {
      ...baseConfig,
      name: "CARMA Strict Rules (apps/libraries)",
      files: [
        "apps/**/*.ts",
        "apps/**/*.tsx",
        "libraries/**/*.ts",
        "libraries/**/*.tsx",
        "envirometrics/**/*.ts",
        "envirometrics/**/*.tsx",
      ],
      ignores: [TYPE_DECLARATIONS_PATTERN, "**/__stories__/**", "**/*.stories.*"],
      rules: {
        ...baseConfig.rules,
        "carma/no-direct-proj4": "warn",
        "carma/no-direct-cesium": "warn",
        "carma/no-direct-leaflet": "off",
        "carma/no-direct-maplibre": "off",
      },
    },
    // Path-specific import restrictions using helper functions (see scripts/eslint/restrictedImports.js)
    noReduxConfig(
      baseConfig,
      ["libraries/**/*.ts", "libraries/**/*.tsx"],
      [TYPE_DECLARATIONS_PATTERN]
    ),
    noReactConfig(baseConfig, [
      "libraries/mapping/engines-interop/**/*.ts",
      "libraries/commons/geo/**/*.ts",
      "libraries/commons/math/**/*.ts",
      "libraries/commons/units/**/*.ts",
      "libraries/commons/utils/**/*.ts",
    ]),
    // Allow React imports in hooks directories (React-specific by nature)
    {
      ...baseConfig,
      name: "Hooks (React allowed)",
      files: ["**/hooks/**/*.ts", "**/hooks/**/*.tsx"],
      rules: {
        ...baseConfig.rules,
        "no-restricted-imports": "off",
      },
    },
    allowlistConfig(baseConfig, {
      name: "Cesium API (allowlist)",
      files: [
        "libraries/mapping/engines/cesium/api/**/*.ts",
        "libraries/mapping/engines/cesium/api/**/*.tsx",
      ],
      ignores: [
        "libraries/mapping/engines/cesium/api/**/*.config.*",
        "libraries/mapping/engines/cesium/api/**/*.d.ts",
      ],
      allowedPackages: ["cesium", "@carma/units/*", "@carma/geo/*", "@carma/math"],
      message:
        "Cesium API can only import: cesium, @carma/units/*, @carma/geo/*, @carma/math. All other packages are blocked.",
    }),
    allowlistConfig(baseConfig, {
      name: "Math library (dependency-free)",
      files: [
        "libraries/commons/math/**/*.ts",
      ],
      ignores: [
        "libraries/commons/math/**/*.config.*",
        "libraries/commons/math/**/*.d.ts",
        "libraries/commons/math/**/*.spec.ts",
      ],
      allowedPackages: [],
      message:
        "Math library must be dependency-free. No external imports allowed.",
    }),
    // Relaxed rules for playground
    {
      ...baseConfig,
      name: "Playground (relaxed rules)",
      files: ["playground/**/*.ts", "playground/**/*.tsx"],
      rules: {
        ...baseConfig.rules,
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "react/prop-types": "off",
        "carma/no-direct-proj4": "off",
        "carma/no-direct-cesium": "off",
        "carma/no-direct-leaflet": "off",
        "carma/no-direct-maplibre": "off",
      },
    },
    // Lightweight config for type declarations
    typeDeclarationsConfig,
  ];
}

module.exports = getCarmaConfigs(baseConfig);
