import type { Meta, StoryObj } from "@storybook/react";

import {
  CAPTURE_026_CAMERA_PROJECTIONS,
  CAPTURE_026_GEORADAR_RENDER_MODES,
  CAPTURE_026_SURFACE_ELEVATION_SOURCES,
  Capture026CollocatedScene,
  GEORADAR_DEFAULT_RENDER_DISTANCE_METERS,
  GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS,
  GEORADAR_MINIMUM_RENDER_DISTANCE_METERS,
  TRAJECTORY_ALIGNMENT_MODES,
} from "../components/Capture026CollocatedScene";

const meta = {
  id: "georadar-trassenansicht",
  title: "Georadar/Trassen und Schnittvolumen",
  component: Capture026CollocatedScene,
  parameters: {
    controls: {
      sort: "none",
      include: [
        "showGeoradar",
        "georadarRenderDistance",
        "georadarRenderMode",
        "georadarDepthInverted",
        "surfaceElevationSource",
        "alignmentMode",
        "trajectoryOffsetForward",
        "trajectoryOffsetDown",
        "trajectoryOffsetRight",
        "cameraProjection",
      ],
    },
    docs: {
      description: {
        component:
          "Eigenständige Georadaransicht mit demselben Streaming-, LOD-, Ausrichtungs- und Schnitteditor wie die multimodale Szene. Mesh und Bildquellen bleiben ausgeblendet. Das ETRS89-/UTM-32N-Raster wird auf GRS80 in ellipsoidischer Referenzhöhe abgebildet. Seine WebGPU-Linien behalten eine konstante Screen-Space-Breite; zu dicht stehende 1-m-Linien werden auf Distanz ausgeblendet.",
      },
    },
  },
  argTypes: {
    georadarRenderDistance: {
      name: "Renderdistanz · m",
      control: {
        type: "range",
        min: GEORADAR_MINIMUM_RENDER_DISTANCE_METERS,
        max: GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS,
        step: 10,
      },
    },
    georadarRenderMode: {
      name: "Renderer",
      control: { type: "inline-radio" },
      options: CAPTURE_026_GEORADAR_RENDER_MODES,
    },
    surfaceElevationSource: {
      name: "Höhenquelle",
      control: { type: "select" },
      options: CAPTURE_026_SURFACE_ELEVATION_SOURCES,
    },
    alignmentMode: {
      name: "Ausrichtung",
      control: { type: "inline-radio" },
      options: TRAJECTORY_ALIGNMENT_MODES,
    },
    cameraProjection: {
      name: "Kameraprojektion",
      control: { type: "inline-radio" },
      options: CAPTURE_026_CAMERA_PROJECTIONS,
    },
  },
  args: {
    radarOnly: true,
    showGeoradar: true,
    georadarRenderDistance: GEORADAR_DEFAULT_RENDER_DISTANCE_METERS,
    georadarRenderMode: "volume",
    georadarDepthInverted: false,
    surfaceElevationSource: "dgm-2020",
    alignmentMode: "surface-curve",
    trajectoryOffsetForward: 0,
    trajectoryOffsetDown: 0,
    trajectoryOffsetRight: 0,
    cameraProjection: "perspective",
    showMesh2024: false,
    showNivPoints: false,
    showPanoramas: false,
    planar3Mode: "hidden",
    showPlanar2: false,
  },
} satisfies Meta<typeof Capture026CollocatedScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MetrischesBodenraster: Story = {
  name: "ETRS89 / UTM32N-Raster",
};
