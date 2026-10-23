import type { Meta, StoryObj } from "@storybook/react";
import { TerrainGeometryComparison } from "./TerrainGeometryComparison";

const meta = {
  title: "Terrain and Atmosphere/Terrain GPU Displacement with Manager",
  component: TerrainGeometryComparison,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Both panels follow the same production terrain manager's published ECEF cut at 0.5 CSS px. The right panel uses optional lossless texture displacement and topology-compatible instancing; unsupported seam layouts/materials fall back to the original mesh. Both use identical normals and the production sun/shadow fit. This story downloads Terrarium data and the source's datum field; use the offline Terrain GPU Displacement story on metered connections. It does not change publication, seam, baseline-cache or memory-grant policies.",
      },
    },
  },
  args: {
    source: "nrw",
    longitude: 7.18246,
    latitude: 51.33178,
    level: 10,
    segments: 128,
    boxes: false,
    wireframe: false,
    shadows: true,
    sunHeading: 270,
    sunElevation: 12,
    gpuDisplacement: true,
  },
  argTypes: {
    source: { control: "select", options: ["nrw", "global"] },
    level: { control: { type: "range", min: 0, max: 16, step: 1 } },
    segments: { control: "select", options: [32, 64, 128, 256, 512] },
    sunHeading: { control: { type: "range", min: 0, max: 360, step: 1 } },
    sunElevation: { control: { type: "range", min: 1, max: 90, step: 1 } },
    gpuDisplacement: { control: false, table: { disable: true } },
    encodingBits: { control: false, table: { disable: true } },
    boxes: { control: false, table: { disable: true } },
  },
} satisfies Meta<typeof TerrainGeometryComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EcefHardShadows: Story = {};
export const GlobalCurvature: Story = {
  args: {
    source: "global",
    level: 2,
    longitude: 20,
    latitude: 30,
    shadows: false,
  },
};
