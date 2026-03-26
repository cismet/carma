import type { Meta, StoryObj } from "@storybook/react";
import { DebuggingStory } from "./storyScenarios";

const meta: Meta = {
  title: "Mapping/MappingEngineSwitcher",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Debugging: StoryObj = {
  name: "Debugging",
  render: () => <DebuggingStory />,
};
