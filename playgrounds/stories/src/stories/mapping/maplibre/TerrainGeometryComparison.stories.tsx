import type { Meta, StoryObj } from "@storybook/react";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import { TerrainGeometryComparison } from "./TerrainGeometryComparison";

const meta = {
  title: "Terrain and Atmosphere/Terrain Geometry",
  component: TerrainGeometryComparison,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Two standalone Three scenes share the production terrain manager's published raster cut. Native Mercator remains planar apart from source relief; the other panel uses the shared WGS84 ECEF transform and global-axis bounding boxes. Orbit and wheel gestures refine toward 0.5 CSS-pixel raster spacing. Global source heights are preserved without assuming a uniform ellipsoidal datum; the polar caps outside Web Mercator are absent. Both panels deliberately share the native manager cut: this is a geometry comparison, not proof of ECEF runtime culling or production shadow integration.",
      },
    },
  },
  args: {
    source: "nrw",
    longitude: 7.18246,
    latitude: 51.33178,
    level: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.minzoom,
    segments: 512,
    boxes: true,
    wireframe: false,
    shadows: true,
    sunHeading: 270,
    sunElevation: 12,
  },
  argTypes: {
    source: { control: "select", options: ["nrw", "global"] },
    level: {
      control: {
        type: "range",
        min: 0,
        max: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.maxzoom,
        step: 1,
      },
    },
    segments: { control: "select", options: [32, 64, 128, 256, 512] },
    sunHeading: { control: { type: "range", min: 0, max: 360, step: 1 } },
    sunElevation: { control: { type: "range", min: 1, max: 90, step: 1 } },
  },
} satisfies Meta<typeof TerrainGeometryComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FlatAndEcef: Story = {
  name: "Native flat / ECEF · shared raster meshes",
};
export const GlobalCurvature: Story = {
  name: "Global Terrarium · curvature",
  args: {
    source: "global",
    level: 2,
    longitude: 20,
    latitude: 30,
    segments: 256,
    shadows: false,
  },
};
