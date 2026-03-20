import {
  LABEL_PLACEMENT_POLYGON_ARGS,
  LABEL_PLACEMENT_POLYGON_ARG_TYPES,
  LABEL_PLACEMENT_SINGLE_LINE_ARGS,
  LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES,
  PolygonSegmentLabelDebugStory,
  SingleLineLabelDebugStory,
} from "./LabelPlacement.story-helpers";

const meta = {
  title: "Providers/LabelOverlay/Layout/Line Labels",
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
  name: "Single Line",
  argTypes: LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES,
  args: LABEL_PLACEMENT_SINGLE_LINE_ARGS,
  render: (args) => <SingleLineLabelDebugStory args={args} />,
};

export const PolygonSegment = {
  name: "Polygon Segment",
  argTypes: LABEL_PLACEMENT_POLYGON_ARG_TYPES,
  args: LABEL_PLACEMENT_POLYGON_ARGS,
  render: (args) => (
    <PolygonSegmentLabelDebugStory
      sidePreference={args.polygonSidePreference ?? "outside"}
    />
  ),
};
