import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  sampleGcg2016Field,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import {
  mutableLngLat,
  projectGeodeticToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import { TERRAIN_GEOMETRY_MODE } from "./reference-surface-types";
import type { ReferenceSurfaceStoryDiagnostics } from "./reference-surface-story-map";

/** Screen-space comparison probe for the experimental MapLibre reference story. */
export const createReferenceComparisonProjector = (
  map: MapLibreMap,
  sharedLayerOrigin: readonly [number, number],
  referenceOrigin: readonly [number, number],
  frame: ReferenceFrame,
  gcgField: Gcg2016ShaderField
): NonNullable<
  ReferenceSurfaceStoryDiagnostics["projectTerrainComparisonPoint"]
> => {
  const runtimeOrigin = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(referenceOrigin),
    0
  );
  const layerOrigin = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(sharedLayerOrigin),
    0
  );
  const runtimeScale = runtimeOrigin.meterInMercatorCoordinateUnits();
  const layerScale = layerOrigin.meterInMercatorCoordinateUnits();
  const runtimeLocalToShared = new THREE.Matrix4()
    .makeTranslation(
      (runtimeOrigin.x - layerOrigin.x) / layerScale,
      (runtimeOrigin.z - layerOrigin.z) / layerScale,
      (runtimeOrigin.y - layerOrigin.y) / layerScale
    )
    .scale(new THREE.Vector3().setScalar(runtimeScale / layerScale));
  const rotationX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const rawScene = new THREE.Vector3();
  const correctedScene = new THREE.Vector3();
  const clip = new THREE.Vector4();
  const project = (local: THREE.Vector3): readonly [number, number, number] => {
    const projectionData = (
      map.transform as unknown as {
        getProjectionDataForCustomLayer: (applyGlobeMatrix?: boolean) => {
          mainMatrix: readonly number[];
        };
      }
    ).getProjectionDataForCustomLayer(false);
    const localFromShared = new THREE.Matrix4()
      .makeTranslation(layerOrigin.x, layerOrigin.y, layerOrigin.z)
      .scale(new THREE.Vector3(layerScale, -layerScale, layerScale))
      .multiply(rotationX);
    const localToClip = new THREE.Matrix4()
      .fromArray(projectionData.mainMatrix as number[])
      .multiply(localFromShared)
      .multiply(runtimeLocalToShared);
    clip.set(local.x, local.y, local.z, 1).applyMatrix4(localToClip);
    const inverseW = 1 / clip.w;
    const canvas = map.getCanvas();
    return [
      (clip.x * inverseW * 0.5 + 0.5) * canvas.clientWidth,
      (0.5 - clip.y * inverseW * 0.5) * canvas.clientHeight,
      clip.w,
    ];
  };
  return (longitude, latitude, normalHeightMeters) => {
    const undulationMeters = sampleGcg2016Field(
      gcgField,
      frame,
      longitude,
      latitude
    );
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      normalHeightMeters,
      TERRAIN_GEOMETRY_MODE.MERCATOR,
      rawScene
    );
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      normalHeightMeters + undulationMeters,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      correctedScene
    );
    const raw = project(rawScene);
    const corrected = project(correctedScene);
    const canvas = map.getCanvas();
    const visible =
      raw[2] > 0 &&
      corrected[2] > 0 &&
      raw[0] >= 0 &&
      raw[0] <= canvas.clientWidth &&
      raw[1] >= 0 &&
      raw[1] <= canvas.clientHeight &&
      corrected[0] >= 0 &&
      corrected[0] <= canvas.clientWidth &&
      corrected[1] >= 0 &&
      corrected[1] <= canvas.clientHeight;
    return {
      raw: [raw[0], raw[1]],
      corrected: [corrected[0], corrected[1]],
      deltaPixels: Math.hypot(corrected[0] - raw[0], corrected[1] - raw[1]),
      undulationMeters,
      visible,
    };
  };
};
