import type { Meta, StoryObj } from "@storybook/react";
import { TerrainDisplacedComparison } from "./TerrainDisplacedComparison";

const meta = {
  title: "Terrain and Atmosphere/Terrain GPU Displacement",
  component: TerrainDisplacedComparison,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Optional terrain representation: unchanged prepared ECEF positions and normals move into lossless Float32 texture arrays. Compatible tiles share indices and UVs and render as instanced batches. Color, directional-shadow depth and point-shadow distance passes share vertex displacement. This story compares identical offline synthetic geometry, camera and production sunlight/shadow fit. It does not change the terrain manager's LOD, requests, seams or cache policy. Render-buffer accounting includes page padding and instance capacity, but the CPU sources remain owned by the manager; the side-by-side comparison is not total application memory. Default terrain rendering in Geoportal remains unchanged.",
      },
    },
  },
  args: {
    segments: 128,
    tilesPerEdge: 2,
    shadows: true,
    wireframe: false,
    sunHeading: 270,
    sunElevation: 12,
  },
  argTypes: {
    segments: { control: "select", options: [32, 64, 128, 256, 512] },
    tilesPerEdge: { control: "select", options: [1, 2, 4] },
    sunHeading: { control: { type: "range", min: 0, max: 360, step: 1 } },
    sunElevation: { control: { type: "range", min: 1, max: 90, step: 1 } },
  },
} satisfies Meta<typeof TerrainDisplacedComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HardShadows: Story = {
  name: "Prepared ECEF / instanced displacement · hard shadows",
};
export const WithoutShadows: Story = { args: { shadows: false } };
export const DenseNativeGrid: Story = {
  args: { segments: 512, tilesPerEdge: 2 },
};
export const ManyTiles: Story = { args: { segments: 64, tilesPerEdge: 4 } };
