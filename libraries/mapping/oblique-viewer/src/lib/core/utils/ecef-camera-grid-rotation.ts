import { Matrix3, Matrix4, Vector3 } from "three";
import { ecefToEnuMatrix } from "@carma-geo/proj";
import type { Matrix3RowMajor } from "@carma-commons/math";
import { calculateUTMConvergence } from "./utmConvergence";

/** Shared inverse of the existing grid projector: retain exact physical ECEF rays. */
export const ecefCameraGridRotation = (
  rows: Matrix3RowMajor,
  eye: Vector3,
  longitude: number,
  latitude: number
): Matrix3RowMajor => {
  const matrix = new Matrix3()
    .set(...rows[0], ...rows[1], ...rows[2])
    .multiply(new Matrix3().setFromMatrix4(ecefToEnuMatrix(eye).invert()))
    .multiply(
      new Matrix3().setFromMatrix4(
        new Matrix4().makeRotationZ(
          -calculateUTMConvergence(longitude, latitude)
        )
      )
    );
  const m = matrix.elements;
  return [
    [m[0], m[3], m[6]],
    [m[1], m[4], m[7]],
    [m[2], m[5], m[8]],
  ];
};
