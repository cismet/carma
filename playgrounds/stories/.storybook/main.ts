import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig, type UserConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.@(mdx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "playgrounds/stories/vite.config.mts",
      },
    },
  },
  async viteFinal(baseConfig) {
    const proxyConfig: UserConfig = {
      server: {
        proxy: {
          "/__wupp_terrain__": {
            target: "https://cesium-wupp-terrain.cismet.de",
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/__wupp_terrain__/, ""),
          },
          "/__wupp_3d__": {
            target: "https://wupp-3d-data.cismet.de",
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/__wupp_3d__/, ""),
          },
        },
      },
    };

    if (process.env.BASE_URL) {
      proxyConfig.base = process.env.BASE_URL;
    }

    return mergeConfig(baseConfig, proxyConfig);
  },
};

export default config;

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs
