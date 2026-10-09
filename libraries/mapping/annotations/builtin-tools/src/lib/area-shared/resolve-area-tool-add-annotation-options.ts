import { Vector3 } from "three";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  ecefFromGeographicCoordinate,
  type NodeChainAnnotation,
  type PolygonType,
} from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  type AnnotationToolAddAnnotationContext,
} from "@carma-mapping/annotations/runtime";

const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

export const resolveAreaToolAddAnnotationOptions = ({
  annotationType,
  engine,
  coordinates,
  options,
}: AnnotationToolAddAnnotationContext) => {
  if (coordinates.length < 3) {
    return options;
  }

  const polygonType = annotationType as PolygonType;
  const pointById = new Map(
    coordinates.map(
      (coordinate, index) =>
        [
          `area-node-${index}`,
          ecefFromGeographicCoordinate(coordinate),
        ] as const
    )
  );
  const preferredFacingPositionECEF = !isValidAnnotationEngine(engine)
    ? null
    : engine.getCameraPositionECEF(new Vector3());
  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: "area-preview",
      type: polygonType,
      nodeIds: coordinates.map((_, index) => `area-node-${index}`),
      edgeRelationIds: [],
      closed: true,
      planeLocked: polygonType !== ANNOTATION_TYPE_AREA_GROUND,
    } satisfies NodeChainAnnotation,
    pointById,
    {
      preferredFacingPositionECEF,
    }
  );

  return {
    ...options,
    closed: true,
    preferredNormalBearingRad: derivedMeasurement.bearingRad,
  };
};
