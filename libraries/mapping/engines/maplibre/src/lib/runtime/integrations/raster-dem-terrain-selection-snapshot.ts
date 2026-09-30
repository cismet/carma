import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Camera, Group, Matrix4, Vector3, WebGLCoordinateSystem } from "three";

import { quantize } from "@carma-commons/math";
import type { RasterDemTerrainResource } from "@carma-commons/resources";

import type {
  SharedThreeSceneFrame,
  SharedThreeSceneShadowView,
} from "../../core/shared-three-scene-types";
import {
  TERRAIN_SELECTION_KIND,
  type TerrainSelectionInput,
} from "../../core/terrain-selection-types";
import type { TileCameraSnapshot } from "../../core/tile-camera-demand";
import {
  terrainTileKey,
  type TerrainTileBounds,
  type TerrainTileId,
} from "./raster-dem-terrain-tile-source";

// Same screen-space raster-spacing metric as final selection, not a certified
// vertical DEM error bound. Refine the coverage-first cut to 16 px before
// final-detail work; the very first coverage cut may intentionally be coarser.
const INITIAL_ERROR_TARGET_PIXELS = 16;

type RasterDemTerrainSelectionSnapshotContext = Readonly<{
  terrainSourceConfig: RasterDemTerrainResource;
  root: Group;
  shadowView: SharedThreeSceneShadowView | null;
  origin: MercatorCoordinate;
  meterScale: number;
  snapshotKnownHeightRanges: () => Record<string, readonly [number, number]>;
  meshes: ReadonlyMap<
    string,
    Readonly<{
      id: TerrainTileId;
      minimumHeightMeters: number;
      maximumHeightMeters: number;
    }>
  >;
  boundsPaddingMeters: Vector3;
  unknownTerrainHeightRange: TerrainSelectionInput["unknownHeightRange"];
  errorTargetPixels: number;
  shadowLevelOffset: number;
  minimumLevel: number;
  maximumLevel: number;
  maxSelectionTiles: number;
  meshSegments: number;
}>;

export const getViewportBounds = (map: MaplibreMap): TerrainTileBounds => {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
};

const cameraFrustumBounds = (
  camera: Camera | TileCameraSnapshot,
  root: Group,
  origin: MercatorCoordinate,
  meterScale: number
): TerrainTileBounds | null => {
  if (camera instanceof Camera) camera.updateWorldMatrix(true, false);
  const projection =
    camera instanceof Camera
      ? camera.projectionMatrix
      : new Matrix4().fromArray(camera.projectionMatrix);
  const world =
    camera instanceof Camera
      ? camera.matrixWorld
      : new Matrix4().fromArray(camera.matrixWorld);
  const clipToWorld = world.clone().multiply(projection.clone().invert());
  root.updateMatrixWorld(true);
  const localFromWorld = new Matrix4().copy(root.matrixWorld).invert();
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [
        camera.coordinateSystem === WebGLCoordinateSystem &&
        !camera.reversedDepth
          ? -1
          : 0,
        1,
      ]) {
        const local = new Vector3(x, y, z)
          .applyMatrix4(clipToWorld)
          .applyMatrix4(localFromWorld);
        const lngLat = new MercatorCoordinate(
          origin.x + local.x * meterScale,
          origin.y + local.z * meterScale,
          0
        ).toLngLat();
        west = Math.min(west, lngLat.lng);
        south = Math.min(south, lngLat.lat);
        east = Math.max(east, lngLat.lng);
        north = Math.max(north, lngLat.lat);
      }
    }
  }
  return [west, south, east, north].every(Number.isFinite)
    ? {
        west: Math.max(-180, west),
        south: Math.max(-90, south),
        east: Math.min(180, east),
        north: Math.min(90, north),
      }
    : null;
};

export const computeRasterDemSelectionInputSignature = (
  frame: SharedThreeSceneFrame,
  map: MaplibreMap | null,
  errorTargetPixels: number,
  selectionShadowViewSignature: string,
  tileCameraSignature: string
): string => {
  const center = map?.getCenter?.();
  const lodViewport = frame.cssViewport ?? frame.viewport;
  // Evaluate changed matrices, including free cameras and terrain-aware
  // near/far changes. Equal resolved tile cuts keep their load generation and
  // overlapping requests; matrix jitter must not restart their preparation.
  const viewSignature = center
    ? [
        quantize(center.lng, 0.0000001),
        quantize(center.lat, 0.0000001),
        quantize(map?.getZoom?.() ?? 0, 0.0001),
        quantize(map?.getBearing?.() ?? 0, 0.001),
        quantize(map?.getPitch?.() ?? 0, 0.001),
      ]
    : [
        quantize(frame.lodCamera.position.x, 5),
        quantize(frame.lodCamera.position.y, 5),
        quantize(frame.lodCamera.position.z, 5),
        quantize(frame.lodCamera.quaternion.x, 0.005),
        quantize(frame.lodCamera.quaternion.y, 0.005),
        quantize(frame.lodCamera.quaternion.z, 0.005),
        quantize(frame.lodCamera.quaternion.w, 0.005),
      ];
  return [
    ...viewSignature,
    errorTargetPixels,
    ...frame.renderCamera.projectionMatrix.elements,
    ...frame.renderCamera.matrixWorld.elements,
    ...frame.lodCamera.projectionMatrix.elements,
    ...frame.lodCamera.position.toArray(),
    `${lodViewport.x}x${lodViewport.y}`,
    selectionShadowViewSignature,
    tileCameraSignature,
  ].join(";");
};

export const snapshotRasterDemTerrainSelectionInput = (
  frame: SharedThreeSceneFrame,
  {
    terrainSourceConfig,
    root,
    shadowView,
    origin,
    meterScale,
    snapshotKnownHeightRanges,
    meshes,
    boundsPaddingMeters,
    unknownTerrainHeightRange,
    errorTargetPixels,
    shadowLevelOffset,
    minimumLevel,
    maximumLevel,
    maxSelectionTiles,
    meshSegments,
  }: RasterDemTerrainSelectionSnapshotContext
): TerrainSelectionInput => {
  const lodViewport = frame.cssViewport ?? frame.viewport;
  frame.renderCamera.updateMatrixWorld(true);
  root.updateWorldMatrix(true, false);
  shadowView?.camera.updateMatrixWorld(true);
  const snapshotCamera = (camera: Camera) => ({
    projectionMatrix: [...camera.projectionMatrix.elements],
    matrixWorldInverse: [...camera.matrixWorldInverse.elements],
    matrixWorld: [...camera.matrixWorld.elements],
    coordinateSystem: camera.coordinateSystem,
    reversedDepth: camera.reversedDepth,
    isOrthographicCamera:
      (camera as Camera & { isOrthographicCamera?: boolean })
        .isOrthographicCamera ?? false,
    position: [camera.position.x, camera.position.y, camera.position.z] as [
      number,
      number,
      number
    ],
    fov: (camera as Camera & { fov?: number }).fov ?? 0,
  });
  const bounds = getViewportBounds(frame.map);
  const shadowBounds = shadowView
    ? cameraFrustumBounds(shadowView.camera, root, origin, meterScale)
    : null;
  const knownHeightRanges: Record<string, readonly [number, number]> =
    snapshotKnownHeightRanges();
  for (const [key, record] of meshes) {
    if (key.startsWith(`${TERRAIN_SELECTION_KIND.SOURCE}:`)) {
      const tileKey = terrainTileKey(record.id);
      const known = knownHeightRanges[tileKey];
      knownHeightRanges[tileKey] = [
        Math.min(known?.[0] ?? Infinity, record.minimumHeightMeters),
        Math.max(known?.[1] ?? -Infinity, record.maximumHeightMeters),
      ];
    }
  }
  return {
    viewportBounds: bounds,
    viewport: [lodViewport.x, lodViewport.y],
    viewportFocusNdc: [
      -frame.lodCamera.projectionMatrix.elements[8],
      -frame.lodCamera.projectionMatrix.elements[9],
    ],
    // Projection/frustum comes from the render camera; screen-space error
    // uses the separate perspective LOD camera, just like the inline walk.
    renderCamera: {
      ...snapshotCamera(frame.renderCamera),
      fov: frame.lodCamera.fov,
    },
    lodCameraPosition: [
      frame.lodCamera.position.x,
      frame.lodCamera.position.y,
      frame.lodCamera.position.z,
    ],
    rootMatrixWorld: [...root.matrixWorld.elements],
    origin: [origin.x, origin.y, origin.z],
    meterScale,
    boundsPaddingMeters: [
      boundsPaddingMeters.x,
      boundsPaddingMeters.y,
      boundsPaddingMeters.z,
    ],
    cameraViews: (frame.tileCameraViews ?? []).flatMap((view) => {
      const bounds = cameraFrustumBounds(view, root, origin, meterScale);
      return bounds ? [{ ...view, bounds }] : [];
    }),
    shadow:
      shadowView && shadowBounds
        ? {
            camera: snapshotCamera(shadowView.camera),
            casterAngularRadiusRadians: shadowView.casterAngularRadiusRadians,
            shadowMapSize: [
              shadowView.shadowMapSize.width,
              shadowView.shadowMapSize.height,
            ],
            bounds: shadowBounds,
          }
        : undefined,
    source: {
      bounds: {
        west: terrainSourceConfig.bounds[0],
        south: terrainSourceConfig.bounds[1],
        east: terrainSourceConfig.bounds[2],
        north: terrainSourceConfig.bounds[3],
      },
      minzoom: terrainSourceConfig.minzoom,
      maxzoom: terrainSourceConfig.maxzoom,
      meshSegments,
    },
    knownHeightRanges,
    unknownHeightRange: unknownTerrainHeightRange,
    errorTargetPixels: errorTargetPixels,
    shadowLevelOffset,
    minimumLevel,
    maximumLevel,
    maxSelectionTiles,
    initialErrorTargetPixels: INITIAL_ERROR_TARGET_PIXELS,
  };
};
