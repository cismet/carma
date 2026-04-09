import { POLYGON_SEGMENT_LABEL_SIDE } from "@carma-commons/svg";

import {
  DISTANCE_TRIANGLE_OVERLAY_ARGS,
  DISTANCE_TRIANGLE_OVERLAY_ARG_TYPES,
  DistanceTriangleOverlayDebugStory,
  LINE_LABEL_COMPONENT_ARGS,
  LINE_LABEL_COMPONENT_ARG_TYPES,
  LABEL_PLACEMENT_POLYGON_ARGS,
  LABEL_PLACEMENT_POLYGON_ARG_TYPES,
  LABEL_PLACEMENT_SINGLE_LINE_ARGS,
  LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES,
  LineLabelComponentStory,
  PolygonSegmentLabelDebugStory,
  SingleLineLabelDebugStory,
} from "./LabelPlacement.story-helpers";

const meta = {
  title: "Overlay/Labels",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
};

export default meta;

export const SingleLine = {
  name: "Label Placement Single Line",
  argTypes: LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES,
  args: LABEL_PLACEMENT_SINGLE_LINE_ARGS,
  render: (args) => <SingleLineLabelDebugStory args={args} />,
};

export const PolygonSegment = {
  name: "Label Placement Polygon Segment",
  argTypes: LABEL_PLACEMENT_POLYGON_ARG_TYPES,
  args: LABEL_PLACEMENT_POLYGON_ARGS,
  render: (args) => (
    <PolygonSegmentLabelDebugStory
      sidePreference={
        args.polygonSidePreference ?? POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
      }
    />
  ),
};

export const DistanceTriangleOverlay = {
  name: "Distance Tool Overlay",
  argTypes: DISTANCE_TRIANGLE_OVERLAY_ARG_TYPES,
  args: DISTANCE_TRIANGLE_OVERLAY_ARGS,
  render: (args) => <DistanceTriangleOverlayDebugStory {...args} />,
};

export const LineLabelComponent = {
  name: "Line Label Component",
  argTypes: LINE_LABEL_COMPONENT_ARG_TYPES,
  args: LINE_LABEL_COMPONENT_ARGS,
  render: (args) => <LineLabelComponentStory {...args} />,
};
