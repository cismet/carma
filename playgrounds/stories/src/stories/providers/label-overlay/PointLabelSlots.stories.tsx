import {
  POINT_LABEL_SLOTS_ARG_TYPES,
  POINT_LABEL_SLOTS_DEFAULT_ARGS,
  PointLabelSlotComparisonStory,
  PointLabelSlotGeneratorStory,
  PointLabelSlotPresetStory,
  type PointLabelSlotsStoryArgs,
} from "./PointLabelSlots.story-helpers";

const meta = {
  title: "Providers/LabelOverlay/Layout/Point Slots",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
};

export default meta;

export const Presets = {
  name: "Presets",
  args: POINT_LABEL_SLOTS_DEFAULT_ARGS,
  argTypes: {
    ...POINT_LABEL_SLOTS_ARG_TYPES,
    strategy: {
      table: {
        disable: true,
      },
    },
    slotCount: {
      table: {
        disable: true,
      },
    },
    includeCenter: {
      table: {
        disable: true,
      },
    },
  },
  render: (args: PointLabelSlotsStoryArgs) => (
    <PointLabelSlotPresetStory {...args} />
  ),
};

export const ArbitraryGenerator = {
  name: "Arbitrary Generator",
  args: {
    ...POINT_LABEL_SLOTS_DEFAULT_ARGS,
    strategy: "equal-height-sides",
    slotCount: 12,
    includeCenter: false,
  },
  argTypes: {
    ...POINT_LABEL_SLOTS_ARG_TYPES,
    preset: {
      table: {
        disable: true,
      },
    },
  },
  render: (args: PointLabelSlotsStoryArgs) => (
    <PointLabelSlotGeneratorStory {...args} />
  ),
};

export const StrategyComparison = {
  name: "Strategy Comparison",
  args: {
    ...POINT_LABEL_SLOTS_DEFAULT_ARGS,
    slotCount: 12,
    includeCenter: true,
    compareStrategies: true,
  },
  argTypes: {
    ...POINT_LABEL_SLOTS_ARG_TYPES,
    preset: {
      table: {
        disable: true,
      },
    },
    strategy: {
      table: {
        disable: true,
      },
    },
  },
  render: (args: PointLabelSlotsStoryArgs) => (
    <PointLabelSlotComparisonStory {...args} />
  ),
};
