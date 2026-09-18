import type { Preview } from "@storybook/react";

import "../src/styles.css";
import "./standalone-layout.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      panelPosition: "right",
      storySort: {
        order: [
          "Applications",
          ["Point Clouds", "Georadar", "*"],
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
