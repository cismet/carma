import type { Meta, StoryObj } from "@storybook/react";

import {
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
} from "../measurement-story-harness";
import {
  playAddMeasurements,
  playOpenMoveGizmo,
  playPointDraft,
  playReplayCreate,
  renderToolStory,
  toolStoryHiddenControls,
  type ToolStoryArgs,
} from "./tool-story";

/** Ground area (footprint): measured in the horizontal; the value sits inside the area while it fits and turns into a pill once it does not. */

const meta = {
  title: "Mapping/Annotations/Tools/Ground Area",
  id: "mapping-annotations-tools-ground-area",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Ground area (footprint): measured in the horizontal; the value sits inside the area while it fits and turns into a pill once it does not.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-area-4"],
    focusAnnotationId: "scene-area-4",
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

/** The move gizmo on a corner: no height arrows (the area is measured in the horizontal), horizontal disc, surface drag. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 2 },
  play: playOpenMoveGizmo,
};

/** The tool active with three corners placed. */
export const Drafting: Story = {
  args: { state: { kind: "drafting", toolId: "area", nodes: 3 } },
  play: playPointDraft,
};

/** Made through carma.annotations: a click per corner, then finished. */
export const ReplayCreate: Story = {
  args: { state: { kind: "empty" }, replayToolId: "area" },
  play: playReplayCreate,
};

/** Added through carma.annotations from the measurement export. */
export const AddMeasurement: Story = {
  args: { state: { kind: "empty" } },
  play: playAddMeasurements,
};
