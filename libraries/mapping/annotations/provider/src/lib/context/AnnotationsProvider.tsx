/* @refresh reset */
import React, { createContext, useContext, useMemo } from "react";
import { type Scene } from "@carma/cesium";

import {
  type AnnotationsOptions,
  useAnnotationsManagement,
} from "./hooks/useAnnotationsManagement";
import { useAnnotationsEditing } from "./hooks/useAnnotationsEditing";
import { useAnnotationsLifecycle } from "./hooks/useAnnotationsLifecycle";
import { useAnnotationsUserInteraction } from "./hooks/useAnnotationsUserInteraction";
import { useAnnotationsVisualization } from "./hooks/useAnnotationsVisualization";
import type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
  AnnotationViewContextType,
} from "./annotationsContext.types";

export type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
  AnnotationViewContextType,
  AnnotationsOptions,
};

interface AnnotationsProviderProps {
  children: React.ReactNode;
  options?: AnnotationsOptions;
  enabled?: boolean;
  cesiumScene: Scene;
}

const AnnotationToolsContext = createContext<
  AnnotationToolsContextType | undefined
>(undefined);
const AnnotationSelectionContext = createContext<
  AnnotationSelectionContextType | undefined
>(undefined);
const AnnotationCollectionContext = createContext<
  AnnotationCollectionContextType | undefined
>(undefined);
const AnnotationEditingContext = createContext<
  AnnotationEditingContextType | undefined
>(undefined);
const AnnotationSettingsContext = createContext<
  AnnotationSettingsContextType | undefined
>(undefined);
const AnnotationViewContext = createContext<
  AnnotationViewContextType | undefined
>(undefined);

const useRequiredAnnotationsContext = <T,>(
  contextValue: T | undefined,
  hookName: string
): T => {
  if (contextValue === undefined) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return contextValue;
};

export const AnnotationsProvider: React.FC<AnnotationsProviderProps> = ({
  children,
  options,
  enabled = true,
  cesiumScene,
}) => {
  const annotationsManagement = useAnnotationsManagement(
    cesiumScene,
    enabled,
    options
  );
  const annotationEditing = useAnnotationsEditing(annotationsManagement);
  const annotationUserInteraction = useAnnotationsUserInteraction(
    annotationsManagement,
    annotationEditing
  );

  useAnnotationsLifecycle(annotationsManagement, annotationUserInteraction);
  useAnnotationsVisualization(
    annotationsManagement,
    annotationUserInteraction,
    annotationEditing
  );

  const toolsContextValue = useMemo<AnnotationToolsContextType>(
    () => ({
      activeToolType: annotationsManagement.activeToolType,
      pendingLabelPlacementAnnotationId:
        annotationsManagement.labelInputPromptPointId,
      requestModeChange: annotationsManagement.requestModeChange,
      requestStartMeasurement: annotationsManagement.requestStartMeasurement,
      requestCloseActiveMeasurement:
        annotationsManagement.requestCloseActiveMeasurement,
    }),
    [
      annotationsManagement.activeToolType,
      annotationsManagement.labelInputPromptPointId,
      annotationsManagement.requestCloseActiveMeasurement,
      annotationsManagement.requestModeChange,
      annotationsManagement.requestStartMeasurement,
    ]
  );

  const selectionContextValue = useMemo<AnnotationSelectionContextType>(
    () => ({
      primaryId: annotationsManagement.selectedAnnotationId,
      activeAnnotationId: annotationsManagement.activeMeasurementId,
      ids: annotationsManagement.selectedAnnotationIds,
      mode: {
        active: annotationsManagement.selectionModeActive,
        additive: annotationsManagement.selectModeAdditive,
        rectangle: annotationsManagement.selectModeRectangle,
      },
      setModeActive: annotationsManagement.setSelectionModeActive,
      setAdditiveMode: annotationsManagement.setSelectModeAdditive,
      setRectangleMode: annotationsManagement.setSelectModeRectangle,
      set: annotationsManagement.selectAnnotationIds,
      clear: annotationsManagement.clearAnnotationSelection,
    }),
    [
      annotationsManagement.activeMeasurementId,
      annotationsManagement.clearAnnotationSelection,
      annotationsManagement.selectAnnotationIds,
      annotationsManagement.selectModeAdditive,
      annotationsManagement.selectModeRectangle,
      annotationsManagement.selectedAnnotationId,
      annotationsManagement.selectedAnnotationIds,
      annotationsManagement.selectionModeActive,
      annotationsManagement.setSelectModeAdditive,
      annotationsManagement.setSelectModeRectangle,
      annotationsManagement.setSelectionModeActive,
    ]
  );

  const collectionContextValue = useMemo<AnnotationCollectionContextType>(
    () => ({
      items: annotationsManagement.annotations,
      byType: annotationsManagement.annotationsByType,
      getNavigationItems: annotationsManagement.getAnnotationsForNavigation,
      getIndexByType: annotationsManagement.getAnnotationIndexByType,
      getOrderByType: annotationsManagement.getAnnotationOrderByType,
      getNextOrderByType: annotationsManagement.getNextAnnotationOrderByType,
      add: annotationsManagement.addAnnotation,
      updateById: annotationsManagement.updateAnnotationById,
      updateNameById: annotationsManagement.updateMeasurementNameById,
      updateVisualizerOptionsById:
        annotationsManagement.updateMeasurementVisualizerOptionsById,
      updatePointLabelAppearanceById:
        annotationsManagement.updatePointLabelAppearanceById,
      removeByIds: annotationsManagement.deleteMeasurementsByIds,
      removeSelection: annotationsManagement.deleteSelectedPointAnnotations,
      removeAll: annotationsManagement.clearAllMeasurements,
      removeByType: annotationsManagement.clearMeasurementsByType,
      toggleLockByIds: annotationsManagement.toggleMeasurementsLockByIds,
      toggleVisibilityByIds:
        annotationsManagement.toggleMeasurementsVisibilityByIds,
      setReferenceMeasurementById:
        annotationsManagement.setReferenceMeasurementById,
      confirmLabelPlacementById:
        annotationsManagement.confirmPointLabelInputById,
      flyToById: annotationsManagement.flyToMeasurementById,
      focusById: annotationsManagement.focusMeasurementById,
      flyToAll: annotationsManagement.flyToAllMeasurements,
    }),
    [
      annotationsManagement.addAnnotation,
      annotationsManagement.annotations,
      annotationsManagement.annotationsByType,
      annotationsManagement.clearAllMeasurements,
      annotationsManagement.clearMeasurementsByType,
      annotationsManagement.confirmPointLabelInputById,
      annotationsManagement.deleteMeasurementsByIds,
      annotationsManagement.deleteSelectedPointAnnotations,
      annotationsManagement.focusMeasurementById,
      annotationsManagement.flyToAllMeasurements,
      annotationsManagement.flyToMeasurementById,
      annotationsManagement.getAnnotationIndexByType,
      annotationsManagement.getAnnotationOrderByType,
      annotationsManagement.getAnnotationsForNavigation,
      annotationsManagement.getNextAnnotationOrderByType,
      annotationsManagement.setReferenceMeasurementById,
      annotationsManagement.toggleMeasurementsLockByIds,
      annotationsManagement.toggleMeasurementsVisibilityByIds,
      annotationsManagement.updateAnnotationById,
      annotationsManagement.updateMeasurementNameById,
      annotationsManagement.updateMeasurementVisualizerOptionsById,
      annotationsManagement.updatePointLabelAppearanceById,
    ]
  );

  const editingContextValue = useMemo<AnnotationEditingContextType>(
    () => ({
      activeTarget: annotationEditing.activeEditTarget,
      requestStart: annotationEditing.requestStartEdit,
      requestStop: annotationEditing.requestStopEdit,
      requestUpdateTarget: annotationEditing.requestUpdateEditTarget,
    }),
    [
      annotationEditing.activeEditTarget,
      annotationEditing.requestStartEdit,
      annotationEditing.requestStopEdit,
      annotationEditing.requestUpdateEditTarget,
    ]
  );

  const settingsContextValue = useMemo<AnnotationSettingsContextType>(
    () => ({
      temporaryMode: annotationsManagement.temporaryMode,
      setTemporaryMode: annotationsManagement.setTemporaryMode,
      point: {
        verticalOffsetMeters: annotationsManagement.pointVerticalOffsetMeters,
        setVerticalOffsetMeters:
          annotationsManagement.setPointVerticalOffsetMeters,
      },
      distance: {
        stickyToFirstPoint:
          annotationsManagement.distanceModeStickyToFirstPoint,
        setStickyToFirstPoint:
          annotationsManagement.setDistanceModeStickyToFirstPoint,
        creationLineVisibility:
          annotationsManagement.distanceCreationLineVisibility,
        setCreationLineVisibilityByKind:
          annotationsManagement.setDistanceCreationLineVisibilityByKind,
      },
      polyline: {
        verticalOffsetMeters:
          annotationsManagement.polylineVerticalOffsetMeters,
        setVerticalOffsetMeters:
          annotationsManagement.setPolylineVerticalOffsetMeters,
        segmentLineMode: annotationsManagement.polylineSegmentLineMode,
        setSegmentLineMode: annotationsManagement.setPolylineSegmentLineMode,
      },
    }),
    [
      annotationsManagement.distanceCreationLineVisibility,
      annotationsManagement.distanceModeStickyToFirstPoint,
      annotationsManagement.pointVerticalOffsetMeters,
      annotationsManagement.polylineSegmentLineMode,
      annotationsManagement.polylineVerticalOffsetMeters,
      annotationsManagement.setDistanceCreationLineVisibilityByKind,
      annotationsManagement.setDistanceModeStickyToFirstPoint,
      annotationsManagement.setPointVerticalOffsetMeters,
      annotationsManagement.setPolylineSegmentLineMode,
      annotationsManagement.setPolylineVerticalOffsetMeters,
      annotationsManagement.setTemporaryMode,
      annotationsManagement.temporaryMode,
    ]
  );

  const viewContextValue = useMemo<AnnotationViewContextType>(
    () => ({
      candidateAnnotation: annotationsManagement.annotationCandidate,
      referencePoint: annotationsManagement.referencePoint,
      hasDistancePreviewAnchor: annotationsManagement.hasDistancePreviewAnchor,
      distanceRelations: annotationsManagement.distanceRelations,
      focusedPlanarMeasurementId:
        annotationsManagement.focusedPlanarMeasurementId,
      activePlanarMeasurementId:
        annotationsManagement.activePlanarMeasurementId,
      planarMeasurements: annotationsManagement.planarPolygonGroups,
      polylineMeasurements: annotationsManagement.polylineGroups,
      groundPolygons: annotationsManagement.areaPolygonGroups,
      planarPolygons: annotationsManagement.planarSurfacePolygonGroups,
      verticalPolygons: annotationsManagement.verticalPolygonGroups,
      polylinePaths: annotationsManagement.polylines,
      pointMarkerBadgeByPointId:
        annotationsManagement.pointMarkerBadgeByPointId,
    }),
    [
      annotationsManagement.annotationCandidate,
      annotationsManagement.activePlanarMeasurementId,
      annotationsManagement.areaPolygonGroups,
      annotationsManagement.distanceRelations,
      annotationsManagement.focusedPlanarMeasurementId,
      annotationsManagement.hasDistancePreviewAnchor,
      annotationsManagement.planarPolygonGroups,
      annotationsManagement.planarSurfacePolygonGroups,
      annotationsManagement.pointMarkerBadgeByPointId,
      annotationsManagement.polylines,
      annotationsManagement.polylineGroups,
      annotationsManagement.referencePoint,
      annotationsManagement.verticalPolygonGroups,
    ]
  );

  return (
    <AnnotationToolsContext.Provider value={toolsContextValue}>
      <AnnotationSelectionContext.Provider value={selectionContextValue}>
        <AnnotationCollectionContext.Provider value={collectionContextValue}>
          <AnnotationEditingContext.Provider value={editingContextValue}>
            <AnnotationSettingsContext.Provider value={settingsContextValue}>
              <AnnotationViewContext.Provider value={viewContextValue}>
                {children}
              </AnnotationViewContext.Provider>
            </AnnotationSettingsContext.Provider>
          </AnnotationEditingContext.Provider>
        </AnnotationCollectionContext.Provider>
      </AnnotationSelectionContext.Provider>
    </AnnotationToolsContext.Provider>
  );
};

export const useAnnotationTools = (): AnnotationToolsContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationToolsContext),
    "useAnnotationTools"
  );

export const useAnnotationSelectionState = (): AnnotationSelectionContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationSelectionContext),
    "useAnnotationSelectionState"
  );

export const useAnnotationCollection = (): AnnotationCollectionContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationCollectionContext),
    "useAnnotationCollection"
  );

export const useAnnotationEditingState = (): AnnotationEditingContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationEditingContext),
    "useAnnotationEditingState"
  );

export const useAnnotationSettings = (): AnnotationSettingsContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationSettingsContext),
    "useAnnotationSettings"
  );

export const useAnnotationViewState = (): AnnotationViewContextType =>
  useRequiredAnnotationsContext(
    useContext(AnnotationViewContext),
    "useAnnotationViewState"
  );
