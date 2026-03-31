import type { Meta, StoryObj } from "@storybook/react";
import {
  BASE_TILE_SIZES_PX,
  DEFAULT_STANDARD_RANGE_M,
  LATITUDE_DISPLAY_MODES,
  MercatorZoomPlots,
  STANDARD_RANGE_PRESETS,
  STANDARD_RANGE_PRESET_LABELS,
  type MercatorZoomStoryArgs,
  Z_QUANTIZE_STEPS,
} from "./mercator-zoom.shared";

const meta: Meta<MercatorZoomStoryArgs> = {
  title: "Geo",
  component: MercatorZoomPlots,
  args: {
    standardRangePreset: STANDARD_RANGE_PRESETS.CUSTOM,
    standardRangeCustom: DEFAULT_STANDARD_RANGE_M,
    standardFovDeg: 45,
    standardLatitudeDeg: 51,
    baseTileSizePx: BASE_TILE_SIZES_PX.PX_256,
    latitudeMode: LATITUDE_DISPLAY_MODES.MERCATOR_CLAMP,
    zQuantizeStep: Z_QUANTIZE_STEPS.FIFTH,
  },
  argTypes: {
    standardRangePreset: {
      options: Object.values(STANDARD_RANGE_PRESETS),
      control: { type: "inline-radio" },
      labels: STANDARD_RANGE_PRESET_LABELS,
      description:
        "Quick shared range presets for both plots. Use Custom to activate the numeric input below.",
    },
    standardRangeCustom: {
      if: {
        arg: "standardRangePreset",
        eq: STANDARD_RANGE_PRESETS.CUSTOM,
      },
      control: { type: "number", min: 10, max: 100000, step: 10 },
      description:
        "Custom shared range in meters for both the heatmap and the lower latitude plot. Used when the preset is Custom.",
    },
    standardLatitudeDeg: {
      control: { type: "range", min: 0, max: 90, step: 0.5 },
      description:
        "Reference latitude for the vertical readout line on the zoom-vs-latitude plot.",
    },
    standardFovDeg: {
      control: { type: "range", min: 1, max: 120, step: 0.1 },
      description:
        "Shared field of view for the heatmap reference line and the lower latitude plot.",
    },
    baseTileSizePx: {
      options: Object.values(BASE_TILE_SIZES_PX),
      control: { type: "inline-radio" },
      description:
        "Base Web-Mercator tile size used for zoom and meters-per-pixel calculations.",
    },
    latitudeMode: {
      options: Object.values(LATITUDE_DISPLAY_MODES),
      control: { type: "inline-radio" },
      description:
        "mercator-square stops the x-axis at the Web-Mercator extent; mercator-extreme continues the zoom-equivalence scheme beyond 85.051°.",
    },
    zQuantizeStep: {
      options: Object.values(Z_QUANTIZE_STEPS),
      control: { type: "inline-radio" },
      description:
        "Optional z-quantize step for heatmap color bands and the lower zoom-vs-latitude plot.",
    },
  },
  parameters: {
    controls: {
      include: [
        "standardRangePreset",
        "standardRangeCustom",
        "standardFovDeg",
        "standardLatitudeDeg",
        "baseTileSizePx",
        "latitudeMode",
        "zQuantizeStep",
      ],
    },
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const MercatorZoomOverview: Story = {
  name: "Zoom by Latitude Overview",
};
