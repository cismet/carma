import { useEffect, useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  hasAnyVisibleDistanceRelationLine,
  isAreaToolType,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
import { isKeyboardTargetEditable } from "@carma-mapping/annotations/core";

type InteractionLifecycleState = {
  annotations: AnnotationCollection;
  selectedAnnotationIds: string[];
  selectablePointIds: ReadonlySet<string>;
  lockedAnnotationIdSet: ReadonlySet<string>;
  selectedAnnotationId: string | null;
  deleteSelectedAnnotations: () => void;
  clearAnnotationsByIds: (ids: string[]) => void;
  selectAnnotationById: (id: string | null) => void;
  setAnnotations: (
    updater:
      | AnnotationCollection
      | ((previous: AnnotationCollection) => AnnotationCollection)
  ) => void;
  pointTemporaryMode: boolean;
  activeToolType: AnnotationToolType;
  requestStartMeasurement: (toolType: AnnotationToolType) => void;
  requestFinishMeasurement: () => boolean;
  isInteractionActive: boolean;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  activeNodeChainAnnotationId: string | null;
  setActiveNodeChainAnnotationId: (id: string | null) => void;
  setNodeChainAnnotations: (
    next:
      | NodeChainAnnotation[]
      | ((previous: NodeChainAnnotation[]) => NodeChainAnnotation[])
  ) => void;
};

type UseInteractionLifecycleParams = InteractionLifecycleState & {
  isPointMeasureCreateModeActive: boolean;
};

export const useInteractionLifecycle = ({
  annotations,
  selectedAnnotationIds,
  selectablePointIds,
  lockedAnnotationIdSet,
  selectedAnnotationId,
  deleteSelectedAnnotations,
  clearAnnotationsByIds,
  selectAnnotationById,
  setAnnotations,
  pointTemporaryMode,
  activeToolType,
  requestStartMeasurement,
  requestFinishMeasurement,
  isInteractionActive,
  distanceRelations,
  nodeChainAnnotations,
  activeNodeChainAnnotationId,
  setActiveNodeChainAnnotationId,
  setNodeChainAnnotations,
  isPointMeasureCreateModeActive,
}: UseInteractionLifecycleParams) => {
  const pointMeasurementEntries = useMemo(
    () => annotations.filter(isPointMeasurementEntry),
    [annotations]
  );

  useEffect(
    function effectBindDeleteKeyHandler() {
      const handleDeleteKey = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isKeyboardTargetEditable(event.target)) return;
        const selectedIds = selectedAnnotationIds.filter(
          (id) => selectablePointIds.has(id) && !lockedAnnotationIdSet.has(id)
        );
        if (selectedIds.length > 1) {
          return;
        }
        const hasDeletablePrimarySelection =
          Boolean(selectedAnnotationId) &&
          selectablePointIds.has(selectedAnnotationId) &&
          !lockedAnnotationIdSet.has(selectedAnnotationId);
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
      lockedAnnotationIdSet,
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

        if (event.key === "Enter" && isAreaToolType(activeToolType)) {
          event.preventDefault();
          event.stopPropagation();
          requestFinishMeasurement();
          return;
        }

        if (event.key !== "Backspace") return;
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
          pointMeasurementEntries[pointMeasurementEntries.length - 2]?.id ??
            null
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
      pointMeasurementEntries,
      selectedAnnotationId,
      selectedAnnotationIds.length,
      selectAnnotationById,
      setAnnotations,
      isPointMeasureCreateModeActive,
      pointTemporaryMode,
      requestFinishMeasurement,
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

      const invalidOpenVerticalGroups = nodeChainAnnotations.filter((group) => {
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

      const remainingGroups = nodeChainAnnotations.filter(
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

      setNodeChainAnnotations(remainingGroups);

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
      nodeChainAnnotations,
      distanceRelations,
      setNodeChainAnnotations,
      setAnnotations,
    ]
  );

  useEffect(
    function effectSelectVisibleDistanceAnchorWhenNothingSelected() {
      if (selectedAnnotationId || activeNodeChainAnnotationId) return;

      const relationWithVisibleLine = distanceRelations.find(
        hasAnyVisibleDistanceRelationLine
      );
      if (relationWithVisibleLine) {
        selectAnnotationById(relationWithVisibleLine.anchorPointId);
      }
    },
    [
      activeNodeChainAnnotationId,
      distanceRelations,
      selectedAnnotationId,
      selectAnnotationById,
    ]
  );

  useEffect(
    function effectClearMissingActiveNodeChainAnnotation() {
      if (!activeNodeChainAnnotationId) return;
      const hasActiveGroup = nodeChainAnnotations.some(
        (group) => group.id === activeNodeChainAnnotationId
      );
      if (!hasActiveGroup) {
        setActiveNodeChainAnnotationId(null);
      }
    },
    [
      activeNodeChainAnnotationId,
      nodeChainAnnotations,
      setActiveNodeChainAnnotationId,
    ]
  );
};
