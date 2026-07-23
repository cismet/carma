import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig, type UserConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "playgrounds/pointcloud-stories/vite.config.mts",
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
          "/__wupp_festpunkte__": {
            target: "https://wupp-3d-data.cismet.de",
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/__wupp_festpunkte__/, ""),
          },
        },
      },
    };
    return mergeConfig(baseConfig, proxyConfig);
  },
};

export default config;
