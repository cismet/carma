import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationCreatePayload,
  AnnotationLabelAppearance,
  AnnotationMode,
  NodeChainAnnotation,
  PointAnnotationEntry,
  PointDistanceRelation,
  PointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import {
  Cartesian3,
  type Cartesian3 as CesiumCartesian3,
  type Scene,
} from "@carma/cesium";

import type {
  AnnotationCollectionContextType,
  AnnotationVisualizerOptionsPatch,
} from "../context/annotationsContext.types";
import {
  replaceAnnotationsStoreState,
  useStoreSelector,
  type AnnotationsStore,
} from "../store";
import { resolveSetStateAction } from "../store/stateUpdateUtils";
import { useAnnotationEntryActions } from "./hooks/useAnnotationEntryActions";
import { useFlyToActions } from "./hooks/useFlyToActions";
type UseAnnotationEntriesParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  referencePoint: CesiumCartesian3 | null;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setReferencePoint: Dispatch<SetStateAction<CesiumCartesian3 | null>>;
  referencePointSyncEpsilonMeters: number;
  updateAnnotationNameById: (id: string, name: string) => void;
  updateAnnotationVisualizerOptionsById: (
    id: string,
    patch: AnnotationVisualizerOptionsPatch
  ) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationLabelAppearance | undefined
  ) => void;
  deleteAnnotationsByIds: (ids: string[]) => void;
  deleteSelectedAnnotations: () => void;
  clearAllAnnotations: () => void;
  clearAnnotationsByType: (type: AnnotationMode) => void;
  toggleAnnotationsLockByIds: (ids: string[]) => void;
  toggleAnnotationsVisibilityByIds: (ids: string[]) => void;
  confirmLabelPlacementById: (id: string) => void;
  focusAnnotationById: (id: string | null) => void;
  selectedAnnotationId: string | null;
};

type UseCollectionStateOptions = {
  nodeChainAnnotations: NodeChainAnnotation[];
};

const NAVIGATION_ANNOTATION_TYPES: AnnotationMode[] = [
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
];
const EMPTY_ANNOTATIONS: AnnotationEntry[] = [];

const useCollectionSelectors = ({
  annotationsByType,
  navigationTypes,
}: {
  annotationsByType: (type: AnnotationMode) => ReadonlyArray<AnnotationEntry>;
  navigationTypes: ReadonlyArray<AnnotationMode>;
}) => {
  const getAnnotationsForNavigation = useCallback(() => {
    const seenIds = new Set<string>();
    const result: AnnotationEntry[] = [];

    navigationTypes.forEach((type) => {
      annotationsByType(type).forEach((annotation) => {
        if (seenIds.has(annotation.id)) {
          return;
        }

        seenIds.add(annotation.id);
        result.push(annotation);
      });
    });

    return result;
  }, [annotationsByType, navigationTypes]);

  const getAnnotationIndexByType = useCallback(
    (type: AnnotationMode, id: string | null | undefined) => {
      if (!id) {
        return -1;
      }

      return annotationsByType(type).findIndex(
        (annotation) => annotation.id === id
      );
    },
    [annotationsByType]
  );

  const getAnnotationOrderByType = useCallback(
    (type: AnnotationMode, id: string | null | undefined) => {
      const index = getAnnotationIndexByType(type, id);

      return index >= 0 ? index + 1 : null;
    },
    [getAnnotationIndexByType]
  );

  const getNextAnnotationOrderByType = useCallback(
    (type: AnnotationMode) => annotationsByType(type).length + 1,
    [annotationsByType]
  );

  return {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  };
};

const deriveNodeChainNodeIdSet = (
  nodeChainAnnotations: NodeChainAnnotation[]
): ReadonlySet<string> => {
  const ids = new Set<string>();
  nodeChainAnnotations.forEach((group) => {
    group.nodeIds.forEach((pointId) => {
      if (pointId) {
        ids.add(pointId);
      }
    });
  });
  return ids;
};

const createAnnotationsByTypeMap = (annotations: AnnotationCollection) => {
  const annotationsByType = new Map<AnnotationMode, AnnotationEntry[]>();

  annotations.forEach((annotation) => {
    const typeEntries = annotationsByType.get(annotation.type);
    if (typeEntries) {
      typeEntries.push(annotation);
      return;
    }

    annotationsByType.set(annotation.type, [annotation]);
  });

  return annotationsByType;
};

const createNavigationAnnotationsByTypeMap = (
  annotations: AnnotationCollection,
  pointEntries: PointAnnotationEntry[],
  pointMeasurementEntries: PointMeasurementEntry[],
  nodeChainNodeIdSet: ReadonlySet<string>
) => {
  const annotationsByType = createAnnotationsByTypeMap(annotations);

  annotationsByType.set(
    ANNOTATION_TYPE_POINT,
    pointMeasurementEntries.filter(
      (measurement) => !measurement.auxiliaryLabelAnchor
    )
  );
  annotationsByType.set(
    ANNOTATION_TYPE_DISTANCE,
    pointEntries.filter((measurement) => {
      if (measurement.type !== ANNOTATION_TYPE_DISTANCE) {
        return false;
      }
      if (measurement.auxiliaryLabelAnchor) {
        return false;
      }
      if (nodeChainNodeIdSet.has(measurement.id)) {
        return false;
      }
      return true;
    })
  );

  return annotationsByType;
};

const selectAdjacentNavigationAnnotationId = (
  navigationItems: readonly AnnotationEntry[],
  selectedAnnotationId: string | null,
  offset: -1 | 1
): string | null => {
  if (navigationItems.length === 0) {
    return null;
  }

  const currentIndex = selectedAnnotationId
    ? navigationItems.findIndex((entry) => entry.id === selectedAnnotationId)
    : -1;
  const fallbackIndex = offset > 0 ? 0 : navigationItems.length - 1;
  const nextIndex =
    currentIndex < 0
      ? fallbackIndex
      : (currentIndex + offset + navigationItems.length) %
        navigationItems.length;

  return navigationItems[nextIndex]?.id ?? null;
};

export const useCollectionState = (
  annotations: AnnotationCollection,
  { nodeChainAnnotations }: UseCollectionStateOptions
) => {
  const nodeChainNodeIdSet = useMemo(
    () => deriveNodeChainNodeIdSet(nodeChainAnnotations),
    [nodeChainAnnotations]
  );
  const pointEntries = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );
  const pointMeasurementEntries = useMemo(
    () => annotations.filter(isPointMeasurementEntry),
    [annotations]
  );

  const annotationsByTypeMap = useMemo(
    () => createAnnotationsByTypeMap(annotations),
    [annotations]
  );
  const navigationAnnotationsByTypeMap = useMemo(
    () =>
      createNavigationAnnotationsByTypeMap(
        annotations,
        pointEntries,
        pointMeasurementEntries,
        nodeChainNodeIdSet
      ),
    [annotations, nodeChainNodeIdSet, pointEntries, pointMeasurementEntries]
  );
  const annotationsByType = useCallback(
    (type: AnnotationMode) =>
      annotationsByTypeMap.get(type) ?? EMPTY_ANNOTATIONS,
    [annotationsByTypeMap]
  );
  const navigationAnnotationsByType = useCallback(
    (type: AnnotationMode) =>
      navigationAnnotationsByTypeMap.get(type) ?? EMPTY_ANNOTATIONS,
    [navigationAnnotationsByTypeMap]
  );

  const {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  } = useCollectionSelectors({
    annotationsByType: navigationAnnotationsByType,
    navigationTypes: NAVIGATION_ANNOTATION_TYPES,
  });

  return {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  };
};

export const useAnnotationEntriesStoreState = (
  annotationsStore: AnnotationsStore
) => {
  const annotations = useStoreSelector(
    annotationsStore,
    (state) => state.annotationEntries
  );
  const distanceRelations = useStoreSelector(
    annotationsStore,
    (state) => state.distanceRelations
  );
  const nodeChainAnnotations = useStoreSelector(
    annotationsStore,
    (state) => state.nodeChainAnnotations
  );
  const referencePoint = useStoreSelector(
    annotationsStore,
    (state) => state.referencePoint
  );
  const annotationToolType = useStoreSelector(
    annotationsStore,
    (state) => state.annotationToolType
  );
  const showLabels = useStoreSelector(
    annotationsStore,
    (state) => state.showLabels
  );
  const occlusionChecksEnabled = useStoreSelector(
    annotationsStore,
    (state) => state.occlusionChecksEnabled
  );

  const setAnnotations = useCallback<
    Dispatch<SetStateAction<AnnotationCollection>>
  >(
    (nextValueOrUpdater) => {
      const previousStoreState = annotationsStore.getState();
      const nextAnnotations = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.annotationEntries
      );
      if (Object.is(nextAnnotations, previousStoreState.annotationEntries)) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          annotationEntries: nextAnnotations,
        })
      );
    },
    [annotationsStore]
  );

  const setDistanceRelations = useCallback<
    Dispatch<SetStateAction<PointDistanceRelation[]>>
  >(
    (nextValueOrUpdater) => {
      const previousStoreState = annotationsStore.getState();
      const nextDistanceRelations = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.distanceRelations
      );
      if (
        Object.is(nextDistanceRelations, previousStoreState.distanceRelations)
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          distanceRelations: nextDistanceRelations,
        })
      );
    },
    [annotationsStore]
  );

  const setNodeChainAnnotations = useCallback<
    Dispatch<SetStateAction<NodeChainAnnotation[]>>
  >(
    (nextValueOrUpdater) => {
      const previousStoreState = annotationsStore.getState();
      const nextNodeChainAnnotations = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.nodeChainAnnotations
      );
      if (
        Object.is(
          nextNodeChainAnnotations,
          previousStoreState.nodeChainAnnotations
        )
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          nodeChainAnnotations: nextNodeChainAnnotations,
        })
      );
    },
    [annotationsStore]
  );

  const setReferencePoint = useCallback<
    Dispatch<SetStateAction<Cartesian3 | null>>
  >(
    (nextValueOrUpdater) => {
      const previousStoreState = annotationsStore.getState();
      const nextReferencePoint = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.referencePoint
      );
      if (Object.is(nextReferencePoint, previousStoreState.referencePoint)) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          referencePoint: nextReferencePoint,
        })
      );
    },
    [annotationsStore]
  );

  return {
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    referencePoint,
    annotationToolType,
    showLabels,
    occlusionChecksEnabled,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setReferencePoint,
  };
};

export const useAnnotationEntries = ({
  scene,
  annotations,
  nodeChainAnnotations,
  referencePoint,
  setAnnotations,
  setReferencePoint,
  referencePointSyncEpsilonMeters,
  updateAnnotationNameById,
  updateAnnotationVisualizerOptionsById,
  updatePointLabelAppearanceById,
  deleteAnnotationsByIds,
  deleteSelectedAnnotations,
  clearAllAnnotations,
  clearAnnotationsByType,
  toggleAnnotationsLockByIds,
  toggleAnnotationsVisibilityByIds,
  confirmLabelPlacementById,
  focusAnnotationById,
  selectedAnnotationId,
}: UseAnnotationEntriesParams) => {
  const {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  } = useCollectionState(annotations, {
    nodeChainAnnotations,
  });

  const { addAnnotation, updateAnnotationById } = useAnnotationEntryActions({
    setAnnotations,
  });

  const { flyToAnnotationById, flyToAllAnnotations } = useFlyToActions(scene, {
    annotations,
    nodeChainAnnotations,
  });

  const pointEntries = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );

  useEffect(
    function effectSyncReferencePointAfterPointDeletion() {
      if (!referencePoint) return;

      if (pointEntries.length === 0) {
        setReferencePoint(null);
        return;
      }

      const hasReferenceMeasurement = pointEntries.some(
        (measurement) =>
          Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          referencePointSyncEpsilonMeters
      );

      if (hasReferenceMeasurement) {
        return;
      }

      const nextReferencePoint =
        pointEntries[pointEntries.length - 1]?.geometryECEF ?? null;
      setReferencePoint(nextReferencePoint);
    },
    [
      pointEntries,
      referencePoint,
      referencePointSyncEpsilonMeters,
      setReferencePoint,
    ]
  );

  useEffect(
    function effectInitializeReferencePointFromPointEntries() {
      if (referencePoint !== null) return;
      if (pointEntries.length > 1) {
        setReferencePoint(pointEntries[0]?.geometryECEF ?? null);
      }
    },
    [pointEntries, referencePoint, setReferencePoint]
  );

  const setReferencePointId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setReferencePoint(null);
        return;
      }

      const referenceMeasurement =
        pointEntries.find((pointEntry) => pointEntry.id === id) ?? null;
      if (!referenceMeasurement) {
        return;
      }

      setReferencePoint(referenceMeasurement.geometryECEF);
    },
    [pointEntries, setReferencePoint]
  );

  const focusAdjacentNavigationItem = useCallback(
    (offset: -1 | 1) => {
      const nextAnnotationId = selectAdjacentNavigationAnnotationId(
        getAnnotationsForNavigation(),
        selectedAnnotationId,
        offset
      );

      focusAnnotationById(nextAnnotationId);
    },
    [focusAnnotationById, getAnnotationsForNavigation, selectedAnnotationId]
  );

  const actionsContextValue = useMemo(
    () => ({
      add: addAnnotation as (
        payload: AnnotationCreatePayload<
          AnnotationCollectionContextType["items"][number]
        >
      ) => string,
      updateById: updateAnnotationById,
      updateNameById: updateAnnotationNameById,
      updateVisualizerOptionsById: updateAnnotationVisualizerOptionsById,
      updatePointLabelAppearanceById,
      removeByIds: deleteAnnotationsByIds,
      removeSelection: deleteSelectedAnnotations,
      removeAll: clearAllAnnotations,
      removeByType: clearAnnotationsByType,
      toggleLockByIds: toggleAnnotationsLockByIds,
      toggleVisibilityByIds: toggleAnnotationsVisibilityByIds,
      setReferencePointId,
      confirmLabelPlacementById,
      flyToById: flyToAnnotationById,
      focusById: focusAnnotationById,
      focusAdjacentNavigationItem,
      flyToAll: flyToAllAnnotations,
    }),
    [
      addAnnotation,
      clearAllAnnotations,
      clearAnnotationsByType,
      confirmLabelPlacementById,
      deleteAnnotationsByIds,
      deleteSelectedAnnotations,
      flyToAllAnnotations,
      flyToAnnotationById,
      focusAdjacentNavigationItem,
      focusAnnotationById,
      setReferencePointId,
      toggleAnnotationsLockByIds,
      toggleAnnotationsVisibilityByIds,
      updateAnnotationById,
      updateAnnotationNameById,
      updateAnnotationVisualizerOptionsById,
      updatePointLabelAppearanceById,
    ]
  );
  const contextValue = useMemo<AnnotationCollectionContextType>(
    () => ({
      items: annotations,
      byType: annotationsByType,
      getNavigationItems: getAnnotationsForNavigation,
      getIndexByType: getAnnotationIndexByType,
      getOrderByType: getAnnotationOrderByType,
      getNextOrderByType: getNextAnnotationOrderByType,
      ...actionsContextValue,
    }),
    [
      actionsContextValue,
      annotations,
      annotationsByType,
      getAnnotationIndexByType,
      getAnnotationOrderByType,
      getAnnotationsForNavigation,
      getNextAnnotationOrderByType,
    ]
  );

  return {
    actionsContextValue,
    contextValue,
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
    addAnnotation,
    updateAnnotationById,
    flyToAnnotationById,
    flyToAllAnnotations,
    focusAdjacentNavigationItem,
    setReferencePointId,
  };
};

export { useAnnotationEntriesDomainActions } from "./hooks/useAnnotationEntriesDomainActions";
export { useAnnotationEntryNameAction } from "./hooks/useAnnotationEntryNameAction";
export { useModelIntegritySync } from "./hooks/useModelIntegritySync";
export { usePersistenceSync } from "./hooks/usePersistenceSync";
export { useSyncNodeChainEdgeRelations } from "./hooks/useSyncNodeChainEdgeRelations";
export { syncNodeChainEdgeDistanceRelations } from "@carma-mapping/annotations/core";
