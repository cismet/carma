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

/** Distance measurement: the direct line with its height and length legs, the right-angle corner and the meter markers. */

const meta = {
  title: "Mapping/Annotations/Tools/Distance",
  id: "mapping-annotations-tools-distance",
  render: renderToolStory,
  parameters: {
    layout: "fullscreen",
    ...toolStoryHiddenControls,
    docs: {
      description: {
        component:
          "Distance measurement: the direct line with its height and length legs, the right-angle corner and the meter markers.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    annotationIds: ["scene-distance-2"],
    focusAnnotationId: "scene-distance-2",
    view: { pitch: 30 },
    state: { kind: "committed" },
  },
  argTypes: measurementStoryArgTypes,
} satisfies Meta<ToolStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/** On the map, nothing selected; the meter markers show by default. */
export const Committed: Story = {};

/** Selected: highlight, node handles and the info box. */
export const Selected: Story = {
  args: { state: { kind: "selected" } },
};

/** The move gizmo on the second node: height arrows, horizontal disc, surface drag. */
export const Editing: Story = {
  args: { state: { kind: "editing" }, editNodeIndex: 1 },
  play: playOpenMoveGizmo,
};

/** The tool active after the first click: the draft follows the pointer from the first node. */
export const Drafting: Story = {
  args: { state: { kind: "drafting", toolId: "distance", nodes: 1 } },
  play: playPointDraft,
};

/** Meter marker mode selected: a quiet line until it is selected or drafted. */
export const MeterMarkersOnlyWhenSelected: Story = {
  args: { meterMarkers: "selected", state: { kind: "committed" } },
};

/** Meter marker mode off: no markers, even while selected. */
export const MeterMarkersOff: Story = {
  args: { meterMarkers: "off", state: { kind: "selected" } },
};
