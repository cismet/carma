import { Matrix4, Vector3 } from "three";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../../core/types";

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
  pose: ObliquePose,
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
