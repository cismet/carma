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
  const nodeIdsByGroupId = new Map(
    openGroups.map((group) => [group.id, new Set(group.nodeIds)])
  );

  const connectedIds = new Set<string>();
  const queue: string[] = [startGroupId];

  while (queue.length > 0) {
    const groupId = queue.shift();
    if (!groupId || connectedIds.has(groupId)) {
      continue;
    }

    const currentNodes = nodeIdsByGroupId.get(groupId);
    if (!currentNodes) {
      continue;
    }

    connectedIds.add(groupId);

    groupById.forEach((candidateGroup, candidateId) => {
      if (connectedIds.has(candidateId)) {
        return;
      }

      const candidateNodes = nodeIdsByGroupId.get(candidateId);
      if (!candidateNodes) {
        return;
      }

      const sharesNode = Array.from(currentNodes).some((nodeId) =>
        candidateNodes.has(nodeId)
      );
      if (sharesNode) {
        queue.push(candidateGroup.id);
      }
    });
  }

  return connectedIds;
};
