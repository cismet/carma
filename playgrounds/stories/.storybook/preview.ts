import type { Preview } from "@storybook/react";

import "../src/styles.css";
import "../../../libraries/mapping/annotations/runtime/src/lib/interaction/annotation-overlay-line-label.css";

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
