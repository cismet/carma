import { Cartesian3 } from "@carma/cesium";
import {
  getRoofSharedEdgeRelationIds,
  getSplitMarkerRelationIds,
  getSplitMarkerRelationIdsByKind,
  getSplitMarkerRelationIdsByKindForGroups,
  getSplitMarkerRelationIdsForGroups,
  type EditableLineRelationIdsByKind,
} from "@carma-mapping/annotations/core";

import {
  type PlanarPolygonGroup,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";

const FACADE_OPPOSING_EDGE_LABEL_EPSILON_METERS = 0.01;

const getDistanceRelationId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `distance-relation:${left}:${right}`;
};

export type DistanceRelationRenderContext = {
  editableLineRelationIdsByKind: EditableLineRelationIdsByKind;
  selectedOrActiveEditableLineRelationIdsByKind: EditableLineRelationIdsByKind;
  polygonEdgeRelationIds: ReadonlySet<string>;
  planarPolygonSharedEdgeRelationIds: ReadonlySet<string>;
  midpointTickRelationIds: ReadonlySet<string>;
  focusedRelationIds: ReadonlySet<string>;
  selectedOrActiveOpenPolylineRelationIds: ReadonlySet<string>;
  duplicateFacadeOpposingRelationIds: ReadonlySet<string>;
};

export const buildDistanceRelationRenderContext = ({
  planarPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  pointsById,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId?: string | null;
  activePlanarPolygonGroupId?: string | null;
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
}): DistanceRelationRenderContext => {
  const editableLineRelationIdsByKind =
    getSplitMarkerRelationIdsByKind(planarPolygonGroups);
  const polygonEdgeRelationIds = getSplitMarkerRelationIds(planarPolygonGroups);
  const planarPolygonSharedEdgeRelationIds =
    getRoofSharedEdgeRelationIds(planarPolygonGroups);

  const activeOrSelectedGroupIds = new Set<string>();
  if (selectedPlanarPolygonGroupId) {
    activeOrSelectedGroupIds.add(selectedPlanarPolygonGroupId);
  }
  if (activePlanarPolygonGroupId) {
    activeOrSelectedGroupIds.add(activePlanarPolygonGroupId);
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
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId ?? null;
  const focusedGroup = focusedGroupId
    ? planarPolygonGroups.find((group) => group.id === focusedGroupId) ?? null
    : null;
  const focusedRelationIds = new Set(focusedGroup?.edgeRelationIds ?? []);

  const selectedOrActiveOpenPolylineRelationIds =
    selectedOrActiveEditableLineRelationIdsByKind.polyline;

  const duplicateFacadeOpposingRelationIds = new Set<string>();
  planarPolygonGroups.forEach((group) => {
    if (!group.closed) return;
    if ((group.surfaceType ?? "roof") !== "facade") return;
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
      Math.abs(length01 - length23) <= FACADE_OPPOSING_EDGE_LABEL_EPSILON_METERS
    ) {
      duplicateFacadeOpposingRelationIds.add(
        getDistanceRelationId(point2Id, point3Id)
      );
    }

    const length12 = Cartesian3.distance(point1, point2);
    const length30 = Cartesian3.distance(point3, point0);
    if (
      Math.abs(length12 - length30) <= FACADE_OPPOSING_EDGE_LABEL_EPSILON_METERS
    ) {
      duplicateFacadeOpposingRelationIds.add(
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
    duplicateFacadeOpposingRelationIds,
  };
};
