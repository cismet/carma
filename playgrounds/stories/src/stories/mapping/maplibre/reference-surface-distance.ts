import * as THREE from "three";

import {
  sampleGcg2016Field,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import {
  projectGeodeticToScene,
  projectMercatorToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import {
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  type ReferenceSurface,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./reference-surface-types";

export type DistanceSummary = Readonly<{
  count: number;
  minimumMeters: number;
  maximumMeters: number;
  meanMeters: number;
  rmsMeters: number;
}>;

export const summarizeSignedDistances = (
  values: readonly number[]
): DistanceSummary | null => {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  let sum = 0;
  let squared = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of finite) {
    sum += value;
    squared += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return {
    count: finite.length,
    minimumMeters: minimum,
    maximumMeters: maximum,
    meanMeters: sum / finite.length,
    rmsMeters: Math.sqrt(squared / finite.length),
  };
};

export const signedCorrespondingDistance = (
  point: THREE.Vector3,
  surface: THREE.Vector3,
  localUp: THREE.Vector3
) => {
  const delta = point.clone().sub(surface);
  return delta.length() * Math.sign(delta.dot(localUp) || 1);
};

export const sceneSurfacePoint = ({
  surface,
  frame,
  field,
  longitude,
  latitude,
  undulationMeters,
  terrainNormalHeightMeters,
  terrainGeometryMode,
  terrainHeightDatum,
  verticalScale,
  verticalOffsetMeters,
}: {
  surface: ReferenceSurface;
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  longitude: number;
  latitude: number;
  undulationMeters?: number;
  terrainNormalHeightMeters?: number;
  terrainGeometryMode: TerrainGeometryMode;
  terrainHeightDatum: TerrainHeightDatum;
  verticalScale: number;
  verticalOffsetMeters: number;
}) => {
  const undulation =
    undulationMeters ?? sampleGcg2016Field(field, frame, longitude, latitude);
  const target = new THREE.Vector3();
  if (surface === REFERENCE_SURFACE.TANGENT) {
    projectMercatorToScene(frame, longitude, latitude, 0, target);
  } else if (surface === REFERENCE_SURFACE.SPHERE) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      0,
      TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE,
      target
    );
  } else if (surface === REFERENCE_SURFACE.ELLIPSOID) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      0,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      target
    );
  } else if (surface === REFERENCE_SURFACE.QUASIGEOID) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      undulation,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      target
    );
  } else if (terrainNormalHeightMeters !== undefined) {
    const height =
      terrainNormalHeightMeters +
      (terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
        ? undulation
        : 0);
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      height,
      terrainGeometryMode,
      target
    );
    return target;
  } else {
    return null;
  }
  target.y = target.y * verticalScale + verticalOffsetMeters;
  return target;
};

export const localUpAt = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number
) => {
  const base = projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    0,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  );
  return projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    1,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  )
    .sub(base)
    .normalize();
};
