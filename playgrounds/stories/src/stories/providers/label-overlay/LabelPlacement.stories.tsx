import { POLYGON_SEGMENT_LABEL_SIDE } from "@carma-commons/svg";

import {
  DISTANCE_TRIANGLE_OVERLAY_ARGS,
  DISTANCE_TRIANGLE_OVERLAY_ARG_TYPES,
  DistanceTriangleOverlayDebugStory,
  LABEL_PLACEMENT_POLYGON_ARGS,
  LABEL_PLACEMENT_POLYGON_ARG_TYPES,
  LABEL_PLACEMENT_SINGLE_LINE_ARGS,
  LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES,
  PolygonSegmentLabelDebugStory,
  SingleLineLabelDebugStory,
} from "./LabelPlacement.story-helpers";
import {
  ANNOTATION_TYPOGRAPHY_ARGS,
  ANNOTATION_TYPOGRAPHY_ARG_TYPES,
  AnnotationTypographyStory,
} from "./AnnotationTypography.story-helpers";
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
  name: "Distance Triangle Overlay",
  argTypes: DISTANCE_TRIANGLE_OVERLAY_ARG_TYPES,
  args: DISTANCE_TRIANGLE_OVERLAY_ARGS,
  render: (args) => <DistanceTriangleOverlayDebugStory {...args} />,
};

export const Typography = {
  name: "Annotation Typography",
  argTypes: ANNOTATION_TYPOGRAPHY_ARG_TYPES,
  args: ANNOTATION_TYPOGRAPHY_ARGS,
  render: (args) => <AnnotationTypographyStory {...args} />,
};
