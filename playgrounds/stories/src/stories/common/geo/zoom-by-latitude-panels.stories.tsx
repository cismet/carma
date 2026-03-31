import type { Meta, StoryObj } from "@storybook/react";

import { GeoChartStoryFrame } from "./geo-chart-story-frame";
import {
  BASE_TILE_SIZES_PX,
  DEFAULT_STANDARD_RANGE_M,
  LATITUDE_DISPLAY_MODES,
  MercatorZoomLatitudeLinePlot,
  MercatorZoomLatitudeRangeHeatmap,
  MercatorZoomLatitudeResolutionHeatmap,
  readLatitudePlotLabel,
  readLatitudeRangePlotLabel,
  readLatitudeResolutionPlotLabel,
  STANDARD_RANGE_PRESETS,
  STANDARD_RANGE_PRESET_LABELS,
  readEffectiveStandardRangeM,
  type MercatorZoomStoryArgs,
  Z_QUANTIZE_STEPS,
} from "./mercator-zoom.shared";
type PlotArgs = MercatorZoomStoryArgs;

const commonArgs: PlotArgs = {
  standardRangePreset: STANDARD_RANGE_PRESETS.CUSTOM,
  standardRangeCustom: DEFAULT_STANDARD_RANGE_M,
  standardFovDeg: 45,
  standardLatitudeDeg: 51,
  baseTileSizePx: BASE_TILE_SIZES_PX.PX_256,
  latitudeMode: LATITUDE_DISPLAY_MODES.MERCATOR_CLAMP,
  zQuantizeStep: Z_QUANTIZE_STEPS.FIFTH,
};

const commonArgTypes: Meta<PlotArgs>["argTypes"] = {
  standardRangePreset: {
    options: Object.values(STANDARD_RANGE_PRESETS),
    control: { type: "inline-radio" },
    labels: STANDARD_RANGE_PRESET_LABELS,
    description:
      "Quick shared range presets. Use Custom to activate the numeric input below.",
  },
  standardRangeCustom: {
    if: {
      arg: "standardRangePreset",
      eq: STANDARD_RANGE_PRESETS.CUSTOM,
    },
    control: { type: "number", min: 10, max: 100000, step: 10 },
    description: "Custom shared range in meters.",
  },
  standardLatitudeDeg: {
    control: { type: "range", min: 0, max: 90, step: 0.5 },
    description: "Reference latitude for the readout marker or vertical guide.",
  },
  standardFovDeg: {
    control: { type: "range", min: 1, max: 120, step: 0.1 },
    description: "Shared field of view.",
  },
  baseTileSizePx: {
    options: Object.values(BASE_TILE_SIZES_PX),
    control: { type: "inline-radio" },
    description: "Base Web-Mercator tile size.",
  },
  latitudeMode: {
    options: Object.values(LATITUDE_DISPLAY_MODES),
    control: { type: "inline-radio" },
    description:
      "mercator-square stops at the Web-Mercator extent; mercator-extreme continues beyond 85.051°.",
  },
  zQuantizeStep: {
    options: Object.values(Z_QUANTIZE_STEPS),
    control: { type: "inline-radio" },
    description:
      "Optional z-quantize step for heatmap colors and stepped lines.",
  },
};

const meta: Meta<PlotArgs> = {
  title: "Geo/Mercator Zoom",
  args: commonArgs,
  argTypes: commonArgTypes,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const buildCommonStatusValues = (args: PlotArgs) => [
  `range ${readEffectiveStandardRangeM(args)} m`,
  `fov ${args.standardFovDeg.toFixed(1)}°`,
  `lat ${args.standardLatitudeDeg.toFixed(1)}°`,
  `mode ${args.latitudeMode}`,
  `tile ${args.baseTileSizePx}px`,
  `z ${args.zQuantizeStep}`,
];

export const LatitudeResolutionHeatmap: Story = {
  name: "Zoom by Latitude and Resolution",
  render: (args) => (
    <GeoChartStoryFrame
      label={readLatitudeResolutionPlotLabel(readEffectiveStandardRangeM(args))}
      values={buildCommonStatusValues(args)}
    >
      <MercatorZoomLatitudeResolutionHeatmap
        baseTileSizePx={args.baseTileSizePx}
        standardRangeM={readEffectiveStandardRangeM(args)}
        standardFovDeg={args.standardFovDeg}
        standardLatitudeDeg={args.standardLatitudeDeg}
        latitudeMode={args.latitudeMode}
        zQuantizeStep={args.zQuantizeStep}
        showTitle={false}
      />
    </GeoChartStoryFrame>
  ),
};

export const LatitudeRangeHeatmap: Story = {
  name: "Zoom by Latitude and Range",
  render: (args) => (
    <GeoChartStoryFrame
      label={readLatitudeRangePlotLabel(args.standardFovDeg)}
      values={buildCommonStatusValues(args)}
    >
      <MercatorZoomLatitudeRangeHeatmap
        baseTileSizePx={args.baseTileSizePx}
        standardFovDeg={args.standardFovDeg}
        standardLatitudeDeg={args.standardLatitudeDeg}
        latitudeMode={args.latitudeMode}
        zQuantizeStep={args.zQuantizeStep}
        showTitle={false}
      />
    </GeoChartStoryFrame>
  ),
};

export const ZoomVsLatitude: Story = {
  name: "Zoom by Latitude",
  render: (args) => (
    <GeoChartStoryFrame
      label={readLatitudePlotLabel(
        readEffectiveStandardRangeM(args),
        args.standardFovDeg
      )}
      values={buildCommonStatusValues(args)}
    >
      <MercatorZoomLatitudeLinePlot
        baseTileSizePx={args.baseTileSizePx}
        standardRangeM={readEffectiveStandardRangeM(args)}
        standardFovDeg={args.standardFovDeg}
        standardLatitudeDeg={args.standardLatitudeDeg}
        latitudeMode={args.latitudeMode}
        zQuantizeStep={args.zQuantizeStep}
        showTitle={false}
      />
    </GeoChartStoryFrame>
  ),
};
