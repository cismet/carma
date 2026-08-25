import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Camera,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type ColorRepresentation,
} from "three";

import {
  acquireCesiumTerrainTileSource,
  cesiumTerrainTileKey,
  type CesiumTerrainTile,
  type CesiumTerrainTileBounds,
  type CesiumTerrainTileId,
  type CesiumTerrainTileSource,
} from "@carma-mapping/engines/cesium/terrain";
import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives";

import {
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
} from "./shared-three-terrain-registry";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "./shared-three-scene-layer";

const DEFAULT_TERRAIN_COLOR = 0xd8d1c4;
const DEFAULT_ERROR_TARGET_PIXELS = 2.5;
const DEFAULT_SHADOW_LEVEL_OFFSET = 2;
const DEFAULT_MINIMUM_LEVEL = 8;
const DEFAULT_MAXIMUM_LEVEL = 17;
const DEFAULT_MAX_SELECTION_TILES = 192;
const DEFAULT_REQUEST_CONCURRENCY = 6;
const DEFAULT_MAX_CACHED_MESHES = 256;

export type CesiumTerrainMaterialOptions = Readonly<{
  color?: ColorRepresentation;
  roughness?: number;
  metalness?: number;
}>;

export type CesiumTerrainRuntimeOptions = Readonly<{
  errorTargetPixels?: number;
  shadowLevelOffset?: number;
  minimumLevel?: number;
  maximumLevel?: number;
  maxSelectionTiles?: number;
  requestConcurrency?: number;
  maxCacheBytes?: number;
  maxCachedMeshes?: number;
  material?: CesiumTerrainMaterialOptions;
  onError?: (error: unknown) => void;
}>;

export interface CesiumTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
  setVisible: (visible: boolean) => void;
  setShadowCamera: (camera: Camera | null) => void;
  setMaterialColor: (color: ColorRepresentation) => void;
  getElevation: (longitude: number, latitude: number) => number | undefined;
}

type TerrainMeshRecord = {
  mesh: Mesh;
  boundaryIndices: Uint32Array;
  lastUsed: number;
};

type TerrainSelection = {
  ids: CesiumTerrainTileId[];
  signature: string;
};

type TerrainCandidate = {
  id: CesiumTerrainTileId;
  errorRatio: number;
};

const clampInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number
) => Math.max(minimum, Math.floor(value ?? fallback));

const boundsIntersect = (
  left: CesiumTerrainTileBounds,
  right: CesiumTerrainTileBounds
) =>
  left.west <= right.east &&
  left.east >= right.west &&
  left.south <= right.north &&
  left.north >= right.south;

const unionBounds = (
  left: CesiumTerrainTileBounds,
  right: CesiumTerrainTileBounds
): CesiumTerrainTileBounds => ({
  west: Math.min(left.west, right.west),
  south: Math.min(left.south, right.south),
  east: Math.max(left.east, right.east),
  north: Math.max(left.north, right.north),
});

const getViewportBounds = (map: MaplibreMap): CesiumTerrainTileBounds => {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
};

const cameraFrustumBounds = (
  camera: Camera,
  root: Group,
  origin: MercatorCoordinate,
  meterScale: number
): CesiumTerrainTileBounds | null => {
  camera.updateMatrixWorld(true);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  root.updateMatrixWorld(true);
  const localFromWorld = new Matrix4().copy(root.matrixWorld).invert();
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const local = new Vector3(x, y, z)
          .unproject(camera)
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

const loadWithConcurrency = async <T, R>(
  values: readonly T[],
  concurrency: number,
  load: (value: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await load(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker)
  );
  return results;
};

export const buildCesiumTerrainRuntime = (
  runtimeId: string,
  terrainUrl: string,
  originLngLat: [number, number],
  options: CesiumTerrainRuntimeOptions = {}
): CesiumTerrainRuntime => {
  const errorTargetPixels = Math.max(
    0.1,
    options.errorTargetPixels ?? DEFAULT_ERROR_TARGET_PIXELS
  );
  const minimumLevel = clampInteger(
    options.minimumLevel,
    DEFAULT_MINIMUM_LEVEL,
    0
  );
  const maximumLevel = Math.max(
    minimumLevel,
    clampInteger(options.maximumLevel, DEFAULT_MAXIMUM_LEVEL, 0)
  );
  const shadowLevelOffset = clampInteger(
    options.shadowLevelOffset,
    DEFAULT_SHADOW_LEVEL_OFFSET,
    0
  );
  const maxSelectionTiles = clampInteger(
    options.maxSelectionTiles,
    DEFAULT_MAX_SELECTION_TILES,
    1
  );
  const requestConcurrency = clampInteger(
    options.requestConcurrency,
    DEFAULT_REQUEST_CONCURRENCY,
    1
  );
  const maxCachedMeshes = clampInteger(
    options.maxCachedMeshes,
    DEFAULT_MAX_CACHED_MESHES,
    1
  );
  const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const root = new Group();
  root.name = `${runtimeId}-root`;
  const material = new MeshStandardMaterial({
    color: options.material?.color ?? DEFAULT_TERRAIN_COLOR,
    roughness: options.material?.roughness ?? 0.96,
    metalness: options.material?.metalness ?? 0,
  });
  const sourcePromise = acquireCesiumTerrainTileSource(terrainUrl, {
    maxCacheBytes: options.maxCacheBytes,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  let source: CesiumTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let shadowCamera: Camera | null = null;
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let meshUseClock = 0;
  let selectionGeneration = 0;
  let requestedSignature = "";
  let resolveReady: (loaded: boolean) => void = () => undefined;
  let readySettled = false;
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });

  const settleReady = (loaded: boolean) => {
    if (readySettled) return;
    readySettled = true;
    resolveReady(loaded);
  };

  const projectToLocalWorld = (
    longitude: number,
    latitude: number,
    height: number,
    target: Vector3
  ) => {
    const coordinate = MercatorCoordinate.fromLngLat(
      [longitude, latitude],
      height
    );
    return target.set(
      (coordinate.x - origin.x) / meterScale,
      (coordinate.z - origin.z) / meterScale,
      (coordinate.y - origin.y) / meterScale
    );
  };

  const getScreenSpaceError = (
    terrainSource: CesiumTerrainTileSource,
    frame: SharedThreeSceneFrame,
    id: CesiumTerrainTileId
  ) => {
    const bounds = terrainSource.getTileBounds(id);
    const center = projectToLocalWorld(
      (bounds.west + bounds.east) / 2,
      (bounds.south + bounds.north) / 2,
      0,
      new Vector3()
    );
    const corner = projectToLocalWorld(
      bounds.east,
      bounds.north,
      0,
      new Vector3()
    );
    const radius = center.distanceTo(corner);
    const distance = Math.max(
      1,
      frame.lodCamera.position.distanceTo(center) - radius
    );
    const focalLengthPixels =
      frame.viewport.y / (2 * Math.tan((frame.lodCamera.fov * Math.PI) / 360));
    return (
      (terrainSource.getLevelMaximumGeometricError(id.level) *
        focalLengthPixels) /
      distance
    );
  };

  const getRelevantChildren = (
    terrainSource: CesiumTerrainTileSource,
    parentId: CesiumTerrainTileId,
    viewportBounds: CesiumTerrainTileBounds,
    shadowBounds: CesiumTerrainTileBounds | null
  ) => {
    const childLevel = parentId.level + 1;
    const children: CesiumTerrainTileId[] = [];
    for (let yOffset = 0; yOffset < 2; yOffset += 1) {
      for (let xOffset = 0; xOffset < 2; xOffset += 1) {
        const id = {
          level: childLevel,
          x: parentId.x * 2 + xOffset,
          y: parentId.y * 2 + yOffset,
        };
        const bounds = terrainSource.getTileBounds(id);
        if (
          !boundsIntersect(bounds, viewportBounds) &&
          (!shadowBounds || !boundsIntersect(bounds, shadowBounds))
        ) {
          continue;
        }
        if (terrainSource.getTileDataAvailable(id) === false) return null;
        children.push(id);
      }
    }
    return children;
  };

  const ensureMesh = (tile: CesiumTerrainTile) => {
    const key = cesiumTerrainTileKey(tile.id);
    const cached = meshes.get(key);
    if (cached) {
      cached.lastUsed = ++meshUseClock;
      return cached.mesh;
    }
    const geometry = createProjectedTerrainTileGeometry({
      tile,
      projectToWorld: projectToLocalWorld,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `${runtimeId}-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    root.add(mesh);
    const boundaryIndices = Uint32Array.from(
      new Set([
        ...(tile.westIndices ?? []),
        ...(tile.southIndices ?? []),
        ...(tile.eastIndices ?? []),
        ...(tile.northIndices ?? []),
      ])
    );
    meshes.set(key, {
      mesh,
      boundaryIndices,
      lastUsed: ++meshUseClock,
    });
    return mesh;
  };

  const smoothActiveBoundaryNormals = (activeKeys: ReadonlySet<string>) => {
    const boundaries = new Map<
      string,
      {
        normal: Vector3;
        vertices: Array<{ record: TerrainMeshRecord; index: number }>;
      }
    >();
    for (const [key, record] of meshes) {
      if (!activeKeys.has(key)) continue;
      record.mesh.geometry.computeVertexNormals();
      const position = record.mesh.geometry.getAttribute("position");
      const normal = record.mesh.geometry.getAttribute("normal");
      for (const index of record.boundaryIndices) {
        const positionKey = `${Math.round(
          position.getX(index) * 1_000
        )}/${Math.round(position.getY(index) * 1_000)}/${Math.round(
          position.getZ(index) * 1_000
        )}`;
        const entry = boundaries.get(positionKey) ?? {
          normal: new Vector3(),
          vertices: [],
        };
        entry.normal.add(
          new Vector3(
            normal.getX(index),
            normal.getY(index),
            normal.getZ(index)
          )
        );
        entry.vertices.push({ record, index });
        boundaries.set(positionKey, entry);
      }
    }
    for (const { normal, vertices } of boundaries.values()) {
      if (vertices.length < 2 || normal.lengthSq() === 0) continue;
      normal.normalize();
      for (const { record, index } of vertices) {
        const attribute = record.mesh.geometry.getAttribute("normal");
        attribute.setXYZ(index, normal.x, normal.y, normal.z);
        attribute.needsUpdate = true;
      }
    }
  };

  const trimMeshCache = (activeKeys: ReadonlySet<string>) => {
    if (meshes.size <= maxCachedMeshes) return;
    const candidates = [...meshes.entries()]
      .filter(([key]) => !activeKeys.has(key))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      root.remove(record.mesh);
      record.mesh.geometry.dispose();
      meshes.delete(key);
      if (meshes.size <= maxCachedMeshes) break;
    }
  };

  const buildSelection = (
    terrainSource: CesiumTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelection => {
    const viewportBounds = getViewportBounds(frame.map);
    const shadowBounds = shadowCamera
      ? cameraFrustumBounds(shadowCamera, root, origin, meterScale)
      : null;
    const coverageBounds = shadowBounds
      ? unionBounds(viewportBounds, shadowBounds)
      : viewportBounds;
    let rootLevel = minimumLevel;
    let rootIds = terrainSource.getTileIdsForBounds(coverageBounds, rootLevel);
    while (rootIds.length > maxSelectionTiles && rootLevel > 0) {
      rootLevel -= 1;
      rootIds = terrainSource.getTileIdsForBounds(coverageBounds, rootLevel);
    }

    const selected = new Map(
      rootIds.map((id) => [cesiumTerrainTileKey(id), id])
    );
    const toCandidate = (id: CesiumTerrainTileId): TerrainCandidate => {
      const bounds = terrainSource.getTileBounds(id);
      const targetPixels = boundsIntersect(bounds, viewportBounds)
        ? errorTargetPixels
        : errorTargetPixels * 2 ** shadowLevelOffset;
      return {
        id,
        errorRatio:
          getScreenSpaceError(terrainSource, frame, id) / targetPixels,
      };
    };
    const candidates = rootIds.map(toCandidate);
    while (candidates.length > 0) {
      candidates.sort((left, right) => left.errorRatio - right.errorRatio);
      const candidate = candidates.pop()!;
      if (candidate.errorRatio <= 1) break;
      if (candidate.id.level >= maximumLevel) continue;
      const children = getRelevantChildren(
        terrainSource,
        candidate.id,
        viewportBounds,
        shadowBounds
      );
      if (!children?.length) continue;
      if (selected.size + children.length - 1 > maxSelectionTiles) continue;
      selected.delete(cesiumTerrainTileKey(candidate.id));
      for (const child of children) {
        selected.set(cesiumTerrainTileKey(child), child);
        candidates.push(toCandidate(child));
      }
    }

    const ids = [...selected.values()];
    return {
      ids,
      signature: ids.map(cesiumTerrainTileKey).sort().join("|"),
    };
  };

  const loadSelection = (
    terrainSource: CesiumTerrainTileSource,
    selection: TerrainSelection
  ) => {
    const generation = ++selectionGeneration;
    void loadWithConcurrency(selection.ids, requestConcurrency, (id) =>
      terrainSource.requestTile(id)
    )
      .then((tiles) => {
        if (disposed || generation !== selectionGeneration) return;
        const activeKeys = new Set<string>();
        for (const tile of tiles) {
          const key = cesiumTerrainTileKey(tile.id);
          activeKeys.add(key);
          ensureMesh(tile).visible = root.visible;
        }
        smoothActiveBoundaryNormals(activeKeys);
        for (const [key, record] of meshes) {
          record.mesh.visible = root.visible && activeKeys.has(key);
        }
        terrainSource.trimCache(activeKeys);
        trimMeshCache(activeKeys);
        settleReady(true);
        if (map) notifySharedThreeTerrainChanged(map);
        map?.triggerRepaint();
      })
      .catch((error) => {
        if (disposed || generation !== selectionGeneration) return;
        options.onError?.(error);
        settleReady(false);
      });
  };

  void sourcePromise
    .then((terrainSource) => {
      if (disposed) return;
      source = terrainSource;
      if (map) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          map,
          runtimeId,
          terrainSource.sampleHeight
        );
        map.triggerRepaint();
      }
    })
    .catch((error) => {
      if (disposed) return;
      options.onError?.(error);
      settleReady(false);
    });

  return {
    id: runtimeId,
    originLngLat,
    root,
    supportsShadows: true,
    ready,
    onAdd(mapInstance) {
      map = mapInstance;
      if (source && !unregisterSampler) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          mapInstance,
          runtimeId,
          source.sampleHeight
        );
      }
      map.triggerRepaint();
    },
    update(frame) {
      if (!source || disposed || !root.visible) return;
      const selection = buildSelection(source, frame);
      if (!selection.ids.length || selection.signature === requestedSignature) {
        return;
      }
      requestedSignature = selection.signature;
      loadSelection(source, selection);
    },
    setVisible(visible) {
      root.visible = visible;
      if (!visible) {
        for (const record of meshes.values()) record.mesh.visible = false;
      } else {
        requestedSignature = "";
      }
      map?.triggerRepaint();
    },
    setShadowCamera(camera) {
      shadowCamera = camera;
      map?.triggerRepaint();
    },
    setMaterialColor(color) {
      material.color.set(color);
      map?.triggerRepaint();
    },
    getElevation(longitude, latitude) {
      return source?.sampleHeight(longitude, latitude);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selectionGeneration += 1;
      unregisterSampler?.();
      unregisterSampler = null;
      for (const record of meshes.values()) record.mesh.geometry.dispose();
      meshes.clear();
      material.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};
