import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  type NodeChainAnnotation,
  type PolygonType,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";

import type { AnnotationToolAddAnnotationContext } from "@carma-mapping/annotations/runtime";

const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: AnnotationToolAddAnnotationContext["coordinates"][number]): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

export const resolveAreaToolAddAnnotationOptions = ({
  annotationType,
  scene,
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
          cartesianFromRuntimeCoordinate(coordinate),
        ] as const
    )
  );
  const preferredFacingPositionECEF =
    !scene || scene.isDestroyed()
      ? null
      : Cartesian3.clone(scene.camera.positionWC);
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
