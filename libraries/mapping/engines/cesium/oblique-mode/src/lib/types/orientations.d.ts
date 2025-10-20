import type { Vector3, Vec3, Orientation } from "@carma/types";

// If used else where than in OLB, promote to @carma/types

export type ExteriorPosition = Vector3;

type row3 = Vec3;

export interface ExteriorOrientationDataArray
  extends Array<number, number, number, row3, row3, row3> {}

export interface ExteriorOrientations {
  [key: string]: ExteriorOrientationDataArray;
}

/**
 * Rotation record for oblique imagery
 * Uses direction vectors (from rotation matrix) for camera orientation
 */
export type RotationRecord = {
  upDirectionRight?: Orientation.UpDirectionRight;
  m?: Orientation.Matrix3;
};

export type DerivedExteriorOrientation = {
  position: {
    sourceCRS: Vec3;
    wgs84?: Vec3;
    ecef?: Vec3;
  };
  rotation: {
    enu: {
      sourceCRS: RotationRecord;
      wgs84?: RotationRecord;
    };
    ecef?: RotationRecord;
  };
  utmConvergenceAngle?: number; // TODO: add units here (Radians)
  sourceCrs?: string;
};
