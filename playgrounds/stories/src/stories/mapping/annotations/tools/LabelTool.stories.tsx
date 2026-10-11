import type { Meta, StoryObj } from "@storybook/react";

import {
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
} from "../measurement-story-harness";
import {
  playOpenMoveGizmo,
  renderToolStory,
  toolStoryHiddenControls,
  type ToolStoryArgs,
} from "./tool-story";

/** Label: a text pill anchored at a point. */

const meta = {
  title: "Mapping/Annotations/Tools/Label",
  id: "mapping-annotations-tools-label",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: { component: "Label: a text pill anchored at a point." },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-label-9"],
    focusAnnotationId: "scene-label-9",
    view: { pitch: 35 },
    state: { kind: "committed" },
  },
  argTypes: measurementStoryArgTypes,
} satisfies Meta<ToolStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/** On the map, nothing selected. */
export const Committed: Story = {};

/** Selected: highlight, node handles and the info box. */
export const Selected: Story = {
  args: { state: { kind: "selected" } },
};

/** The move gizmo on the label anchor: height arrows, horizontal disc, surface drag. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 0 },
  play: playOpenMoveGizmo,
};
