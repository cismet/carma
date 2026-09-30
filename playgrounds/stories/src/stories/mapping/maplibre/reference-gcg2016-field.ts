import maplibregl from "maplibre-gl";
import * as THREE from "three";

import type { LngLatArray } from "@carma-geo/data-structures";
import { EARTH_RADIUS, getGcg2016HeightAnomalies } from "@carma-geo/proj";

import {
  createReferenceFrame,
  localGroundLngLat,
  mutableLngLat,
  projectMercatorToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";

const GCG_TEXTURE_SIZE = 65;
const GCG_HALF_EXTENT_METERS = 60_000;

export type Gcg2016ShaderField = Readonly<{
  center: readonly [longitude: number, latitude: number];
  halfExtentMeters: number;
  minimumMeters: number;
  maximumMeters: number;
  size: number;
  values: Float32Array;
  texture: THREE.DataTexture;
}>;

export const fieldCenterOffsetFromOrigin = (
  originLngLat: readonly [number, number],
  fieldCenter: readonly [number, number]
) => {
  const origin = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(originLngLat),
    0
  );
  const field = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(fieldCenter),
    0
  );
  const meterScale = origin.meterInMercatorCoordinateUnits();
  return new THREE.Vector2(
    (field.x - origin.x) / meterScale,
    (field.y - origin.y) / meterScale
  );
};

export const sampleGcg2016Field = (
  field: Gcg2016ShaderField,
  frame: ReferenceFrame,
  longitude: number,
  latitude: number
) => {
  const local = projectMercatorToScene(frame, longitude, latitude, 0);
  const fieldOffset = fieldCenterOffsetFromOrigin(
    frame.originLngLat,
    field.center
  );
  return sampleGcg2016FieldAtLocal(field, fieldOffset, local.x, local.z);
};

export const sampleGcg2016FieldAtLocal = (
  field: Gcg2016ShaderField,
  fieldCenterOffset: THREE.Vector2,
  eastMeters: number,
  southMeters: number
) => {
  const u = THREE.MathUtils.clamp(
    (eastMeters - fieldCenterOffset.x) / (2 * field.halfExtentMeters) + 0.5,
    0,
    1
  );
  const v = THREE.MathUtils.clamp(
    (southMeters - fieldCenterOffset.y) / (2 * field.halfExtentMeters) + 0.5,
    0,
    1
  );
  const x = u * (field.size - 1);
  const y = v * (field.size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.size - 1, x0 + 1);
  const y1 = Math.min(field.size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (column: number, row: number) =>
    field.values[row * field.size + column] ?? 0;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(at(x0, y0), at(x1, y0), tx),
    THREE.MathUtils.lerp(at(x0, y1), at(x1, y1), tx),
    ty
  );
};

export const createGcg2016ShaderField = async (
  center: readonly [number, number]
): Promise<Gcg2016ShaderField> => {
  const frame = createReferenceFrame(center, EARTH_RADIUS);
  const coordinates: LngLatArray.deg[] = [];
  for (let row = 0; row < GCG_TEXTURE_SIZE; row += 1) {
    const southMeters =
      ((row / (GCG_TEXTURE_SIZE - 1)) * 2 - 1) * GCG_HALF_EXTENT_METERS;
    for (let column = 0; column < GCG_TEXTURE_SIZE; column += 1) {
      const eastMeters =
        ((column / (GCG_TEXTURE_SIZE - 1)) * 2 - 1) * GCG_HALF_EXTENT_METERS;
      coordinates.push(localGroundLngLat(frame, eastMeters, southMeters));
    }
  }

  const undulations = await getGcg2016HeightAnomalies(coordinates);
  const values = Float32Array.from(undulations);
  const minimumMeters = Math.min(...undulations);
  const maximumMeters = Math.max(...undulations);
  const rangeMeters = Math.max(1e-6, maximumMeters - minimumMeters);
  const encoded = Uint16Array.from(undulations, (value) =>
    THREE.DataUtils.toHalfFloat((value - minimumMeters) / rangeMeters)
  );
  const texture = new THREE.DataTexture(
    encoded,
    GCG_TEXTURE_SIZE,
    GCG_TEXTURE_SIZE,
    THREE.RedFormat,
    THREE.HalfFloatType
  );
  texture.name = "GCG2016 bundled coefficient field";
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    center,
    halfExtentMeters: GCG_HALF_EXTENT_METERS,
    minimumMeters,
    maximumMeters,
    size: GCG_TEXTURE_SIZE,
    values,
    texture,
  };
};
