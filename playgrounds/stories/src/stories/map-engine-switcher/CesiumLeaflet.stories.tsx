import type { Meta, StoryObj } from "@storybook/react";
import { CesiumLeafletStory } from "./storyScenarios";

const meta: Meta = {
  title: "Mapping/MappingEngineSwitcher",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const CesiumLeaflet: StoryObj = {
  name: "Cesium Leaflet",
  render: () => <CesiumLeafletStory />,
};
