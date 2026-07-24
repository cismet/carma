import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";

import { MeshRegistrationScene } from "../components/MeshRegistrationScene";
import {
  POINT_CLOUD_HEIGHT_DATUMS,
  POINT_METRICS,
  POINT_SHAPES,
} from "../components/StandalonePointCloudViewer";
import { RAMP_NAMES } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";

const meta = {
  title: "Pointcloud Investigation/Mesh Registration",
  component: MeshRegistrationScene,
  argTypes: {
    color: {
      control: "inline-radio",
      options: ["white", "rgb", "classification", "intensity"],
    },
    metric: {
      control: "select",
      options: POINT_METRICS,
    },
    colorRamp: {
      control: "select",
      options: RAMP_NAMES,
    },
    sizeMode: {
      name: "point size mode",
      control: "inline-radio",
      options: ["auto", "pixels", "meters"],
      table: { category: "Point cloud" },
    },
    radiusScale: {
      name: "automatic radius scale",
      control: { type: "range", min: 0.25, max: 4, step: 0.25 },
      if: { arg: "sizeMode", eq: "auto" },
      table: { category: "Point cloud" },
    },
    pointSize: {
      name: "point size (pixels)",
      control: { type: "range", min: 0.5, max: 8, step: 0.25 },
      if: { arg: "sizeMode", eq: "pixels" },
      table: { category: "Point cloud" },
    },
    radiusMeters: {
      name: "point radius (meters)",
      control: { type: "range", min: 0.01, max: 2, step: 0.01 },
      if: { arg: "sizeMode", eq: "meters" },
      table: { category: "Point cloud" },
    },
    shape: {
      name: "point form",
      control: "inline-radio",
      options: Object.values(POINT_SHAPES),
      table: { category: "Point cloud" },
    },
    metricBlendMode: {
      name: "metric blend",
      control: "inline-radio",
      options: ["normal", "multiply"],
    },
    pointCompositeMode: {
      name: "point blend",
      control: "inline-radio",
      options: ["normal", "multiply"],
    },
    background: {
      control: "inline-radio",
      options: ["white", "black"],
    },
    sourceHeightDatum: {
      name: "source height datum",
      control: "inline-radio",
      options: Object.values(POINT_CLOUD_HEIGHT_DATUMS),
    },
    heightOffset: {
      name: "height offset",
      control: { type: "range", min: -70, max: 70, step: 0.5 },
    },
    meshOpacity: {
      name: "mesh opacity",
      control: { type: "range", min: 0, max: 1, step: 0.05 },
    },
    meshErrorTarget: {
      name: "mesh error target",
      control: { type: "range", min: 0, max: 50, step: 0.5 },
    },
    meshWhite: {
      name: "white mesh shading",
      control: "boolean",
    },
    clampMode: {
      name: "field clamp",
      control: "inline-radio",
      options: ["auto", "manual"],
    },
    clampMin: {
      name: "field minimum",
      control: "number",
      if: { arg: "clampMode", eq: "manual" },
    },
    clampMax: {
      name: "field maximum",
      control: "number",
      if: { arg: "clampMode", eq: "manual" },
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Click corresponding point-cloud and Mesh 2024 positions, then solve a constrained rigid registration. The solver never estimates scale and reports pair residuals.",
      },
    },
  },
} satisfies Meta<typeof MeshRegistrationScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nordbahntrasse: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<typeof args>();
    return (
      <MeshRegistrationScene
        {...args}
        onColorizerOptionsChange={(next) => {
          const changed = Object.entries(next).some(
            ([key, value]) => args[key as keyof typeof args] !== value
          );
          if (changed) updateArgs(next);
        }}
      />
    );
  },
};

Nordbahntrasse.args = {
  sizeMode: "meters",
  pointSize: 2,
  radiusMeters: 0.3,
  radiusScale: 1,
  shape: POINT_SHAPES.DOME,
  metricBlendMode: "multiply",
  pointCompositeMode: "normal",
  background: "white",
  // sourceHeightDatum intentionally unset: each dataset preset supplies its
  // declared datum; the control remains available as a manual override.
  heightOffset: 0,
  color: "intensity",
  metric: "none",
  colorRamp: "viridis",
  clampMode: "manual",
  clampMin: 2,
  clampMax: 24,
};
