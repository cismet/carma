import type { StorybookConfig } from "@storybook/react-vite";

// These options were migrated by @nx/storybook:convert-to-inferred from the project.json file.
const configValues = { default: {}, ci: {} };

// Determine the correct configValue to use based on the configuration
const nxConfiguration = process.env.NX_TASK_TARGET_CONFIGURATION ?? "default";

const options = {
  ...configValues.default,
  ...(configValues[nxConfiguration] ?? {}),
};

const config: StorybookConfig = {
  stories: ["../src/lib/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-docs"],

  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "./vite.config.ts",
      },
    },
  },

  docs: {},

  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      tsconfigPath:
        "libraries/mapping/carma-map-control-layout/tsconfig.storybook.json",
    },
  },
};

export default config;

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs
