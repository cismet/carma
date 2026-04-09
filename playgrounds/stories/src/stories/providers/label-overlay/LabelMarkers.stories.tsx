import {
  LabelBackgroundsStory,
  LABEL_MARKERS_ARG_TYPES,
  LABEL_MARKERS_DEFAULT_ARGS,
  LABEL_MARKERS_PARAMETERS,
  PillboxOnlyStory,
  RepresentativeCasesStory,
} from "./LabelMarkers.story-helpers";

const meta = {
  title: "Overlay/Labels",
  args: LABEL_MARKERS_DEFAULT_ARGS,
  argTypes: LABEL_MARKERS_ARG_TYPES,
  parameters: {
    layout: "fullscreen",
    ...LABEL_MARKERS_PARAMETERS,
  },
};

export default meta;

export const RepresentativeCases = {
  name: "Representative Cases",
  render: (args) => <RepresentativeCasesStory {...args} />,
};

export const LabelBackgrounds = {
  name: "Label Backgrounds",
  args: {
    storyBackground: "urban",
  },
  render: (args) => <LabelBackgroundsStory {...args} />,
};

export const LabelComponent = {
  name: "Label Component",
  render: (args) => <PillboxOnlyStory {...args} />,
};
