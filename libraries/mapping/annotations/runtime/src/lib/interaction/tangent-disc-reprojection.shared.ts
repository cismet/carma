import { Plane, Ray, Vector3 } from "three";
import { intersectRayWithPlane } from "@carma-commons/math";

import type { AnnotationEngine, AnnotationScreenPosition } from "../engine";

export type TangentDiscSamplePlane = {
  pointECEF: Vector3;
  normalECEF: Vector3;
};

/** The pick ray's hit on the tangent plane; null when parallel or behind the camera. */
export const resolveTangentDiscPlaneReprojectedWorldPosition = ({
  engine,
  screenPosition,
  tangentPlane,
}: {
  engine: AnnotationEngine;
  screenPosition: AnnotationScreenPosition;
  tangentPlane: TangentDiscSamplePlane | null;
}): Vector3 | null => {
  if (!tangentPlane) {
    return null;
  }

  const pickRay = engine.getPickRay(screenPosition);
  if (!pickRay) {
    return null;
  }

  const plane = new Plane().setFromNormalAndCoplanarPoint(
    tangentPlane.normalECEF.clone().normalize(),
    tangentPlane.pointECEF
  );
  const hit = intersectRayWithPlane(
    new Ray(pickRay.origin, pickRay.direction),
    plane
  );
  if (!hit) {
    return null;
  }

  const isAheadOfRay =
    pickRay.direction.dot(new Vector3().subVectors(hit, pickRay.origin)) > 0;
  return isAheadOfRay ? hit : null;
};
