import type {
  AnnotationGeometryEdge,
  PolygonAnnotationVertex,
} from "../types/annotationPersistenceTypes";
import type { NodeChainAnnotation } from "../types/annotationTypes";
import type { PointDistanceRelation } from "../types/distanceRelation";
export const getMeasurementEdgeId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `edge:${left}:${right}`;
};

export const getDistanceRelationId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `distance-relation:${left}:${right}`;
};

export const withDistanceRelationEdgeId = (
  relation: PointDistanceRelation
): PointDistanceRelation => ({
  ...relation,
  edgeId:
    relation.edgeId && relation.edgeId.length > 0
      ? relation.edgeId
      : getMeasurementEdgeId(relation.pointAId, relation.pointBId),
});

export const isSameDistanceRelationPair = (
  relation: PointDistanceRelation,
  pointAId: string,
  pointBId: string
) =>
  (relation.pointAId === pointAId && relation.pointBId === pointBId) ||
  (relation.pointAId === pointBId && relation.pointBId === pointAId);

export const buildPolygonGroupVertexTable = (
  groups: readonly NodeChainAnnotation[]
): PolygonAnnotationVertex[] =>
  groups.flatMap((group) =>
    group.nodeIds.map((pointId, order) => ({
      id: `${group.id}:${order}`,
      groupId: group.id,
      pointId,
      order,
    }))
  );

export const buildGeometryEdgeTable = (
  relations: readonly PointDistanceRelation[],
  groups: readonly NodeChainAnnotation[]
): AnnotationGeometryEdge[] => {
  const byEdgeId = new Map<string, AnnotationGeometryEdge>();

  relations.forEach((relation) => {
    const edgeId =
      relation.edgeId && relation.edgeId.length > 0
        ? relation.edgeId
        : getMeasurementEdgeId(relation.pointAId, relation.pointBId);
    if (!byEdgeId.has(edgeId)) {
      byEdgeId.set(edgeId, {
        id: edgeId,
        pointAId: relation.pointAId,
        pointBId: relation.pointBId,
      });
    }
  });

  groups.forEach((group) => {
    const nodeIds = group.nodeIds;
    if (nodeIds.length < 2) return;

    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      const pointAId = nodeIds[index];
      const pointBId = nodeIds[index + 1];
      if (!pointAId || !pointBId) continue;
      const edgeId = getMeasurementEdgeId(pointAId, pointBId);
      if (!byEdgeId.has(edgeId)) {
        byEdgeId.set(edgeId, { id: edgeId, pointAId, pointBId });
      }
    }

    if (group.closed && nodeIds.length >= 3) {
      const pointAId = nodeIds[nodeIds.length - 1];
      const pointBId = nodeIds[0];
      if (!pointAId || !pointBId) return;
      const edgeId = getMeasurementEdgeId(pointAId, pointBId);
      if (!byEdgeId.has(edgeId)) {
        byEdgeId.set(edgeId, { id: edgeId, pointAId, pointBId });
      }
    }
  });

  return Array.from(byEdgeId.values());
};
