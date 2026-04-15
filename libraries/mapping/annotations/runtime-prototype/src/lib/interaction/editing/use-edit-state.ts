import { useCallback, useEffect, type SetStateAction } from "react";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";

import {
  replaceAnnotationsStoreState,
  useStoreSelector,
  type AnnotationEditStoreState,
  type AnnotationsStore,
} from "../../store";
import { resolveSetStateAction } from "../../store/state-update-utils";
import type {
  AnnotationEditTarget,
  MoveGizmoAxisCandidate,
  MoveGizmoSession,
  MoveGizmoStartOptions,
} from "./annotation-edit.types";
const cloneAxisCandidates = (
  axisCandidates: MoveGizmoAxisCandidate[] | null | undefined
): MoveGizmoAxisCandidate[] | null =>
  axisCandidates
    ? axisCandidates.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      }))
    : null;

const createEmptyMoveGizmoSession = (): MoveGizmoSession => ({
  pointId: null,
  axisDirection: null,
  axisTitle: null,
  axisCandidates: null,
  preferredAxisId: null,
  verticalOffsetEditMode: null,
  verticalOffsetNodeChainAnnotationId: null,
  isDragging: false,
});

const isEmptyMoveGizmoSession = (moveGizmo: MoveGizmoSession): boolean =>
  moveGizmo.pointId === null &&
  moveGizmo.axisDirection === null &&
  moveGizmo.axisTitle === null &&
  moveGizmo.axisCandidates === null &&
  moveGizmo.preferredAxisId === null &&
  moveGizmo.verticalOffsetEditMode === null &&
  moveGizmo.verticalOffsetNodeChainAnnotationId === null &&
  moveGizmo.isDragging === false;

const hasDetachedMoveGizmoConfig = (moveGizmo: MoveGizmoSession): boolean =>
  moveGizmo.preferredAxisId !== null ||
  moveGizmo.verticalOffsetEditMode !== null ||
  moveGizmo.verticalOffsetNodeChainAnnotationId !== null;

export const useEditState = (
  annotationsStore: AnnotationsStore,
  annotations: AnnotationCollection
) => {
  const editState = useStoreSelector(
    annotationsStore,
    (state) => state.editState
  );

  const setEditState = useCallback(
    (nextValueOrUpdater: SetStateAction<AnnotationEditStoreState>) => {
      const previousStoreState = annotationsStore.getState();
      const nextEditState = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.editState
      );

      if (Object.is(nextEditState, previousStoreState.editState)) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          editState: nextEditState,
        })
      );
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
          previousState.moveGizmo.isDragging
        );

        return nextIsMoveGizmoDragging === previousState.moveGizmo.isDragging
          ? previousState
          : {
              ...previousState,
              moveGizmo: {
                ...previousState.moveGizmo,
                isDragging: nextIsMoveGizmoDragging,
              },
            };
      });
    },
    [setEditState]
  );

  const clearMoveGizmo = useCallback(() => {
    setEditState((previousState) =>
      isEmptyMoveGizmoSession(previousState.moveGizmo)
        ? previousState
        : {
            ...previousState,
            moveGizmo: createEmptyMoveGizmoSession(),
          }
    );
  }, [setEditState]);

  useEffect(
    function effectResetDetachedMoveGizmoState() {
      if (editState.moveGizmo.pointId) {
        return;
      }

      setEditState((previousState) =>
        !hasDetachedMoveGizmoConfig(previousState.moveGizmo)
          ? previousState
          : {
              ...previousState,
              moveGizmo: {
                ...previousState.moveGizmo,
                preferredAxisId: null,
                verticalOffsetEditMode: null,
                verticalOffsetNodeChainAnnotationId: null,
              },
            }
      );
    },
    [editState.moveGizmo.pointId, setEditState]
  );

  useEffect(
    function effectClearRemovedMoveGizmoMeasurement() {
      if (!editState.moveGizmo.pointId) {
        return;
      }

      const hasMoveGizmoPoint = annotations.some(
        (annotation) => annotation.id === editState.moveGizmo.pointId
      );
      if (!hasMoveGizmoPoint) {
        clearMoveGizmo();
      }
    },
    [annotations, clearMoveGizmo, editState.moveGizmo.pointId]
  );

  const startMoveGizmoForAnnotationId = useCallback(
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
        moveGizmo: {
          pointId: id,
          axisDirection: options?.axisDirection ?? null,
          axisTitle: options?.axisTitle ?? null,
          axisCandidates: cloneAxisCandidates(options?.axisCandidates ?? null),
          preferredAxisId: options?.preferredAxisId ?? null,
          verticalOffsetEditMode: options?.verticalOffsetEditMode ?? null,
          verticalOffsetNodeChainAnnotationId:
            options?.verticalOffsetNodeChainAnnotationId ?? null,
          isDragging: false,
        },
      }));
    },
    [annotations, setEditState]
  );

  const setMoveGizmoAxis = useCallback(
    (axisDirection: Cartesian3, axisTitle?: string | null) => {
      setEditState((previousState) => ({
        ...previousState,
        moveGizmo: {
          ...previousState.moveGizmo,
          axisDirection: Cartesian3.clone(axisDirection),
          axisTitle: axisTitle ?? null,
        },
      }));
    },
    [setEditState]
  );

  const moveGizmo: MoveGizmoSession = editState.moveGizmo;

  return {
    activeEditTarget: editState.activeTarget,
    setActiveEditTarget,
    clearActiveEditTarget,
    moveGizmo,
    setMoveGizmoDragging: setIsMoveGizmoDragging,
    startMoveGizmoForAnnotationId,
    clearMoveGizmo,
    setMoveGizmoAxis,
  };
};

export type AnnotationEditState = ReturnType<typeof useEditState>;
