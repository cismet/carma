import type { Meta, StoryObj } from "@storybook/react";

import { PointCloudPlayground } from "../../../ng-topicmap-playground/src/app/pointcloud/PointCloudPlayground";
import { CarmaMapStoryProviders } from "../components/CarmaMapStoryProviders";

const meta = {
  title: "Pointcloud Investigation/MapLibre Integration",
  component: PointCloudPlayground,
  decorators: [
    (Story) => (
      <CarmaMapStoryProviders>
        <Story />
      </CarmaMapStoryProviders>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Uses the real CARMA MapLibre path to combine a COPC custom layer, Fraunhofer GeoJSON classification geometry, ALKIS vector tiles and raster-DEM terrain.",
      },
    },
  },
} satisfies Meta<typeof PointCloudPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PointCloudVectorAndElevation: Story = {
  args: {
    initialCloudIds: ["seg2512"],
    initialBuildingsEnabled: true,
    fraunhoferGeoJsonUrl: "/fraunhofer-geojson/all_vegetation.geojson",
    showMapControls: false,
    showScenePanel: false,
  },
};
