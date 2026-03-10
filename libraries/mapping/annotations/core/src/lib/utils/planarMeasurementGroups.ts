import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
} from "../types/annotationTypes";
import type {
  PlanarMeasurementGroup,
  PlanarPolylineGroup,
  PlanarPolygonGroup,
} from "../types/planarTypes";

export type PlanarMeasurementGroupsByType = {
  polylineGroups: PlanarPolylineGroup[];
  areaPolygonGroups: PlanarPolygonGroup[];
  planarSurfacePolygonGroups: PlanarPolygonGroup[];
  verticalPolygonGroups: PlanarPolygonGroup[];
};

export const groupPlanarMeasurementGroupsByType = (
  groups: readonly PlanarMeasurementGroup[]
): PlanarMeasurementGroupsByType => {
  const grouped: PlanarMeasurementGroupsByType = {
    polylineGroups: [],
    areaPolygonGroups: [],
    planarSurfacePolygonGroups: [],
    verticalPolygonGroups: [],
  };

  groups.forEach((group) => {
    if (group.type === ANNOTATION_TYPE_POLYLINE) {
      grouped.polylineGroups.push(group);
      return;
    }
    if (group.type === ANNOTATION_TYPE_AREA_GROUND) {
      grouped.areaPolygonGroups.push(group);
      return;
    }
    if (group.type === ANNOTATION_TYPE_AREA_PLANAR) {
      grouped.planarSurfacePolygonGroups.push(group);
      return;
    }
    if (group.type === ANNOTATION_TYPE_AREA_VERTICAL) {
      grouped.verticalPolygonGroups.push(group);
    }
  });

  return grouped;
};

export const getConnectedOpenPolylineGroupIds = (
  groups: readonly PlanarMeasurementGroup[],
  startGroupId: string
) => {
  const openGroups = groups.filter(
    (group): group is PlanarPolylineGroup =>
      !group.closed && group.type === ANNOTATION_TYPE_POLYLINE
  );
  const startGroup = openGroups.find((group) => group.id === startGroupId);
  if (!startGroup) {
    return new Set<string>();
  }

  const groupById = new Map(openGroups.map((group) => [group.id, group]));
  const vertexIdsByGroupId = new Map(
    openGroups.map((group) => [group.id, new Set(group.vertexPointIds)])
  );

  const connectedIds = new Set<string>();
  const queue: string[] = [startGroupId];

  while (queue.length > 0) {
    const groupId = queue.shift();
    if (!groupId || connectedIds.has(groupId)) {
      continue;
    }

    const currentVertices = vertexIdsByGroupId.get(groupId);
    if (!currentVertices) {
      continue;
    }

    connectedIds.add(groupId);

    groupById.forEach((candidateGroup, candidateId) => {
      if (connectedIds.has(candidateId)) {
        return;
      }

      const candidateVertices = vertexIdsByGroupId.get(candidateId);
      if (!candidateVertices) {
        return;
      }

      const sharesVertex = Array.from(currentVertices).some((vertexId) =>
        candidateVertices.has(vertexId)
      );
      if (sharesVertex) {
        queue.push(candidateGroup.id);
      }
    });
  }

  return connectedIds;
};
