import type { Meta, StoryObj } from "@storybook/react";

import {
  BASE_TILE_SIZES_PX,
  MercatorZoomReferenceTables,
  type MercatorZoomReferenceStoryArgs,
} from "./mercator-zoom.shared";
const meta: Meta<MercatorZoomReferenceStoryArgs> = {
  title: "Geo/Mercator Zoom",
  component: MercatorZoomReferenceTables,
  parameters: {
    layout: "fullscreen",
    controls: {
      include: [
        "baseTileSizePx",
        "standardFovDeg",
        "standardLatitudeDeg",
        "minimumForwardZoom",
        "maximumForwardZoom",
      ],
    },
  },
  args: {
    baseTileSizePx: BASE_TILE_SIZES_PX.PX_256,
    standardFovDeg: 45,
    standardLatitudeDeg: 51,
    minimumForwardZoom: 0,
    maximumForwardZoom: 22,
  },
  argTypes: {
    baseTileSizePx: {
      options: Object.values(BASE_TILE_SIZES_PX),
      control: { type: "inline-radio" },
      description:
        "Base Web-Mercator tile size used for both forward and inverse reference calculations.",
    },
    standardLatitudeDeg: {
      control: { type: "range", min: 0, max: 85, step: 0.5 },
      description: "Reference latitude used for both lookup tables.",
    },
    standardFovDeg: {
      control: { type: "range", min: 1, max: 120, step: 0.1 },
      description: "Field of view used for range-to-zoom conversion.",
    },
    minimumForwardZoom: {
      control: { type: "range", min: 0, max: 30, step: 1 },
      description: "Minimum zoom included in the forward zoom-to-range table.",
    },
    maximumForwardZoom: {
      control: { type: "range", min: 0, max: 30, step: 1 },
      description: "Maximum zoom included in the forward zoom-to-range table.",
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ZoomRangeResolutionReference: Story = {
  name: "Zoom by Range and Resolution Reference",
};
