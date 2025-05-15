import { Cartesian3, Ellipsoid, Matrix4, Transforms } from "cesium";
import type { Matrix3RowMajor, Vector3Arr } from "@carma-commons/types";
import type { ObliqueImageRecord, Proj4Converter } from "../types";
import { calculateUTMConvergence } from "./utmConvergence";

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
  longitude: number,
  latitude: number
): [Vector3Arr, number] => {
  const [x, y, z] = dirEnuSourceCRS;

  const radians = calculateUTMConvergence(longitude, latitude);

  const negatedRadians = -radians;

  // Apply 2D rotation on XY plane
  // rotation against the convergence angle to compensate for it;
  const cosAngle = Math.cos(negatedRadians);
  const sinAngle = Math.sin(negatedRadians);

  const rotatedX = x * cosAngle - y * sinAngle;
  const rotatedY = x * sinAngle + y * cosAngle;

  return [[rotatedX, rotatedY, z], radians];
};

export const computeDerivedExteriorOrientation = (
  record: ObliqueImageRecord,
  { converter, sourceCrs }: Proj4Converter,
  upMapping: { rowIndex: number; negate: boolean } = {
    rowIndex: 1,
    negate: false,
  }
): DerivedExteriorOrientation => {
  const { x, y, z, m } = record;

  const [lon, lat, height] = converter.forward([x, y, z]);

  // Create the derived exterior orientation object with sourceCRS

  const up = upMapping.negate
    ? negateRow(m[upMapping.rowIndex])
    : m[upMapping.rowIndex];

  const derivedOrientation: DerivedExteriorOrientation = {
    sourceCrs,
    position: {
      sourceCRS: [x, y, z],
      wgs84: [lon, lat, height],
    },
    rotation: {
      enu: {
        sourceCRS: { m, direction: m[2], up },
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
    lon,
    lat
  );

  const [upEnuWGS84] = correctForUTMConvergence(upEnuSourceNegated, lon, lat);

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
