import type { StoryContext } from "@storybook/react";

import {
  MeasurementStory,
  pointDraftAtNextNode,
  pressNodeMarker,
  type MeasurementStoryProps,
  type MeasurementStoryState,
  type MeasurementStoryView,
} from "../measurement-story-harness";

/**
 * What the per-tool stories share: one fixture measurement, the state it
 * starts in, and for the editing state a play function that opens the move
 * gizmo with a long press on one node, the way a user does. Every tool
 * story file shows the same states so they compare side by side:
 * committed, selected, editing (the tool's own edit rule), drafting where
 * the tool drafts (its play function points at the next node), and for
 * line tools the meter marker modes.
 */

export type ToolStoryArgs = Pick<
  MeasurementStoryProps,
  "surfaceTiles" | "showAllTools" | "meterMarkers"
> & {
  annotationIds: readonly string[];
  focusAnnotationId: string;
  state: MeasurementStoryState;
  /** Node the editing story presses. */
  editNodeIndex?: number;
  /** Direction the camera frames the measurement from. */
  view?: MeasurementStoryView;
};

export const renderToolStory = (args: ToolStoryArgs) => (
  <MeasurementStory
    surfaceTiles={args.surfaceTiles}
    showAllTools={args.showAllTools}
    meterMarkers={args.meterMarkers}
    annotationIds={args.annotationIds}
    focusAnnotationId={args.focusAnnotationId}
    state={args.state}
    frame
    view={args.view}
    storageKey={`carma::stories::measurement-tool::${args.focusAnnotationId}`}
  />
);

/** Opens the move gizmo on the story's edit node once the marker is placed. */
export const playOpenMoveGizmo = async ({
  canvasElement,
  args,
}: StoryContext<ToolStoryArgs>) => {
  await pressNodeMarker(
    canvasElement,
    args.focusAnnotationId,
    args.editNodeIndex ?? 0
  );
};

/** Puts the pointer on the next node, so the draft's rubber band shows. */
export const playPointDraft = async ({
  canvasElement,
}: StoryContext<ToolStoryArgs>) => {
  await pointDraftAtNextNode(canvasElement);
};

/** Story arguments that are scenario data rather than controls. */
export const toolStoryHiddenControls = {
  controls: {
    exclude: [
      "annotationIds",
      "focusAnnotationId",
      "state",
      "editNodeIndex",
      "view",
    ],
  },
};
