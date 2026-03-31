import {
  LABEL_MARKERS_ARG_TYPES,
  LABEL_MARKERS_DEFAULT_ARGS,
  LABEL_MARKERS_PARAMETERS,
  PillboxOnlyStory,
  RepresentativeCasesStory,
} from "./LabelMarkers.story-helpers";

const meta = {
  title: "Overlay/Labels",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const RepresentativeCases = {
  name: "Representative Cases",
  args: LABEL_MARKERS_DEFAULT_ARGS,
  parameters: LABEL_MARKERS_PARAMETERS,
  argTypes: LABEL_MARKERS_ARG_TYPES,
  render: (args) => <RepresentativeCasesStory {...args} />,
};

export const PillboxLabelOnly = {
  name: "Pillbox Label Only",
  args: LABEL_MARKERS_DEFAULT_ARGS,
  parameters: LABEL_MARKERS_PARAMETERS,
  argTypes: LABEL_MARKERS_ARG_TYPES,
  render: (args) => <PillboxOnlyStory {...args} />,
};
