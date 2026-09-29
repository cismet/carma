import maplibregl from "maplibre-gl";
import * as THREE from "three";

import type { LngLatArray } from "@carma-geo/data-structures";
import { degToRadNumeric } from "@carma-units";
import {
  WGS84_A,
  WGS84_B,
  cartographicToEcef,
  ecefToEnuMatrix,
} from "@carma-geo/proj";

import {
  TERRAIN_GEOMETRY_MODE,
  type TerrainGeometryMode,
} from "./reference-surface-types";

export type ReferenceFrame = Readonly<{
  /** Colour reference only; never changes geometry placement. */
  anchorNormalHeightMeters: number;
  originLngLat: readonly [longitude: number, latitude: number];
  originMercator: maplibregl.MercatorCoordinate;
  mercatorUnitsPerMeter: number;
  originEcef: THREE.Vector3;
  ecefToEnuRotation: THREE.Matrix3;
  sphereRadiusMeters: number;
  originSphereEcef: THREE.Vector3;
}>;

export const mutableLngLat = (
  value: readonly [number, number]
): [number, number] => [value[0], value[1]];

const sphericalEcef = (
  longitudeRadians: number,
  latitudeRadians: number,
  radiusMeters: number,
  target = new THREE.Vector3()
) =>
  target.set(
    radiusMeters * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    radiusMeters * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
    radiusMeters * Math.sin(latitudeRadians)
  );

export const createReferenceFrame = (
  originLngLat: readonly [number, number],
  sphereRadiusMeters: number,
  anchorNormalHeightMeters = 0
): ReferenceFrame => {
  const longitudeRadians = degToRadNumeric(originLngLat[0]);
  const latitudeRadians = degToRadNumeric(originLngLat[1]);
  const originEcef = cartographicToEcef(longitudeRadians, latitudeRadians, 0);
  const originMercator = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(originLngLat),
    0
  );
  return {
    anchorNormalHeightMeters,
    originLngLat,
    originMercator,
    mercatorUnitsPerMeter: originMercator.meterInMercatorCoordinateUnits(),
    originEcef,
    ecefToEnuRotation: new THREE.Matrix3().setFromMatrix4(
      ecefToEnuMatrix(originEcef)
    ),
    sphereRadiusMeters,
    originSphereEcef: sphericalEcef(
      longitudeRadians,
      latitudeRadians,
      sphereRadiusMeters
    ),
  };
};

export const localGroundLngLat = (
  frame: ReferenceFrame,
  eastMeters: number,
  southMeters: number
): LngLatArray.deg => {
  const lngLat = new maplibregl.MercatorCoordinate(
    frame.originMercator.x + eastMeters * frame.mercatorUnitsPerMeter,
    frame.originMercator.y + southMeters * frame.mercatorUnitsPerMeter,
    0
  ).toLngLat();
  return [lngLat.lng, lngLat.lat] as LngLatArray.deg;
};

export const projectMercatorToScene = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  altitudeMeters: number,
  target = new THREE.Vector3()
) => {
  const coordinate = maplibregl.MercatorCoordinate.fromLngLat(
    [longitude, latitude],
    altitudeMeters
  );
  return target.set(
    (coordinate.x - frame.originMercator.x) / frame.mercatorUnitsPerMeter,
    (coordinate.z - frame.originMercator.z) / frame.mercatorUnitsPerMeter,
    (coordinate.y - frame.originMercator.y) / frame.mercatorUnitsPerMeter
  );
};

const enuToScene = (enu: THREE.Vector3, target: THREE.Vector3) => {
  const east = enu.x;
  const north = enu.y;
  const up = enu.z;
  return target.set(east, up, -north);
};

export const projectGeodeticToScene = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  ellipsoidalHeightMeters: number,
  geometryMode: TerrainGeometryMode,
  target = new THREE.Vector3()
) => {
  if (geometryMode === TERRAIN_GEOMETRY_MODE.MERCATOR) {
    return projectMercatorToScene(
      frame,
      longitude,
      latitude,
      ellipsoidalHeightMeters,
      target
    );
  }
  const longitudeRadians = degToRadNumeric(longitude);
  const latitudeRadians = degToRadNumeric(latitude);
  const ecef =
    geometryMode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
      ? cartographicToEcef(
          longitudeRadians,
          latitudeRadians,
          ellipsoidalHeightMeters,
          target
        )
      : sphericalEcef(
          longitudeRadians,
          latitudeRadians,
          frame.sphereRadiusMeters + ellipsoidalHeightMeters,
          target
        );
  ecef
    .sub(
      geometryMode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        ? frame.originEcef
        : frame.originSphereEcef
    )
    .applyMatrix3(frame.ecefToEnuRotation);
  return enuToScene(ecef, target);
};

/** Exact WGS84 reference prediction, not an observed mesh-height measurement. */
export const referenceMountDrop = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  height = 0
) =>
  projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    height,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  ).y - height;

export const WGS84_REFERENCE_AXES = {
  semiMajorMeters: WGS84_A,
  semiMinorMeters: WGS84_B,
  // Gaussian curvature radius sqrt(MN) at the Wuppertal story origin.
  defaultLocalSphereRadiusMeters: 6_382_757,
} as const;
