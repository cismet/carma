import { Matrix3RowMajor, Vector3Arr } from "types/math";
import { ExteriorOrientationRecord, Proj4Converter } from "../types";
import {
  Cartesian3,
  Ellipsoid,
  Matrix4,
  Transforms,
  Math as CesiumMath,
} from "cesium";
import { type Converter } from "proj4";
import { dir } from "console";

export const DEFAULT_UTM_GRID_CONVERGENCE_ANGLE = 1.52;

const getConvergenceAngleForUTM = (
  easting: number,
  northing: number
): number => {
  // Placeholder for actual UTM convergence angle calculation
  // This should be replaced with the actual logic to compute the convergence angle
  return DEFAULT_UTM_GRID_CONVERGENCE_ANGLE;
};

const negateRow = <T extends readonly number[]>(
  row: T
): { [K in keyof T]: number } => {
  return row.map((value) => -value) as { [K in keyof T]: number };
};

export type RotationDescription = {
  direction?: Vector3Arr;
  up?: Vector3Arr;
  m?: Matrix3RowMajor;
  omega?: number;
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
  utmConvergenceAngle?: number;
  sourceCrs?: string;
};

export const enuToEcef = (
  enu: Vector3Arr,
  position: Cartesian3,
  ellipsoid = Ellipsoid.WGS84
): Vector3Arr => {
  const localToFixed = Transforms.eastNorthUpToFixedFrame(
    position,
    ellipsoid,
    new Matrix4()
  );

  const localDirCartesian = new Cartesian3(...enu);

  // Transform from local ENU to ECEF
  const ecefDirection = Matrix4.multiplyByPointAsVector(
    localToFixed,
    localDirCartesian,
    new Cartesian3()
  );

  return [ecefDirection.x, ecefDirection.y, ecefDirection.z];
};

const correctForUTMConvergence = (
  dirEnuSourceCRS: Vector3Arr,
  easting: number,
  northing: number
): [Vector3Arr, number] => {
  const [x, y, z] = dirEnuSourceCRS;

  const angle = getConvergenceAngleForUTM(easting, northing);

  const radians = CesiumMath.toRadians(angle);

  // Apply 2D rotation on XY plane
  const cosAngle = Math.cos(radians);
  const sinAngle = Math.sin(radians);

  // Rotation formula: x' = x*cos(θ) - y*sin(θ), y' = x*sin(θ) + y*cos(θ)
  const rotatedX = x * cosAngle - y * sinAngle;
  const rotatedY = x * sinAngle + y * cosAngle;

  return [[rotatedX, rotatedY, z], angle];
};

export const computeDerivedExteriorOrientation = (
  record: ExteriorOrientationRecord,
  { converter, sourceCrs }: Proj4Converter
): DerivedExteriorOrientation => {
  const { x, y, z, m } = record;

  const [lon, lat, height] = converter.forward([x, y, z]);

  // Create the derived exterior orientation object with sourceCRS
  const derivedOrientation: DerivedExteriorOrientation = {
    sourceCrs,
    position: {
      sourceCRS: [x, y, z],
      wgs84: [lon, lat, height],
    },
    rotation: {
      enu: {
        sourceCRS: { m, direction: m[2], up: m[1] },
      },
    },
  };

  // negate Row TODO: evaluate if this could be expressed by some other part of the matrix or a better transform of it
  const dirEnuSourceNegated = negateRow(
    derivedOrientation.rotation.enu.sourceCRS.direction
  );
  const upEnuSourceNegated = negateRow(
    derivedOrientation.rotation.enu.sourceCRS.up
  );

  const [dirEnuWGS84, convergenceAngle] = correctForUTMConvergence(
    dirEnuSourceNegated,
    x,
    y
  );

  const [upEnuWGS84] = correctForUTMConvergence(upEnuSourceNegated, x, y);

  derivedOrientation.rotation.enu.wgs84 = {
    direction: dirEnuWGS84,
    up: upEnuWGS84,
  };

  derivedOrientation.utmConvergenceAngle = convergenceAngle;

  // Create ECEF position from WGS84 coordinates (lat, lon, height)
  const ecefPosition = Cartesian3.fromDegrees(lon, lat, height);

  // Use the ECEF position for the ENU to ECEF transformation
  const dirEcef = enuToEcef(dirEnuWGS84, ecefPosition);
  const upEcef = enuToEcef(upEnuWGS84, ecefPosition);

  derivedOrientation.rotation.ecef = {
    direction: dirEcef,
    up: upEcef,
  };

  return derivedOrientation;
};
