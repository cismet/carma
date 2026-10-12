import type { Meta, StoryObj } from "@storybook/react";

import {
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
} from "../measurement-story-harness";
import {
  playAddMeasurements,
  playOpenMoveGizmo,
  playReplayCreate,
  renderToolStory,
  toolStoryHiddenControls,
  type ToolStoryArgs,
} from "./tool-story";

/** Point measurement: one node with its height label. Edits move it freely (height arrows, horizontal disc, surface drag). */

const meta = {
  title: "Mapping/Annotations/Tools/Point",
  id: "mapping-annotations-tools-point",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Point measurement: one node with its height label. Edits move it freely (height arrows, horizontal disc, surface drag).",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-point-1"],
    focusAnnotationId: "scene-point-1",
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

/** The move gizmo on the point: height arrows, horizontal disc, centre handle following the surface. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 0 },
  play: playOpenMoveGizmo,
};

/** Made through carma.annotations: the point tool and one click. */
export const ReplayCreate: Story = {
  args: { state: { kind: "empty" }, replayToolId: "point" },
  play: playReplayCreate,
};

/** Added through carma.annotations from the measurement export. */
export const AddMeasurement: Story = {
  args: { state: { kind: "empty" } },
  play: playAddMeasurements,
};
