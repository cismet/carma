import "../src/styles.css";
import type { Preview } from "@storybook/react";
import * as React from "react";

type StorybookRequireShim = {
  require?: (id: string) => unknown;
};

const storybookRequireTarget = globalThis as typeof globalThis &
  StorybookRequireShim;

if (typeof storybookRequireTarget.require !== "function") {
  storybookRequireTarget.require = (id: string) => {
    if (id === "react") {
      return React;
    }

    throw new Error(
      `[storybook require shim] Unsupported dynamic require: ${id}`
    );
  };
}

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      panelPosition: "right",
      storySort: {
        order: [
          "Geo",
          [
            "Zoom by Latitude Overview",
            "Range by FOV and Resolution",
            "Mercator Zoom",
          ],
          "Mapping",
          ["MapFrameworkSwitcher", "ViewSync", "Annotations", "Controls"],
          "Mapping Components",
          ["Controls", "Geo", "Gizmo", "Cesium", "Camera State Visualizer"],
          "Overlay",
          ["Layout", "Labels", "Labels (WIP)"],
          "Common",
          ["UI", "Formatter", "Svg", "Math"],
        ],
      },
    },
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
};

export default preview;
