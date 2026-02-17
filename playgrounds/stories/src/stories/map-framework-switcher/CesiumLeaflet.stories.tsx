import type { Meta, StoryObj } from "@storybook/react";
import { CesiumLeafletStory } from "./storyScenarios";

const meta: Meta = {
  title: "MapFrameworkSwitcher/Cesium Leaflet",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const CesiumLeaflet: StoryObj = {
  name: "Cesium Leaflet",
  render: () => <CesiumLeafletStory />,
};
