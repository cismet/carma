import type { Meta, StoryObj } from "@storybook/react";

import { RAMP_NAMES } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import { POINT_SHAPES } from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";
import {
  POINT_CLOUD_ASSET_IDENTITIES,
  POINT_CLOUD_PUBLIC_BASE_URL,
  type PointCloudAssetIdentity,
} from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import { AWG2_DGM1_RIGID_REGISTRATION } from "../../../ng-topicmap-playground/src/app/pointcloud/pointcloud-spatial-registration";

import {
  POINT_CLOUD_HEIGHT_DATUMS,
  POINT_METRICS,
  StandalonePointCloudViewer,
} from "../components/StandalonePointCloudViewer";
import type {
  PointMetric,
  StandalonePointCloudColor,
} from "../components/StandalonePointCloudViewer";

const DATA_BASE =
  import.meta.env.VITE_POINTCLOUD_DATA_BASE_URL ?? POINT_CLOUD_PUBLIC_BASE_URL;

const KWH_METRICS = [
  "none",
  "rgb",
  "classification",
  "z",
  "synthetic",
  "overlap",
  "pointindex",
] satisfies PointMetric[];
const AWG_METRICS = [
  "none",
  "classification",
  "z",
  "pointindex",
] satisfies PointMetric[];
const MLS_METRICS = [
  "none",
  "rgb",
  "z",
  "intensity",
  "pointindex",
] satisfies PointMetric[];
const SEGMENT_METRICS = [
  "none",
  "classification",
  "z",
  "intensity",
  "userdata",
  "pointindex",
] satisfies PointMetric[];
const datasetArgTypes = (
  colors: StandalonePointCloudColor[],
  metrics: PointMetric[]
) => ({
  color: {
    name: "base color",
    control: "inline-radio" as const,
    options: colors,
  },
  metric: { control: "select" as const, options: metrics },
});

const datasetIdentityArgs = (identity: PointCloudAssetIdentity) => ({
  datasetUrl: `${DATA_BASE}/${identity.artifactFileName}`,
  datasetName: identity.label,
  sourceTag: identity.sourceTag,
  acquiredOn: identity.acquiredOn,
  fieldDimensions: identity.fieldDimensions,
  hasRgb: identity.hasRgb,
});

const meta = {
  title: "Pointcloud Investigation/Point Clouds",
  component: StandalonePointCloudViewer,
  parameters: {
    docs: {
      description: {
        component:
          "One standalone Three.js scene for each currently published Mesh-2024 COPC with Ambient Occlusion. There is no map or CARMA application shell. Each story lists only varying scalar metrics plus usable RGB/classification attributes. Points use uniform pixel or world-meter sizing; Mesh 2024 can be loaded into the same anchored scene.",
      },
    },
  },
  argTypes: {
    datasetUrl: { control: false },
    datasetName: { control: false },
    sourceTag: { control: false },
    acquiredOn: { control: false },
    pointBudgetPercent: {
      control: "select",
      options: [1, 5, 10, 25, 50, 100],
    },
    sizeMode: { control: "inline-radio", options: ["pixels", "meters"] },
    pointSize: {
      control: { type: "range", min: 0.5, max: 8, step: 0.25 },
      if: { arg: "sizeMode", eq: "pixels" },
    },
    radiusMeters: {
      control: { type: "range", min: 0.01, max: 2, step: 0.01 },
      if: { arg: "sizeMode", eq: "meters" },
    },
    shape: {
      name: "point shape",
      control: "inline-radio",
      options: Object.values(POINT_SHAPES),
    },
    color: {
      name: "base color",
      control: "inline-radio",
      options: ["white", "rgb", "classification"],
    },
    metric: { control: "select", options: POINT_METRICS },
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
    colorRamp: { name: "color ramp", control: "select", options: RAMP_NAMES },
    clampMode: {
      name: "clamp range",
      control: "inline-radio",
      options: ["auto", "manual"],
    },
    clampMin: {
      name: "clamp min",
      control: "number",
      if: { arg: "clampMode", eq: "manual" },
    },
    clampMax: {
      name: "clamp max",
      control: "number",
      if: { arg: "clampMode", eq: "manual" },
    },
    heightOffset: {
      control: { type: "range", min: -70, max: 70, step: 0.5 },
    },
    sourceHeightDatum: {
      name: "source height datum",
      control: "inline-radio",
      options: Object.values(POINT_CLOUD_HEIGHT_DATUMS),
    },
    showMesh2024: { control: "boolean" },
    meshErrorTarget: {
      control: { type: "range", min: 2, max: 40, step: 1 },
      if: { arg: "showMesh2024", truthy: true },
    },
    showRoadRoiControls: { control: false, table: { disable: true } },
    roadRoiEnabled: { control: false, table: { disable: true } },
    roadName: { control: false, table: { disable: true } },
    roadWidthMeters: { control: false, table: { disable: true } },
    roadBudgetPercent: { control: false, table: { disable: true } },
    roadOutsideMode: { control: false, table: { disable: true } },
    roadOutsideDepth: { control: false, table: { disable: true } },
  },
  args: {
    pointBudgetPercent: 100,
    sizeMode: "pixels",
    pointSize: 2,
    radiusMeters: 0.05,
    shape: POINT_SHAPES.CIRCLE,
    color: "rgb",
    metric: "z",
    metricBlendMode: "multiply",
    pointCompositeMode: "normal",
    background: "white",
    colorRamp: "elevation",
    clampMode: "auto",
    clampMin: 0,
    clampMax: 1,
    sourceHeightDatum: POINT_CLOUD_HEIGHT_DATUMS.DHHN2016,
    heightOffset: 0,
    showMesh2024: false,
    meshErrorTarget: 12,
    showRoadRoiControls: false,
    roadRoiEnabled: false,
  },
} satisfies Meta<typeof StandalonePointCloudViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KaiserWilhelmHainRgb: Story = {
  name: "Kaiser-Wilhelm-Hain · RGB",
  argTypes: datasetArgTypes(["white", "rgb", "classification"], KWH_METRICS),
  args: {
    ...datasetIdentityArgs(POINT_CLOUD_ASSET_IDENTITIES.kwh),
  },
};

export const AwgSegmentation: Story = {
  name: "AWG 2 Wuppertal · 3D-Segmentierung",
  argTypes: datasetArgTypes(["white", "classification"], AWG_METRICS),
  args: {
    ...datasetIdentityArgs(POINT_CLOUD_ASSET_IDENTITIES.awg),
    registration: AWG2_DGM1_RIGID_REGISTRATION,
    color: "classification",
    sourceHeightDatum: POINT_CLOUD_HEIGHT_DATUMS.ELLIPSOIDAL,
  },
};

export const WuppertalOelbergMls: Story = {
  name: "Wuppertal-Ölberg · MLS",
  argTypes: datasetArgTypes(["white", "rgb"], MLS_METRICS),
  args: {
    ...datasetIdentityArgs(POINT_CLOUD_ASSET_IDENTITIES.mls),
  },
};

export const NordbahntrasseSegments: Story = {
  name: "Nordbahntrasse 0–3000 m · Segmentierung",
  argTypes: datasetArgTypes(["white", "classification"], SEGMENT_METRICS),
  args: {
    ...datasetIdentityArgs(POINT_CLOUD_ASSET_IDENTITIES.seg2512),
    color: "classification",
    sourceHeightDatum: POINT_CLOUD_HEIGHT_DATUMS.ELLIPSOIDAL,
  },
};
