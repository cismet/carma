import type { Meta, StoryObj } from "@storybook/react";

import { TileCameraStressDemo } from "./TileCameraStressDemo";
import { TILE_STRESS_DEFAULT_ARGS } from "./tile-stress-presets";

const meta = {
  title: "Tile Loading Manager/Lights",
  id: "tile-loading-manager-lights",
  component: TileCameraStressDemo,
  parameters: {
    layout: "fullscreen",
    controls: {
      include: [
        "source",
        "animate",
        "nightCarCount",
        "nightRailTraffic",
        "lightCount",
        "mastHeight",
        "nightLightStrength",
        "pixelError",
      ],
    },
    docs: {
      description: {
        component:
          "Barmen night demonstrator on the shared production mesh/raster tile runtime. Fixed BELIS lights use a worker-baked projected irradiance atlas; vehicles and signals use live Three lights. Projected illumination has no geometry occlusion and is not a shadow bake. All motion and timing are synthetic; town-wide operation is intentionally disabled until coverage and an occlusion-aware bake are proven.",
      },
    },
  },
  args: {
    ...TILE_STRESS_DEFAULT_ARGS,
    scenario: "night-traffic",
    preset: "Rathaus Barmen",
    lightCount: 400,
    nightCarCount: 3,
    nightRailTraffic: true,
    nightLightStrength: 0.55,
    showLightViews: false,
    showImagePlanes: false,
    pixelError: 8,
    animate: true,
  },
  argTypes: {
    source: { options: ["mesh", "terrain"], control: "radio" },
    animate: {
      table: { category: "Traffic" },
      control: "boolean",
      description:
        "Pause the simulated clock, including cars, rail vehicles and traffic signals.",
    },
    nightCarCount: {
      table: { category: "Traffic" },
      control: { type: "range", min: 0, max: 6, step: 1 },
      description:
        "Sparse synthetic late-night traffic, not observed vehicle positions.",
    },
    nightRailTraffic: {
      table: { category: "Traffic" },
      control: "boolean",
      description:
        "One Schwebebahn and one train. OSM tracks, assumed DGM-relative elevations; not the surveyed VehicleAnimation route.",
    },
    lightCount: {
      table: { category: "Lighting" },
      control: { type: "range", min: 0, max: 600, step: 25 },
      description:
        "Maximum BELIS lights from loaded source tiles within 900 m of Rathaus. Not a completeness claim.",
    },
    mastHeight: {
      table: { category: "Lighting" },
      control: { type: "range", min: 3, max: 14, step: 0.5 },
      description: "Assumed lamp height over DGM.",
    },
    nightLightStrength: {
      table: { category: "Lighting" },
      control: { type: "range", min: 0, max: 2, step: 0.05 },
      description: "Visual irradiance strength, not calibrated photometry.",
    },
    pixelError: { options: [2, 4, 8, 16], control: "select" },
  },
} satisfies Meta<typeof TileCameraStressDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BarmenNightTraffic: Story = {
  name: "Barmen baked night lights + traffic · review",
};
