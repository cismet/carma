import { Matrix3, Matrix4, Vector3, Vector4 } from "three";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
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
      -cx / width,
      0,
      (-f * d) / height,
      (-f * e) / height,
      cy / height - 1,
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
    .addScaledVector(direction, cx / width);
  const vertical = up
    .multiplyScalar(focal / height)
    .addScaledVector(direction, 1 - cy / height);
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
