import {
  DOM_LABEL_LAYOUT_ARG_TYPES,
  DOM_LABEL_LAYOUT_DEFAULT_ARGS,
  DomLabelLayoutEngineStory,
} from "./DomLabelLayoutEngine.story-helpers";

const meta = {
  title: "Providers/LabelOverlay",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
  args: DOM_LABEL_LAYOUT_DEFAULT_ARGS,
  argTypes: DOM_LABEL_LAYOUT_ARG_TYPES,
};

export default meta;

export const DomLayoutEngine = {
  name: "DOM Layout Engine",
  render: (args) => <DomLabelLayoutEngineStory {...args} />,
};
