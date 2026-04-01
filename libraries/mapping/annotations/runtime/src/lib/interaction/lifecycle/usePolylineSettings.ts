import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getPositionWithVerticalOffsetFromAnchor,
} from "@carma-mapping/engines/cesium/core";
type UsePolylineSettingsParams = {
  focusedNodeChainAnnotationId: string | null;
  nodeChainAnnotations: NodeChainAnnotation[];
  defaultPolylineVerticalOffsetMeters: number;
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  setDefaultPolylineVerticalOffsetMeters: Dispatch<SetStateAction<number>>;
  setDefaultPolylineSegmentLineMode: Dispatch<
    SetStateAction<LinearSegmentLineMode>
  >;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
};

export const usePolylineSettings = ({
  focusedNodeChainAnnotationId,
  nodeChainAnnotations,
  defaultPolylineVerticalOffsetMeters,
  defaultPolylineSegmentLineMode,
  setDefaultPolylineVerticalOffsetMeters,
  setDefaultPolylineSegmentLineMode,
  setNodeChainAnnotations,
  setAnnotations,
}: UsePolylineSettingsParams) => {
  const polylineVerticalOffsetMeters = useMemo(() => {
    if (!focusedNodeChainAnnotationId) {
      return defaultPolylineVerticalOffsetMeters;
    }
    const focusedGroup = nodeChainAnnotations.find(
      (group) => group.id === focusedNodeChainAnnotationId
    );
    return (
      focusedGroup?.verticalOffsetMeters ?? defaultPolylineVerticalOffsetMeters
    );
  }, [
    defaultPolylineVerticalOffsetMeters,
    focusedNodeChainAnnotationId,
    nodeChainAnnotations,
  ]);

  const setPolylineVerticalOffsetMeters = useCallback<
    Dispatch<SetStateAction<number>>
  >(
    (nextOffsetOrUpdater) => {
      const nextOffsetMeters =
        typeof nextOffsetOrUpdater === "function"
          ? nextOffsetOrUpdater(polylineVerticalOffsetMeters)
          : nextOffsetOrUpdater;

      if (!Number.isFinite(nextOffsetMeters)) {
        return;
      }

      if (Math.abs(nextOffsetMeters - polylineVerticalOffsetMeters) <= 1e-9) {
        return;
      }

      setDefaultPolylineVerticalOffsetMeters(nextOffsetMeters);

      if (!focusedNodeChainAnnotationId) {
        return;
      }

      const focusedGroup = nodeChainAnnotations.find(
        (group) => group.id === focusedNodeChainAnnotationId
      );
      if (!focusedGroup) {
        return;
      }

      setNodeChainAnnotations((prev) =>
        prev.map((group) =>
          group.id === focusedNodeChainAnnotationId
            ? {
                ...group,
                verticalOffsetMeters: nextOffsetMeters,
              }
            : group
        )
      );

      const focusedVertexIdSet = new Set(focusedGroup.nodeIds);
      if (focusedVertexIdSet.size === 0) {
        return;
      }

      setAnnotations((prev) =>
        prev.map((measurement) => {
          if (
            !isPointAnnotationEntry(measurement) ||
            !focusedVertexIdSet.has(measurement.id) ||
            !measurement.verticalOffsetAnchorECEF
          ) {
            return measurement;
          }

          const anchorECEF = new Cartesian3(
            measurement.verticalOffsetAnchorECEF.x,
            measurement.verticalOffsetAnchorECEF.y,
            measurement.verticalOffsetAnchorECEF.z
          );
          const nextPointPosition = getPositionWithVerticalOffsetFromAnchor(
            anchorECEF,
            nextOffsetMeters
          );
          const nextWGS84 = getDegreesFromCartesian(nextPointPosition);

          return {
            ...measurement,
            geometryECEF: nextPointPosition,
            geometryWGS84: {
              longitude: nextWGS84.longitude,
              latitude: nextWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
            },
          };
        })
      );
    },
    [
      focusedNodeChainAnnotationId,
      nodeChainAnnotations,
      polylineVerticalOffsetMeters,
      setAnnotations,
      setDefaultPolylineVerticalOffsetMeters,
      setNodeChainAnnotations,
    ]
  );

  const polylineSegmentLineMode = useMemo(() => {
    if (!focusedNodeChainAnnotationId) {
      return defaultPolylineSegmentLineMode;
    }
    const activeGroup = nodeChainAnnotations.find(
      (group) => group.id === focusedNodeChainAnnotationId
    );
    return activeGroup?.segmentLineMode ?? defaultPolylineSegmentLineMode;
  }, [
    focusedNodeChainAnnotationId,
    defaultPolylineSegmentLineMode,
    nodeChainAnnotations,
  ]);

  const setPolylineSegmentLineMode = useCallback<
    Dispatch<SetStateAction<LinearSegmentLineMode>>
  >(
    (nextModeOrUpdater) => {
      const nextMode =
        typeof nextModeOrUpdater === "function"
          ? nextModeOrUpdater(polylineSegmentLineMode)
          : nextModeOrUpdater;

      if (!nextMode || nextMode === polylineSegmentLineMode) {
        return;
      }

      setDefaultPolylineSegmentLineMode(nextMode);

      if (!focusedNodeChainAnnotationId) {
        return;
      }

      setNodeChainAnnotations((prev) =>
        prev.map((group) =>
          group.id === focusedNodeChainAnnotationId
            ? {
                ...group,
                segmentLineMode: nextMode,
              }
            : group
        )
      );
    },
    [
      focusedNodeChainAnnotationId,
      polylineSegmentLineMode,
      setDefaultPolylineSegmentLineMode,
      setNodeChainAnnotations,
    ]
  );

  return {
    polylineVerticalOffsetMeters,
    setPolylineVerticalOffsetMeters,
    polylineSegmentLineMode,
    setPolylineSegmentLineMode,
  };
};
