import { HeadingPitchRoll, Matrix3, Quaternion } from "cesium";

import { ExteriorOrientationOPK } from "../types";

export function createRotationMatrixFromOPK(
  opk: ExteriorOrientationOPK
): Matrix3 {
  const { omega, phi, kappa } = opk;

  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinKappa = Math.sin(kappa);
  const cosKappa = Math.cos(kappa);

  // prettier-ignore
  return new Matrix3(
    cosKappa * cosPhi,                                     sinKappa * cosPhi,                                     -sinPhi,
    cosKappa * sinPhi * sinOmega - sinKappa * cosOmega,    sinKappa * sinPhi * sinOmega + cosKappa * cosOmega,    cosPhi * sinOmega,
    cosKappa * sinPhi * cosOmega + sinKappa * sinOmega,    sinKappa * sinPhi * cosOmega - cosKappa * sinOmega,    cosPhi * cosOmega
  );
}

export function convertToENUMatrix(photogrammetryMatrix: Matrix3): Matrix3 {
  // prettier-ignore
  const conversionMatrix = new Matrix3(
    0,    1,    0, // East direction
    1,    0,    0, // North direction
    0,    0,    -1 // Up direction
  );

  return Matrix3.multiply(
    conversionMatrix,
    photogrammetryMatrix,
    new Matrix3()
  );
}

export function computeOrientations(orientation: ExteriorOrientationOPK): {
  quaternion: Quaternion;
  hpr: HeadingPitchRoll;
  rotationMatrix: Matrix3;
} {
  // Create rotation matrix from photogrammetric angles
  const rotationMatrix = createRotationMatrixFromOPK(orientation);
  const enuRotationMatrix = convertToENUMatrix(rotationMatrix);
  const quaternion = Quaternion.fromRotationMatrix(enuRotationMatrix);
  const hpr = HeadingPitchRoll.fromQuaternion(quaternion);

  return {
    quaternion,
    hpr,
    rotationMatrix: enuRotationMatrix,
  };
}
