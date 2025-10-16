// If used else where than in OLB, promote to @carma/types

export type ExteriorPosition = {
  x: number;
  y: number;
  z: number;
};

type row3 = [number, number, number];

export interface ExteriorOrientationDataArray
  extends Array<number, number, number, row3, row3, row3> {}

export interface ExteriorOrientations {
  [key: string]: ExteriorOrientationDataArray;
}

// TODO: this mixes multiple rotation descriptions into one type, clear this up
// TODO: add rotation convention as a typed brand
export type RotationDescription = {
  direction?: Vector3Arr;
  up?: Vector3Arr;
  m?: Matrix3RowMajor;
  omega?: number; // TODO: add units here
  phi?: number;
  kappa?: number;
};

export type DerivedExteriorOrientation = {
  position: {
    sourceCRS: Vector3Arr;
    wgs84?: Vector3Arr;
    ecef?: Vector3Arr;
  };
  rotation: {
    enu: {
      sourceCRS: RotationDescription;
      wgs84?: RotationDescription;
    };
    ecef?: RotationDescription;
  };
  utmConvergenceAngle?: number; // TODO: add units here
  sourceCrs?: string;
};
