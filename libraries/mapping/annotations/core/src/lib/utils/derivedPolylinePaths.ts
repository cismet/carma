import {
  Cartesian3,
  getDegreesFromCartesian,
  getPositionWithVerticalOffsetFromAnchor,
} from "@carma/cesium";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "../types/annotationCesiumTypes";
import { ANNOTATION_TYPE_POLYLINE } from "../types/annotationTypes";
import type { NodeChainAnnotation } from "../types/annotationTypes";
import type { DerivedPolylinePath } from "../types/derivedPolylinePath";
import { getDistanceRelationId } from "./measurementRelations";
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
  group: NodeChainAnnotation,
  pointById: ReadonlyMap<string, Cartesian3>,
  verticalOffsetMeters: number = 0
): DerivedPolylinePath | null => {
  if (group.closed || group.nodeIds.length < 2) {
    return null;
  }

  const applyGroupVerticalOffset = (position: Cartesian3) =>
    Math.abs(verticalOffsetMeters) > 1e-9
      ? getPositionWithVerticalOffsetFromAnchor(position, verticalOffsetMeters)
      : position;

  const segmentLengthsMeters: number[] = [];
  const segmentLengthsCumulativeMeters: number[] = [0];
  const nodeHeightsMeters = group.nodeIds.map((pointId) => {
    const point = pointById.get(pointId);
    if (!point) {
      return 0;
    }

    const pointWGS84 = getDegreesFromCartesian(applyGroupVerticalOffset(point));
    return pointWGS84.altitude ?? 0;
  });
  let totalLengthMeters = 0;
  const edgeRelationIds: string[] = [];

  for (let index = 0; index < group.nodeIds.length - 1; index += 1) {
    const startId = group.nodeIds[index];
    const endId = group.nodeIds[index + 1];
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
    group.nodeIds.includes(group.distanceMeasurementStartPointId);

  return {
    id: group.id,
    name: group.name,
    nodeIds: [...group.nodeIds],
    edgeRelationIds,
    distanceMeasurementStartPointId: hasStartPoint
      ? group.distanceMeasurementStartPointId ?? null
      : group.nodeIds[0] ?? null,
    nodeHeightsMeters,
    segmentLengthsMeters,
    segmentLengthsCumulativeMeters,
    totalLengthMeters,
  };
};

export const buildDerivedPolylinePaths = ({
  annotations,
  nodeChainAnnotations,
  defaultVerticalOffsetMeters,
  useOffsetAnchors,
}: {
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  defaultVerticalOffsetMeters: number;
  useOffsetAnchors: boolean;
}): DerivedPolylinePath[] => {
  const pointById = getPolylineComputationPointPositionMap(
    annotations,
    useOffsetAnchors
  );

  return nodeChainAnnotations
    .filter(
      (group): group is NodeChainAnnotation =>
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
