import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  Matrix4,
  Transforms,
} from "../cesium";
import { cartesian3FromJson, type Cartesian3Json } from "../serialization";
const PLANAR_TRANSFORM_ELEMENTS = new Array<number>(16);
const BASIS_SCALE_TRANSLATION_ELEMENTS = new Array<number>(16);
const EAST_NORTH_UP_TRANSFORM_SCRATCH = new Matrix4();
const WORLD_TO_ENU_TRANSFORM_SCRATCH = new Matrix4();
const EAST_NORTH_UP_POINT_SCRATCH = new Cartesian3();
const DIRECTION_EPSILON = 1e-12;
const ARC_POINT_EPSILON_METERS = 0.001;
const HPR_ROUNDTRIP_MAX_ITERATIONS = 12;
const HPR_ROUNDTRIP_EPSILON_METERS = 0.001;

export type EastNorthUpOffset = {
  east: number;
  north: number;
  up: number;
};

export type CartographicHeadingPitchRange = {
  cartographic: Cartographic;
  headingPitchRange: HeadingPitchRange;
};

export type CartographicHeadingPitchRangePoints = {
  cameraPositionECEF: Cartesian3;
  referencePointECEF: Cartesian3;
};

export type LocalFrameJson = {
  originECEF: Cartesian3Json;
  eastECEF: Cartesian3Json;
  northECEF: Cartesian3Json;
  upECEF: Cartesian3Json;
};

export type LocalFrameVectors = {
  origin: Cartesian3;
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
};

export type LocalFramePosition = {
  eastMeters: number;
  northMeters: number;
  upMeters: number;
};

/**
 * Creates a local XY planar transform with:
 * - uniform scale in X/Y,
 * - rotation around local +Z,
 * - translation at origin.
 */
export const createPlanarScaleRotationTranslationMatrix = (
  origin: Cartesian3,
  scale = 1,
  rotationRad = 0,
  minScale = 0
): Matrix4 => {
  const safeScale = Math.max(scale, minScale);
  const cosine = Math.cos(rotationRad);
  const sine = Math.sin(rotationRad);
  PLANAR_TRANSFORM_ELEMENTS[0] = safeScale * cosine;
  PLANAR_TRANSFORM_ELEMENTS[1] = safeScale * sine;
  PLANAR_TRANSFORM_ELEMENTS[2] = 0;
  PLANAR_TRANSFORM_ELEMENTS[3] = 0;

  PLANAR_TRANSFORM_ELEMENTS[4] = -safeScale * sine;
  PLANAR_TRANSFORM_ELEMENTS[5] = safeScale * cosine;
  PLANAR_TRANSFORM_ELEMENTS[6] = 0;
  PLANAR_TRANSFORM_ELEMENTS[7] = 0;

  PLANAR_TRANSFORM_ELEMENTS[8] = 0;
  PLANAR_TRANSFORM_ELEMENTS[9] = 0;
  PLANAR_TRANSFORM_ELEMENTS[10] = 1;
  PLANAR_TRANSFORM_ELEMENTS[11] = 0;

  PLANAR_TRANSFORM_ELEMENTS[12] = origin.x;
  PLANAR_TRANSFORM_ELEMENTS[13] = origin.y;
  PLANAR_TRANSFORM_ELEMENTS[14] = origin.z;
  PLANAR_TRANSFORM_ELEMENTS[15] = 1;

  return Matrix4.fromArray(PLANAR_TRANSFORM_ELEMENTS, 0, new Matrix4());
};

/**
 * Creates a transform from basis vectors and translation:
 * - basis columns are xAxis/yAxis/zAxis,
 * - each basis axis can be scaled independently,
 * - translation is origin.
 */
export const createBasisScaleTranslationMatrix = (
  origin: Cartesian3,
  xAxis: Cartesian3,
  yAxis: Cartesian3,
  zAxis: Cartesian3,
  xScale = 1,
  yScale = 1,
  zScale = 1,
  result: Matrix4 = new Matrix4()
): Matrix4 => {
  BASIS_SCALE_TRANSLATION_ELEMENTS[0] = xAxis.x * xScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[1] = xAxis.y * xScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[2] = xAxis.z * xScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[3] = 0;

  BASIS_SCALE_TRANSLATION_ELEMENTS[4] = yAxis.x * yScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[5] = yAxis.y * yScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[6] = yAxis.z * yScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[7] = 0;

  BASIS_SCALE_TRANSLATION_ELEMENTS[8] = zAxis.x * zScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[9] = zAxis.y * zScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[10] = zAxis.z * zScale;
  BASIS_SCALE_TRANSLATION_ELEMENTS[11] = 0;

  BASIS_SCALE_TRANSLATION_ELEMENTS[12] = origin.x;
  BASIS_SCALE_TRANSLATION_ELEMENTS[13] = origin.y;
  BASIS_SCALE_TRANSLATION_ELEMENTS[14] = origin.z;
  BASIS_SCALE_TRANSLATION_ELEMENTS[15] = 1;

  return Matrix4.fromArray(BASIS_SCALE_TRANSLATION_ELEMENTS, 0, result);
};

/**
 * Reads a Matrix4 basis column (x/y/z) as Cartesian3.
 */
export const matrix4ColumnToCartesian3 = (
  matrix: Matrix4,
  columnIndex: 0 | 1 | 2,
  result: Cartesian3 = new Cartesian3()
): Cartesian3 => {
  const offset = columnIndex * 4;
  return Cartesian3.fromElements(
    matrix[offset],
    matrix[offset + 1],
    matrix[offset + 2],
    result
  );
};

export const normalizeDirection = (
  direction: Cartesian3
): Cartesian3 | null => {
  if (Cartesian3.magnitudeSquared(direction) <= DIRECTION_EPSILON) {
    return null;
  }
  return Cartesian3.normalize(direction, new Cartesian3());
};

export const getLocalUpDirectionAtAnchor = (
  anchorECEF: Cartesian3
): Cartesian3 => Cartesian3.normalize(anchorECEF, new Cartesian3());

export const projectPointToHorizontalPlaneAtAnchor = (
  pointECEF: Cartesian3,
  anchorECEF: Cartesian3
): Cartesian3 => {
  const localUp = getLocalUpDirectionAtAnchor(anchorECEF);
  const delta = Cartesian3.subtract(pointECEF, anchorECEF, new Cartesian3());
  const distanceAlongUp = Cartesian3.dot(delta, localUp);
  return Cartesian3.subtract(
    pointECEF,
    Cartesian3.multiplyByScalar(localUp, distanceAlongUp, new Cartesian3()),
    new Cartesian3()
  );
};

export const getSignedAngleDegAroundAxis = (
  fromDirection: Cartesian3,
  toDirection: Cartesian3,
  axisDirection: Cartesian3
): number | null => {
  const normalizedAxis = normalizeDirection(axisDirection);
  if (!normalizedAxis) return null;

  const fromProjected = normalizeDirection(
    Cartesian3.subtract(
      fromDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(fromDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  const toProjected = normalizeDirection(
    Cartesian3.subtract(
      toDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(toDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  if (!fromProjected || !toProjected) {
    return null;
  }

  const sinComponent = Cartesian3.dot(
    Cartesian3.cross(fromProjected, toProjected, new Cartesian3()),
    normalizedAxis
  );
  const cosComponent = Math.max(
    -1,
    Math.min(1, Cartesian3.dot(fromProjected, toProjected))
  );
  return (Math.atan2(sinComponent, cosComponent) * 180) / Math.PI;
};

export const resolveLocalFrameVectors = (
  frame: LocalFrameJson | null | undefined
): LocalFrameVectors | null => {
  if (!frame) return null;

  const east = normalizeDirection(cartesian3FromJson(frame.eastECEF));
  const north = normalizeDirection(cartesian3FromJson(frame.northECEF));
  const up = normalizeDirection(cartesian3FromJson(frame.upECEF));
  if (!east || !north || !up) {
    return null;
  }

  return {
    origin: cartesian3FromJson(frame.originECEF),
    east,
    north,
    up,
  };
};

export const getPositionInLocalFrame = (
  position: Cartesian3,
  frame: LocalFrameVectors
): LocalFramePosition => {
  const delta = Cartesian3.subtract(position, frame.origin, new Cartesian3());
  return {
    eastMeters: Cartesian3.dot(delta, frame.east),
    northMeters: Cartesian3.dot(delta, frame.north),
    upMeters: Cartesian3.dot(delta, frame.up),
  };
};

export const getPositionFromLocalFrame = (
  frame: LocalFrameVectors,
  eastMeters: number,
  northMeters: number,
  upMeters: number
): Cartesian3 =>
  Cartesian3.add(
    frame.origin,
    Cartesian3.add(
      Cartesian3.multiplyByScalar(frame.east, eastMeters, new Cartesian3()),
      Cartesian3.add(
        Cartesian3.multiplyByScalar(frame.north, northMeters, new Cartesian3()),
        Cartesian3.multiplyByScalar(frame.up, upMeters, new Cartesian3()),
        new Cartesian3()
      ),
      new Cartesian3()
    ),
    new Cartesian3()
  );

export const getPositionWithVerticalOffsetFromAnchor = (
  anchorECEF: Cartesian3,
  verticalOffsetMeters: number
): Cartesian3 =>
  Cartesian3.add(
    anchorECEF,
    Cartesian3.multiplyByScalar(
      getLocalUpDirectionAtAnchor(anchorECEF),
      verticalOffsetMeters,
      new Cartesian3()
    ),
    new Cartesian3()
  );

export const getArcPointsInSpannedPlane = (
  auxiliaryPoint: Cartesian3,
  verticalTargetPoint: Cartesian3,
  horizontalTargetPoint: Cartesian3,
  arcRadiusMeters: number,
  segmentCount: number
): Cartesian3[] | null => {
  if (!Number.isFinite(arcRadiusMeters) || arcRadiusMeters <= 0) return null;

  const verticalVector = Cartesian3.subtract(
    verticalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const horizontalVector = Cartesian3.subtract(
    horizontalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const verticalLength = Cartesian3.magnitude(verticalVector);
  const horizontalLength = Cartesian3.magnitude(horizontalVector);

  if (verticalLength <= ARC_POINT_EPSILON_METERS) return null;
  if (horizontalLength <= ARC_POINT_EPSILON_METERS) return null;

  const verticalDirection = Cartesian3.normalize(
    verticalVector,
    new Cartesian3()
  );
  const horizontalDirectionRaw = Cartesian3.normalize(
    horizontalVector,
    new Cartesian3()
  );
  const dot = Math.max(
    -1,
    Math.min(1, Cartesian3.dot(verticalDirection, horizontalDirectionRaw))
  );
  const angleRad = Math.acos(dot);
  if (!Number.isFinite(angleRad) || angleRad <= 1e-3) return null;

  const horizontalOrthogonal = Cartesian3.subtract(
    horizontalDirectionRaw,
    Cartesian3.multiplyByScalar(verticalDirection, dot, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitude(horizontalOrthogonal) <= 1e-5) return null;

  const horizontalDirection = Cartesian3.normalize(
    horizontalOrthogonal,
    new Cartesian3()
  );
  const safeRadius = Math.min(
    arcRadiusMeters,
    verticalLength * 0.999,
    horizontalLength * 0.999
  );
  if (safeRadius <= ARC_POINT_EPSILON_METERS) return null;

  const points: Cartesian3[] = [];
  const segments = Math.max(8, segmentCount);
  for (let index = 0; index <= segments; index += 1) {
    const theta = angleRad * (index / segments);
    const direction = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        verticalDirection,
        Math.cos(theta),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        horizontalDirection,
        Math.sin(theta),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const normalizedDirection = Cartesian3.normalize(
      direction,
      new Cartesian3()
    );
    points.push(
      Cartesian3.add(
        auxiliaryPoint,
        Cartesian3.multiplyByScalar(
          normalizedDirection,
          safeRadius,
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );
  }

  return points.length >= 2 ? points : null;
};

export const getEastNorthUpOffset = (
  pointECEF: Cartesian3,
  referenceECEF: Cartesian3,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): EastNorthUpOffset => {
  const eastNorthUpTransform = Transforms.eastNorthUpToFixedFrame(
    referenceECEF,
    ellipsoid,
    EAST_NORTH_UP_TRANSFORM_SCRATCH
  );
  const worldToEastNorthUpTransform = Matrix4.inverseTransformation(
    eastNorthUpTransform,
    WORLD_TO_ENU_TRANSFORM_SCRATCH
  );
  const pointEastNorthUp = Matrix4.multiplyByPoint(
    worldToEastNorthUpTransform,
    pointECEF,
    EAST_NORTH_UP_POINT_SCRATCH
  );

  return {
    east: pointEastNorthUp.x,
    north: pointEastNorthUp.y,
    up: pointEastNorthUp.z,
  };
};

/**
 * Returns reference point cartographic coordinates plus a HeadingPitchRange
 * from camera->reference direction in the camera's ENU frame.
 *
 * This guarantees that the "up" axis used for pitch is camera ENU up.
 */
export const getCartographicAndHeadingPitchRangeFromPoints = (
  cameraPositionECEF: Cartesian3,
  referencePointECEF: Cartesian3,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): CartographicHeadingPitchRange | null => {
  const cartographic = Cartographic.fromCartesian(
    referencePointECEF,
    ellipsoid
  );
  if (!cartographic) {
    return null;
  }

  const offsetInCameraEnu = getEastNorthUpOffset(
    referencePointECEF,
    cameraPositionECEF,
    ellipsoid
  );
  const range = Cartesian3.distance(cameraPositionECEF, referencePointECEF);
  if (!Number.isFinite(range) || range <= DIRECTION_EPSILON) {
    return null;
  }

  const horizontalDistance = Math.hypot(
    offsetInCameraEnu.east,
    offsetInCameraEnu.north
  );
  const heading = Math.atan2(offsetInCameraEnu.east, offsetInCameraEnu.north);
  const pitch = Math.atan2(offsetInCameraEnu.up, horizontalDistance);

  return {
    cartographic,
    headingPitchRange: new HeadingPitchRange(heading, pitch, range),
  };
};

const toHeadingPitchRangeOffsetInEnu = (
  headingPitchRange: HeadingPitchRange
): Cartesian3 => {
  const cosPitch = Math.cos(headingPitchRange.pitch);
  const east =
    Math.sin(headingPitchRange.heading) * cosPitch * headingPitchRange.range;
  const north =
    Math.cos(headingPitchRange.heading) * cosPitch * headingPitchRange.range;
  const up = Math.sin(headingPitchRange.pitch) * headingPitchRange.range;
  return new Cartesian3(east, north, up);
};

const toWorldOffsetAtAnchorFromEnuOffset = (
  anchorECEF: Cartesian3,
  enuOffset: Cartesian3,
  ellipsoid: Ellipsoid
): Cartesian3 => {
  const enuToWorld = Transforms.eastNorthUpToFixedFrame(
    anchorECEF,
    ellipsoid,
    EAST_NORTH_UP_TRANSFORM_SCRATCH
  );
  const eastAxis = matrix4ColumnToCartesian3(enuToWorld, 0, new Cartesian3());
  const northAxis = matrix4ColumnToCartesian3(enuToWorld, 1, new Cartesian3());
  const upAxis = matrix4ColumnToCartesian3(enuToWorld, 2, new Cartesian3());

  return Cartesian3.add(
    Cartesian3.multiplyByScalar(eastAxis, enuOffset.x, new Cartesian3()),
    Cartesian3.add(
      Cartesian3.multiplyByScalar(northAxis, enuOffset.y, new Cartesian3()),
      Cartesian3.multiplyByScalar(upAxis, enuOffset.z, new Cartesian3()),
      new Cartesian3()
    ),
    new Cartesian3()
  );
};

/**
 * Reconstructs camera/reference points from object-centric camera state.
 *
 * The forward transform (`getCartographicAndHeadingPitchRangeFromPoints`) uses
 * camera ENU as the heading/pitch frame. Inverse reconstruction is solved with
 * a fixed-point iteration because ENU basis depends on camera position.
 */
export const getPointsFromCartographicAndHeadingPitchRange = (
  value: CartographicHeadingPitchRange,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84,
  options: {
    maxIterations?: number;
    convergenceEpsilonMeters?: number;
  } = {}
): CartographicHeadingPitchRangePoints | null => {
  const referencePointECEF = Cartographic.toCartesian(
    value.cartographic,
    ellipsoid,
    new Cartesian3()
  );
  if (!referencePointECEF) {
    return null;
  }

  const { headingPitchRange } = value;
  if (
    !Number.isFinite(headingPitchRange.range) ||
    headingPitchRange.range <= DIRECTION_EPSILON
  ) {
    return null;
  }

  const enuOffset = toHeadingPitchRangeOffsetInEnu(headingPitchRange);
  const initialOffsetWorld = toWorldOffsetAtAnchorFromEnuOffset(
    referencePointECEF,
    enuOffset,
    ellipsoid
  );
  const cameraPositionECEF = Cartesian3.subtract(
    referencePointECEF,
    initialOffsetWorld,
    new Cartesian3()
  );

  const maxIterations = Math.max(
    1,
    Math.floor(options.maxIterations ?? HPR_ROUNDTRIP_MAX_ITERATIONS)
  );
  const convergenceEpsilonMeters = Math.max(
    1e-9,
    options.convergenceEpsilonMeters ?? HPR_ROUNDTRIP_EPSILON_METERS
  );

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const offsetWorld = toWorldOffsetAtAnchorFromEnuOffset(
      cameraPositionECEF,
      enuOffset,
      ellipsoid
    );
    const predictedReference = Cartesian3.add(
      cameraPositionECEF,
      offsetWorld,
      new Cartesian3()
    );
    const error = Cartesian3.subtract(
      referencePointECEF,
      predictedReference,
      new Cartesian3()
    );
    const errorMeters = Cartesian3.magnitude(error);
    if (errorMeters <= convergenceEpsilonMeters) {
      break;
    }
    Cartesian3.add(cameraPositionECEF, error, cameraPositionECEF);
  }

  return {
    cameraPositionECEF,
    referencePointECEF,
  };
};
