import { Vector3 } from "three";

import type { AnnotationEngine, AnnotationScreenPosition } from "../engine";

export type TangentDiscSamplePlane = {
  pointECEF: Vector3;
  normalECEF: Vector3;
};

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

  const planeNormal = tangentPlane.normalECEF.clone().normalize();
  const denominator = pickRay.direction.dot(planeNormal);
  if (Math.abs(denominator) <= 1e-6) {
    return null;
  }

  const originToPlane = new Vector3().subVectors(
    tangentPlane.pointECEF,
    pickRay.origin
  );
  const t = originToPlane.dot(planeNormal) / denominator;
  if (!Number.isFinite(t) || t <= 0) {
    return null;
  }

  return pickRay.origin.clone().addScaledVector(pickRay.direction, t);
};
