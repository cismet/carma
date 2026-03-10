import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  type DistanceRelationRenderContext,
  getDistanceRelationId,
  getPlanarSharedEdgeRelationIds,
  getSplitMarkerRelationIds,
  getSplitMarkerRelationIdsByKind,
  getSplitMarkerRelationIdsByKindForGroups,
  getSplitMarkerRelationIdsForGroups,
  type PlanarMeasurementGroup,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

const VERTICAL_OPPOSING_EDGE_LABEL_EPSILON_METERS = 0.01;

export const buildEdgeRelationRenderContext = ({
  planarPolygonGroups,
  focusedPlanarMeasurementId,
  activePlanarMeasurementId,
  pointsById,
}: {
  planarPolygonGroups: readonly PlanarMeasurementGroup[];
  focusedPlanarMeasurementId?: string | null;
  activePlanarMeasurementId?: string | null;
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
}): DistanceRelationRenderContext => {
  const editableLineRelationIdsByKind =
    getSplitMarkerRelationIdsByKind(planarPolygonGroups);
  const polygonEdgeRelationIds = getSplitMarkerRelationIds(planarPolygonGroups);
  const planarPolygonSharedEdgeRelationIds =
    getPlanarSharedEdgeRelationIds(planarPolygonGroups);

  const activeOrSelectedGroupIds = new Set<string>();
  if (focusedPlanarMeasurementId) {
    activeOrSelectedGroupIds.add(focusedPlanarMeasurementId);
  }
  if (activePlanarMeasurementId) {
    activeOrSelectedGroupIds.add(activePlanarMeasurementId);
  }

  const midpointTickRelationIds = getSplitMarkerRelationIdsForGroups(
    planarPolygonGroups,
    activeOrSelectedGroupIds
  );
  const selectedOrActiveEditableLineRelationIdsByKind =
    getSplitMarkerRelationIdsByKindForGroups(
      planarPolygonGroups,
      activeOrSelectedGroupIds
    );

  const focusedGroupId =
    focusedPlanarMeasurementId ?? activePlanarMeasurementId ?? null;
  const focusedGroup = focusedGroupId
    ? planarPolygonGroups.find((group) => group.id === focusedGroupId) ?? null
    : null;
  const focusedRelationIds = new Set(focusedGroup?.edgeRelationIds ?? []);

  const selectedOrActiveOpenPolylineRelationIds =
    selectedOrActiveEditableLineRelationIdsByKind.polyline;

  const duplicateVerticalOpposingRelationIds = new Set<string>();
  planarPolygonGroups.forEach((group) => {
    if (!group.closed) return;
    if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) return;
    if (group.vertexPointIds.length !== 4) return;

    const [point0Id, point1Id, point2Id, point3Id] = group.vertexPointIds;
    if (!point0Id || !point1Id || !point2Id || !point3Id) return;

    const point0 = pointsById.get(point0Id)?.geometryECEF;
    const point1 = pointsById.get(point1Id)?.geometryECEF;
    const point2 = pointsById.get(point2Id)?.geometryECEF;
    const point3 = pointsById.get(point3Id)?.geometryECEF;
    if (!point0 || !point1 || !point2 || !point3) return;

    const length01 = Cartesian3.distance(point0, point1);
    const length23 = Cartesian3.distance(point2, point3);
    if (
      Math.abs(length01 - length23) <=
      VERTICAL_OPPOSING_EDGE_LABEL_EPSILON_METERS
    ) {
      duplicateVerticalOpposingRelationIds.add(
        getDistanceRelationId(point2Id, point3Id)
      );
    }

    const length12 = Cartesian3.distance(point1, point2);
    const length30 = Cartesian3.distance(point3, point0);
    if (
      Math.abs(length12 - length30) <=
      VERTICAL_OPPOSING_EDGE_LABEL_EPSILON_METERS
    ) {
      duplicateVerticalOpposingRelationIds.add(
        getDistanceRelationId(point3Id, point0Id)
      );
    }
  });

  return {
    editableLineRelationIdsByKind,
    selectedOrActiveEditableLineRelationIdsByKind,
    polygonEdgeRelationIds,
    planarPolygonSharedEdgeRelationIds,
    midpointTickRelationIds,
    focusedRelationIds,
    selectedOrActiveOpenPolylineRelationIds,
    duplicateVerticalOpposingRelationIds,
  };
};
