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

import { useManagedSelectionDeleteKeyboardShortcuts } from "./useManagedSelectionDeleteKeyboardShortcuts";
import { useManagedToolKeyboardShortcuts } from "./useManagedToolKeyboardShortcuts";
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
  requestCancelActiveMeasurementAndEnterSelection: () => boolean;
  requestFinishMeasurement: () => boolean;
  focusAdjacentNavigationItem: (offset: -1 | 1) => void;
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
  requestCancelActiveMeasurementAndEnterSelection,
  requestFinishMeasurement,
  focusAdjacentNavigationItem,
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

  useManagedSelectionDeleteKeyboardShortcuts(
    selectedAnnotationIds,
    selectedAnnotationId,
    selectablePointIds,
    lockedAnnotationIdSet,
    nodeChainAnnotations,
    clearAnnotationsByIds,
    deleteSelectedAnnotations
  );

  useManagedToolKeyboardShortcuts({
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
  });

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
