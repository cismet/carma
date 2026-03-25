import "../src/styles.css";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      panelPosition: "right",
      storySort: {
        order: [
          "Mapping",
          [
            "Gizmo",
            "Cesium",
            "MapFrameworkSwitcher",
            "ViewSync",
            "Annotations",
          ],
          "Providers",
          ["LabelOverlay"],
          "Common",
          ["UI", "SVG"],
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
