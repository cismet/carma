import type { Preview } from "@storybook/react";

import "../src/styles.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      panelPosition: "right",
      storySort: {
        order: [
          "Pointcloud Investigation",
          [
            "Overview",
            "Point Clouds",
            "Georadar Volume",
            "Capture 026",
            "Elevation Calibration",
            "MapLibre Integration",
          ],
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
