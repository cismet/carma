import type { Meta, StoryObj } from "@storybook/react";

import { TileCameraStressDemo } from "./TileCameraStressDemo";
import {
  TILE_STRESS_DEFAULT_ARGS,
  TILE_STRESS_PRESETS,
} from "./tile-stress-presets";

const meta = {
  title: "Tile Loading Manager/Camera Views",
  id: "tile-loading-manager-camera-views",
  component: TileCameraStressDemo,
  // Conditional controls omit their args from rendering, not just the panel.
  // Keep valid inactive defaults for the shared camera-rig contract.
  render: (args) => (
    <TileCameraStressDemo {...TILE_STRESS_DEFAULT_ARGS} {...args} />
  ),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The main MapLibre view is always the priority camera. Panorama and facade arrays remain secondary demand against the same real mesh or Terrarium source, shared Three scene/renderer and tile pool. Resizable sidebar panels use native MapLibre padding; the main projection passes that focus to the manager. Diagnostic image strips are observations, not certified coverage.",
      },
    },
  },
  args: TILE_STRESS_DEFAULT_ARGS,
  argTypes: {
    scenario: { table: { disable: true } },
    source: { options: ["mesh", "terrain"], control: "radio" },
    preset: {
      options: [
        "Toelleturm",
        "HKW chimney-top virtual eye",
        "Rathaus roof virtual eye",
      ],
      control: "select",
    },
    cameraCount: {
      table: { category: "Camera rig" },
      control: { type: "range", min: 3, max: 64, step: 1 },
      description:
        "Minimum count: every retained shoreline segment gets a camera even if this needs more cameras.",
    },
    mode: {
      table: { category: "Camera rig" },
      options: ["panorama", "object-cover"],
      control: "radio",
    },
    path: {
      table: { category: "Spine and perimeter" },
      options: [
        "perimeter",
        "wupper-bank",
        "schwebebahn",
        "urban-street",
        "custom",
      ],
      control: "select",
    },
    visibleSegments: {
      table: { category: "Array navigation" },
      control: { type: "range", min: 1, max: 30, step: 1 },
      description:
        "Initial visible segment window. Only on-screen cameras request tiles or render.",
    },
    pairedSides: { table: { disable: true } },
    customSpine: {
      table: { category: "Spine and perimeter" },
      control: "object",
      description:
        "Ordered [longitude, latitude, optional elevation] points. Select custom path.",
    },
    closed: {
      table: { category: "Spine and perimeter" },
      control: "boolean",
    },
    side: {
      table: { category: "Spine and perimeter" },
      options: [1, -1],
      control: "radio",
    },
    elevation: {
      table: { category: "Camera rig" },
      control: "number",
      description:
        "Shared array elevation; 0 uses the preset. Spine vertex heights do not move individual panels. Alt-drag shifts the whole array.",
    },
    radius: {
      table: { category: "Camera rig" },
      control: { type: "range", min: 5, max: 500, step: 5 },
    },
    viewHeight: {
      table: { category: "Vertical framing" },
      control: { type: "range", min: 5, max: 300, step: 5 },
      if: { arg: "mode", eq: "object-cover" },
      description:
        "Orthographic object-cover height in metres; ignored by perspective panoramas.",
    },
    cameraOffset: {
      table: { category: "Spine and perimeter" },
      control: { type: "range", min: 1, max: 100, step: 1 },
    },
    referenceSurfaceOffset: {
      table: { category: "Spine and perimeter" },
      control: { type: "number", step: 0.5 },
      description:
        "0 = spine, positive = farther into the scene. Panel edges meet at this depth, not at every depth. Invalid folded/behind-camera surfaces are rejected; no silent clamping.",
    },
    objectReferenceDepth: {
      table: { category: "Camera rig" },
      control: { type: "number", min: 0.1, step: 0.5 },
      description:
        "Inward orthographic wall: depth must be smaller than the cylinder radius and far plane.",
    },
    perimeterClearance: {
      table: { category: "Spine and perimeter" },
      control: { type: "range", min: 2, max: 20, step: 0.5 },
      description:
        "Outward offset of every ALKIS hull edge in scene metres; minimum 2 m. Closed perimeter only.",
    },
    backStreetMargin: {
      table: { category: "Clipping" },
      control: { type: "range", min: 0, max: 20, step: 0.5 },
      description:
        "Far plane margin behind the original hull, fitted separately to each strip. Closed perimeter only.",
    },
    clipBeforeSurface: {
      table: { category: "Clipping" },
      control: { type: "range", min: 0, max: 20, step: 0.1 },
      description: "Must be less than camera offset.",
    },
    clipping: { table: { category: "Clipping" }, control: "boolean" },
    showImagePlanes: { table: { category: "Debug" }, control: "boolean" },
    far: {
      table: { category: "Clipping" },
      control: { type: "range", min: 10, max: 10000, step: 5 },
    },
    pixelError: { options: [2, 4, 8, 16, 32], control: "select" },
    segmentPixels: {
      table: { category: "Preview output" },
      options: [64, 128, 256, 512],
      control: "select",
    },
    previewUpdatesPerSecond: {
      table: { category: "Preview output" },
      control: { type: "range", min: 1, max: 30, step: 1 },
      description: "Total segment updates, not complete panoramas per second.",
    },
    panoramaVerticalFovDegrees: {
      table: { category: "Vertical framing" },
      if: { arg: "mode", eq: "panorama" },
      control: { type: "range", min: 20, max: 120, step: 1 },
      description:
        "Nominal zero-shift vertical FOV. Lens shift changes angular top/bottom coverage; camera count partitions only the horizontal panorama.",
    },
    panoramaPitchDegrees: {
      table: { category: "Vertical framing" },
      if: { arg: "mode", eq: "panorama" },
      control: { type: "range", min: -45, max: 45, step: 1 },
      description:
        "Vertical lens shift keeps adjacent vertical image planes aligned.",
    },
    fitVertical: {
      table: { category: "Vertical framing" },
      control: "boolean",
      description: "Fit the preset vertical window when one is available.",
    },
    spineMergeAngleDegrees: {
      table: { category: "Spine and perimeter" },
      control: { type: "range", min: 0, max: 15, step: 0.5 },
      description:
        "Maximum heading range of near-straight merged edges. Closed footprint retains every hull edge to preserve clearance.",
    },
    verticalPadding: {
      table: { category: "Vertical framing" },
      control: { type: "range", min: 0, max: 50, step: 1 },
      description: "Scene metres added above and below the fitted window.",
    },
    animate: { table: { disable: true } },
    lightCount: { table: { disable: true } },
    lightIntensity: { table: { disable: true } },
    lightRange: { table: { disable: true } },
    shadowMapSize: { table: { disable: true } },
    shadowLightLimit: { table: { disable: true } },
    shadowUpdatesPerSecond: { table: { disable: true } },
    lightMinHeight: { table: { disable: true } },
    lightMaxHeight: { table: { disable: true } },
    orbitSeconds: { table: { disable: true } },
    mastHeight: { table: { disable: true } },
    normalBias: { table: { disable: true } },
    showLightViews: { table: { disable: true } },
    viewLightIndex: { table: { disable: true } },
  },
} satisfies Meta<typeof TileCameraStressDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

const cameraControls = [
  "source",
  "cameraCount",
  "elevation",
  "far",
  "pixelError",
  "segmentPixels",
  "previewUpdatesPerSecond",
  "showImagePlanes",
];
const panoramaControls = [
  ...cameraControls,
  "preset",
  "mode",
  "radius",
  "viewHeight",
  "panoramaVerticalFovDegrees",
  "panoramaPitchDegrees",
];
const facadeParameters = {
  controls: {
    include: [
      ...cameraControls,
      "path",
      "visibleSegments",
      "customSpine",
      "closed",
      "side",
      "fitVertical",
      "viewHeight",
      "verticalPadding",
      "spineMergeAngleDegrees",
      "cameraOffset",
      "referenceSurfaceOffset",
      "perimeterClearance",
      "backStreetMargin",
      "clipping",
      "clipBeforeSurface",
    ],
  },
};
const facadeArgTypes = {
  // Storybook deep-merges argTypes: replace the meta's eq, do not add truthy.
  viewHeight: { if: { arg: "fitVertical", eq: false } },
  customSpine: { if: { arg: "path", eq: "custom" } },
  clipBeforeSurface: { if: { arg: "clipping", truthy: true } },
};

export const Panorama: Story = {
  name: "Toelleturm panorama",
  parameters: { controls: { include: panoramaControls } },
};
export const HkwChimneyTopPanorama: Story = {
  parameters: { controls: { include: panoramaControls } },
  args: {
    preset: "HKW chimney-top virtual eye",
    panoramaPitchDegrees: -18,
  },
};
export const RathausRoofPanorama: Story = {
  name: "Rathaus roof panorama · review",
  parameters: { controls: { include: panoramaControls } },
  args: {
    preset: "Rathaus roof virtual eye",
    panoramaPitchDegrees: -12,
  },
};
export const ClosedFacade: Story = {
  name: "Rathaus perimeter unroll · review",
  parameters: facadeParameters,
  argTypes: facadeArgTypes,
  args: {
    scenario: "facade",
    preset: "Rathaus Barmen",
    path: "perimeter",
    closed: true,
    cameraCount: 16,
    perimeterClearance: 3,
    referenceSurfaceOffset: 0,
    backStreetMargin: 3,
    // Clip at the buffered outline, outside the building and its cornices.
    clipping: true,
    clipBeforeSurface: 0,
    far: 300,
  },
};
export const OpenSpine: Story = {
  name: "Schwebebahn · full route, sliding window",
  parameters: facadeParameters,
  argTypes: facadeArgTypes,
  args: {
    scenario: "facade",
    preset: "Wupper north bank / Barmen",
    path: "schwebebahn",
    visibleSegments: 10,
    referenceSurfaceOffset: 0,
    showImagePlanes: false,
    closed: false,
    cameraCount: 3,
    spineMergeAngleDegrees: 3,
    // West-to-east northern bank: stand landward and look across the river.
    side: -1,
    cameraOffset: 10,
    clipBeforeSurface: 8,
    verticalPadding: 0,
    clipping: true,
    viewHeight: 40,
    far: 250,
  },
};

export const StreetSides: Story = {
  name: "B7 · synchronized street sides",
  parameters: {
    controls: {
      include: [
        "streetView",
        "upperStreetSide",
        ...facadeParameters.controls.include.filter((name) => name !== "side"),
      ],
    },
  },
  argTypes: {
    ...facadeArgTypes,
    streetView: {
      options: ["left", "right", "both"],
      control: {
        type: "inline-radio",
        labels: { left: "Links", right: "Rechts", both: "Beide · synchron" },
      },
      table: { category: "Street unfolding" },
    },
    upperStreetSide: {
      options: ["left", "right"],
      control: {
        type: "inline-radio",
        labels: { left: "Links", right: "Rechts" },
      },
      if: { arg: "streetView", eq: "both" },
      table: { category: "Street unfolding" },
    },
  },
  args: {
    scenario: "facade",
    preset: "Rathaus Barmen",
    path: "urban-street",
    closed: false,
    cameraCount: 3,
    visibleSegments: 10,
    pairedSides: true,
    streetView: "both",
    referenceSurfaceOffset: 0,
    upperStreetSide: "left",
    side: 1,
    cameraOffset: 1,
    clipBeforeSurface: 0,
    clipping: true,
    fitVertical: false,
    viewHeight: 50,
    verticalPadding: 0,
    spineMergeAngleDegrees: 3,
    far: 65,
    showImagePlanes: false,
  },
};

export const ChimneyObjectCover: Story = {
  name: "HKW chimney object cover · review",
  parameters: {
    controls: {
      include: [
        ...cameraControls,
        "radius",
        "viewHeight",
        "objectReferenceDepth",
        "clipping",
      ],
    },
  },
  args: {
    preset: "HKW chimney",
    mode: "object-cover",
    elevation:
      (TILE_STRESS_PRESETS["HKW chimney"].verticalWindow.minElevation +
        TILE_STRESS_PRESETS["HKW chimney"].verticalWindow.maxElevation) /
      2,
    viewHeight: 220,
    showImagePlanes: false,
    radius: 90,
    objectReferenceDepth: 80,
    far: 200,
    clipping: false,
  },
};
