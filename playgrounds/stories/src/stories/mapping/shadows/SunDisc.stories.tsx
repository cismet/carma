import type { Meta, StoryObj } from "@storybook/react";
import { SHADOW_SUN_DISC_SAMPLES } from "@carma-mapping/shadow-simulation/three";

import {
  SunShadowDemo,
  SUN_SHADOW_STORY_DEFAULTS as defaultArgs,
} from "./SunShadowDemo";

const meta = {
  title: "Shadows/Sun Disc",
  id: "mapping-shadows-sun-disc",
  component: SunShadowDemo,
  // Conditional Controls strip hidden args; retain a complete runtime contract.
  render: (args) => (
    <SunShadowDemo
      {...defaultArgs}
      {...args}
      cachedLighting={false}
      measureBanding={false}
    />
  ),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Standalone fixture of the addon's mono render stack: ShadowController and shared HDR accumulation, using the same 0.53° uniform-radiance solar disc. No MapLibre or terrain downloads. Defaults target a settled soft frame within five seconds on the reference client; manually selected high sample counts and opt-in pass benchmarks are not time-capped. Distance is measured from the object's underside to the receiver. Scalar visibility and cached-RGB experiments are not addon modes and are not exposed here.",
      },
    },
  },
  args: defaultArgs,
  argTypes: {
    distanceMeters: {
      table: { category: "Fixture" },
      control: { type: "range", min: 0.1, max: 30, step: 0.1 },
      name: "Caster–receiver distance (m)",
    },
    elevationDegrees: {
      table: { category: "Sun" },
      control: { type: "range", min: 15, max: 85, step: 1 },
      name: "Sun elevation (°)",
    },
    object: {
      table: { category: "Fixture" },
      control: "select",
      options: ["plate", "sphere", "thin-fence"],
    },
    view: {
      table: { category: "Fixture" },
      control: "radio",
      options: ["overview", "shadow-edge"],
    },
    pointSun: {
      table: { category: "Sun" },
      control: "boolean",
      name: "Point sun reference",
    },
    samples: {
      table: { category: "Quality" },
      if: { arg: "pointSun", eq: false },
      control: "select",
      options: SHADOW_SUN_DISC_SAMPLES,
    },
    measureBanding: { table: { disable: true } },
    rasterJitter: {
      table: { category: "Quality" },
      if: { arg: "pointSun", eq: false },
      control: "boolean",
      description:
        "Subtexel shadow raster phases, not eye-camera jitter and not additional sun spread. Experimental aliasing comparison.",
    },
    bufferFormat: {
      table: { category: "Quality" },
      if: { arg: "pointSun", eq: false },
      control: "select",
      options: ["rgba16f", "rgba16f-32f", "rgba32f", "rgba8"],
      description:
        "Addon color formats. Hybrid 16f-32f keeps FP16 scene samples and an FP32 running average; full 32F resolves MSAA to zero.",
    },
    msaaSamples: {
      table: { category: "Quality" },
      if: { arg: "pointSun", eq: false },
      control: "radio",
      options: [0, 4],
      description:
        "Full 32-bit float uses MSAA=0 for portability. Hybrid 16f-32f supports scene MSAA=0 or 4.",
    },
    renderScale: {
      table: { category: "Quality" },
      control: "select",
      options: [0.5, 0.75, 1],
    },
    sunIntensity: {
      table: { category: "Sun" },
      control: { type: "range", min: 1, max: 12, step: 0.25 },
    },
    groundTexelFit: {
      table: { category: "Quality" },
      control: "boolean",
      name: "Ground-isotropic shadow texels",
    },
    shadowMapSize: {
      table: { category: "Quality" },
      control: "select",
      options: [1024, 2048, 4096, 8192],
    },
    exposure: {
      table: { category: "Sun" },
      control: { type: "range", min: 0.25, max: 4, step: 0.05 },
    },
    benchmark: {
      table: { category: "Diagnostics" },
      if: { arg: "pointSun", eq: false },
      control: "boolean",
      name: "Run pass-cost benchmark",
      description:
        "Explicit cost experiment after the final image; intentionally longer than the five-second preview target.",
    },
    cachedLighting: { table: { disable: true } },
  },
} satisfies Meta<typeof SunShadowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
export const PenumbraDetail: Story = {
  args: {
    view: "shadow-edge",
    distanceMeters: 25,
    samples: 128,
    shadowMapSize: 4096,
  },
};
export const ThinOccluders: Story = {
  // Low sun projects the one-metre slats over each other, hiding the gaps.
  args: { object: "thin-fence", view: "shadow-edge", elevationDegrees: 80 },
};
export const BufferPrecision: Story = {
  name: "Float32 precision reference",
  args: {
    bufferFormat: "rgba32f",
    msaaSamples: 0,
    samples: 128,
    distanceMeters: 25,
    view: "shadow-edge",
  },
};
export const PointSun: Story = { args: { pointSun: true } };
