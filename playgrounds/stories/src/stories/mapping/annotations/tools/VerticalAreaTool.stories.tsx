import type { Meta, StoryObj } from "@storybook/react";

import {
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
} from "../measurement-story-harness";
import {
  playOpenMoveGizmo,
  playPointDraft,
  renderToolStory,
  toolStoryHiddenControls,
  type ToolStoryArgs,
} from "./tool-story";

/** Vertical area (wall): a rectangle in a vertical plane from two diagonal corners. */

const meta = {
  title: "Mapping/Annotations/Tools/Vertical Area",
  id: "mapping-annotations-tools-vertical-area",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Vertical area (wall): a rectangle in a vertical plane from two diagonal corners.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-vertical-8"],
    focusAnnotationId: "scene-vertical-8",
    view: { pitch: 40 },
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

/** The move gizmo on a corner: disc in the wall plane, drag in the wall, no arrows. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 2 },
  play: playOpenMoveGizmo,
};

/** The tool active after the first corner: the rectangle follows the pointer. */
export const Drafting: Story = {
  args: { state: { kind: "drafting", toolId: "vertical", nodes: 1 } },
  play: playPointDraft,
};
