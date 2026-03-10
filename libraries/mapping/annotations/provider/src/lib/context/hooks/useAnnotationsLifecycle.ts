import { useEffect } from "react";

import { isKeyboardTargetEditable } from "@carma-commons/utils";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  hasAnyVisibleDistanceRelationLine,
  isAreaToolType,
  isPointAnnotationEntry,
} from "@carma-mapping/annotations/core";

import type { AnnotationsManagementState } from "./useAnnotationsManagement";
import type { AnnotationsUserInteractionState } from "./useAnnotationsUserInteraction";
export const useAnnotationsLifecycle = (
  managedAnnotations: AnnotationsManagementState,
  annotationUserInteraction: AnnotationsUserInteractionState
) => {
  const {
    annotations,
    selectedAnnotationIds,
    selectablePointIds,
    lockedMeasurementIdSet,
    selectedAnnotationId,
    deleteSelectedAnnotations,
    clearAnnotationsByIds,
    pointMeasureEntries,
    selectAnnotationById,
    setAnnotations,
    pointTemporaryMode,
    options,
    activeToolType,
    requestStartMeasurement,
    setDoubleClickChainSourcePointId,
    clearAnnotationSelection,
    clearActivePlanarDrawingState,
    clearMoveGizmo,
    isInteractionActive,
    doubleClickChainSourcePointId,
    distanceRelations,
    planarPolygonGroups,
    setPendingPolylinePromotionRingClosurePointId,
    activePlanarMeasurementId,
    setPlanarMeasurements,
  } = managedAnnotations;
  const { isPointMeasureCreateModeActive } = annotationUserInteraction;

  useEffect(
    function effectClearPendingRingPromotionOutsidePolylineMode() {
      if (activeToolType === ANNOTATION_TYPE_POLYLINE) return;
      setPendingPolylinePromotionRingClosurePointId(null);
    },
    [activeToolType, setPendingPolylinePromotionRingClosurePointId]
  );

  useEffect(
    function effectBindDeleteKeyHandler() {
      const handleDeleteKey = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isKeyboardTargetEditable(event.target)) return;
        const selectedIds = selectedAnnotationIds.filter(
          (id) => selectablePointIds.has(id) && !lockedMeasurementIdSet.has(id)
        );
        if (selectedIds.length > 1) {
          return;
        }
        const hasDeletablePrimarySelection =
          Boolean(selectedAnnotationId) &&
          selectablePointIds.has(selectedAnnotationId) &&
          !lockedMeasurementIdSet.has(selectedAnnotationId);
        if (selectedIds.length === 0 && !hasDeletablePrimarySelection) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        deleteSelectedAnnotations();
      };

      window.addEventListener("keydown", handleDeleteKey, true);
      return () => {
        window.removeEventListener("keydown", handleDeleteKey, true);
      };
    },
    [
      deleteSelectedAnnotations,
      lockedMeasurementIdSet,
      selectablePointIds,
      selectedAnnotationId,
      selectedAnnotationIds,
    ]
  );

  useEffect(
    function effectBindPointModeKeyboardShortcuts() {
      const handlePointModeKeyboardShortcuts = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isKeyboardTargetEditable(event.target)) return;
        if (activeToolType === SELECT_TOOL_TYPE) {
          return;
        }

        const hasSelection =
          selectedAnnotationIds.length > 0 || Boolean(selectedAnnotationId);

        if (
          event.key === "Enter" &&
          isPointMeasureCreateModeActive &&
          pointTemporaryMode
        ) {
          const latestTemporaryPointMeasurement = [...annotations]
            .reverse()
            .find(
              (measurement) =>
                isPointAnnotationEntry(measurement) && measurement.temporary
            );
          if (!latestTemporaryPointMeasurement) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setAnnotations((prev) =>
            prev.map((measurement) =>
              measurement.temporary
                ? { ...measurement, temporary: false }
                : measurement
            )
          );
          selectAnnotationById(latestTemporaryPointMeasurement.id);
          return;
        }

        if (event.key !== "Backspace") return;
        if (hasSelection) return;

        const latestPointMeasurement =
          pointMeasureEntries[pointMeasureEntries.length - 1];
        if (!latestPointMeasurement) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearAnnotationsByIds([latestPointMeasurement.id]);
        selectAnnotationById(
          pointMeasureEntries[pointMeasureEntries.length - 2]?.id ?? null
        );
      };

      window.addEventListener(
        "keydown",
        handlePointModeKeyboardShortcuts,
        true
      );
      return () => {
        window.removeEventListener(
          "keydown",
          handlePointModeKeyboardShortcuts,
          true
        );
      };
    },
    [
      activeToolType,
      clearAnnotationsByIds,
      pointMeasureEntries,
      selectedAnnotationId,
      selectedAnnotationIds.length,
      selectAnnotationById,
      setAnnotations,
      isPointMeasureCreateModeActive,
      pointTemporaryMode,
      annotations,
    ]
  );

  useEffect(
    function effectSyncInteractionEnabledState() {
      if (!isInteractionActive) {
        requestStartMeasurement(SELECT_TOOL_TYPE);
      }
    },
    [isInteractionActive, requestStartMeasurement]
  );

  useEffect(
    function effectCleanUpInvalidOpenVerticalGroups() {
      if (
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType)
      ) {
        return;
      }

      const invalidOpenVerticalGroups = planarPolygonGroups.filter((group) => {
        return (
          !group.closed &&
          group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          group.nodeIds.length === 1
        );
      });
      if (invalidOpenVerticalGroups.length === 0) return;

      const invalidGroupIdSet = new Set(
        invalidOpenVerticalGroups.map((group) => group.id)
      );
      const removablePointIdSet = new Set<string>();
      invalidOpenVerticalGroups.forEach((group) => {
        const onlyPointId = group.nodeIds[0];
        if (onlyPointId) {
          removablePointIdSet.add(onlyPointId);
        }
      });

      const remainingGroups = planarPolygonGroups.filter(
        (group) => !invalidGroupIdSet.has(group.id)
      );
      const protectedPointIdSet = new Set<string>();
      remainingGroups.forEach((group) => {
        group.nodeIds.forEach((pointId) => {
          if (pointId) {
            protectedPointIdSet.add(pointId);
          }
        });
      });
      distanceRelations.forEach((relation) => {
        protectedPointIdSet.add(relation.pointAId);
        protectedPointIdSet.add(relation.pointBId);
        protectedPointIdSet.add(relation.anchorPointId);
      });

      setPlanarMeasurements(remainingGroups);

      if (removablePointIdSet.size === 0) return;
      setAnnotations((prev) =>
        prev.filter((measurement) => {
          if (!isPointAnnotationEntry(measurement)) {
            return true;
          }
          if (!removablePointIdSet.has(measurement.id)) {
            return true;
          }
          return protectedPointIdSet.has(measurement.id);
        })
      );
    },
    [
      activeToolType,
      planarPolygonGroups,
      distanceRelations,
      setPlanarMeasurements,
      setAnnotations,
    ]
  );

  useEffect(
    function effectClearMissingDoubleClickChainSource() {
      if (!doubleClickChainSourcePointId) return;
      const hasChainSourceMeasurement = annotations.some(
        (measurement) => measurement.id === doubleClickChainSourcePointId
      );
      if (!hasChainSourceMeasurement) {
        setDoubleClickChainSourcePointId(null);
      }
    },
    [
      doubleClickChainSourcePointId,
      annotations,
      setDoubleClickChainSourcePointId,
    ]
  );

  useEffect(
    function effectSelectVisibleDistanceAnchorWhenNothingSelected() {
      if (selectedAnnotationId || activePlanarMeasurementId) return;

      const relationWithVisibleLine = distanceRelations.find(
        hasAnyVisibleDistanceRelationLine
      );
      if (relationWithVisibleLine) {
        selectAnnotationById(relationWithVisibleLine.anchorPointId);
      }
    },
    [
      activePlanarMeasurementId,
      distanceRelations,
      selectedAnnotationId,
      selectAnnotationById,
    ]
  );

  useEffect(
    function effectClearMissingActivePlanarGroup() {
      if (!activePlanarMeasurementId) return;
      const hasActiveGroup = planarPolygonGroups.some(
        (group) => group.id === activePlanarMeasurementId
      );
      if (!hasActiveGroup) {
        clearActivePlanarDrawingState();
      }
    },
    [
      activePlanarMeasurementId,
      clearActivePlanarDrawingState,
      planarPolygonGroups,
    ]
  );
};
