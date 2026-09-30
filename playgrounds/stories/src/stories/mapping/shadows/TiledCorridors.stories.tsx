import type { Meta, StoryObj } from "@storybook/react";
import { TiledShadowDemo } from "./TiledShadowDemo";

const defaultArgs = {
  targetPixels: 4,
  samples: 32,
  elevationDegrees: 30,
  maximumMapSize: 512,
  renderScale: 0.5,
  panMeters: 0,
  caster: "lod-numbers" as const,
  casterLiftMeters: 0,
  animateCamera: false,
};

const meta = {
  title: "Shadows/Corridors",
  id: "mapping-shadows-tiled-corridors",
  component: TiledShadowDemo,
  render: (args) => <TiledShadowDemo {...defaultArgs} {...args} />,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The addon's exact ShadowTiledScene: common hard-sun draw followed by geometry-owned finite-disc receiver publications. Fixture geometry is already resident; there is no mock readiness or separate cache benchmark. Drag to orbit/pan and retain completed shadows on surfaces. Story defaults deliberately reduce resolution; status reports real publication readiness and time from the current revision. Raw depth-cache experiments remain in library tests.",
      },
    },
  },
  args: defaultArgs,
  argTypes: {
    targetPixels: {
      name: "Shadow texel target (render pixels)",
      table: { category: "Rendering" },
      control: "select",
      options: [0.5, 1, 2, 4],
    },
    samples: {
      table: { category: "Rendering" },
      control: "select",
      options: [16, 32, 64, 128],
      description:
        "Finite-disc directions. High custom values are outside the default five-second target.",
    },
    maximumMapSize: {
      table: { category: "Rendering" },
      control: "select",
      options: [256, 512, 1024, 2048],
    },
    renderScale: {
      table: { category: "Rendering" },
      control: "select",
      options: [0.5, 0.75, 1],
      description:
        "Story-only drawing-buffer scale; the addon renderer itself is unchanged.",
    },
    elevationDegrees: {
      name: "Sun elevation (degrees)",
      table: { category: "Sun and geometry" },
      control: { type: "range", min: 5, max: 85, step: 1 },
    },
    caster: {
      table: { category: "Sun and geometry" },
      control: "radio",
      options: ["lod-numbers", "columns"],
    },
    casterLiftMeters: {
      table: { category: "Sun and geometry" },
      control: { type: "range", min: 0, max: 20, step: 1 },
    },
    panMeters: {
      table: { category: "Camera" },
      control: { type: "range", min: -20, max: 20, step: 1 },
    },
    animateCamera: {
      table: { category: "Camera" },
      control: "boolean",
      description:
        "Advances only after an actual soft-shadow publication; disabled for readiness measurements.",
    },
  },
} satisfies Meta<typeof TiledShadowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Columns: Story = { args: { caster: "columns" } };
export const FloatingCasters: Story = {
  args: { casterLiftMeters: 12 },
};
export const RetainedShadowsOnDrag: Story = {
  name: "Retained shadows on drag",
  args: { caster: "columns" },
  parameters: {
    docs: {
      description: {
        story:
          "Wait for soft-ready, then orbit or pan. Completed receiver publications remain attached while the observer moves; only current-view demand is reconsidered when the drag ends.",
      },
    },
  },
};

/** Retains the dev URL, exercising reuse through the current addon renderer. */
export const CacheReuse: Story = {
  name: "Cache reuse · camera cycle",
  args: {
    targetPixels: 4,
    samples: 16,
    maximumMapSize: 256,
    animateCamera: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Camera movement starts after a real soft publication. Inspect retained publications and cache counters in the current addon stack. This replaces the old raw-depth-cache-only fixture; it is not a reproduction of its old timing benchmark.",
      },
    },
  },
};
