import type { Meta, StoryObj } from "@storybook/react";

import { TileCameraStressDemo } from "./TileCameraStressDemo";
import { TILE_STRESS_DEFAULT_ARGS } from "./tile-stress-presets";

const meta = {
  title: "Tile Loading Manager/Lights",
  id: "tile-loading-manager-lights",
  component: TileCameraStressDemo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Orbiting HKW lights and public BELIS streetlights illuminate one shared real mesh or Terrarium source. Shadows and optional light views are provisional diagnostics, not certified visibility analysis.",
      },
    },
  },
  args: TILE_STRESS_DEFAULT_ARGS,
  argTypes: {
    scenario: { table: { disable: true } },
    source: { options: ["mesh", "terrain"], control: "radio" },
    animate: { table: { category: "Motion" }, control: "boolean" },
    lightCount: {
      table: { category: "Lighting" },
      control: { type: "range", min: 10, max: 32, step: 1 },
      description: "Streetlight request count; orbit always has four lights.",
    },
    lightIntensity: {
      table: { category: "Lighting" },
      control: "number",
      description: "Visual stress setting, not verified luminaire photometry.",
    },
    lightRange: {
      table: { category: "Lighting" },
      control: { type: "range", min: 20, max: 1000, step: 10 },
    },
    radius: {
      table: { category: "Motion" },
      control: { type: "range", min: 5, max: 500, step: 5 },
      description: "Orbit radius around the measured HKW chimney foot.",
    },
    shadowMapSize: {
      table: { category: "Shadows" },
      options: [128, 256, 512, 1024],
      control: "select",
    },
    shadowLightLimit: {
      table: { category: "Shadows" },
      control: { type: "range", min: 0, max: 8, step: 1 },
      description: "Shadowed subset, also capped by GPU sampler headroom.",
    },
    shadowUpdatesPerSecond: {
      table: { category: "Shadows" },
      control: { type: "range", min: 1, max: 20, step: 1 },
    },
    lightMinHeight: { table: { category: "Motion" }, control: "number" },
    lightMaxHeight: { table: { category: "Motion" }, control: "number" },
    orbitSeconds: {
      table: { category: "Motion" },
      control: { type: "range", min: 10, max: 120, step: 5 },
    },
    mastHeight: {
      table: { category: "Lighting" },
      control: { type: "range", min: 3, max: 20, step: 0.5 },
      description:
        "Assumed luminaire height over DGM; no height field is certified in BELIS.",
    },
    normalBias: {
      table: { category: "Shadows" },
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    showLightViews: { table: { category: "Debug" }, control: "boolean" },
    viewLightIndex: {
      table: { category: "Debug" },
      control: { type: "range", min: 0, max: 31, step: 1 },
    },
    pixelError: { options: [2, 4, 8, 16, 32], control: "select" },
    segmentPixels: {
      table: { category: "Debug" },
      options: [64, 128, 256, 512],
      control: "select",
    },
    preset: { table: { disable: true } },
    cameraCount: { table: { disable: true } },
    mode: { table: { disable: true } },
    path: { table: { disable: true } },
    customSpine: { table: { disable: true } },
    closed: { table: { disable: true } },
    side: { table: { disable: true } },
    elevation: { table: { disable: true } },
    viewHeight: { table: { disable: true } },
    cameraOffset: { table: { disable: true } },
    clipBeforeSurface: { table: { disable: true } },
    clipping: { table: { disable: true } },
    showImagePlanes: { table: { disable: true } },
    far: { table: { disable: true } },
    previewUpdatesPerSecond: { table: { disable: true } },
    panoramaVerticalFovDegrees: { table: { disable: true } },
    panoramaPitchDegrees: { table: { disable: true } },
    fitVertical: { table: { disable: true } },
    spineMergeAngleDegrees: { table: { disable: true } },
    verticalPadding: { table: { disable: true } },
  },
} satisfies Meta<typeof TileCameraStressDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrbitingChimneyLights: Story = {
  args: {
    scenario: "orbit",
    preset: "HKW chimney",
    radius: 90,
    normalBias: 1,
    showImagePlanes: false,
  },
};
export const RathausStreetlights: Story = {
  args: {
    scenario: "streetlights",
    preset: "Rathaus Barmen",
    lightCount: 12,
    lightIntensity: 800,
    lightRange: 65,
    shadowMapSize: 256,
    animate: false,
  },
};
