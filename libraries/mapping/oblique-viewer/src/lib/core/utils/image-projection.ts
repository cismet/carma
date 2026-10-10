import { Matrix3, Matrix4, Vector3, Vector4 } from "three";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../types";

/** Project view rays through the footprint's calibrated image projector.
 * Without an anchor, homogeneous directions omit camera translation. An anchor
 * selects a finite plane at its photo-optical depth, preserving its UV and scale
 * for a translated view camera. This plane does not reproduce mesh parallax.
 */
export const viewportImageProjection = (
  sceneToImage: Matrix4,
  sceneToClip: Matrix4,
  anchor?: Vector3
): Matrix3 => {
  const clipToScene = sceneToClip.clone().invert().elements;
  const clipToReceiver = new Matrix4();
  const receivers = clipToReceiver.elements;
  // Plane coefficients in homogeneous scene coordinates. The photo projector's
  // w row measures optical depth; subtracting the anchor depth cancels its
  // translation term, leaving a plane through the anchor normal to that axis.
  const photo = sceneToImage.elements;
  const plane = anchor
    ? new Vector4(
        photo[3],
        photo[7],
        photo[11],
        -(photo[3] * anchor.x + photo[7] * anchor.y + photo[11] * anchor.z)
      )
    : new Vector4(0, 0, 0, 1);
  const planeAtColumn = (offset: number) =>
    plane.x * clipToScene[offset] +
    plane.y * clipToScene[offset + 1] +
    plane.z * clipToScene[offset + 2] +
    plane.w * clipToScene[offset + 3];
  const planeDepth = planeAtColumn(8);
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const depth = planeAtColumn(offset) / planeDepth;
    for (let row = 0; row < 4; row += 1) {
      receivers[offset + row] =
        clipToScene[offset + row] - clipToScene[8 + row] * depth;
    }
    if (!anchor) receivers[offset + 3] = 0;
  }
  const e = sceneToImage.clone().multiply(clipToReceiver).elements;
  return new Matrix3().set(
    2 * e[0],
    2 * e[4],
    e[12] - e[0] - e[4],
    2 * e[1],
    2 * e[5],
    e[13] - e[1] - e[5],
    2 * e[3],
    2 * e[7],
    e[15] - e[3] - e[7]
  );
};

/** True only when the calibrated projected photo quadrilateral contains all
 * four viewport corners. UVs are bottom-left in both domains; no bounding-box
 * or zoom approximation is used. Horizon-crossing and singular quads fail. */
export const viewportImageCoversViewport = (
  viewportToImage: Matrix3
): boolean => {
  const elements = viewportToImage.elements;
  if (!elements.every(Number.isFinite)) return false;
  const magnitude = Math.max(...elements.map(Math.abs));
  const determinant = viewportToImage.determinant();
  if (
    !magnitude ||
    Math.abs(determinant) <= Number.EPSILON * magnitude ** 3 * 16
  )
    return false;
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const project = (matrix: Matrix3) => {
    const e = matrix.elements;
    const depths = corners.map(([x, y]) => e[2] * x + e[5] * y + e[8]);
    const epsilon = 1e-12 * Math.max(...e.map(Math.abs));
    if (
      depths.some(
        (w) =>
          !Number.isFinite(w) ||
          Math.abs(w) <= epsilon ||
          Math.sign(w) !== Math.sign(depths[0])
      )
    )
      return null;
    const points = corners.map(([x, y], i) => ({
      x: (e[0] * x + e[3] * y + e[6]) / depths[i],
      y: (e[1] * x + e[4] * y + e[7]) / depths[i],
    }));
    return points.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
    )
      ? points
      : null;
  };
  // A finite projective image of the sensor rectangle is convex provided none
  // of its edges cross the homography horizon. Its inverse then preserves
  // containment, so four sensor-UV tests are exactly the quad containment test.
  if (!project(viewportToImage.clone().invert())) return false;
  const imagePoints = project(viewportToImage);
  const epsilon = 1e-9;
  return !!imagePoints?.every(
    ({ x, y }) =>
      x >= -epsilon && y >= -epsilon && x <= 1 + epsilon && y <= 1 + epsilon
  );
};

/** Intersect the current viewport-centre ray with the local ground plane.
 * Camera pan/zoom can move this point without another terrain request. A ray
 * parallel to the plane, behind it, or a singular camera retains the old anchor.
 */
export const viewportCenterPlaneAnchor = (
  sceneToClip: Matrix4,
  anchor: Vector3,
  worldUp = new Vector3(0, 1, 0)
): Vector3 => {
  const fallback = () =>
    anchor.toArray().every(Number.isFinite) ? anchor.clone() : new Vector3();
  const inverse = sceneToClip.clone().invert();
  const near = new Vector3(0, 0, -0.5).applyMatrix4(inverse);
  const far = new Vector3(0, 0, 0.5).applyMatrix4(inverse);
  const direction = far.sub(near);
  const denominator = worldUp.dot(direction);
  const scale = worldUp.length() * direction.length();
  if (
    ![...near.toArray(), ...direction.toArray(), denominator, scale].every(
      Number.isFinite
    ) ||
    !(scale > 0) ||
    Math.abs(denominator) <= 1e-12 * scale
  )
    return fallback();
  const distance = worldUp.dot(anchor.clone().sub(near)) / denominator;
  if (!(distance >= 0 && Number.isFinite(distance))) return fallback();
  const intersection = near.addScaledVector(direction, distance);
  return intersection.toArray().every(Number.isFinite)
    ? intersection
    : fallback();
};

/** MapLibre camera roll delta in degrees that makes scene vertical point up.
 * Uses the actual scene camera at the chosen anchor, not the photo calibration.
 * Apply to camera roll while retaining its eye and anchor screen position.
 */
export const viewportUprightRollCorrectionDeg = (
  sceneToClip: Matrix4,
  anchor: Vector3,
  viewport: Readonly<{ width: number; height: number }>,
  worldUp = new Vector3(0, 1, 0)
): number => {
  if (!(viewport.width > 0 && viewport.height > 0)) return 0;
  const point = new Vector4(anchor.x, anchor.y, anchor.z, 1).applyMatrix4(
    sceneToClip
  );
  const vertical = new Vector4(worldUp.x, worldUp.y, worldUp.z, 0).applyMatrix4(
    sceneToClip
  );
  if (
    !point.w ||
    ![...point.toArray(), ...vertical.toArray()].every(Number.isFinite)
  )
    return 0;
  const x =
    ((vertical.x * point.w - point.x * vertical.w) / (point.w * point.w)) *
    viewport.width;
  const y =
    ((vertical.y * point.w - point.y * vertical.w) / (point.w * point.w)) *
    viewport.height;
  const length = Math.hypot(x, y);
  // MapLibre flips camera Y before applying -roll, so its positive roll
  // rotates rendered NDC by +roll (opposite to Three camera.rotateZ).
  return Number.isFinite(length) && length > 1e-10
    ? radToDegNumeric(Math.atan2(x, y))
    : 0;
};

// The shared physical scene uses east/up/south; camera orientations use ENU.
const SCENE_TO_ENU = new Matrix4().set(
  1,
  0,
  0,
  0,
  0,
  0,
  -1,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1
);

/** Current ECEF receiver world coordinates to the photo's true-north ENU rays. */
export const sceneToPhotoEnu = (
  origin: readonly [number, number],
  sceneFromLocal: Matrix4,
  pose: Pick<ObliquePose, "longitude" | "latitude">,
  altitude: number
): Matrix4 => {
  const ecef = ([longitude, latitude]: readonly [number, number]) =>
    cartographicToEcef(
      degToRadNumeric(longitude),
      degToRadNumeric(latitude),
      0
    );
  return new Matrix4()
    .makeTranslation(0, 0, -altitude)
    .multiply(ecefToEnuMatrix(ecef([pose.longitude, pose.latitude])))
    .multiply(ecefToEnuMatrix(ecef(origin)).invert())
    .multiply(SCENE_TO_ENU)
    .multiply(sceneFromLocal.clone().invert());
};

/** Mercator terrain follows the same scene camera convention as flyToImage. */
export const sceneToMercatorPhotoEnu = (position: Vector3): Matrix4 =>
  SCENE_TO_ENU.clone().multiply(
    new Matrix4().makeTranslation(-position.x, -position.y, -position.z)
  );

/** Homogeneous bottom-left image UV, with positive camera depth in w.
 * Converts CenterTopLeft native pixel centres to texture-edge UV exactly once.
 * Uses the same delivered-pixel affine and INPHO rows as projectTargetPixel.
 */
export const imageProjectionMatrix = (
  record: ObliqueImageRecord,
  calibration: ObliqueCameraCalibration,
  pose: ObliquePose,
  sceneToEnu: Matrix4
): Matrix4 => {
  const { widthPx: width, heightPx: height } = calibration;
  const affine = calibration.imageMmToPixelAffine;
  if (affine) {
    const [[a, b, cx], [d, e, cy]] = affine;
    const f = calibration.focalLengthMm;
    const intrinsic = new Matrix4().set(
      (f * a) / width,
      (f * b) / width,
      -(cx + 0.5) / width,
      0,
      (-f * d) / height,
      (-f * e) / height,
      (cy + 0.5) / height - 1,
      0,
      0,
      0,
      -1,
      0,
      0,
      0,
      -1,
      0
    );
    const [r0, r1, r2] = record.m;
    const orientation = new Matrix4().set(
      ...r0,
      0,
      ...r1,
      0,
      ...r2,
      0,
      0,
      0,
      0,
      1
    );
    return intrinsic
      .multiply(orientation)
      .multiply(new Matrix4().makeRotationZ(pose.utmConvergenceRad))
      .multiply(sceneToEnu);
  }
  const direction = new Vector3(...pose.direction).normalize();
  const up = new Vector3(...pose.up).normalize();
  const right = new Vector3().crossVectors(direction, up).normalize();
  const focal = Math.max(width, height) / (2 * calibration.halfFovTan);
  const [cx, cy] = calibration.principalPointPx;
  const horizontal = right
    .multiplyScalar(focal / width)
    .addScaledVector(direction, (cx + 0.5) / width);
  const vertical = up
    .multiplyScalar(focal / height)
    .addScaledVector(direction, 1 - (cy + 0.5) / height);
  return new Matrix4()
    .set(
      horizontal.x,
      horizontal.y,
      horizontal.z,
      0,
      vertical.x,
      vertical.y,
      vertical.z,
      0,
      direction.x,
      direction.y,
      direction.z,
      0,
      direction.x,
      direction.y,
      direction.z,
      0
    )
    .multiply(sceneToEnu);
};
