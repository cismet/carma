import {
  LabelBackgroundsStory,
  LABEL_MARKERS_ARG_TYPES,
  LABEL_MARKERS_DEFAULT_ARGS,
  LABEL_MARKERS_PARAMETERS,
  LabelStatesAndThemesStory,
  PillboxOnlyStory,
  REPRESENTATIVE_CASES_STORY_ARGS,
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

export const LabelStatesAndThemes = {
  name: "States and Themes",
  args: {
    ...REPRESENTATIVE_CASES_STORY_ARGS,
  },
  render: (args) => <LabelStatesAndThemesStory {...args} />,
};

export const LabelBackgrounds = {
  name: "Backgrounds",
  args: {
    storyBackground: "urban",
  },
  render: (args) => <LabelBackgroundsStory {...args} />,
};

export const LabelComponent = {
  name: "Component",
  render: (args) => <PillboxOnlyStory {...args} />,
};
