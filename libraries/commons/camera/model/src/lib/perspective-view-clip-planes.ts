import { Plane, Vector3 } from "three";

import { isFiniteNumber } from "@carma-commons/math";
const createPlaneFromOriginAndNormal = ({
  origin,
  normal,
}: {
  origin: Vector3;
  normal: Vector3;
}): Plane => new Plane().setFromNormalAndCoplanarPoint(normal.clone(), origin);

const orientPlaneTowardInsidePoint = ({
  origin,
  normal,
  insidePoint,
  epsilon,
}: {
  origin: Vector3;
  normal: Vector3;
  insidePoint: Vector3;
  epsilon: number;
}): Plane | null => {
  if (normal.lengthSq() <= epsilon * epsilon) {
    return null;
  }

  const plane = createPlaneFromOriginAndNormal({
    origin,
    normal: normal.clone().normalize(),
  });
  if (plane.distanceToPoint(insidePoint) < 0) {
    plane.negate();
  }

  return plane;
};

export const createPerspectiveViewClipPlanes3 = ({
  apex,
  forward,
  up,
  fovHorizontalRad,
  fovVerticalRad,
  near,
  far,
  epsilon = 0,
}: {
  apex: Vector3;
  forward: Vector3;
  up: Vector3;
  fovHorizontalRad: number;
  fovVerticalRad: number;
  near?: number;
  far?: number;
  epsilon?: number;
}): Plane[] => {
  const resolvedForward = forward.clone();
  if (resolvedForward.lengthSq() <= epsilon * epsilon) {
    return [];
  }
  resolvedForward.normalize();

  const resolvedRight = resolvedForward.clone().cross(up);
  if (resolvedRight.lengthSq() <= epsilon * epsilon) {
    return [];
  }
  resolvedRight.normalize();

  const resolvedUp = resolvedRight.clone().cross(resolvedForward);
  if (resolvedUp.lengthSq() <= epsilon * epsilon) {
    return [];
  }
  resolvedUp.normalize();

  const horizontalScale = Math.tan(fovHorizontalRad * 0.5);
  const verticalScale = Math.tan(fovVerticalRad * 0.5);
  const boundaryRays = [
    resolvedForward
      .clone()
      .add(resolvedRight.clone().multiplyScalar(horizontalScale))
      .add(resolvedUp.clone().multiplyScalar(verticalScale))
      .normalize(),
    resolvedForward
      .clone()
      .add(resolvedRight.clone().multiplyScalar(-horizontalScale))
      .add(resolvedUp.clone().multiplyScalar(verticalScale))
      .normalize(),
    resolvedForward
      .clone()
      .add(resolvedRight.clone().multiplyScalar(-horizontalScale))
      .add(resolvedUp.clone().multiplyScalar(-verticalScale))
      .normalize(),
    resolvedForward
      .clone()
      .add(resolvedRight.clone().multiplyScalar(horizontalScale))
      .add(resolvedUp.clone().multiplyScalar(-verticalScale))
      .normalize(),
  ] as const;

  const insideDirection = boundaryRays.reduce(
    (sum, ray) => sum.add(ray),
    new Vector3()
  );
  if (insideDirection.lengthSq() <= epsilon * epsilon) {
    return [];
  }

  const clipPlanes = boundaryRays
    .map((startRay, startIndex) =>
      orientPlaneTowardInsidePoint({
        origin: apex,
        normal: startRay
          .clone()
          .cross(boundaryRays[(startIndex + 1) % boundaryRays.length]!),
        insidePoint: apex.clone().add(insideDirection.clone().normalize()),
        epsilon,
      })
    )
    .filter((plane): plane is Plane => plane !== null);

  if (isFiniteNumber(near) && near > epsilon) {
    clipPlanes.unshift(
      createPlaneFromOriginAndNormal({
        origin: apex.clone().add(resolvedForward.clone().multiplyScalar(near)),
        normal: resolvedForward.clone(),
      })
    );
  }

  if (isFiniteNumber(far) && far > epsilon) {
    clipPlanes.push(
      createPlaneFromOriginAndNormal({
        origin: apex.clone().add(resolvedForward.clone().multiplyScalar(far)),
        normal: resolvedForward.clone().negate(),
      })
    );
  }

  return clipPlanes;
};
