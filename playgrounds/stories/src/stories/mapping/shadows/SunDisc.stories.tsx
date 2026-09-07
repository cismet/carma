import type { Meta, StoryObj } from "@storybook/react";
import { SHADOW_SUN_DISC_SAMPLES } from "@carma-mapping/shadow-simulation/three";

import { SunShadowDemo } from "./SunShadowDemo";

const meta = {
  title: "Mapping/Shadows/Sun Disc",
  component: SunShadowDemo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Standalone Three.js reference using Geoportal's ShadowController and shared HDR accumulator. No MapLibre, terrain downloads, or second sun implementation. The current production sampler uses a 0.53° uniform-radiance solar disc; limb darkening is not yet implemented. Distance is measured from the object's underside to the receiver. Benchmark is opt-in and measures diagnostic cost bounds, not an adaptive quality mode.",
      },
    },
  },
  args: {
    distanceMeters: 15,
    elevationDegrees: 45,
    object: "plate",
    view: "overview",
    pointSun: false,
    samples: 512,
    shadowMapSize: 4096,
    exposure: 1,
    sunIntensity: 3,
    bufferFormat: "rgba16f-32f",
    msaaSamples: 4,
    renderScale: 1,
    groundTexelFit: true,
    benchmark: false,
    cachedLighting: false,
    measureBanding: true,
    rasterJitter: true,
  },
  argTypes: {
    distanceMeters: {
      control: { type: "range", min: 0.1, max: 30, step: 0.1 },
      name: "Caster–receiver distance (m)",
    },
    elevationDegrees: {
      control: { type: "range", min: 15, max: 85, step: 1 },
      name: "Sun elevation (°)",
    },
    object: { control: "select", options: ["plate", "sphere", "thin-fence"] },
    view: { control: "radio", options: ["overview", "shadow-edge"] },
    pointSun: { control: "boolean", name: "Point sun reference" },
    samples: { control: "select", options: SHADOW_SUN_DISC_SAMPLES },
    measureBanding: {
      control: "boolean",
      description:
        "Plate + R buffer only: coherent profile residual against analytic uniform-disc penumbra. One readback after settling, excluded from GPU benchmark. Not a universal perceptual score.",
    },
    rasterJitter: {
      control: "boolean",
      description:
        "Subtexel shadow raster phases, not eye-camera jitter and not additional sun spread. Experimental aliasing comparison.",
    },
    bufferFormat: {
      control: "select",
      options: [
        "rgba16f",
        "rgba16f-32f",
        "rgba32f",
        "rgba8",
        "r16f",
        "r16f-32f",
        "r32f",
        "r8",
      ],
      description:
        "R formats show solar visibility only, not final RGB lighting. Hybrid 16f-32f keeps FP16 scene samples and an FP32 running average.",
    },
    msaaSamples: {
      control: "radio",
      options: [0, 4],
      description:
        "Full 32-bit float uses MSAA=0 for portability. Hybrid 16f-32f supports scene MSAA=0 or 4.",
    },
    renderScale: { control: "select", options: [0.5, 0.75, 1] },
    sunIntensity: { control: { type: "range", min: 1, max: 12, step: 0.25 } },
    groundTexelFit: {
      control: "boolean",
      name: "Ground-isotropic shadow texels",
    },
    shadowMapSize: { control: "select", options: [1024, 2048, 4096, 8192] },
    exposure: { control: { type: "range", min: 0.25, max: 4, step: 0.05 } },
    benchmark: { control: "boolean", name: "Run pass-cost benchmark" },
    cachedLighting: {
      control: "boolean",
      name: "Compose cached RGB lighting (R buffers)",
      description:
        "Experimental opaque-scene factorization. Requires an R format. Captures central-direction unshadowed/indirect RGB once, then averages scalar visibility. Benchmark includes both cache captures and final composition, against full RGB integration. Not a production mode.",
    },
  },
} satisfies Meta<typeof SunShadowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
export const PenumbraDetail: Story = {
  args: { view: "shadow-edge", distanceMeters: 25, samples: 4096 },
};
export const ThinOccluders: Story = {
  args: { object: "thin-fence", view: "shadow-edge" },
};
export const CachedLighting: Story = {
  args: {
    cachedLighting: true,
    bufferFormat: "r32f",
    msaaSamples: 0,
    samples: 4096,
    distanceMeters: 25,
    view: "shadow-edge",
  },
};
