import type { Meta, StoryObj } from "@storybook/react";

import { RAMP_NAMES } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import {
  POINT_CLOUD_ASSET_IDENTITIES,
  POINT_CLOUD_PUBLIC_BASE_URL,
} from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";

import {
  POINT_CLOUD_HEIGHT_DATUMS,
  StandalonePointCloudViewer,
} from "../components/StandalonePointCloudViewer";
import type {
  PointMetric,
  StandaloneClampMode,
  StandaloneMetricBlendMode,
} from "../components/StandalonePointCloudViewer";
import type { RampName } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";

const DATA_BASE =
  import.meta.env.VITE_POINTCLOUD_DATA_BASE_URL ?? POINT_CLOUD_PUBLIC_BASE_URL;

const NORDTRASSE_SEGMENTS = POINT_CLOUD_ASSET_IDENTITIES.seg2512;

const SEGMENT_METRICS = [
  "none",
  "rgb",
  "classification",
  "z",
  "intensity",
  "classification",
  "userdata",
  "pointindex",
] satisfies PointMetric[];

interface ElevationCalibrationProps {
  manualOffset: number;
  pointBudgetPercent: number;
  meshErrorTarget: number;
  metric: PointMetric;
  metricBlendMode: StandaloneMetricBlendMode;
  colorRamp: RampName;
  clampMode: StandaloneClampMode;
  clampMin: number;
  clampMax: number;
}

function ElevationCalibrationView({
  manualOffset,
  pointBudgetPercent,
  meshErrorTarget,
  metric,
  metricBlendMode,
  colorRamp,
  clampMode,
  clampMin,
  clampMax,
}: ElevationCalibrationProps) {
  return (
    <StandalonePointCloudViewer
      datasetUrl={`${DATA_BASE}/${NORDTRASSE_SEGMENTS.artifactFileName}`}
      datasetName={NORDTRASSE_SEGMENTS.label}
      sourceTag={NORDTRASSE_SEGMENTS.sourceTag}
      fieldDimensions={NORDTRASSE_SEGMENTS.fieldDimensions}
      hasRgb={NORDTRASSE_SEGMENTS.hasRgb}
      pointBudgetPercent={pointBudgetPercent}
      sourceHeightDatum={POINT_CLOUD_HEIGHT_DATUMS.ELLIPSOIDAL}
      heightOffset={manualOffset}
      metric={metric}
      metricBlendMode={metricBlendMode}
      colorRamp={colorRamp}
      clampMode={clampMode}
      clampMin={clampMin}
      clampMax={clampMax}
      showMesh2024
      meshErrorTarget={meshErrorTarget}
    />
  );
}

const meta = {
  title: "Pointcloud Investigation/Elevation Calibration",
  component: ElevationCalibrationView,
  parameters: {
    docs: {
      description: {
        component:
          "Standalone Three.js comparison of the December 2025 point cloud and Mesh 2024 in one local scene. The GCG2016 correction is evaluated at the COPC center; manual offset allows visual calibration without a map.",
      },
    },
  },
  argTypes: {
    manualOffset: {
      control: { type: "range", min: -10, max: 10, step: 0.1 },
    },
    pointBudgetPercent: {
      control: "select",
      options: [1, 5, 10, 25, 50, 100],
    },
    meshErrorTarget: {
      control: { type: "range", min: 2, max: 40, step: 1 },
    },
    metric: { control: "select", options: SEGMENT_METRICS },
    metricBlendMode: {
      name: "metric blend",
      control: "inline-radio",
      options: ["normal", "multiply"],
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
  },
} satisfies Meta<typeof ElevationCalibrationView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PointCloudVsMesh2024: Story = {
  args: {
    manualOffset: 0,
    pointBudgetPercent: 100,
    meshErrorTarget: 12,
    metric: "z",
    metricBlendMode: "multiply",
    colorRamp: "elevation",
    clampMode: "auto",
    clampMin: 0,
    clampMax: 1,
  },
};
