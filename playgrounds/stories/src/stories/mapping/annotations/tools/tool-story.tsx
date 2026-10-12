import type { StoryContext } from "@storybook/react";
import { carma } from "@carma-api";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import {
  MeasurementStory,
  type MeasurementStoryProps,
  type MeasurementStoryState,
  type MeasurementStoryView,
} from "../measurement-story-harness";
import {
  fixtureCoordinates,
  fixtureSubset,
  loadMeasurementStoryFixture,
  pointDraftAtNextNode,
  pressNodeMarker,
  waitForMeasurementStory,
} from "../measurement-story-play";

/**
 * Per-tool stories: one fixture measurement in a state (committed, selected,
 * editing, drafting, meter marker modes), plus a replay that makes it click
 * by click and an add from the export, both through carma.annotations.
 */

export type ToolStoryArgs = Pick<
  MeasurementStoryProps,
  "surfaceTiles" | "showAllTools" | "meterMarkers"
> & {
  annotationIds: readonly string[];
  focusAnnotationId: string;
  state: MeasurementStoryState;
  editNodeIndex?: number;
  view?: MeasurementStoryView;
  replayToolId?: AnnotationToolId;
  /** fixture nodes the replay clicks, in this order; all when omitted */
  replayNodeOrder?: readonly number[];
  /** answer to a label's text prompt */
  replayText?: string;
};

const REPLAY_STEP_MS = 700;

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
  />
);

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

export const playPointDraft = async ({
  canvasElement,
}: StoryContext<ToolStoryArgs>) => {
  await pointDraftAtNextNode(canvasElement);
};

export const playReplayCreate = async ({
  canvasElement,
  args,
}: StoryContext<ToolStoryArgs>) => {
  if (!args.replayToolId) return;
  if (!(await waitForMeasurementStory(canvasElement))) return;
  const coordinates = fixtureCoordinates(
    await loadMeasurementStoryFixture(),
    args.focusAnnotationId
  );
  const clicked = args.replayNodeOrder
    ? args.replayNodeOrder.flatMap((index) => coordinates[index] ?? [])
    : coordinates;
  await carma.annotations.createMeasurement(args.replayToolId, clicked, {
    stepDelayMs: REPLAY_STEP_MS,
    text: args.replayText,
  });
};

/** Adds the left-out measurement from the export, selected. */
export const playAddMeasurements = async ({
  canvasElement,
  args,
}: StoryContext<ToolStoryArgs>) => {
  if (!(await waitForMeasurementStory(canvasElement))) return;
  carma.annotations.addMeasurements(
    fixtureSubset(await loadMeasurementStoryFixture(), [
      args.focusAnnotationId,
    ]),
    { select: true }
  );
};

export const toolStoryHiddenControls = {
  controls: {
    exclude: [
      "annotationIds",
      "focusAnnotationId",
      "state",
      "editNodeIndex",
      "view",
      "replayToolId",
      "replayNodeOrder",
      "replayText",
    ],
  },
};
