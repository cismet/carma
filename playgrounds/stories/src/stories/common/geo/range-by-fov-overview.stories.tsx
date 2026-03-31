import type { Meta, StoryObj } from "@storybook/react";

import {
  DOLLY_ZOOM_X_AXIS_MODES,
  readDollyZoomXAxisStatusValue,
  type DollyZoomXAxisMode,
} from "./dolly-zoom-axis";
import { GeoChartStoryFrame } from "./geo-chart-story-frame";
import { GEO_STORY_STYLES } from "./geo-story-styles";
import { RangeByFovAndResolutionPanel } from "./range-by-fov-and-resolution-plot";
import { ResolutionByFovAndRangePanel } from "./resolution-by-fov-and-range-plot";
type RangeByFovOverviewStoryArgs = {
  xAxisMode: DollyZoomXAxisMode;
};

const meta: Meta<RangeByFovOverviewStoryArgs> = {
  title: "Geo",
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

export const RangeByFovAndResolution: Story = {
  name: "Range by FOV and Resolution",
  render: (args) => (
    <GeoChartStoryFrame
      label="Range by FOV Overview"
      values={[
        readDollyZoomXAxisStatusValue(args.xAxisMode),
        "compare range and resolution views",
      ]}
    >
      <section style={GEO_STORY_STYLES.layout.intro}>
        <p style={GEO_STORY_STYLES.text.introText}>
          Dolly zoom trades field of view against distance to keep subject size
          fixed.
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>range = k / tan(fov / 2)</p>
        <p style={GEO_STORY_STYLES.text.introText}>
          The upper plot shows range as the output. The lower plot shows the
          matching center resolution instead.
        </p>
      </section>
      <section style={GEO_STORY_STYLES.layout.panel}>
        <RangeByFovAndResolutionPanel xAxisMode={args.xAxisMode} />
      </section>
      <section style={GEO_STORY_STYLES.layout.panel}>
        <ResolutionByFovAndRangePanel xAxisMode={args.xAxisMode} />
      </section>
    </GeoChartStoryFrame>
  ),
};
