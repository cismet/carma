import { useCallback, useEffect, useState } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

export type MoveGizmoStartOptions = {
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  verticalOffsetEditMode?:
    | typeof ANNOTATION_TYPE_POINT
    | typeof ANNOTATION_TYPE_POLYLINE
    | null;
  verticalOffsetPlanarGroupId?: string | null;
};

export const useMoveGizmoState = (annotations: AnnotationCollection) => {
  const [moveGizmoPointId, setMoveGizmoPointId] = useState<string | null>(null);
  const [moveGizmoAxisDirection, setMoveGizmoAxisDirection] =
    useState<Cartesian3 | null>(null);
  const [moveGizmoAxisTitle, setMoveGizmoAxisTitle] = useState<string | null>(
    null
  );
  const [moveGizmoAxisCandidates, setMoveGizmoAxisCandidates] = useState<Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null>(null);
  const [moveGizmoPreferredAxisId, setMoveGizmoPreferredAxisId] = useState<
    string | null
  >(null);
  const [moveGizmoVerticalOffsetEditMode, setMoveGizmoVerticalOffsetEditMode] =
    useState<
      typeof ANNOTATION_TYPE_POINT | typeof ANNOTATION_TYPE_POLYLINE | null
    >(null);
  const [
    moveGizmoVerticalOffsetPlanarGroupId,
    setMoveGizmoVerticalOffsetPlanarGroupId,
  ] = useState<string | null>(null);
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] =
    useState<boolean>(false);

  const clearMoveGizmo = useCallback(() => {
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setMoveGizmoPreferredAxisId(null);
    setMoveGizmoVerticalOffsetEditMode(null);
    setMoveGizmoVerticalOffsetPlanarGroupId(null);
    setIsMoveGizmoDragging(false);
  }, []);

  useEffect(
    function effectResetDetachedMoveGizmoState() {
      if (moveGizmoPointId) {
        return;
      }

      setMoveGizmoPreferredAxisId(null);
      setMoveGizmoVerticalOffsetEditMode(null);
      setMoveGizmoVerticalOffsetPlanarGroupId(null);
    },
    [moveGizmoPointId]
  );

  useEffect(
    function effectClearRemovedMoveGizmoMeasurement() {
      if (!moveGizmoPointId) {
        return;
      }

      const hasMoveGizmoPoint = annotations.some(
        (annotation) => annotation.id === moveGizmoPointId
      );
      if (!hasMoveGizmoPoint) {
        clearMoveGizmo();
      }
    },
    [annotations, clearMoveGizmo, moveGizmoPointId]
  );

  const startMoveGizmoForMeasurementId = useCallback(
    (id: string, options?: MoveGizmoStartOptions) => {
      const measurement = annotations.find(
        (annotation) =>
          isPointAnnotationEntry(annotation) && annotation.id === id
      );
      if (!measurement || !isPointAnnotationEntry(measurement)) {
        return;
      }

      if (measurement.locked) {
        return;
      }

      const axisCandidates = options?.axisCandidates?.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      }));

      setMoveGizmoPointId(id);
      setMoveGizmoAxisDirection(options?.axisDirection ?? null);
      setMoveGizmoAxisTitle(options?.axisTitle ?? null);
      setMoveGizmoAxisCandidates(axisCandidates ?? null);
      setMoveGizmoPreferredAxisId(options?.preferredAxisId ?? null);
      setMoveGizmoVerticalOffsetEditMode(
        options?.verticalOffsetEditMode ?? null
      );
      setMoveGizmoVerticalOffsetPlanarGroupId(
        options?.verticalOffsetPlanarGroupId ?? null
      );
      setIsMoveGizmoDragging(false);
    },
    [annotations]
  );

  const handleMoveGizmoAxisChange = useCallback(
    (axisDirection: Cartesian3, axisTitle?: string | null) => {
      setMoveGizmoAxisDirection(Cartesian3.clone(axisDirection));
      setMoveGizmoAxisTitle(axisTitle ?? null);
    },
    []
  );

  return {
    moveGizmoPointId,
    moveGizmoAxisDirection,
    moveGizmoAxisTitle,
    moveGizmoAxisCandidates,
    moveGizmoPreferredAxisId,
    moveGizmoVerticalOffsetEditMode,
    moveGizmoVerticalOffsetPlanarGroupId,
    isMoveGizmoDragging,
    setIsMoveGizmoDragging,
    startMoveGizmoForMeasurementId,
    clearMoveGizmo,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit: clearMoveGizmo,
  };
};

export type MoveGizmoState = ReturnType<typeof useMoveGizmoState>;
