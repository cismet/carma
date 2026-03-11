import { useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

type UseAnnotationsRenderStateOptions = {
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  pointIdsWithoutLabelAnchor: ReadonlySet<string>;
  unselectedClosedAreaNodeIdSet: ReadonlySet<string>;
  unfocusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  focusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  labelAnchorPointIdsWithForcedVisibility: ReadonlySet<string>;
  unfocusedPolylineNonLastIds: ReadonlySet<string>;
  annotationCursorEnabled: boolean;
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
};

export const useAnnotationsRenderState = (
  annotations: AnnotationCollection,
  distanceRelations: PointDistanceRelation[],
  nodeChainAnnotations: NodeChainAnnotation[],
  {
    selectedAnnotationId,
    selectedAnnotationIds,
    pointIdsWithoutLabelAnchor,
    unselectedClosedAreaNodeIdSet,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
    labelAnchorPointIdsWithForcedVisibility,
    unfocusedPolylineNonLastIds,
    annotationCursorEnabled,
    defaultDistanceRelationLabelVisibility,
  }: UseAnnotationsRenderStateOptions
) => {
  const hiddenMeasurementIdSet = useMemo(
    () =>
      new Set(
        annotations
          .filter(
            (measurement) =>
              measurement.hidden && !measurement.auxiliaryLabelAnchor
          )
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
          .filter((group) => group.hidden)
          .map((group) => group.id)
      ),
    [nodeChainAnnotations]
  );

  const visibleMeasurementsForRendering = useMemo(
    () =>
      annotations.filter(
        (measurement) => !measurement.hidden || measurement.auxiliaryLabelAnchor
      ),
    [annotations]
  );

  const visiblePolygonAnnotationsForRendering = useMemo(
    () => nodeChainAnnotations.filter((group) => !group.hidden),
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

  const selectedStandaloneDistanceRelationIdSet = useMemo(() => {
    const selectedPointIdSet = new Set<string>(selectedAnnotationIds);
    if (selectedAnnotationId) {
      selectedPointIdSet.add(selectedAnnotationId);
    }
    if (selectedPointIdSet.size === 0) {
      return new Set<string>();
    }

    const standaloneRelations = visibleDistanceRelationsForRendering.filter(
      (relation) => !relation.polygonGroupId
    );
    if (standaloneRelations.length === 0) {
      return new Set<string>();
    }

    const neighborPointIdsByPointId = new Map<string, Set<string>>();
    const relationIdsByPointId = new Map<string, Set<string>>();

    standaloneRelations.forEach((relation) => {
      const { pointAId, pointBId, id } = relation;
      if (!neighborPointIdsByPointId.has(pointAId)) {
        neighborPointIdsByPointId.set(pointAId, new Set());
      }
      if (!neighborPointIdsByPointId.has(pointBId)) {
        neighborPointIdsByPointId.set(pointBId, new Set());
      }
      neighborPointIdsByPointId.get(pointAId)?.add(pointBId);
      neighborPointIdsByPointId.get(pointBId)?.add(pointAId);

      if (!relationIdsByPointId.has(pointAId)) {
        relationIdsByPointId.set(pointAId, new Set());
      }
      if (!relationIdsByPointId.has(pointBId)) {
        relationIdsByPointId.set(pointBId, new Set());
      }
      relationIdsByPointId.get(pointAId)?.add(id);
      relationIdsByPointId.get(pointBId)?.add(id);
    });

    const queue: string[] = [];
    selectedPointIdSet.forEach((pointId) => {
      if (neighborPointIdsByPointId.has(pointId)) {
        queue.push(pointId);
      }
    });
    if (queue.length === 0) {
      return new Set<string>();
    }

    const visitedPointIds = new Set<string>();
    const selectedRelationIds = new Set<string>();

    while (queue.length > 0) {
      const pointId = queue.shift();
      if (!pointId || visitedPointIds.has(pointId)) continue;
      visitedPointIds.add(pointId);

      relationIdsByPointId.get(pointId)?.forEach((relationId) => {
        selectedRelationIds.add(relationId);
      });
      neighborPointIdsByPointId.get(pointId)?.forEach((neighborPointId) => {
        if (!visitedPointIds.has(neighborPointId)) {
          queue.push(neighborPointId);
        }
      });
    }

    return selectedRelationIds;
  }, [
    selectedAnnotationId,
    selectedAnnotationIds,
    visibleDistanceRelationsForRendering,
  ]);

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

  const effectiveDistanceRelationsForRendering = useMemo<
    PointDistanceRelation[]
  >(() => {
    const planarPolygonGroupById = new Map(
      nodeChainAnnotations.map((group) => [group.id, group] as const)
    );

    return visibleDistanceRelationsForRendering.map((relation) => {
      const owningGroup = relation.polygonGroupId
        ? planarPolygonGroupById.get(relation.polygonGroupId) ?? null
        : null;
      const isStandaloneDistanceRelation = !relation.polygonGroupId;
      const isSelectedStandaloneDistanceRelation =
        isStandaloneDistanceRelation &&
        selectedStandaloneDistanceRelationIdSet.has(relation.id);
      const isDistanceMeasureRelation = !owningGroup || !owningGroup.closed;
      if (!isDistanceMeasureRelation) {
        return relation;
      }

      if (isSelectedStandaloneDistanceRelation) {
        return {
          ...relation,
          directLabelMode: "segment",
          labelVisibilityByKind: {
            ...defaultDistanceRelationLabelVisibility,
            ...(relation.labelVisibilityByKind ?? {}),
            direct: true,
            vertical: true,
            horizontal: true,
          },
        };
      }

      return {
        ...relation,
        directLabelMode: "none",
        labelVisibilityByKind: {
          ...defaultDistanceRelationLabelVisibility,
          ...(relation.labelVisibilityByKind ?? {}),
          direct: false,
          vertical: false,
          horizontal: false,
        },
      };
    });
  }, [
    defaultDistanceRelationLabelVisibility,
    visibleDistanceRelationsForRendering,
    nodeChainAnnotations,
    selectedStandaloneDistanceRelationIdSet,
  ]);

  const hiddenPointLabelIds = useMemo(() => {
    const ids = new Set<string>([
      ...polygonOnlyPointIdSet,
      ...hiddenMeasurementIdSet,
      ...pointIdsWithoutLabelAnchor,
      ...unselectedClosedAreaNodeIdSet,
      ...unfocusedStandaloneDistanceNonHighestPointIds,
      ...focusedStandaloneDistanceNonHighestPointIds,
    ]);
    openVerticalSingleNodeIdSet.forEach((pointId) => {
      ids.add(pointId);
    });
    labelAnchorPointIdsWithForcedVisibility.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [
    annotations,
    polygonOnlyPointIdSet,
    hiddenMeasurementIdSet,
    pointIdsWithoutLabelAnchor,
    unselectedClosedAreaNodeIdSet,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
    openVerticalSingleNodeIdSet,
    labelAnchorPointIdsWithForcedVisibility,
  ]);

  const fullyHiddenPointIds = useMemo(() => {
    const ids = new Set([
      ...unfocusedPolylineNonLastIds,
      ...unfocusedStandaloneDistanceNonHighestPointIds,
      ...hiddenMeasurementIdSet,
    ]);
    closedVerticalRectangleVertexIdSet.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [
    annotations,
    unfocusedPolylineNonLastIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    hiddenMeasurementIdSet,
    closedVerticalRectangleVertexIdSet,
  ]);

  const effectiveFullyHiddenPointIds = useMemo(() => {
    if (!annotationCursorEnabled) {
      return fullyHiddenPointIds;
    }

    return new Set(hiddenMeasurementIdSet);
  }, [fullyHiddenPointIds, hiddenMeasurementIdSet, annotationCursorEnabled]);

  return {
    markerlessPointIds,
    visibleMeasurementsForRendering,
    visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
  };
};
