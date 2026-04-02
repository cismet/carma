import { useCallback, useEffect, useRef } from "react";

import {
  getPointById,
  hasPointCandidateOffsetStem,
  resolveCandidateCapabilities,
  type AnnotationCandidateDescriptor,
  type AnnotationCandidateKind,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";
import { getLocalUpDirectionAtAnchor } from "@carma-mapping/engines/cesium/core";
import {
  type AnnotationPreviewScreenPosition,
  type PreviewRuntimeController,
} from "../candidate/previewRuntime";
type AnnotationCursorSource = "none" | "raw" | "snapped-node";

type AnnotationCursorState = {
  source: AnnotationCursorSource;
  candidateNodePositionECEF: Cartesian3 | null;
  candidateNodeScreenPosition: AnnotationPreviewScreenPosition | null;
  candidateNodeSurfaceNormalECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorScreenPosition: AnnotationPreviewScreenPosition | null;
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
  previewRuntimeController: PreviewRuntimeController;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  onCandidateNodePositionChange?: (positionECEF: Cartesian3 | null) => void;
};

const toScreenPosition = (
  value: Cartesian2 | null | { x: number; y: number } | undefined
): AnnotationPreviewScreenPosition | null =>
  value && Number.isFinite(value.x) && Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;

const isSameCartesian3 = (left: Cartesian3 | null, right: Cartesian3 | null) =>
  left === right ||
  (!!left &&
    !!right &&
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z);

const isSameScreenPosition = (
  left: AnnotationPreviewScreenPosition | null,
  right: AnnotationPreviewScreenPosition | null
) =>
  left === right ||
  (!!left && !!right && left.x === right.x && left.y === right.y);

const copyCartesian3OrNull = (
  value: Cartesian3 | null,
  target: Cartesian3 | null
): Cartesian3 | null => {
  if (!value) {
    return null;
  }

  return Cartesian3.clone(value, target ?? new Cartesian3());
};

const copyCartesian2OrNull = (
  value: Cartesian2 | null,
  target: Cartesian2 | null
): Cartesian2 | null => {
  if (!value) {
    return null;
  }

  return Cartesian2.clone(value, target ?? new Cartesian2());
};

const copyScreenPositionOrNull = (
  value: AnnotationPreviewScreenPosition | null,
  target: AnnotationPreviewScreenPosition | null
): AnnotationPreviewScreenPosition | null => {
  if (!value) {
    return null;
  }

  if (target) {
    target.x = value.x;
    target.y = value.y;
    return target;
  }

  return { x: value.x, y: value.y };
};

const resolveCandidateWorldState = ({
  candidateKind,
  verticalOffsetMeters,
  getPositionWithVerticalOffsetFromAnchor,
  anchorPositionECEF,
  surfaceNormalECEF,
  candidateNodePositionTarget,
  candidateNodeSurfaceNormalTarget,
  candidateNodeVerticalOffsetAnchorTarget,
}: {
  candidateKind: AnnotationCandidateKind;
  verticalOffsetMeters: number;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  anchorPositionECEF: Cartesian3 | null;
  surfaceNormalECEF?: Cartesian3 | null;
  candidateNodePositionTarget: Cartesian3 | null;
  candidateNodeSurfaceNormalTarget: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorTarget: Cartesian3 | null;
}) => {
  const hasOffsetStem = hasPointCandidateOffsetStem(
    candidateKind,
    verticalOffsetMeters
  );
  const candidateNodeVerticalOffsetAnchorECEF =
    hasOffsetStem && anchorPositionECEF
      ? Cartesian3.clone(
          anchorPositionECEF,
          candidateNodeVerticalOffsetAnchorTarget ?? new Cartesian3()
        )
      : null;
  const elevatedCandidatePositionECEF = anchorPositionECEF
    ? hasOffsetStem
      ? getPositionWithVerticalOffsetFromAnchor(
          anchorPositionECEF,
          verticalOffsetMeters
        )
      : anchorPositionECEF
    : null;
  const candidateNodePositionECEF = elevatedCandidatePositionECEF
    ? Cartesian3.clone(
        elevatedCandidatePositionECEF,
        candidateNodePositionTarget ?? new Cartesian3()
      )
    : null;
  const candidateNodeSurfaceNormalECEF = surfaceNormalECEF
    ? Cartesian3.normalize(
        surfaceNormalECEF,
        candidateNodeSurfaceNormalTarget ?? new Cartesian3()
      )
    : null;

  return {
    candidateNodePositionECEF,
    candidateNodeSurfaceNormalECEF,
    candidateNodeVerticalOffsetAnchorECEF,
  };
};

export const useCursorState = (
  _scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  {
    enabled,
    snappedPointReleaseDelayMs,
    previewRuntimeController,
    getPositionWithVerticalOffsetFromAnchor,
    onCandidateNodePositionChange,
  }: UseAnnotationCursorStateParams
) => {
  const { hasCandidateNode } = resolveCandidateCapabilities(candidate.kind);
  const candidateKind = candidate.kind;
  const verticalOffsetMeters = candidate.verticalOffsetMeters;
  const cursorStateRef = useRef<AnnotationCursorState>({
    source: "none",
    candidateNodePositionECEF: null,
    candidateNodeScreenPosition: null,
    candidateNodeSurfaceNormalECEF: null,
    candidateNodeVerticalOffsetAnchorECEF: null,
    candidateNodeVerticalOffsetAnchorScreenPosition: null,
    candidatePointId: null,
  });

  const snappedPointIdRef = useRef<string | null>(null);
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

  const clearSnappedPointReleaseTimeout = useCallback(() => {
    if (snappedPointReleaseTimeoutRef.current === null) return;
    window.clearTimeout(snappedPointReleaseTimeoutRef.current);
    snappedPointReleaseTimeoutRef.current = null;
  }, []);

  const setCursorStateInternal = useCallback(
    ({
      source,
      anchorPositionECEF,
      anchorScreenPosition,
      surfaceNormalECEF,
      snappedPointId,
    }: {
      source: AnnotationCursorSource;
      anchorPositionECEF: Cartesian3 | null;
      anchorScreenPosition?: AnnotationPreviewScreenPosition | null;
      surfaceNormalECEF?: Cartesian3 | null;
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
        candidateNodePositionTarget:
          cursorStateRef.current.candidateNodePositionECEF,
        candidateNodeSurfaceNormalTarget:
          cursorStateRef.current.candidateNodeSurfaceNormalECEF,
        candidateNodeVerticalOffsetAnchorTarget:
          cursorStateRef.current.candidateNodeVerticalOffsetAnchorECEF,
      });
      const nextSnappedPointId =
        source === "snapped-node" ? snappedPointId ?? null : null;
      const candidateNodeScreenPosition = anchorScreenPosition ?? null;
      const candidateNodeVerticalOffsetAnchorScreenPosition =
        anchorScreenPosition ?? null;

      const previousState = cursorStateRef.current;
      if (
        previousState.source === source &&
        previousState.candidatePointId === nextSnappedPointId &&
        isSameCartesian3(
        previousState.candidateNodePositionECEF,
        candidateNodePositionECEF
      ) &&
        isSameScreenPosition(
          previousState.candidateNodeScreenPosition,
          candidateNodeScreenPosition
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
          previousState.candidateNodeVerticalOffsetAnchorScreenPosition,
          candidateNodeVerticalOffsetAnchorScreenPosition
        )
      ) {
        return;
      }

      previousState.source = source;
      previousState.candidateNodePositionECEF = candidateNodePositionECEF;
      previousState.candidateNodeScreenPosition = copyScreenPositionOrNull(
        candidateNodeScreenPosition,
        previousState.candidateNodeScreenPosition
      );
      previousState.candidateNodeSurfaceNormalECEF =
        candidateNodeSurfaceNormalECEF;
      previousState.candidateNodeVerticalOffsetAnchorECEF =
        candidateNodeVerticalOffsetAnchorECEF;
      previousState.candidateNodeVerticalOffsetAnchorScreenPosition =
        copyScreenPositionOrNull(
          candidateNodeVerticalOffsetAnchorScreenPosition,
          previousState.candidateNodeVerticalOffsetAnchorScreenPosition
        );
      previousState.candidatePointId = nextSnappedPointId;

      candidateNodePositionChangeRef.current?.(
        previousState.candidateNodePositionECEF
      );
      previewRuntimeController.publish(previousState);
    },
    [
      candidateKind,
      getPositionWithVerticalOffsetFromAnchor,
      previewRuntimeController,
      verticalOffsetMeters,
    ]
  );

  const clearMeasurementCursor = useCallback(() => {
    clearSnappedPointReleaseTimeout();
    snappedPointIdRef.current = null;
    rawPointerSampleRef.current.positionECEF = null;
    rawPointerSampleRef.current.screenPosition = null;
    rawPointerSampleRef.current.surfaceNormalECEF = null;
    setCursorStateInternal({
      source: "none",
      anchorPositionECEF: null,
      anchorScreenPosition: null,
      snappedPointId: null,
    });
  }, [clearSnappedPointReleaseTimeout, setCursorStateInternal]);

  useEffect(() => {
    clearMeasurementCursorRef.current = clearMeasurementCursor;
  }, [clearMeasurementCursor]);

  const clearSnappedMeasurementCursor = useCallback(() => {
    clearSnappedPointReleaseTimeout();
    snappedPointIdRef.current = null;
  }, [clearSnappedPointReleaseTimeout]);

  const applyLastRawPointerSample = useCallback(() => {
    const rawSample = rawPointerSampleRef.current;
    setCursorStateInternal({
      source: rawSample.positionECEF ? "raw" : "none",
      anchorPositionECEF: rawSample.positionECEF,
      anchorScreenPosition: toScreenPosition(rawSample.screenPosition),
      surfaceNormalECEF: rawSample.surfaceNormalECEF,
      snappedPointId: null,
    });
  }, [setCursorStateInternal]);

  const syncMeasurementCursorToExistingPoint = useCallback(
    (
      pointId: string,
      anchorPosition?: AnnotationPreviewScreenPosition | null
    ) => {
      clearSnappedPointReleaseTimeout();
      const hoveredPoint = getPointById(annotations, pointId);
      if (!hoveredPoint) {
        return false;
      }

      snappedPointIdRef.current = pointId;
      setCursorStateInternal({
        source: "snapped-node",
        anchorPositionECEF: hoveredPoint.geometryECEF,
        anchorScreenPosition:
          anchorPosition ??
          toScreenPosition(rawPointerSampleRef.current.screenPosition),
        surfaceNormalECEF: getLocalUpDirectionAtAnchor(
          hoveredPoint.geometryECEF
        ),
        snappedPointId: pointId,
      });
      return true;
    },
    [annotations, clearSnappedPointReleaseTimeout, setCursorStateInternal]
  );

  const handleRawMeasurementPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      rawPointerSampleRef.current.positionECEF = copyCartesian3OrNull(
        positionECEF,
        rawPointerSampleRef.current.positionECEF
      );
      rawPointerSampleRef.current.screenPosition =
        screenPosition &&
        Number.isFinite(screenPosition.x) &&
        Number.isFinite(screenPosition.y)
          ? copyCartesian2OrNull(
              screenPosition,
              rawPointerSampleRef.current.screenPosition
            )
          : null;
      rawPointerSampleRef.current.surfaceNormalECEF = copyCartesian3OrNull(
        surfaceNormalECEF ?? null,
        rawPointerSampleRef.current.surfaceNormalECEF
      );

      const snappedPointId = snappedPointIdRef.current;
      if (!snappedPointId) {
        setCursorStateInternal({
          source: positionECEF ? "raw" : "none",
          anchorPositionECEF: positionECEF,
          anchorScreenPosition: toScreenPosition(screenPosition),
          surfaceNormalECEF,
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
      setCursorStateInternal({
        source: "snapped-node",
        anchorPositionECEF: snappedPoint.geometryECEF,
        anchorScreenPosition: toScreenPosition(
          rawPointerSampleRef.current.screenPosition
        ),
        surfaceNormalECEF: getLocalUpDirectionAtAnchor(
          snappedPoint.geometryECEF
        ),
        snappedPointId,
      });
    },
    [
      annotations,
      applyLastRawPointerSample,
      clearSnappedMeasurementCursor,
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
      previewRuntimeController.clear();
    },
    [previewRuntimeController]
  );

  return {
    clearMeasurementCursor,
    handleAnnotationCursorMove: handleRawMeasurementPointerMove,
    releaseAnnotationCursorSnap: releaseMeasurementCursorSnap,
    scheduleAnnotationCursorSnapRelease: scheduleMeasurementCursorSnapRelease,
    syncAnnotationCursorToExistingPoint: syncMeasurementCursorToExistingPoint,
  } as const;
};
