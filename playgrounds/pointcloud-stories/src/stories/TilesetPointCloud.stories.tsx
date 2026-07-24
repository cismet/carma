import type { Meta, StoryObj } from "@storybook/react";

import { TilesetPointCloudScene } from "../components/TilesetPointCloudScene";

const meta = {
  title: "Pointcloud Investigation/3D Tiles Point Cloud",
  component: TilesetPointCloudScene,
  argTypes: {
    tilesetUrl: { name: "tileset url", control: "text" },
    pointSize: {
      name: "point size (pixels)",
      control: { type: "range", min: 1, max: 8, step: 0.5 },
    },
    errorTarget: {
      name: "error target",
      control: { type: "range", min: 1, max: 32, step: 1 },
    },
    background: { control: "inline-radio", options: ["#0d1117", "#ffffff"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Reviews a 3D Tiles 1.1 point tileset (glTF POINTS content) produced by scripts/copc-to-3dtiles.mjs, loaded through the plain 3d-tiles-renderer path. Defaults to the published Oelberg MLS tileset; locally generated tilesets under .data/derived/pointcloud-3dtiles are served at /pointcloud-3dtiles/.",
      },
    },
  },
} satisfies Meta<typeof TilesetPointCloudScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OelbergMls: Story = {};

OelbergMls.args = {
  tilesetUrl:
    "https://wupp-3d-data.cismet.de/mesh2024/pointclouds/wuppertal-oelberg-mls-2025-09-11-3dtiles-v1/tileset.json",
  pointSize: 2,
  errorTarget: 8,
  background: "#0d1117",
};
