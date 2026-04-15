import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

export type TangentDiscSamplePlane = {
  pointECEF: Cartesian3;
  normalECEF: Cartesian3;
};

export const resolveTangentDiscPlaneReprojectedWorldPosition = ({
  scene,
  screenPosition,
  tangentPlane,
}: {
  scene: Scene;
  screenPosition: Cartesian2;
  tangentPlane: TangentDiscSamplePlane | null;
}): Cartesian3 | null => {
  if (!tangentPlane) {
    return null;
  }

  const pickRay = scene.camera.getPickRay(screenPosition);
  if (!pickRay) {
    return null;
  }

  const planeNormal = Cartesian3.normalize(
    tangentPlane.normalECEF,
    new Cartesian3()
  );
  const denominator = Cartesian3.dot(pickRay.direction, planeNormal);
  if (Math.abs(denominator) <= 1e-6) {
    return null;
  }

  const originToPlane = Cartesian3.subtract(
    tangentPlane.pointECEF,
    pickRay.origin,
    new Cartesian3()
  );
  const t = Cartesian3.dot(originToPlane, planeNormal) / denominator;
  if (!Number.isFinite(t) || t <= 0) {
    return null;
  }

  return Cartesian3.add(
    pickRay.origin,
    Cartesian3.multiplyByScalar(pickRay.direction, t, new Cartesian3()),
    new Cartesian3()
  );
};
