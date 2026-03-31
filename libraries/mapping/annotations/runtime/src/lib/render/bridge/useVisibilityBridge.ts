import { useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_AREA_VERTICAL,
  AnnotationCollection,
  NodeChainAnnotation,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";
type UseVisibilityBridgeOptions = {
  selectedAnnotationId: string | null;
  pointIdsWithoutLabelAnchor: ReadonlySet<string>;
  unselectedClosedAreaNodeIdSet: ReadonlySet<string>;
  unfocusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  focusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  labelAnchorPointIdsWithForcedVisibility: ReadonlySet<string>;
  unfocusedPolylineNonLastIds: ReadonlySet<string>;
  annotationCursorEnabled: boolean;
  showAllPointOverlays: boolean;
};

const createUnionSet = (...sources: ReadonlySet<string>[]): Set<string> => {
  const ids = new Set<string>();
  sources.forEach((source) => {
    source.forEach((id) => ids.add(id));
  });
  return ids;
};

type UseVisibilityBridgeParams = {
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
} & UseVisibilityBridgeOptions;

export const useVisibilityBridge = ({
  annotations,
  distanceRelations,
  nodeChainAnnotations,
  selectedAnnotationId,
  pointIdsWithoutLabelAnchor,
  unselectedClosedAreaNodeIdSet,
  unfocusedStandaloneDistanceNonHighestPointIds,
  focusedStandaloneDistanceNonHighestPointIds,
  labelAnchorPointIdsWithForcedVisibility,
  unfocusedPolylineNonLastIds,
  annotationCursorEnabled,
  showAllPointOverlays,
}: UseVisibilityBridgeParams) => {
  const hiddenMeasurementIdSet = useMemo(
    () =>
      new Set(
        annotations
          .filter((measurement) => measurement.hidden)
          .map((measurement) => measurement.id)
      ),
    [annotations]
  );

  const auxiliaryLabelAnchorIdSet = useMemo(
    () =>
      new Set(
        annotations
          .filter((measurement) => measurement.auxiliaryLabelAnchor)
          .map((measurement) => measurement.id)
      ),
    [annotations]
  );

  const openVerticalSingleNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    nodeChainAnnotations.forEach((group) => {
      if (group.closed) return;
      if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) return;
      if (group.nodeIds.length !== 1) return;
      const onlyPointId = group.nodeIds[0];
      if (onlyPointId) {
        ids.add(onlyPointId);
      }
    });
    return ids;
  }, [nodeChainAnnotations]);

  const closedVerticalRectangleVertexIdSet = useMemo(() => {
    const ids = new Set<string>();
    nodeChainAnnotations.forEach((group) => {
      if (!group.closed) return;
      if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) return;
      if (group.nodeIds.length !== 4) return;
      group.nodeIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [nodeChainAnnotations]);

  const markerlessPointIds = useMemo(() => {
    const ids = new Set(auxiliaryLabelAnchorIdSet);
    closedVerticalRectangleVertexIdSet.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [auxiliaryLabelAnchorIdSet, closedVerticalRectangleVertexIdSet]);

  const hiddenPolygonAnnotationIdSet = useMemo(
    () =>
      new Set(
        nodeChainAnnotations
          .filter((group) => group.type !== ANNOTATION_TYPE_DISTANCE)
          .filter((group) => group.hidden)
          .map((group) => group.id)
      ),
    [nodeChainAnnotations]
  );

  const visiblePolygonAnnotationsForRendering = useMemo(
    () =>
      nodeChainAnnotations.filter(
        (group) => group.type !== ANNOTATION_TYPE_DISTANCE && !group.hidden
      ),
    [nodeChainAnnotations]
  );

  const visibleDistanceRelationsForRendering = useMemo(
    () =>
      distanceRelations.filter((relation) => {
        if (
          relation.polygonGroupId &&
          hiddenPolygonAnnotationIdSet.has(relation.polygonGroupId)
        ) {
          return false;
        }
        return (
          !hiddenMeasurementIdSet.has(relation.pointAId) &&
          !hiddenMeasurementIdSet.has(relation.pointBId)
        );
      }),
    [distanceRelations, hiddenMeasurementIdSet, hiddenPolygonAnnotationIdSet]
  );

  const polygonOnlyPointIdSet = useMemo(() => {
    const displayReadyPolygonGroupIds = new Set(
      nodeChainAnnotations
        .filter(
          (group) =>
            group.closed || (group.planeLocked && group.nodeIds.length >= 4)
        )
        .map((group) => group.id)
    );

    const polygonVertexIds = new Set<string>();
    nodeChainAnnotations.forEach((group) => {
      if (!displayReadyPolygonGroupIds.has(group.id)) {
        return;
      }
      group.nodeIds.forEach((id) => polygonVertexIds.add(id));
    });

    const nonPolygonRelationPointIds = new Set<string>();
    distanceRelations.forEach((relation) => {
      if (
        relation.polygonGroupId &&
        displayReadyPolygonGroupIds.has(relation.polygonGroupId)
      ) {
        return;
      }
      nonPolygonRelationPointIds.add(relation.pointAId);
      nonPolygonRelationPointIds.add(relation.pointBId);
    });

    const ids = new Set<string>();
    polygonVertexIds.forEach((id) => {
      if (!nonPolygonRelationPointIds.has(id)) {
        ids.add(id);
      }
    });

    if (selectedAnnotationId) {
      ids.delete(selectedAnnotationId);
    }

    return ids;
  }, [distanceRelations, nodeChainAnnotations, selectedAnnotationId]);

  const hiddenPointLabelIds = useMemo(() => {
    if (showAllPointOverlays) {
      return new Set<string>();
    }

    const coreHiddenLabelIds = createUnionSet(
      pointIdsWithoutLabelAnchor,
      polygonOnlyPointIdSet,
      openVerticalSingleNodeIdSet,
      unfocusedStandaloneDistanceNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds,
      unfocusedPolylineNonLastIds,
      unselectedClosedAreaNodeIdSet
    );
    if (annotationCursorEnabled) {
      return coreHiddenLabelIds;
    }

    return createUnionSet(
      coreHiddenLabelIds,
      labelAnchorPointIdsWithForcedVisibility
    );
  }, [
    annotationCursorEnabled,
    focusedStandaloneDistanceNonHighestPointIds,
    labelAnchorPointIdsWithForcedVisibility,
    openVerticalSingleNodeIdSet,
    pointIdsWithoutLabelAnchor,
    polygonOnlyPointIdSet,
    unfocusedPolylineNonLastIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    unselectedClosedAreaNodeIdSet,
    showAllPointOverlays,
  ]);

  const effectiveFullyHiddenPointIds = useMemo(() => {
    if (showAllPointOverlays) {
      return new Set<string>();
    }

    return createUnionSet(
      polygonOnlyPointIdSet,
      openVerticalSingleNodeIdSet,
      unfocusedPolylineNonLastIds,
      unselectedClosedAreaNodeIdSet
    );
  }, [
    openVerticalSingleNodeIdSet,
    polygonOnlyPointIdSet,
    showAllPointOverlays,
    unfocusedPolylineNonLastIds,
    unselectedClosedAreaNodeIdSet,
  ]);

  return {
    markerlessPointIds,
    visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering:
      visibleDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
  };
};
