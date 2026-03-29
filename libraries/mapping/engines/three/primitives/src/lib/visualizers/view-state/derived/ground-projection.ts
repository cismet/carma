import { buildCirclePoints, clipConvexPolygonByPlanes3d } from "@carma/math";
import { Plane, Vector3 } from "three";

const GROUND_PLANE_NORMAL = new Vector3(0, 1, 0);
const GROUND_PROJECTION_DISK_SEGMENT_COUNT = 128;

const computeGroundPolygonAreaXZ = (polygon: readonly Vector3[]): number => {
  if (polygon.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    areaTwice += current.x * next.z - next.x * current.z;
  }

  return Math.abs(areaTwice) * 0.5;
};

const buildGroundDiskPolygon = (radius: number): Vector3[] =>
  buildCirclePoints(radius, GROUND_PROJECTION_DISK_SEGMENT_COUNT).map(
    (point) => new Vector3(point.x, 0, point.y)
  );

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

const finalizeGroundProjection = ({
  polygon,
  epsilon,
}: {
  polygon: Vector3[];
  epsilon: number;
}): Vector3[] | null => {
  const areaXZ = computeGroundPolygonAreaXZ(polygon);
  const renderable = polygon.length >= 3 && areaXZ > epsilon;

  return renderable ? polygon : null;
};

export const buildGroundProjectionFromClipPlanes = ({
  radius,
  clipPlanes,
  epsilon,
}: {
  radius: number;
  clipPlanes: readonly Plane[];
  epsilon: number;
}) =>
  finalizeGroundProjection({
    polygon: clipConvexPolygonByPlanes3d(
      buildGroundDiskPolygon(radius),
      clipPlanes,
      { epsilon }
    ),
    epsilon,
  });

export const buildOrthographicFrustumClipPlanes = ({
  tangentPlaneCorners,
  imagePlaneCenter,
  forward,
  near,
  far,
  epsilon,
}: {
  tangentPlaneCorners: [Vector3, Vector3, Vector3, Vector3];
  imagePlaneCenter: Vector3;
  forward: Vector3;
  near?: number;
  far?: number;
  epsilon: number;
}): Plane[] => {
  const edgeIndices: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  const resolvedForward = forward.clone();
  if (resolvedForward.lengthSq() <= epsilon * epsilon) {
    return [];
  }
  resolvedForward.normalize();

  const depthClipPlanes = [
    createPlaneFromOriginAndNormal({
      origin: imagePlaneCenter
        .clone()
        .add(
          resolvedForward
            .clone()
            .multiplyScalar(typeof near === "number" ? near : 0)
        ),
      normal: resolvedForward,
    }),
    ...(typeof far === "number" && far > epsilon
      ? [
          createPlaneFromOriginAndNormal({
            origin: imagePlaneCenter
              .clone()
              .add(resolvedForward.clone().multiplyScalar(far)),
            normal: resolvedForward.clone().negate(),
          }),
        ]
      : []),
  ];

  return [
    ...depthClipPlanes,
    ...edgeIndices
      .map(([startIndex, endIndex]) =>
        orientPlaneTowardInsidePoint({
          origin: tangentPlaneCorners[startIndex]!,
          normal: tangentPlaneCorners[endIndex]!.clone()
            .sub(tangentPlaneCorners[startIndex]!)
            .cross(resolvedForward),
          insidePoint: imagePlaneCenter,
          epsilon,
        })
      )
      .filter((plane): plane is Plane => plane !== null),
  ];
};

export const buildOrthographicGroundProjectionClipPlanes = ({
  projectedCorners,
  imagePlaneCenter,
  forward,
  near,
  far,
  epsilon,
}: {
  projectedCorners: [Vector3, Vector3, Vector3, Vector3];
  imagePlaneCenter: Vector3;
  forward: Vector3;
  near?: number;
  far?: number;
  epsilon: number;
}): Plane[] => {
  const edgeIndices: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  const insidePoint = projectedCorners
    .reduce((sum, point) => sum.add(point.clone()), new Vector3())
    .multiplyScalar(1 / projectedCorners.length);
  const resolvedForward = forward.clone();
  if (resolvedForward.lengthSq() <= epsilon * epsilon) {
    return [];
  }
  resolvedForward.normalize();

  return edgeIndices
    .map(([startIndex, endIndex]) =>
      orientPlaneTowardInsidePoint({
        origin: projectedCorners[startIndex]!,
        normal: projectedCorners[endIndex]!.clone()
          .sub(projectedCorners[startIndex]!)
          .cross(GROUND_PLANE_NORMAL),
        insidePoint,
        epsilon,
      })
    )
    .filter((plane): plane is Plane => plane !== null)
    .concat(
      typeof near === "number"
        ? [
            createPlaneFromOriginAndNormal({
              origin: imagePlaneCenter
                .clone()
                .add(resolvedForward.clone().multiplyScalar(near)),
              normal: resolvedForward.clone(),
            }),
          ]
        : []
    )
    .concat(
      typeof far === "number" && far > epsilon
        ? [
            createPlaneFromOriginAndNormal({
              origin: imagePlaneCenter
                .clone()
                .add(resolvedForward.clone().multiplyScalar(far)),
              normal: resolvedForward.clone().negate(),
            }),
          ]
        : []
    );
};
