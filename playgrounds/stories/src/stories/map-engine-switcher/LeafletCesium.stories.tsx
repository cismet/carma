import type { Meta, StoryObj } from "@storybook/react";

import { LeafletCesiumStory } from "./storyScenarios";
const meta: Meta = {
  title: "Mapping/MapFrameworkSwitcher",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const LeafletCesium: StoryObj = {
  name: "Leaflet Cesium",
  render: () => <LeafletCesiumStory />,
};
