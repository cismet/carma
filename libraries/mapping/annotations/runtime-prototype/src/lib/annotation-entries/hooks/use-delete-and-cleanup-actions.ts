import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  buildEdgeRelationIdsForPolygon,
  getDistanceRelationId,
  getPointPositionMap,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
const { DISTANCE: ANNOTATION_TYPE_DISTANCE } = ANNOTATION_TYPES;

type UseDeleteAndCleanupActionsParams = {
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  selectableAnnotationIds: ReadonlySet<string>;
  lockedAnnotationIdSet: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  clearMoveGizmo: () => void;
  getOwnerGroupIdsForPointId: (pointId: string) => readonly string[];
  computePolygonGroupDerivedDataWithCamera: (
    group: NodeChainAnnotation,
    pointById: Map<string, Cartesian3>
  ) => NodeChainAnnotation;
  pruneDistanceSession: (
    removedPointIds: ReadonlySet<string>,
    removedRelationIds: ReadonlySet<string>
  ) => void;
  pruneMeasurementDraftSession: (
    removedPointIds: ReadonlySet<string>,
    removedRelationIds: ReadonlySet<string>
  ) => void;
  pruneSelectionByRemovedIds: (removedIds: ReadonlySet<string>) => void;
};

export const useDeleteAndCleanupActions = ({
  annotations,
  distanceRelations,
  nodeChainAnnotations,
  selectedAnnotationId,
  selectedAnnotationIds,
  selectableAnnotationIds,
  lockedAnnotationIdSet,
  moveGizmoPointId,
  setAnnotations,
  setDistanceRelations,
  setNodeChainAnnotations,
  setActiveNodeChainAnnotationId,
  clearMoveGizmo,
  getOwnerGroupIdsForPointId,
  computePolygonGroupDerivedDataWithCamera,
  pruneDistanceSession,
  pruneMeasurementDraftSession,
  pruneSelectionByRemovedIds,
}: UseDeleteAndCleanupActionsParams) => {
  const clearAnnotationsByIds = useCallback(
    (ids: string[]) => {
      const pointById = new Map(
        annotations
          .filter(isPointAnnotationEntry)
          .map((annotation) => [annotation.id, annotation] as const)
      );

      const requestedIdSet = new Set(ids);
      const protectedPolygonNodeIdSet = new Set<string>();
      nodeChainAnnotations.forEach((group) => {
        if (!group.closed || group.nodeIds.length > 3) {
          return;
        }
        const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
          Boolean(nodeId)
        );
        if (nodeIds.length === 0) {
          return;
        }
        const includesAnyNode = nodeIds.some((nodeId) =>
          requestedIdSet.has(nodeId)
        );
        if (!includesAnyNode) {
          return;
        }
        const includesAllNodes = nodeIds.every((nodeId) =>
          requestedIdSet.has(nodeId)
        );
        if (includesAllNodes) {
          return;
        }
        nodeIds.forEach((nodeId) => {
          protectedPolygonNodeIdSet.add(nodeId);
        });
      });

      const idsToDelete = new Set(
        ids.filter((id) => !protectedPolygonNodeIdSet.has(id))
      );
      if (idsToDelete.size === 0) {
        return;
      }
      let remainingRelations = [...distanceRelations];

      let expanded = true;
      while (expanded) {
        expanded = false;

        const nextRemainingRelations: PointDistanceRelation[] = [];
        const removedRelations: PointDistanceRelation[] = [];
        remainingRelations.forEach((relation) => {
          if (
            idsToDelete.has(relation.pointAId) ||
            idsToDelete.has(relation.pointBId)
          ) {
            removedRelations.push(relation);
            return;
          }
          nextRemainingRelations.push(relation);
        });
        remainingRelations = nextRemainingRelations;

        removedRelations.forEach((relation) => {
          [relation.pointAId, relation.pointBId].forEach((pointId) => {
            if (idsToDelete.has(pointId)) return;
            const point = pointById.get(pointId);
            if (!point) return;
            if (point.type !== ANNOTATION_TYPE_DISTANCE) return;

            const stillReferencedByRemainingRelation = remainingRelations.some(
              (candidate) =>
                candidate.pointAId === pointId || candidate.pointBId === pointId
            );
            if (stillReferencedByRemainingRelation) return;
            const belongsToNodeChainAnnotation =
              getOwnerGroupIdsForPointId(pointId).length > 0;
            if (belongsToNodeChainAnnotation) return;

            idsToDelete.add(pointId);
            expanded = true;
          });
        });
      }

      setAnnotations((prev) =>
        prev.filter((annotation) => !idsToDelete.has(annotation.id))
      );
      setDistanceRelations(remainingRelations);
      pruneSelectionByRemovedIds(idsToDelete);
      const removedRelationIds = new Set(
        distanceRelations
          .filter(
            (relation) =>
              !remainingRelations.some(
                (remainingRelation) => remainingRelation.id === relation.id
              )
          )
          .map((relation) => relation.id)
      );
      pruneDistanceSession(idsToDelete, removedRelationIds);
      pruneMeasurementDraftSession(idsToDelete, removedRelationIds);
      if (moveGizmoPointId && idsToDelete.has(moveGizmoPointId)) {
        clearMoveGizmo();
      }

      const remainingPointById = getPointPositionMap(annotations);
      idsToDelete.forEach((id) => remainingPointById.delete(id));
      setNodeChainAnnotations((prev) =>
        prev.flatMap((group) => {
          const nextNodeIds = group.nodeIds.filter(
            (nodeId) => !idsToDelete.has(nodeId)
          );
          if (nextNodeIds.length < 3) {
            return [];
          }
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            group.closed,
            getDistanceRelationId
          );
          return [
            computePolygonGroupDerivedDataWithCamera(
              {
                ...group,
                nodeIds: nextNodeIds,
                edgeRelationIds: nextEdgeRelationIds,
              },
              remainingPointById
            ),
          ];
        })
      );
      setActiveNodeChainAnnotationId((prev) => {
        if (!prev) return prev;
        const activeGroup = nodeChainAnnotations.find(
          (group) => group.id === prev
        );
        if (!activeGroup) return null;
        return activeGroup.nodeIds.some((id) => idsToDelete.has(id))
          ? null
          : prev;
      });
    },
    [
      annotations,
      clearMoveGizmo,
      computePolygonGroupDerivedDataWithCamera,
      distanceRelations,
      getOwnerGroupIdsForPointId,
      moveGizmoPointId,
      nodeChainAnnotations,
      pruneDistanceSession,
      pruneMeasurementDraftSession,
      pruneSelectionByRemovedIds,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setDistanceRelations,
      setNodeChainAnnotations,
    ]
  );

  const deletePolygonAnnotationById = useCallback(
    (id: string) => {
      const group = nodeChainAnnotations.find((entry) => entry.id === id);
      if (!group) {
        return;
      }

      const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
        Boolean(nodeId)
      );
      if (nodeIds.length === 0) {
        return;
      }

      clearAnnotationsByIds(nodeIds);
    },
    [clearAnnotationsByIds, nodeChainAnnotations]
  );

  const deleteAnnotationsByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedNodeChainAnnotations = nodeChainAnnotations.filter(
        (group) => requestedIdSet.has(group.id)
      );
      const expandedAnnotationIdSet = new Set<string>(
        ids.filter(
          (id) =>
            !lockedAnnotationIdSet.has(id) &&
            !targetedNodeChainAnnotations.some((group) => group.id === id)
        )
      );

      targetedNodeChainAnnotations.forEach((group) => {
        group.nodeIds.forEach((nodeId) => {
          if (!lockedAnnotationIdSet.has(nodeId)) {
            expandedAnnotationIdSet.add(nodeId);
          }
        });
      });

      clearAnnotationsByIds([...expandedAnnotationIdSet]);
    },
    [clearAnnotationsByIds, lockedAnnotationIdSet, nodeChainAnnotations]
  );

  const deleteSelectedAnnotations = useCallback(() => {
    const selectedIds = selectedAnnotationIds.filter(
      (id) => selectableAnnotationIds.has(id) && !lockedAnnotationIdSet.has(id)
    );
    if (selectedIds.length > 0) {
      clearAnnotationsByIds(selectedIds);
      return;
    }
    if (
      selectedAnnotationId &&
      selectableAnnotationIds.has(selectedAnnotationId) &&
      !lockedAnnotationIdSet.has(selectedAnnotationId)
    ) {
      clearAnnotationsByIds([selectedAnnotationId]);
    }
  }, [
    clearAnnotationsByIds,
    lockedAnnotationIdSet,
    selectableAnnotationIds,
    selectedAnnotationId,
    selectedAnnotationIds,
  ]);

  return {
    clearAnnotationsByIds,
    deletePolygonAnnotationById,
    deleteAnnotationsByIds,
    deleteSelectedAnnotations,
  };
};
