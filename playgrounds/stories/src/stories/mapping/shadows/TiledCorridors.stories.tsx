import type { Meta, StoryObj } from "@storybook/react";
import { TiledShadowDemo } from "./TiledShadowDemo";

const meta = {
  title: "Mapping/Shadows/Tiled Corridors",
  component: TiledShadowDemo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Real shared ShadowController + TiledShadowRenderer + HDR accumulation. World-fixed cells cover the entire fixture terrain and elevated mesh receivers. Drag to orbit/pan; buffers follow physical-screen-pixel demand. Experimental multipass reference, not yet the Geoportal default. Ground spacing is a horizontal-surface reference; grazing slopes are not certified. Cache budget includes a scratch page, but not the host's HDR buffers. No independent sun shader or mocked cache counters.",
      },
    },
  },
  args: {
    targetPixels: 0.5,
    samples: 128,
    elevationDegrees: 30,
    cacheMiB: 128,
    maximumMapSize: 2048,
    panMeters: 0,
    benchmark: false,
    caster: "lod-numbers",
    casterLiftMeters: 0,
    animateCamera: true,
  },
  argTypes: {
    targetPixels: { control: "select", options: [0.5, 1, 2, 4] },
    samples: { control: "select", options: [4, 16, 32, 64, 128, 256, 512] },
    elevationDegrees: { control: { type: "range", min: 5, max: 85, step: 1 } },
    cacheMiB: { control: "select", options: [32, 64, 128, 256] },
    maximumMapSize: {
      control: "select",
      options: [256, 512, 1024, 2048, 4096],
    },
    panMeters: { control: { type: "range", min: -20, max: 20, step: 1 } },
    benchmark: { control: "boolean" },
    caster: { control: "radio", options: ["lod-numbers", "columns"] },
    casterLiftMeters: { control: { type: "range", min: 0, max: 20, step: 1 } },
    animateCamera: { control: "boolean" },
  },
} satisfies Meta<typeof TiledShadowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Columns: Story = { args: { caster: "columns" } };
export const FloatingCasters: Story = {
  args: { casterLiftMeters: 12, animateCamera: false },
};
/** Deliberately coarse diagnostic: fits the full disc, proves exact cache reuse. */
export const CacheReuse: Story = {
  args: {
    targetPixels: 4,
    samples: 4,
    maximumMapSize: 256,
    cacheMiB: 256,
    animateCamera: false,
  },
};
