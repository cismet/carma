import type { Vector3 } from "three";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationSceneLineCollection,
  type AnnotationSceneLineHandle,
} from "../../engine";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import { shouldExcludeAnnotationSceneLineFromDragSample } from "../annotation-edge-drag-sample-exclusions";
import type { EdgeSceneLine } from "./edge-models";

/**
 * The point-move gizmo must not sample the edited node's own lines while
 * dragging along a surface: they live in the collection created with
 * `excludeFromDragSamples`, foreign lines stay snappable in the other.
 */
export type SceneLineCollections = {
  snappable: AnnotationSceneLineCollection;
  excludedFromDragSamples: AnnotationSceneLineCollection;
};

export type SceneLineHandle = {
  signature: string;
  line: EdgeSceneLine;
  sceneLine: AnnotationSceneLineHandle;
  /** Which collection currently owns `sceneLine`. */
  excludedFromDragSamples: boolean;
  /** Node ids and stored positions, so the pre-render patch can swap in live anchors and restore. */
  startNodeId?: string;
  endNodeId?: string;
  baseStart: Vector3;
  baseEnd: Vector3;
  recompute?: (
    liveAnchors: LiveAnnotationAnchors
  ) => readonly [Vector3, Vector3] | null;
  overridden: boolean;
  destroy: () => void;
};

export const buildSceneLineSignature = (line: EdgeSceneLine) =>
  [
    line.id,
    line.start.x,
    line.start.y,
    line.start.z,
    line.end.x,
    line.end.y,
    line.end.z,
    line.stroke,
    line.strokeWidth,
    line.occludedDashed,
    line.ruler,
    line.rulerStartMeters ?? 0,
    line.halo !== false,
  ].join(":");

export const createSceneLineCollections = (
  engine: AnnotationEngine
): SceneLineCollections => ({
  snappable: engine.createLineCollection(),
  excludedFromDragSamples: engine.createLineCollection({
    excludeFromDragSamples: true,
  }),
});

export const destroySceneLineCollections = (
  collections: SceneLineCollections
) => {
  collections.snappable.destroy();
  collections.excludedFromDragSamples.destroy();
};

const resolveSceneLineCollection = (
  collections: SceneLineCollections,
  excludedFromDragSamples: boolean
) =>
  excludedFromDragSamples
    ? collections.excludedFromDragSamples
    : collections.snappable;

export const createSceneLineHandle = (
  engine: AnnotationEngine,
  collections: SceneLineCollections,
  line: EdgeSceneLine,
  excludedFromDragSamples: boolean
): SceneLineHandle => {
  const sceneLine = resolveSceneLineCollection(
    collections,
    excludedFromDragSamples
  ).addLine({
    id: line.id,
    positions: [line.start, line.end],
    color: line.stroke,
    width: line.strokeWidth,
    occludedDashed: line.occludedDashed,
    ruler: line.ruler,
    rulerStartMeters: line.rulerStartMeters,
    halo: line.halo !== false,
    visible: true,
  });

  const destroy = () => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    try {
      sceneLine.destroy();
    } catch (error) {
      console.warn(
        "[annotations/runtime] Ignoring committed edge destroy error.",
        error
      );
    }
  };

  return {
    signature: buildSceneLineSignature(line),
    line,
    sceneLine,
    excludedFromDragSamples,
    startNodeId: line.startNodeId,
    endNodeId: line.endNodeId,
    baseStart: line.start,
    baseEnd: line.end,
    recompute: line.recompute,
    overridden: false,
    destroy,
  };
};

export const destroySceneLineHandles = (
  handles: Map<string, SceneLineHandle>
) => {
  handles.forEach((handle) => {
    handle.destroy();
  });
  handles.clear();
};

/** Moves line endpoints to the live drag anchors before the draw and restores the stored positions once they clear. */
export const applyLiveAnchorsToSceneLines = (
  handles: Map<string, SceneLineHandle>,
  liveAnchors: LiveAnnotationAnchors
) => {
  const hasAnchors = liveAnchors.size > 0;
  handles.forEach((handle) => {
    let nextPositions: readonly [Vector3, Vector3] | null = null;
    if (handle.recompute) {
      nextPositions = hasAnchors ? handle.recompute(liveAnchors) : null;
    } else {
      const liveStart = handle.startNodeId
        ? liveAnchors.get(handle.startNodeId)
        : undefined;
      const liveEnd = handle.endNodeId
        ? liveAnchors.get(handle.endNodeId)
        : undefined;
      if (liveStart !== undefined || liveEnd !== undefined) {
        nextPositions = [
          liveStart ?? handle.baseStart,
          liveEnd ?? handle.baseEnd,
        ];
      }
    }
    if (nextPositions === null && !handle.overridden) {
      return;
    }
    handle.sceneLine.setPositions(
      nextPositions
        ? [nextPositions[0], nextPositions[1]]
        : [handle.baseStart, handle.baseEnd]
    );
    handle.overridden = nextPositions !== null && hasAnchors;
  });
};

/** Re-evaluated every frame; a line whose verdict changed is re-created in the other collection. */
export const applyDragSampleExclusionsToSceneLines = (
  engine: AnnotationEngine,
  collections: SceneLineCollections,
  handles: Map<string, SceneLineHandle>,
  activeEditedNodeId: string | null,
  liveAnchors: LiveAnnotationAnchors
) => {
  handles.forEach((handle, id) => {
    const excludedFromDragSamples =
      shouldExcludeAnnotationSceneLineFromDragSample(
        handle,
        activeEditedNodeId,
        (nodeId) => liveAnchors.get(nodeId) !== undefined
      );
    if (excludedFromDragSamples === handle.excludedFromDragSamples) {
      return;
    }

    handle.destroy();
    const nextHandle = createSceneLineHandle(
      engine,
      collections,
      handle.line,
      excludedFromDragSamples
    );
    nextHandle.overridden = false;
    handles.set(id, nextHandle);
  });
};
