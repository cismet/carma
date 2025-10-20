import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

const config: StorybookConfig = {
  stories: ["../src/__stories__/**/*.stories.@(js|jsx|ts|tsx|mdx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  async viteFinal(config) {
    // Find workspace root by going up from this .storybook directory
    const workspaceRoot = resolve(__dirname, "../../../../../..");
    
    return mergeConfig(config, {
      plugins: [
        // Copy Cesium runtime assets (Workers, Assets, etc.)
        viteStaticCopy({
          targets: [
            {
              src: resolve(workspaceRoot, "node_modules/cesium/Build/Cesium/*"),
              dest: "cesium",
            },
          ],
          silent: false,
        }),
      ],
    });
  },
};

export default config;
