import {
  ANNOTATION_TYPOGRAPHY_ARGS,
  ANNOTATION_TYPOGRAPHY_ARG_TYPES,
  AnnotationTypographyStory,
} from "../providers/label-overlay/AnnotationTypography.story-helpers";

const meta = {
  title: "Annotations/Typography",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
};

export default meta;

export const Typography = {
  name: "Typography",
  argTypes: ANNOTATION_TYPOGRAPHY_ARG_TYPES,
  args: ANNOTATION_TYPOGRAPHY_ARGS,
  render: (args) => <AnnotationTypographyStory {...args} />,
};
