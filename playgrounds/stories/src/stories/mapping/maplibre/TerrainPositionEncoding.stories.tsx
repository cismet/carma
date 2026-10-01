import type { Meta, StoryObj } from "@storybook/react";
import { TerrainGeometryComparison } from "./TerrainGeometryComparison";

const meta = {
  title: "Terrain and Atmosphere/Terrain Position Encoding",
  component: TerrainGeometryComparison,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Both panels borrow the same real terrain manager's ECEF mesh cut, camera, material and sun. Only the right panel encodes positions in normalized integer buffers and decodes them with a per-tile matrix. Source normals remain Float32 and compensate that matrix's nonuniform scale. Displayed errors measure reconstructed positions against the Float32 mesh, independently of DEM and raster-spacing errors. Buffer sizes include positions, normals, UVs and indices; they are representation sizes, not measured driver memory. Twelve effective bits occupy Uint16 storage and save no GPU bytes relative to sixteen. Quantization is experimental and never enabled in the Geoportal runtime.",
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
    encodingBits: 16,
  },
  argTypes: {
    source: { control: "select", options: ["nrw", "global"] },
    encodingBits: { control: "select", options: [8, 12, 16] },
    level: { control: { type: "range", min: 0, max: 16, step: 1 } },
    segments: { control: "select", options: [32, 64, 128, 256, 512] },
    sunHeading: { control: { type: "range", min: 0, max: 360, step: 1 } },
    sunElevation: { control: { type: "range", min: 1, max: 90, step: 1 } },
    boxes: { control: false, table: { disable: true } },
  },
} satisfies Meta<typeof TerrainGeometryComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UInt16: Story = { name: "ECEF Float32 / UInt16" };
export const TwelveEffectiveBits: Story = {
  name: "ECEF Float32 / 12 effective bits in UInt16",
  args: { encodingBits: 12 },
};
export const UInt8: Story = {
  name: "ECEF Float32 / UInt8",
  args: { encodingBits: 8 },
};
export const GlobalExtent: Story = {
  name: "Global ECEF · Float32 / UInt16",
  args: {
    source: "global",
    level: 2,
    longitude: 20,
    latitude: 30,
    shadows: false,
  },
};
