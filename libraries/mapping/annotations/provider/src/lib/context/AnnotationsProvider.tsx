/* @refresh reset */
import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import { useStoreSelector } from "@carma-commons/react-store";
import {
  ANNOTATION_TYPE_DISTANCE,
  buildDerivedPolylinePaths,
  groupPlanarMeasurementGroupsByType,
  type AnnotationEntry,
  type DerivedPolylinePath,
  isPointAnnotationEntry,
  type PlanarMeasurementGroup,
  type PlanarPolygonGroup,
  type PlanarPolylineGroup,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

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
} from "./annotationsContext.types";
import {
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  type AnnotationsStore,
  type AnnotationsStoreSnapshot,
} from "./store";

export type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
  AnnotationsOptions,
};

interface AnnotationsProviderProps {
  children: React.ReactNode;
  options?: AnnotationsOptions;
  enabled?: boolean;
  cesiumScene: Scene;
}

const AnnotationsStoreContext = createContext<AnnotationsStore | undefined>(
  undefined
);

const useRequiredAnnotationsStore = (
  store: AnnotationsStore | undefined,
  hookName: string
): AnnotationsStore => {
  if (store === undefined) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return store;
};

export const AnnotationsProvider: React.FC<AnnotationsProviderProps> = ({
  children,
  options,
  enabled = true,
  cesiumScene,
}) => {
  const annotationsStoreRef = useRef<AnnotationsStore | null>(null);

  if (annotationsStoreRef.current === null) {
    annotationsStoreRef.current = createAnnotationsStore(
      createInitialAnnotationsStoreState({
        initialToolType: options?.initialToolType ?? "point",
        initialPointRadius: options?.pointQueries?.radius ?? 1,
        initialPointVerticalOffsetMeters:
          options?.pointQueries?.verticalOffsetMeters ?? 0,
        initialPointTemporaryMode:
          options?.pointQueries?.temporaryMode ?? false,
        initialPolylineVerticalOffsetMeters:
          options?.pointQueries?.verticalOffsetMeters ?? 0,
        initialHeightOffset: options?.pointQueries?.heightOffset ?? 1.5,
      })
    );
  }

  const annotationsStore = annotationsStoreRef.current;
  const annotationsManagement = useAnnotationsManagement(
    annotationsStore,
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
      requestModeChange: annotationsManagement.requestModeChange,
      requestStartMeasurement: annotationsManagement.requestStartMeasurement,
      requestCloseActiveMeasurement:
        annotationsManagement.requestCloseActiveMeasurement,
    }),
    [
      annotationsManagement.activeToolType,
      annotationsManagement.requestCloseActiveMeasurement,
      annotationsManagement.requestModeChange,
      annotationsManagement.requestStartMeasurement,
    ]
  );

  const selectionContextValue = useMemo<AnnotationSelectionContextType>(
    () => ({
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
      updateNameById: annotationsManagement.updateAnnotationNameById,
      updateVisualizerOptionsById:
        annotationsManagement.updateAnnotationVisualizerOptionsById,
      updatePointLabelAppearanceById:
        annotationsManagement.updatePointLabelAppearanceById,
      removeByIds: annotationsManagement.deleteAnnotationsByIds,
      removeSelection: annotationsManagement.deleteSelectedAnnotations,
      removeAll: annotationsManagement.clearAllAnnotations,
      removeByType: annotationsManagement.clearAnnotationsByType,
      toggleLockByIds: annotationsManagement.toggleAnnotationsLockByIds,
      toggleVisibilityByIds:
        annotationsManagement.toggleAnnotationsVisibilityByIds,
      setReferencePointId: annotationsManagement.setReferencePointId,
      confirmLabelPlacementById:
        annotationsManagement.confirmLabelPlacementById,
      flyToById: annotationsManagement.flyToAnnotationById,
      focusById: annotationsManagement.focusAnnotationById,
      flyToAll: annotationsManagement.flyToAllAnnotations,
    }),
    [
      annotationsManagement.addAnnotation,
      annotationsManagement.annotations,
      annotationsManagement.annotationsByType,
      annotationsManagement.clearAllAnnotations,
      annotationsManagement.clearAnnotationsByType,
      annotationsManagement.confirmLabelPlacementById,
      annotationsManagement.deleteAnnotationsByIds,
      annotationsManagement.deleteSelectedAnnotations,
      annotationsManagement.focusAnnotationById,
      annotationsManagement.flyToAllAnnotations,
      annotationsManagement.flyToAnnotationById,
      annotationsManagement.getAnnotationIndexByType,
      annotationsManagement.getAnnotationOrderByType,
      annotationsManagement.getAnnotationsForNavigation,
      annotationsManagement.getNextAnnotationOrderByType,
      annotationsManagement.setReferencePointId,
      annotationsManagement.toggleAnnotationsLockByIds,
      annotationsManagement.toggleAnnotationsVisibilityByIds,
      annotationsManagement.updateAnnotationById,
      annotationsManagement.updateAnnotationNameById,
      annotationsManagement.updateAnnotationVisualizerOptionsById,
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
      point: {
        verticalOffsetMeters: annotationsManagement.pointVerticalOffsetMeters,
        setVerticalOffsetMeters:
          annotationsManagement.setPointVerticalOffsetMeters,
        temporaryMode: annotationsManagement.pointTemporaryMode,
        setTemporaryMode: annotationsManagement.setPointTemporaryMode,
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
      annotationsManagement.pointTemporaryMode,
      annotationsManagement.polylineSegmentLineMode,
      annotationsManagement.polylineVerticalOffsetMeters,
      annotationsManagement.setDistanceCreationLineVisibilityByKind,
      annotationsManagement.setDistanceModeStickyToFirstPoint,
      annotationsManagement.setPointVerticalOffsetMeters,
      annotationsManagement.setPointTemporaryMode,
      annotationsManagement.setPolylineSegmentLineMode,
      annotationsManagement.setPolylineVerticalOffsetMeters,
    ]
  );

  const annotationsStoreSnapshot = useMemo<AnnotationsStoreSnapshot>(
    () => ({
      tools: toolsContextValue,
      selection: selectionContextValue,
      annotations: collectionContextValue,
      edit: editingContextValue,
      settings: settingsContextValue,
    }),
    [
      collectionContextValue,
      editingContextValue,
      selectionContextValue,
      settingsContextValue,
      toolsContextValue,
    ]
  );

  useLayoutEffect(() => {
    annotationsStore.setState((currentState) =>
      Object.is(currentState.tools, annotationsStoreSnapshot.tools) &&
      Object.is(currentState.selection, annotationsStoreSnapshot.selection) &&
      Object.is(
        currentState.annotations,
        annotationsStoreSnapshot.annotations
      ) &&
      Object.is(currentState.edit, annotationsStoreSnapshot.edit) &&
      Object.is(currentState.settings, annotationsStoreSnapshot.settings)
        ? currentState
        : {
            ...currentState,
            ...annotationsStoreSnapshot,
          }
    );
  }, [annotationsStore, annotationsStoreSnapshot]);

  useLayoutEffect(() => {
    annotationsStore.setState((currentState) =>
      Object.is(
        currentState.candidateAnnotation,
        annotationsManagement.annotationCandidate
      )
        ? currentState
        : {
            ...currentState,
            candidateAnnotation: annotationsManagement.annotationCandidate,
          }
    );
  }, [annotationsManagement.annotationCandidate, annotationsStore]);

  return (
    <AnnotationsStoreContext.Provider value={annotationsStore}>
      {children}
    </AnnotationsStoreContext.Provider>
  );
};

const useAnnotationsStore = (hookName: string): AnnotationsStore =>
  useRequiredAnnotationsStore(useContext(AnnotationsStoreContext), hookName);

const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;

export const useAnnotationTools = (): AnnotationToolsContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationTools");

  return useStoreSelector(annotationsStore, (state) => state.tools);
};

export const useAnnotationSelectionState =
  (): AnnotationSelectionContextType => {
    const annotationsStore = useAnnotationsStore("useAnnotationSelectionState");

    return useStoreSelector(annotationsStore, (state) => state.selection);
  };

export const useAnnotationCollection = (): AnnotationCollectionContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationCollection");

  return useStoreSelector(annotationsStore, (state) => state.annotations);
};

export const useAnnotationEditingState = (): AnnotationEditingContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationEditingState");

  return useStoreSelector(annotationsStore, (state) => state.edit);
};

export const useAnnotationSettings = (): AnnotationSettingsContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationSettings");

  return useStoreSelector(annotationsStore, (state) => state.settings);
};

export const useCandidateAnnotation = (): AnnotationEntry | null => {
  const annotationsStore = useAnnotationsStore("useCandidateAnnotation");

  return useStoreSelector(
    annotationsStore,
    (state) => state.candidateAnnotation
  );
};

export const usePendingLabelPlacementTargetId = (): string | null => {
  const annotationsStore = useAnnotationsStore(
    "usePendingLabelPlacementTargetId"
  );

  return useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
};

export const useReferencePoint = (): Cartesian3 | null => {
  const annotationsStore = useAnnotationsStore("useReferencePoint");

  return useStoreSelector(annotationsStore, (state) => state.referencePoint);
};

export type AnnotationDistanceReadModel = {
  referencePoint: Cartesian3 | null;
  hasPreviewAnchor: boolean;
  distanceRelations: PointDistanceRelation[];
};

export const useDistanceAnnotationReadModel =
  (): AnnotationDistanceReadModel => {
    const annotationsStore = useAnnotationsStore(
      "useDistanceAnnotationReadModel"
    );
    const referencePoint = useStoreSelector(
      annotationsStore,
      (state) => state.referencePoint
    );
    const distanceRelations = useStoreSelector(
      annotationsStore,
      (state) => state.distanceRelations
    );
    const annotationEntries = useStoreSelector(
      annotationsStore,
      (state) => state.annotationEntries
    );
    const activeToolType = useStoreSelector(
      annotationsStore,
      (state) => state.tools.activeToolType
    );
    const openChainPointId = useStoreSelector(
      annotationsStore,
      (state) => state.openChainPointId
    );
    const distanceModeStickyToFirstPoint = useStoreSelector(
      annotationsStore,
      (state) => state.settingsState.distance.stickyToFirstPoint
    );

    const pointEntries = useMemo(
      () => annotationEntries.filter(isPointAnnotationEntry),
      [annotationEntries]
    );
    const referencePointMeasurementId = useMemo(() => {
      if (!referencePoint) {
        return null;
      }

      const referenceMeasurement =
        pointEntries.find(
          (pointEntry) =>
            Cartesian3.distance(pointEntry.geometryECEF, referencePoint) <=
            REFERENCE_POINT_SYNC_EPSILON_METERS
        ) ?? null;

      return referenceMeasurement?.id ?? null;
    }, [pointEntries, referencePoint]);
    const pointIdSet = useMemo(
      () => new Set(pointEntries.map((pointEntry) => pointEntry.id)),
      [pointEntries]
    );
    const hasPreviewAnchor = useMemo(() => {
      if (activeToolType !== ANNOTATION_TYPE_DISTANCE) {
        return false;
      }

      if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
        return true;
      }

      return Boolean(openChainPointId && pointIdSet.has(openChainPointId));
    }, [
      activeToolType,
      distanceModeStickyToFirstPoint,
      openChainPointId,
      pointIdSet,
      referencePointMeasurementId,
    ]);

    return useMemo(
      () => ({
        referencePoint,
        hasPreviewAnchor,
        distanceRelations,
      }),
      [distanceRelations, hasPreviewAnchor, referencePoint]
    );
  };

export const usePlanarMeasurements = (): PlanarMeasurementGroup[] => {
  const annotationsStore = useAnnotationsStore("usePlanarMeasurements");

  return useStoreSelector(
    annotationsStore,
    (state) => state.planarMeasurements
  );
};

export type AnnotationPlanarReadModel = {
  measurements: PlanarMeasurementGroup[];
  polylineMeasurements: PlanarPolylineGroup[];
  groundPolygons: PlanarPolygonGroup[];
  planarPolygons: PlanarPolygonGroup[];
  verticalPolygons: PlanarPolygonGroup[];
  polylinePaths: DerivedPolylinePath[];
  focusedMeasurementId: string | null;
  activeMeasurementId: string | null;
};

export const usePlanarAnnotationReadModel = (): AnnotationPlanarReadModel => {
  const annotationsStore = useAnnotationsStore("usePlanarAnnotationReadModel");
  const planarMeasurements = useStoreSelector(
    annotationsStore,
    (state) => state.planarMeasurements
  );
  const activeMeasurementId = useStoreSelector(
    annotationsStore,
    (state) => state.activePlanarMeasurementId
  );
  const annotationEntries = useStoreSelector(
    annotationsStore,
    (state) => state.annotationEntries
  );
  const selectedAnnotationIds = useStoreSelector(
    annotationsStore,
    (state) => state.selection.ids
  );
  const defaultPolylineVerticalOffsetMeters = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.polyline.defaultVerticalOffsetMeters
  );

  const groupedPlanarMeasurements = useMemo(
    () => groupPlanarMeasurementGroupsByType(planarMeasurements),
    [planarMeasurements]
  );
  const polylinePaths = useMemo(
    () =>
      buildDerivedPolylinePaths({
        annotations: annotationEntries,
        planarPolygonGroups: planarMeasurements,
        defaultVerticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
        useOffsetAnchors: true,
      }),
    [annotationEntries, defaultPolylineVerticalOffsetMeters, planarMeasurements]
  );
  const focusedMeasurementId = useMemo(() => {
    for (let index = selectedAnnotationIds.length - 1; index >= 0; index -= 1) {
      const selectedAnnotationId = selectedAnnotationIds[index];
      if (!selectedAnnotationId) {
        continue;
      }

      const focusedMeasurement =
        planarMeasurements.find((measurement) =>
          measurement.nodeIds.includes(selectedAnnotationId)
        ) ?? null;
      if (focusedMeasurement) {
        return focusedMeasurement.id;
      }
    }

    return activeMeasurementId;
  }, [activeMeasurementId, planarMeasurements, selectedAnnotationIds]);

  return useMemo(
    () => ({
      measurements: planarMeasurements,
      polylineMeasurements: groupedPlanarMeasurements.polylineGroups,
      groundPolygons: groupedPlanarMeasurements.areaPolygonGroups,
      planarPolygons: groupedPlanarMeasurements.planarSurfacePolygonGroups,
      verticalPolygons: groupedPlanarMeasurements.verticalPolygonGroups,
      polylinePaths,
      focusedMeasurementId,
      activeMeasurementId,
    }),
    [
      activeMeasurementId,
      focusedMeasurementId,
      groupedPlanarMeasurements,
      planarMeasurements,
      polylinePaths,
    ]
  );
};
