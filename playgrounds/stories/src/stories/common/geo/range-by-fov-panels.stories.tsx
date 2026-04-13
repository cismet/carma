import type { Meta, StoryObj } from "@storybook/react";

import {
  DOLLY_ZOOM_X_AXIS_MODES,
  readDollyZoomXAxisStatusValue,
  type DollyZoomXAxisMode,
} from "./dolly-zoom-axis";
import { GeoChartStoryFrame } from "./geo-chart-story-frame";
import {
  RangeByFovAndResolutionPanel,
  type RangeByFovAndResolutionStoryArgs,
} from "./range-by-fov-and-resolution-plot";
import {
  ResolutionByFovAndRangePanel,
  type ResolutionByFovAndRangeStoryArgs,
} from "./resolution-by-fov-and-range-plot";
type PlotArgs = {
  xAxisMode: DollyZoomXAxisMode;
};

const meta: Meta<PlotArgs> = {
  title: "Geo/Range by FOV",
  args: {
    xAxisMode: DOLLY_ZOOM_X_AXIS_MODES.FOV_DEG,
  },
  argTypes: {
    xAxisMode: {
      options: Object.values(DOLLY_ZOOM_X_AXIS_MODES),
      control: { type: "inline-radio" },
      description:
        "Horizontal axis as direct FOV degrees, log(fov), or log(tan(fov / 2)).",
    },
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const RangeOutput: Story = {
  name: "Range by FOV and Resolution",
  render: (args: RangeByFovAndResolutionStoryArgs) => (
    <GeoChartStoryFrame
      label="Range by FOV and Resolution"
      values={[readDollyZoomXAxisStatusValue(args.xAxisMode), "y log2(m/px)"]}
    >
      <RangeByFovAndResolutionPanel xAxisMode={args.xAxisMode} />
    </GeoChartStoryFrame>
  ),
};

export const ResolutionOutput: Story = {
  name: "Resolution by FOV and Range",
  render: (args: ResolutionByFovAndRangeStoryArgs) => (
    <GeoChartStoryFrame
      label="Resolution by FOV and Range"
      values={[readDollyZoomXAxisStatusValue(args.xAxisMode), "y log2(range)"]}
    >
      <ResolutionByFovAndRangePanel xAxisMode={args.xAxisMode} />
    </GeoChartStoryFrame>
  ),
};
