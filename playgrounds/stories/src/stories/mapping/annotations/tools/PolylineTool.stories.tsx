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

/** Polyline measurement: segment lengths, the total on the badge and meter markers counted on along the chain. */

const meta = {
  title: "Mapping/Annotations/Tools/Polyline",
  id: "mapping-annotations-tools-polyline",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Polyline measurement: segment lengths, the total on the badge and meter markers counted on along the chain.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-polyline-3"],
    focusAnnotationId: "scene-polyline-3",
    view: { pitch: 45 },
    state: { kind: "committed" },
  },
  argTypes: measurementStoryArgTypes,
} satisfies Meta<ToolStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/** On the map, nothing selected; the meter markers count on from segment to segment. */
export const Committed: Story = {};

/** Selected: highlight, node handles and the info box. */
export const Selected: Story = {
  args: { state: { kind: "selected" } },
};

/** The move gizmo on the middle node: height arrows, horizontal disc, surface drag. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 1 },
  play: playOpenMoveGizmo,
};

/** The tool active with two nodes placed: the drafted chain carries its meter markers. */
export const Drafting: Story = {
  args: { state: { kind: "drafting", toolId: "polyline", nodes: 2 } },
  play: playPointDraft,
};

/** Meter marker mode off: no markers, even while selected. */
export const MeterMarkersOff: Story = {
  args: { meterMarkers: "off", state: { kind: "selected" } },
};
