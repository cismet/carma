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

/** Roof area (planar): measured in its own plane. Four ways to fit the plane share the stored type; the drafting stories show each tool. */

const meta = {
  title: "Mapping/Annotations/Tools/Roof Area",
  id: "mapping-annotations-tools-roof-area",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Roof area (planar): measured in its own plane. Four ways to fit the plane share the stored type; the drafting stories show each tool.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-planar-5", "scene-planar-6", "scene-planar-7"],
    focusAnnotationId: "scene-planar-5",
    state: { kind: "committed" },
  },
  argTypes: measurementStoryArgTypes,
} satisfies Meta<ToolStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/** All three roof areas on the map, nothing selected. */
export const Committed: Story = {};

/** D1 selected. */
export const Selected: Story = {
  args: { state: { kind: "selected" } },
};

/** The move gizmo on a corner of D1: disc in the roof plane, drag in the plane, no arrows. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 1 },
  play: playOpenMoveGizmo,
};

/** Plane from the first three corners that are not on one line. */
export const DraftingFirstTriangle: Story = {
  args: { state: { kind: "drafting", toolId: "planar", nodes: 3 } },
  play: playPointDraft,
};

/** Plane from the biggest triangle of the corners. */
export const DraftingBiggestTriangle: Story = {
  args: {
    state: { kind: "drafting", toolId: "planar-biggest-triangle", nodes: 3 },
  },
  play: playPointDraft,
};

/** Plane fitted through all corners (PCA). */
export const DraftingPca: Story = {
  args: { state: { kind: "drafting", toolId: "planar-pca", nodes: 3 } },
  play: playPointDraft,
};

/** Trapezoid construction. */
export const DraftingTrapezoid: Story = {
  args: { state: { kind: "drafting", toolId: "planar-trapezoid", nodes: 3 } },
  play: playPointDraft,
};

/** Made through carma.annotations with the first-triangle plane. */
export const ReplayCreateFirstTriangle: Story = {
  args: { state: { kind: "empty" }, replayToolId: "planar" },
  play: playReplayCreate,
};

/** Made through carma.annotations with the biggest-triangle plane. */
export const ReplayCreateBiggestTriangle: Story = {
  args: { state: { kind: "empty" }, replayToolId: "planar-biggest-triangle" },
  play: playReplayCreate,
};

/** Made through carma.annotations with the fitted (PCA) plane. */
export const ReplayCreatePca: Story = {
  args: { state: { kind: "empty" }, replayToolId: "planar-pca" },
  play: playReplayCreate,
};

/** Made through carma.annotations with the trapezoid construction. */
export const ReplayCreateTrapezoid: Story = {
  args: { state: { kind: "empty" }, replayToolId: "planar-trapezoid" },
  play: playReplayCreate,
};

/** Added through carma.annotations from the measurement export. */
export const AddMeasurement: Story = {
  args: { state: { kind: "empty" } },
  play: playAddMeasurements,
};
