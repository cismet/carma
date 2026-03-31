import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPointById,
  hasPointCandidateOffsetStem,
  resolveCandidateCapabilities,
  type AnnotationCandidateDescriptor,
  type AnnotationCandidateKind,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  isValidScene,
  getLocalUpDirectionAtAnchor,
  type Scene,
} from "@carma/cesium";
type AnnotationCursorSource = "none" | "raw" | "snapped-node";

type AnnotationCursorScreenPosition = { x: number; y: number };

type AnnotationCursorState = {
  source: AnnotationCursorSource;
  cursorScreenPosition: AnnotationCursorScreenPosition | null;
  rawCursorScreenPosition: AnnotationCursorScreenPosition | null;
  snappedCursorScreenPosition: AnnotationCursorScreenPosition | null;
  candidateNodePositionECEF: Cartesian3 | null;
  candidateNodeSurfaceNormalECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  candidatePointId: string | null;
};

type RawMeasurementPointerSample = {
  positionECEF: Cartesian3 | null;
  screenPosition: Cartesian2 | null;
  surfaceNormalECEF: Cartesian3 | null;
};

type UseAnnotationCursorStateParams = {
  enabled: boolean;
  snappedPointReleaseDelayMs: number;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  onCandidateNodePositionChange?: (positionECEF: Cartesian3 | null) => void;
};

const cloneCartesian3OrNull = (value: Cartesian3 | null) =>
  value ? Cartesian3.clone(value) : null;

const cloneCartesian2OrNull = (value: Cartesian2 | null) =>
  value ? Cartesian2.clone(value) : null;

const cloneRawPointerSample = (
  sample: RawMeasurementPointerSample
): RawMeasurementPointerSample => ({
  positionECEF: cloneCartesian3OrNull(sample.positionECEF),
  screenPosition: cloneCartesian2OrNull(sample.screenPosition),
  surfaceNormalECEF: cloneCartesian3OrNull(sample.surfaceNormalECEF),
});

const toScreenPosition = (
  screenPosition?: Cartesian2 | AnnotationCursorScreenPosition | null
): AnnotationCursorScreenPosition | null => {
  if (!screenPosition) return null;
  if (
    !Number.isFinite(screenPosition.x) ||
    !Number.isFinite(screenPosition.y)
  ) {
    return null;
  }
  return { x: screenPosition.x, y: screenPosition.y };
};

const projectScreenPositionFromScene = (
  scene: Scene | null,
  positionECEF: Cartesian3 | null
): AnnotationCursorScreenPosition | null => {
  if (!isValidScene(scene) || !positionECEF) {
    return null;
  }

  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    positionECEF
  );
  if (!defined(screenPosition)) {
    return null;
  }

  return toScreenPosition(screenPosition);
};

const isSameCartesian3 = (left: Cartesian3 | null, right: Cartesian3 | null) =>
  left === right ||
  (!!left &&
    !!right &&
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z);

const isSameScreenPosition = (
  left: AnnotationCursorScreenPosition | null,
  right: AnnotationCursorScreenPosition | null
) =>
  left === right ||
  (!!left && !!right && left.x === right.x && left.y === right.y);

const resolveCandidateWorldState = ({
  candidateKind,
  verticalOffsetMeters,
  getPositionWithVerticalOffsetFromAnchor,
  anchorPositionECEF,
  surfaceNormalECEF,
}: {
  candidateKind: AnnotationCandidateKind;
  verticalOffsetMeters: number;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  anchorPositionECEF: Cartesian3 | null;
  surfaceNormalECEF?: Cartesian3 | null;
}) => {
  const hasOffsetStem = hasPointCandidateOffsetStem(
    candidateKind,
    verticalOffsetMeters
  );
  const candidateNodeVerticalOffsetAnchorECEF =
    hasOffsetStem && anchorPositionECEF
      ? Cartesian3.clone(anchorPositionECEF)
      : null;
  const candidateNodePositionECEF = anchorPositionECEF
    ? hasOffsetStem
      ? getPositionWithVerticalOffsetFromAnchor(
          anchorPositionECEF,
          verticalOffsetMeters
        )
      : Cartesian3.clone(anchorPositionECEF)
    : null;
  const candidateNodeSurfaceNormalECEF = surfaceNormalECEF
    ? Cartesian3.normalize(surfaceNormalECEF, new Cartesian3())
    : null;

  return {
    candidateNodePositionECEF,
    candidateNodeSurfaceNormalECEF,
    candidateNodeVerticalOffsetAnchorECEF,
  };
};

export const useCursorState = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  {
    enabled,
    snappedPointReleaseDelayMs,
    getPositionWithVerticalOffsetFromAnchor,
    onCandidateNodePositionChange,
  }: UseAnnotationCursorStateParams
) => {
  const { hasCandidateNode } = resolveCandidateCapabilities(candidate.kind);
  const candidateKind = candidate.kind;
  const verticalOffsetMeters = candidate.verticalOffsetMeters;
  const [cursorState, setCursorState] = useState<AnnotationCursorState>({
    source: "none",
    cursorScreenPosition: null,
    rawCursorScreenPosition: null,
    snappedCursorScreenPosition: null,
    candidateNodePositionECEF: null,
    candidateNodeSurfaceNormalECEF: null,
    candidateNodeVerticalOffsetAnchorECEF: null,
    candidatePointId: null,
  });

  const snappedPointIdRef = useRef<string | null>(null);
  const snappedPointScreenPositionRef =
    useRef<AnnotationCursorScreenPosition | null>(null);
  const snappedPointReleaseTimeoutRef = useRef<number | null>(null);
  const candidateNodePositionChangeRef = useRef(onCandidateNodePositionChange);
  const clearMeasurementCursorRef = useRef<(() => void) | null>(null);
  const rawPointerSampleRef = useRef<RawMeasurementPointerSample>({
    positionECEF: null,
    screenPosition: null,
    surfaceNormalECEF: null,
  });

  useEffect(() => {
    candidateNodePositionChangeRef.current = onCandidateNodePositionChange;
  }, [onCandidateNodePositionChange]);

  useEffect(
    function effectTrackRawPointerScreenPosition() {
      if (!enabled || !hasCandidateNode) {
        return;
      }

      const handlePointerMove = (event: PointerEvent) => {
        const nextRawCursorScreenPosition = toScreenPosition({
          x: event.clientX,
          y: event.clientY,
        });

        rawPointerSampleRef.current = {
          ...rawPointerSampleRef.current,
          screenPosition: nextRawCursorScreenPosition
            ? new Cartesian2(
                nextRawCursorScreenPosition.x,
                nextRawCursorScreenPosition.y
              )
            : null,
        };

        setCursorState((previousState) =>
          isSameScreenPosition(
            previousState.rawCursorScreenPosition,
            nextRawCursorScreenPosition
          ) &&
          isSameScreenPosition(
            previousState.cursorScreenPosition,
            nextRawCursorScreenPosition
          )
            ? previousState
            : {
                ...previousState,
                rawCursorScreenPosition: nextRawCursorScreenPosition,
                cursorScreenPosition: nextRawCursorScreenPosition,
              }
        );
      };

      window.addEventListener("pointermove", handlePointerMove, true);

      return () => {
        window.removeEventListener("pointermove", handlePointerMove, true);
      };
    },
    [enabled, hasCandidateNode]
  );

  const clearSnappedPointReleaseTimeout = useCallback(() => {
    if (snappedPointReleaseTimeoutRef.current === null) return;
    window.clearTimeout(snappedPointReleaseTimeoutRef.current);
    snappedPointReleaseTimeoutRef.current = null;
  }, []);

  const setCursorStateInternal = useCallback(
    ({
      source,
      anchorPositionECEF,
      surfaceNormalECEF,
      rawCursorScreenPosition,
      snappedCursorScreenPosition,
      snappedPointId,
    }: {
      source: AnnotationCursorSource;
      anchorPositionECEF: Cartesian3 | null;
      surfaceNormalECEF?: Cartesian3 | null;
      rawCursorScreenPosition?: AnnotationCursorScreenPosition | null;
      snappedCursorScreenPosition?: AnnotationCursorScreenPosition | null;
      snappedPointId?: string | null;
    }) => {
      const {
        candidateNodePositionECEF,
        candidateNodeSurfaceNormalECEF,
        candidateNodeVerticalOffsetAnchorECEF,
      } = resolveCandidateWorldState({
        candidateKind,
        verticalOffsetMeters,
        getPositionWithVerticalOffsetFromAnchor,
        anchorPositionECEF,
        surfaceNormalECEF,
      });
      const nextRawCursorScreenPosition =
        rawCursorScreenPosition === undefined ? null : rawCursorScreenPosition;
      const nextSnappedCursorScreenPosition =
        snappedCursorScreenPosition === undefined
          ? null
          : snappedCursorScreenPosition;
      // Keep the crosshair overlay anchored to the actual pointer sample.
      // Snapping should only affect the candidate world position/rendered
      // preview, not visually drag the mouse cursor to the snapped node.
      const nextCursorScreenPosition =
        nextRawCursorScreenPosition ??
        (source === "snapped-node" ? nextSnappedCursorScreenPosition : null);
      const nextSnappedPointId =
        source === "snapped-node" ? snappedPointId ?? null : null;

      let hasStateChanged = false;
      setCursorState((previousState) => {
        if (
          previousState.source === source &&
          previousState.candidatePointId === nextSnappedPointId &&
          isSameCartesian3(
            previousState.candidateNodePositionECEF,
            candidateNodePositionECEF
          ) &&
          isSameCartesian3(
            previousState.candidateNodeSurfaceNormalECEF,
            candidateNodeSurfaceNormalECEF
          ) &&
          isSameCartesian3(
            previousState.candidateNodeVerticalOffsetAnchorECEF,
            candidateNodeVerticalOffsetAnchorECEF
          ) &&
          isSameScreenPosition(
            previousState.rawCursorScreenPosition,
            nextRawCursorScreenPosition
          ) &&
          isSameScreenPosition(
            previousState.snappedCursorScreenPosition,
            nextSnappedCursorScreenPosition
          ) &&
          isSameScreenPosition(
            previousState.cursorScreenPosition,
            nextCursorScreenPosition
          )
        ) {
          return previousState;
        }
        hasStateChanged = true;

        return {
          source,
          cursorScreenPosition: nextCursorScreenPosition,
          rawCursorScreenPosition: nextRawCursorScreenPosition,
          snappedCursorScreenPosition: nextSnappedCursorScreenPosition,
          candidateNodePositionECEF,
          candidateNodeSurfaceNormalECEF,
          candidateNodeVerticalOffsetAnchorECEF,
          candidatePointId: nextSnappedPointId,
        };
      });

      if (!hasStateChanged) {
        return;
      }
      candidateNodePositionChangeRef.current?.(candidateNodePositionECEF);
      scene?.requestRender();
    },
    [
      candidateKind,
      getPositionWithVerticalOffsetFromAnchor,
      scene,
      verticalOffsetMeters,
    ]
  );

  const clearMeasurementCursor = useCallback(() => {
    clearSnappedPointReleaseTimeout();
    snappedPointIdRef.current = null;
    snappedPointScreenPositionRef.current = null;
    rawPointerSampleRef.current = {
      positionECEF: null,
      screenPosition: null,
      surfaceNormalECEF: null,
    };
    setCursorStateInternal({
      source: "none",
      anchorPositionECEF: null,
      rawCursorScreenPosition: null,
      snappedCursorScreenPosition: null,
      snappedPointId: null,
    });
  }, [clearSnappedPointReleaseTimeout, setCursorStateInternal]);

  useEffect(() => {
    clearMeasurementCursorRef.current = clearMeasurementCursor;
  }, [clearMeasurementCursor]);

  const clearSnappedMeasurementCursor = useCallback(() => {
    clearSnappedPointReleaseTimeout();
    snappedPointIdRef.current = null;
    snappedPointScreenPositionRef.current = null;
  }, [clearSnappedPointReleaseTimeout]);

  const applyLastRawPointerSample = useCallback(() => {
    const rawSample = cloneRawPointerSample(rawPointerSampleRef.current);
    setCursorStateInternal({
      source: rawSample.positionECEF ? "raw" : "none",
      anchorPositionECEF: rawSample.positionECEF,
      surfaceNormalECEF: rawSample.surfaceNormalECEF,
      rawCursorScreenPosition: toScreenPosition(rawSample.screenPosition),
      snappedCursorScreenPosition: null,
      snappedPointId: null,
    });
  }, [setCursorStateInternal]);

  const syncMeasurementCursorToExistingPoint = useCallback(
    (
      pointId: string,
      anchorPosition?: AnnotationCursorScreenPosition | null
    ) => {
      clearSnappedPointReleaseTimeout();
      const hoveredPoint = getPointById(annotations, pointId);
      if (!hoveredPoint) {
        return false;
      }

      const snappedScreenPosition =
        projectScreenPositionFromScene(scene, hoveredPoint.geometryECEF) ??
        toScreenPosition(anchorPosition) ??
        (snappedPointIdRef.current === pointId
          ? snappedPointScreenPositionRef.current
          : null);
      snappedPointIdRef.current = pointId;
      snappedPointScreenPositionRef.current = snappedScreenPosition;
      setCursorStateInternal({
        source: "snapped-node",
        anchorPositionECEF: hoveredPoint.geometryECEF,
        surfaceNormalECEF: getLocalUpDirectionAtAnchor(
          hoveredPoint.geometryECEF
        ),
        rawCursorScreenPosition: toScreenPosition(
          rawPointerSampleRef.current.screenPosition
        ),
        snappedCursorScreenPosition: snappedScreenPosition,
        snappedPointId: pointId,
      });
      return true;
    },
    [
      annotations,
      clearSnappedPointReleaseTimeout,
      scene,
      setCursorStateInternal,
    ]
  );

  const handleRawMeasurementPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      rawPointerSampleRef.current = {
        positionECEF: cloneCartesian3OrNull(positionECEF),
        screenPosition:
          screenPosition &&
          Number.isFinite(screenPosition.x) &&
          Number.isFinite(screenPosition.y)
            ? Cartesian2.clone(screenPosition)
            : null,
        surfaceNormalECEF: cloneCartesian3OrNull(surfaceNormalECEF ?? null),
      };

      const snappedPointId = snappedPointIdRef.current;
      const nextRawCursorScreenPosition = toScreenPosition(screenPosition);
      if (!snappedPointId) {
        setCursorStateInternal({
          source: positionECEF ? "raw" : "none",
          anchorPositionECEF: positionECEF,
          surfaceNormalECEF,
          rawCursorScreenPosition: nextRawCursorScreenPosition,
          snappedCursorScreenPosition: null,
          snappedPointId: null,
        });
        return;
      }

      const snappedPoint = getPointById(annotations, snappedPointId);
      if (!snappedPoint) {
        clearSnappedMeasurementCursor();
        applyLastRawPointerSample();
        return;
      }

      const nextSnappedCursorScreenPosition =
        projectScreenPositionFromScene(scene, snappedPoint.geometryECEF) ??
        snappedPointScreenPositionRef.current ??
        nextRawCursorScreenPosition;
      snappedPointScreenPositionRef.current = nextSnappedCursorScreenPosition;
      setCursorStateInternal({
        source: "snapped-node",
        anchorPositionECEF: snappedPoint.geometryECEF,
        surfaceNormalECEF: getLocalUpDirectionAtAnchor(
          snappedPoint.geometryECEF
        ),
        rawCursorScreenPosition: nextRawCursorScreenPosition,
        snappedCursorScreenPosition: nextSnappedCursorScreenPosition,
        snappedPointId,
      });
    },
    [
      annotations,
      applyLastRawPointerSample,
      clearSnappedMeasurementCursor,
      scene,
      setCursorStateInternal,
    ]
  );

  const scheduleMeasurementCursorSnapRelease = useCallback(
    (pointId: string) => {
      if (snappedPointIdRef.current !== pointId) return;
      clearSnappedPointReleaseTimeout();
      snappedPointReleaseTimeoutRef.current = window.setTimeout(() => {
        snappedPointReleaseTimeoutRef.current = null;
        if (snappedPointIdRef.current !== pointId) return;
        clearSnappedMeasurementCursor();
        applyLastRawPointerSample();
      }, snappedPointReleaseDelayMs);
    },
    [
      applyLastRawPointerSample,
      clearSnappedMeasurementCursor,
      clearSnappedPointReleaseTimeout,
      snappedPointReleaseDelayMs,
    ]
  );

  const releaseMeasurementCursorSnap = useCallback(() => {
    if (!snappedPointIdRef.current) {
      return;
    }
    clearSnappedMeasurementCursor();
    applyLastRawPointerSample();
  }, [applyLastRawPointerSample, clearSnappedMeasurementCursor]);

  useEffect(() => {
    if (enabled && hasCandidateNode) return;
    clearMeasurementCursor();
  }, [clearMeasurementCursor, enabled, hasCandidateNode]);

  useEffect(
    () => () => {
      clearMeasurementCursorRef.current?.();
    },
    []
  );

  return {
    ...cursorState,
    cursorScreenPosition: cursorState.rawCursorScreenPosition,
    clearMeasurementCursor,
    handleAnnotationCursorMove: handleRawMeasurementPointerMove,
    releaseAnnotationCursorSnap: releaseMeasurementCursorSnap,
    scheduleAnnotationCursorSnapRelease: scheduleMeasurementCursorSnapRelease,
    syncAnnotationCursorToExistingPoint: syncMeasurementCursorToExistingPoint,
  } as const;
};
