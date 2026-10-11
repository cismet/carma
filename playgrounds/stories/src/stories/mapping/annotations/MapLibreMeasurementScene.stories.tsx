import type { Meta, StoryObj } from "@storybook/react";

import {
  MeasurementStory,
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
  type MeasurementStoryProps,
} from "./measurement-story-harness";

/**
 * The 3D measurement scene the measurement3d addon ships with: the Mesh
 * 2024 at the Rathaus Barmen courtyard with one measurement of every type,
 * each partly hidden by the pavilion or the dormer. The same scene as the
 * geoportal test link, without the geoportal: the MapLibre engine, the
 * runtime and the built-in tools alone. One story per tool with its states
 * lives under Mapping/Annotations/Tools.
 */

type MeasurementSceneArgs = Pick<
  MeasurementStoryProps,
  "surfaceTiles" | "showAllTools" | "meterMarkers"
>;

const MapLibreMeasurementScene = (args: MeasurementSceneArgs) => (
  <MeasurementStory
    {...args}
    storageKey="carma::stories::maplibre-measurement-scene"
  />
);

const meta = {
  title: "Mapping/Annotations/MapLibre Measurement Scene",
  id: "mapping-annotations-maplibre-measurement-scene",
  component: MapLibreMeasurementScene,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Mesh 2024 at the Rathaus Barmen courtyard with one measurement of every type, each partly hidden by the pavilion or the dormer: point, distance, polyline, ground area, three planar roof areas and two vertical areas. Lines draw in the shared Three scene with a dashed depth-fail pass for the hidden parts, area fills carry a metric dot screen that foreshortens with the surface. The fixture is the same scene as the geoportal test link.",
      },
    },
  },
  args: measurementStoryDefaultArgs,
  argTypes: measurementStoryArgTypes,
} satisfies Meta<typeof MapLibreMeasurementScene>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RathausBarmenCourtyard: Story = {};

export const StableToolsOnly: Story = {
  args: { showAllTools: false },
};
