import type { Meta, StoryObj } from "@storybook/react";

import { LeafletCesiumStory } from "./storyScenarios";
const meta: Meta = {
  title: "Map Navigation/Engine Switching",
  id: "mapping-mapframeworkswitcher",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const LeafletCesium: StoryObj = {
  name: "Leaflet Cesium",
  render: () => <LeafletCesiumStory />,
};
