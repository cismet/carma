import type { Meta, StoryObj } from "@storybook/react";
import { Vector3 } from "three";
import { carma, type EcefVector } from "@carma-api";
import { ecefFromGeographicCoordinate, enuOffsetToEcef } from "@carma-geo/proj";
import { type AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  MeasurementStory,
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
  type MeasurementStoryProps,
} from "./measurement-story-harness";
import {
  fixtureCoordinates,
  loadMeasurementStoryFixture,
  waitForMeasurementStory,
} from "./measurement-story-play";

/** The measurement3d test scene: one measurement of every type, partly hidden. */

const MapLibreMeasurementScene = (
  args: Pick<
    MeasurementStoryProps,
    "surfaceTiles" | "showAllTools" | "meterMarkers"
  >
) => <MeasurementStory {...args} />;

const meta = {
  title: "Mapping/Annotations/MapLibre Measurement Scene",
  id: "mapping-annotations-maplibre-measurement-scene",
  component: MapLibreMeasurementScene,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Mesh 2024 at the Rathaus Barmen courtyard with one measurement of every type, partly hidden by the pavilion or the dormer; the scene of the geoportal test link.",
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

/** Looking at a measurement from 90 m south and 70 m above its centroid. */
const viewOf = (coordinates: readonly AnnotationGeographicCoordinate[]) => {
  const target = coordinates
    .reduce(
      (sum, coordinate) => sum.add(ecefFromGeographicCoordinate(coordinate)),
      new Vector3()
    )
    .divideScalar(Math.max(1, coordinates.length));
  return {
    eye: enuOffsetToEcef(0, -90, 70, target).toArray() as EcefVector,
    target: target.toArray() as EcefVector,
  };
};

/** carma.camera: three look-ats the whole camera morphs to, then back to the start. */
export const CameraTour: Story = {
  play: async ({ canvasElement }) => {
    if (!(await waitForMeasurementStory(canvasElement))) return;
    const fixture = await loadMeasurementStoryFixture();
    const start = carma.camera.getPose();
    for (const id of ["scene-distance-2", "scene-planar-5", "scene-point-1"]) {
      const { eye, target } = viewOf(fixtureCoordinates(fixture, id));
      if (!(await carma.camera.lookAt(eye, target, { durationMs: 2500 })))
        return;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (start) await carma.camera.flyToPose(start, { durationMs: 2500 });
  },
};
