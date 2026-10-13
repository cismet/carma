import { useEffect, useMemo, useRef } from "react";

import { computeCircleSegments } from "@carma-commons/math";
import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
  type AnnotationGizmoPoint,
} from "@carma-mapping/annotations/core";

import { createLiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import { useEdgeSceneLines } from "../../render/edges/use-edge-scene-lines";
import { useScenePrimitives } from "../../render/scene-primitives/use-scene-primitives";
import {
  createPointMoveGizmoFrameReader,
  type PointMoveGizmoFrameOptions,
} from "./engine-point-move-gizmo-frame";
import { getRotationAxisDashCount } from "./engine-point-move-gizmo-rotation-axis";
import {
  buildPointMoveGizmoSceneLines,
  buildPointMoveGizmoScenePrimitives,
  canDrawPointMoveGizmoInScene,
} from "./engine-point-move-gizmo-scene-models";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

/** The gizmo's lines carry no node ids and never follow drag anchors. */
const NO_LIVE_ANCHORS = createLiveAnnotationAnchors(() => undefined);

/**
 * The scene part of the gizmo, composed like a measurement: line and
 * primitive models built from the gizmo state go through the hooks that draw
 * the measurement edges, recomputed before every frame from the frame layout
 * the overlay positions its hit areas with.
 */
export const usePointMoveGizmoScene = (
  engine: AnnotationEngine | null,
  gizmo: PointMoveGizmoState,
  {
    movePoint,
    axisCandidates,
    showAxes,
    showDisc,
    showRotationHandle,
    axisWidthPx,
    frameOptions,
  }: {
    movePoint: AnnotationGizmoPoint | null;
    /** The axes the overlay holds arrows for. */
    axisCandidates: readonly AnnotationGizmoAxisCandidate[];
    showAxes: boolean;
    showDisc: boolean;
    showRotationHandle: boolean;
    axisWidthPx: number;
    frameOptions: PointMoveGizmoFrameOptions;
  }
) => {
  const frameOptionsRef = useRef(frameOptions);
  frameOptionsRef.current = frameOptions;
  const movePointRef = useRef(movePoint);
  movePointRef.current = movePoint;
  const movePointKey = movePoint?.id ?? null;
  const validEngine = isValidAnnotationEngine(engine) ? engine : null;
  const inScene = canDrawPointMoveGizmoInScene(validEngine);
  const readFrame = useMemo(
    () =>
      validEngine
        ? createPointMoveGizmoFrameReader(
            validEngine,
            gizmo,
            () => frameOptionsRef.current
          )
        : () => null,
    [validEngine, gizmo]
  );
  const axisCandidatesRef = useRef(axisCandidates);
  axisCandidatesRef.current = axisCandidates;
  const axisKey = axisCandidates
    .map((candidate) => `${candidate.id}:${candidate.color ?? ""}`)
    .join("|");
  const discSegments = computeCircleSegments(
    frameOptions.discOutlineScreenPixelRadius
  );

  // Rebuilt per selected point and structure only; positions follow per frame.
  const models = useMemo(() => {
    const point = movePointRef.current;
    if (!validEngine || !point || point.id !== movePointKey) {
      return { lines: [], primitives: [] };
    }
    const originECEF = point.geometryECEF.clone();
    const cameraPosition = validEngine.getCameraPositionECEF();
    const options = {
      pointId: point.id,
      originECEF,
      axisCandidates: axisKey ? axisCandidatesRef.current : [],
      showAxes,
      showDisc,
      showRotationHandle,
      inScene,
      occludedLinesInScene: validEngine.capabilities.occludedLinesInScene,
      axisWidthPx,
      discSegments,
      rotationAxisDashCount: getRotationAxisDashCount(
        cameraPosition?.distanceTo(originECEF) ?? null,
        validEngine.getScreenPixelsPerMeterAt(originECEF)
      ),
      readFrame,
    };
    return {
      lines: buildPointMoveGizmoSceneLines(options),
      primitives: buildPointMoveGizmoScenePrimitives(options),
    };
  }, [
    axisKey,
    axisWidthPx,
    discSegments,
    inScene,
    movePointKey,
    readFrame,
    showAxes,
    showDisc,
    showRotationHandle,
    validEngine,
  ]);

  // A fresh selection captures its stepped disc size anew.
  useEffect(() => {
    gizmo.discSteppedScaler.reset();
  }, [gizmo, movePointKey]);

  // Options the frame layout reads take effect with the next frame.
  useEffect(() => {
    validEngine?.requestRender();
  }, [validEngine, frameOptions]);

  useEdgeSceneLines(validEngine, models.lines, null, NO_LIVE_ANCHORS);
  useScenePrimitives(validEngine, models.primitives);
};
