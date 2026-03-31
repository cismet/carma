import { useEffect, useMemo } from "react";

import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  isAreaToolType,
  isManagedAnnotationKeyboardEvent,
  isPointAnnotationEntry,
  resolveAnnotationCommonShortcutAction,
  type AnnotationCollection,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

type UseManagedToolKeyboardShortcutsParams = {
  annotations: AnnotationCollection;
  activeToolType: AnnotationToolType;
  clearAnnotationsByIds: (ids: string[]) => void;
  isPointMeasureCreateModeActive: boolean;
  pointTemporaryMode: boolean;
  pointMeasurementEntries: AnnotationCollection;
  requestCancelActiveMeasurementAndEnterSelection: () => boolean;
  requestFinishMeasurement: () => boolean;
  focusAdjacentNavigationItem: (offset: -1 | 1) => void;
  selectAnnotationById: (id: string | null) => void;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  setAnnotations: (
    updater:
      | AnnotationCollection
      | ((previous: AnnotationCollection) => AnnotationCollection)
  ) => void;
};

export const useManagedToolKeyboardShortcuts = ({
  annotations,
  activeToolType,
  clearAnnotationsByIds,
  isPointMeasureCreateModeActive,
  pointTemporaryMode,
  pointMeasurementEntries,
  requestCancelActiveMeasurementAndEnterSelection,
  requestFinishMeasurement,
  focusAdjacentNavigationItem,
  selectAnnotationById,
  selectedAnnotationId,
  selectedAnnotationIds,
  setAnnotations,
}: UseManagedToolKeyboardShortcutsParams) => {
  const latestTemporaryPointMeasurementId = useMemo(
    () =>
      [...annotations]
        .reverse()
        .find(
          (measurement) =>
            isPointAnnotationEntry(measurement) && measurement.temporary
        )?.id ?? null,
    [annotations]
  );

  useEffect(() => {
    const handleToolKeyboardShortcuts = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event, { allowRepeat: true })) {
        return;
      }

      const action = resolveAnnotationCommonShortcutAction(event);

      if (
        action ===
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_PREVIOUS_NAVIGATION_ITEM
      ) {
        event.preventDefault();
        event.stopPropagation();
        focusAdjacentNavigationItem(-1);
        return;
      }

      if (
        action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_NEXT_NAVIGATION_ITEM
      ) {
        event.preventDefault();
        event.stopPropagation();
        focusAdjacentNavigationItem(1);
        return;
      }

      if (activeToolType === SELECT_TOOL_TYPE) {
        return;
      }

      if (action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL) {
        if (!requestCancelActiveMeasurementAndEnterSelection()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const hasSelection =
        selectedAnnotationIds.length > 0 || Boolean(selectedAnnotationId);

      if (
        action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.FINISH_MEASUREMENT &&
        isPointMeasureCreateModeActive &&
        pointTemporaryMode
      ) {
        if (!latestTemporaryPointMeasurementId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setAnnotations((previousAnnotations) =>
          previousAnnotations.map((measurement) =>
            isPointAnnotationEntry(measurement) && measurement.temporary
              ? { ...measurement, temporary: false }
              : measurement
          )
        );
        selectAnnotationById(latestTemporaryPointMeasurementId);
        return;
      }

      if (
        action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.FINISH_MEASUREMENT &&
        (activeToolType === ANNOTATION_TYPE_DISTANCE ||
          activeToolType === ANNOTATION_TYPE_POLYLINE ||
          isAreaToolType(activeToolType))
      ) {
        event.preventDefault();
        event.stopPropagation();
        requestFinishMeasurement();
        return;
      }

      if (action !== ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT) return;
      if (hasSelection) return;

      const latestPointMeasurement =
        pointMeasurementEntries[pointMeasurementEntries.length - 1];
      if (!latestPointMeasurement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearAnnotationsByIds([latestPointMeasurement.id]);
      selectAnnotationById(
        pointMeasurementEntries[pointMeasurementEntries.length - 2]?.id ?? null
      );
    };

    window.addEventListener("keydown", handleToolKeyboardShortcuts, true);
    return () => {
      window.removeEventListener("keydown", handleToolKeyboardShortcuts, true);
    };
  }, [
    activeToolType,
    clearAnnotationsByIds,
    isPointMeasureCreateModeActive,
    latestTemporaryPointMeasurementId,
    pointMeasurementEntries,
    pointTemporaryMode,
    requestCancelActiveMeasurementAndEnterSelection,
    requestFinishMeasurement,
    focusAdjacentNavigationItem,
    selectAnnotationById,
    selectedAnnotationId,
    selectedAnnotationIds,
    setAnnotations,
  ]);
};
