import {
  Cartesian3,
  getDegreesFromCartesian,
  getPositionWithVerticalOffsetFromAnchor,
} from "@carma/cesium";

import { getDistanceRelationId } from "./measurementRelations";
import { ANNOTATION_TYPE_POLYLINE } from "../types/annotationTypes";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "../types/annotationCesiumTypes";
import type { DerivedPolylinePath } from "../types/derivedPolylinePath";
import type {
  PlanarMeasurementGroup,
  PlanarPolylineGroup,
} from "../types/planarTypes";

const getPolylineComputationPointPositionMap = (
  annotations: AnnotationCollection,
  useOffsetAnchors: boolean
) => {
  const map = new Map<string, Cartesian3>();

  annotations.forEach((measurement) => {
    if (!isPointAnnotationEntry(measurement)) {
      return;
    }

    if (useOffsetAnchors && measurement.verticalOffsetAnchorECEF) {
      map.set(
        measurement.id,
        new Cartesian3(
          measurement.verticalOffsetAnchorECEF.x,
          measurement.verticalOffsetAnchorECEF.y,
          measurement.verticalOffsetAnchorECEF.z
        )
      );
      return;
    }

    map.set(measurement.id, measurement.geometryECEF);
  });

  return map;
};

export const buildDerivedPolylinePath = (
  group: PlanarPolylineGroup,
  pointById: ReadonlyMap<string, Cartesian3>,
  verticalOffsetMeters: number = 0
): DerivedPolylinePath | null => {
  if (group.closed || group.vertexPointIds.length < 2) {
    return null;
  }

  const applyGroupVerticalOffset = (position: Cartesian3) =>
    Math.abs(verticalOffsetMeters) > 1e-9
      ? getPositionWithVerticalOffsetFromAnchor(position, verticalOffsetMeters)
      : position;

  const segmentLengthsMeters: number[] = [];
  const segmentLengthsCumulativeMeters: number[] = [0];
  const vertexHeightsMeters = group.vertexPointIds.map((pointId) => {
    const point = pointById.get(pointId);
    if (!point) {
      return 0;
    }

    const pointWGS84 = getDegreesFromCartesian(applyGroupVerticalOffset(point));
    return pointWGS84.altitude ?? 0;
  });
  let totalLengthMeters = 0;
  const edgeRelationIds: string[] = [];

  for (let index = 0; index < group.vertexPointIds.length - 1; index += 1) {
    const startId = group.vertexPointIds[index];
    const endId = group.vertexPointIds[index + 1];
    if (!startId || !endId) {
      continue;
    }

    const start = pointById.get(startId);
    const end = pointById.get(endId);
    if (!start || !end) {
      continue;
    }

    const segmentLength = Cartesian3.distance(
      applyGroupVerticalOffset(start),
      applyGroupVerticalOffset(end)
    );
    segmentLengthsMeters.push(segmentLength);
    totalLengthMeters += segmentLength;
    segmentLengthsCumulativeMeters.push(totalLengthMeters);
    edgeRelationIds.push(getDistanceRelationId(startId, endId));
  }

  if (segmentLengthsMeters.length === 0) {
    return null;
  }

  const hasStartPoint =
    !!group.distanceMeasurementStartPointId &&
    group.vertexPointIds.includes(group.distanceMeasurementStartPointId);

  return {
    id: group.id,
    name: group.name,
    vertexPointIds: [...group.vertexPointIds],
    edgeRelationIds,
    distanceMeasurementStartPointId: hasStartPoint
      ? group.distanceMeasurementStartPointId ?? null
      : group.vertexPointIds[0] ?? null,
    vertexHeightsMeters,
    segmentLengthsMeters,
    segmentLengthsCumulativeMeters,
    totalLengthMeters,
  };
};

export const buildDerivedPolylinePaths = ({
  annotations,
  planarPolygonGroups,
  defaultVerticalOffsetMeters,
  useOffsetAnchors,
}: {
  annotations: AnnotationCollection;
  planarPolygonGroups: readonly PlanarMeasurementGroup[];
  defaultVerticalOffsetMeters: number;
  useOffsetAnchors: boolean;
}): DerivedPolylinePath[] => {
  const pointById = getPolylineComputationPointPositionMap(
    annotations,
    useOffsetAnchors
  );

  return planarPolygonGroups
    .filter(
      (group): group is PlanarPolylineGroup =>
        group.type === ANNOTATION_TYPE_POLYLINE
    )
    .map((group) =>
      buildDerivedPolylinePath(
        group,
        pointById,
        group.verticalOffsetMeters ?? defaultVerticalOffsetMeters
      )
    )
    .filter((polyline): polyline is DerivedPolylinePath => Boolean(polyline));
};
