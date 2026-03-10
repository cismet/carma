import { useCallback, useEffect, type SetStateAction } from "react";

import { Cartesian3 } from "@carma/cesium";
import { useStoreSelector } from "@carma-commons/react-store";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

import type { AnnotationEditStoreState, AnnotationsStore } from "../store";
import type {
  AnnotationEditTarget,
  MoveGizmoAxisCandidate,
  MoveGizmoStartOptions,
} from "./editing/annotationEdit.types";

const resolveSetStateAction = <TValue>(
  action: SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof action === "function"
    ? (action as (previousValue: TValue) => TValue)(previousValue)
    : action;

const cloneAxisCandidates = (
  axisCandidates: MoveGizmoAxisCandidate[] | null | undefined
): MoveGizmoAxisCandidate[] | null =>
  axisCandidates
    ? axisCandidates.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      }))
    : null;

export const useAnnotationEditState = (
  annotationsStore: AnnotationsStore,
  annotations: AnnotationCollection
) => {
  const editState = useStoreSelector(
    annotationsStore,
    (state) => state.editState
  );

  const setEditState = useCallback(
    (nextValueOrUpdater: SetStateAction<AnnotationEditStoreState>) => {
      annotationsStore.setState((previousStoreState) => {
        const nextEditState = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.editState
        );

        return Object.is(nextEditState, previousStoreState.editState)
          ? previousStoreState
          : {
              ...previousStoreState,
              editState: nextEditState,
            };
      });
    },
    [annotationsStore]
  );

  const setActiveEditTarget = useCallback(
    (nextValueOrUpdater: SetStateAction<AnnotationEditTarget | null>) => {
      setEditState((previousState) => {
        const nextActiveTarget = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.activeTarget
        );

        return nextActiveTarget === previousState.activeTarget
          ? previousState
          : {
              ...previousState,
              activeTarget: nextActiveTarget,
            };
      });
    },
    [setEditState]
  );

  const clearActiveEditTarget = useCallback(() => {
    setActiveEditTarget((previousTarget) =>
      previousTarget === null ? previousTarget : null
    );
  }, [setActiveEditTarget]);

  const setIsMoveGizmoDragging = useCallback(
    (nextValueOrUpdater: SetStateAction<boolean>) => {
      setEditState((previousState) => {
        const nextIsMoveGizmoDragging = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.isMoveGizmoDragging
        );

        return nextIsMoveGizmoDragging === previousState.isMoveGizmoDragging
          ? previousState
          : {
              ...previousState,
              isMoveGizmoDragging: nextIsMoveGizmoDragging,
            };
      });
    },
    [setEditState]
  );

  const clearMoveGizmo = useCallback(() => {
    setEditState((previousState) =>
      previousState.moveGizmoPointId === null &&
      previousState.moveGizmoAxisDirection === null &&
      previousState.moveGizmoAxisTitle === null &&
      previousState.moveGizmoAxisCandidates === null &&
      previousState.moveGizmoPreferredAxisId === null &&
      previousState.moveGizmoVerticalOffsetEditMode === null &&
      previousState.moveGizmoVerticalOffsetPlanarMeasurementId === null &&
      previousState.isMoveGizmoDragging === false
        ? previousState
        : {
            ...previousState,
            moveGizmoPointId: null,
            moveGizmoAxisDirection: null,
            moveGizmoAxisTitle: null,
            moveGizmoAxisCandidates: null,
            moveGizmoPreferredAxisId: null,
            moveGizmoVerticalOffsetEditMode: null,
            moveGizmoVerticalOffsetPlanarMeasurementId: null,
            isMoveGizmoDragging: false,
          }
    );
  }, [setEditState]);

  useEffect(
    function effectResetDetachedMoveGizmoState() {
      if (editState.moveGizmoPointId) {
        return;
      }

      setEditState((previousState) =>
        previousState.moveGizmoPreferredAxisId === null &&
        previousState.moveGizmoVerticalOffsetEditMode === null &&
        previousState.moveGizmoVerticalOffsetPlanarMeasurementId === null
          ? previousState
          : {
              ...previousState,
              moveGizmoPreferredAxisId: null,
              moveGizmoVerticalOffsetEditMode: null,
              moveGizmoVerticalOffsetPlanarMeasurementId: null,
            }
      );
    },
    [editState.moveGizmoPointId, setEditState]
  );

  useEffect(
    function effectClearRemovedMoveGizmoMeasurement() {
      if (!editState.moveGizmoPointId) {
        return;
      }

      const hasMoveGizmoPoint = annotations.some(
        (annotation) => annotation.id === editState.moveGizmoPointId
      );
      if (!hasMoveGizmoPoint) {
        clearMoveGizmo();
      }
    },
    [annotations, clearMoveGizmo, editState.moveGizmoPointId]
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

      setEditState((previousState) => ({
        ...previousState,
        moveGizmoPointId: id,
        moveGizmoAxisDirection: options?.axisDirection ?? null,
        moveGizmoAxisTitle: options?.axisTitle ?? null,
        moveGizmoAxisCandidates: cloneAxisCandidates(
          options?.axisCandidates ?? null
        ),
        moveGizmoPreferredAxisId: options?.preferredAxisId ?? null,
        moveGizmoVerticalOffsetEditMode:
          options?.verticalOffsetEditMode ?? null,
        moveGizmoVerticalOffsetPlanarMeasurementId:
          options?.verticalOffsetPlanarMeasurementId ?? null,
        isMoveGizmoDragging: false,
      }));
    },
    [annotations, setEditState]
  );

  const handleMoveGizmoAxisChange = useCallback(
    (axisDirection: Cartesian3, axisTitle?: string | null) => {
      setEditState((previousState) => ({
        ...previousState,
        moveGizmoAxisDirection: Cartesian3.clone(axisDirection),
        moveGizmoAxisTitle: axisTitle ?? null,
      }));
    },
    [setEditState]
  );

  return {
    activeEditTarget: editState.activeTarget,
    setActiveEditTarget,
    clearActiveEditTarget,
    moveGizmoPointId: editState.moveGizmoPointId,
    moveGizmoAxisDirection: editState.moveGizmoAxisDirection,
    moveGizmoAxisTitle: editState.moveGizmoAxisTitle,
    moveGizmoAxisCandidates: editState.moveGizmoAxisCandidates,
    moveGizmoPreferredAxisId: editState.moveGizmoPreferredAxisId,
    moveGizmoVerticalOffsetEditMode: editState.moveGizmoVerticalOffsetEditMode,
    moveGizmoVerticalOffsetPlanarMeasurementId:
      editState.moveGizmoVerticalOffsetPlanarMeasurementId,
    isMoveGizmoDragging: editState.isMoveGizmoDragging,
    setIsMoveGizmoDragging,
    startMoveGizmoForMeasurementId,
    clearMoveGizmo,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit: clearMoveGizmo,
  };
};

export type AnnotationEditState = ReturnType<typeof useAnnotationEditState>;
