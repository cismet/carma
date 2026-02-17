import type { Meta, StoryObj } from "@storybook/react";
import { RESOLUTION_SCALE } from "./helpers/constants";
import {
  ResolutionScaleStory,
  type ResolutionScaleControls,
} from "./storyScenarios";

const meta: Meta<ResolutionScaleControls> = {
  title: "MapFrameworkSwitcher/Resolution Scale",
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    resolutionScale: {
      control: {
        type: "inline-radio",
        labels: RESOLUTION_SCALE.labels,
      },
      options: RESOLUTION_SCALE.options,
      description: "Cesium render resolution scale",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "1.0" },
      },
    },
    useBrowserRecommendedResolution: {
      control: "boolean",
      description: "Use browser recommended resolution (ignores DPR)",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
      },
    },
  },
};

export default meta;

export const ResolutionScale: StoryObj<ResolutionScaleControls> = {
  name: "Resolution Scale",
  args: {
    resolutionScale: 1.0,
    useBrowserRecommendedResolution: false,
  },
  render: (args) => <ResolutionScaleStory {...args} />,
};
