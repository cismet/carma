import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Box3,
  Camera,
  FrontSide,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";

import { clamp, quantize } from "@carma-commons/math";
import {
  geographicBoundsContain,
  geographicBoundsIntersect,
  padGeographicBounds,
  unionGeographicBounds,
} from "@carma-geo/helpers";
import {
  acquireCesiumTerrainTileSource,
  cesiumTerrainTileKey,
  type CesiumTerrainTile,
  type CesiumTerrainTileBounds,
  type CesiumTerrainTileId,
  type CesiumTerrainTileSource,
} from "@carma-mapping/engines/cesium/terrain";
import {
  createProjectedTerrainTileGeometry,
  type TerrainTileProjector,
} from "@carma-mapping/engines/three/primitives";

import {
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";
import { createProjectedTerrainGeometryCache } from "./projected-terrain-geometry-cache";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneDebugVolume,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowView,
} from "./shared-three-scene-layer";
import { getSharedThreeShadowViewSignature } from "./shared-three-scene-layer";

const DEFAULT_TERRAIN_COLOR = 0xd8d1c4;
const DEFAULT_ERROR_TARGET_PIXELS = 2.5;
const DEFAULT_SHADOW_LEVEL_OFFSET = 2;
const DEFAULT_MINIMUM_LEVEL = 8;
const DEFAULT_MAXIMUM_LEVEL = 17;
const DEFAULT_MAX_SELECTION_TILES = 192;
const DEFAULT_REQUEST_CONCURRENCY = 6;
const DEFAULT_MAX_CACHED_MESHES = 256;
const TERRAIN_UPDATE_PRIORITY = 100;
const ZERO_ELEVATION_EPSILON_METERS = 1e-3;
const VIEWPORT_COVERAGE_PADDING_FACTOR = 0.25;
const UNKNOWN_TERRAIN_HEIGHT_RANGE_METERS = [-1_000, 10_000] as const;

export type CesiumTerrainMaterialOptions = Readonly<{
  color?: ColorRepresentation;
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
  /** Source-specific height that denotes missing terrain coverage. */
  noDataHeightMeters?: number;
  material?: CesiumTerrainMaterialOptions;
  /** Called after the active terrain meshes or their normals changed. */
  onContentChanged?: () => void;
  onError?: (error: unknown) => void;
}>;

export interface CesiumTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  setMaterialColor: (color: ColorRepresentation) => void;
  getElevation: (longitude: number, latitude: number) => number | undefined;
  getViewElevationRange: (
    camera: Camera
  ) => readonly [minimum: number, maximum: number] | null;
  getDebugVolumes: () => readonly SharedThreeSceneDebugVolume[];
}

type TerrainMeshRecord = {
  node: Group;
  reliefMesh: Mesh | null;
  baseMesh: Mesh | null;
  boundaryEdges: TerrainBoundaryEdges;
  lastUsed: number;
  id: CesiumTerrainTileId;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
};

type TerrainBoundarySide = "west" | "south" | "east" | "north";

type TerrainBoundaryEdges = Record<TerrainBoundarySide, Uint32Array>;

type TerrainBoundaryVertex = {
  accumulator: TerrainBoundaryNormalAccumulator;
  parameter: number;
  normal: Vector3;
};

type TerrainBoundaryNormalAccumulator = {
  record: TerrainMeshRecord;
  index: number;
  normalSum: Vector3;
  contributorCount: number;
};

type TerrainBoundaryEdge = {
  side: TerrainBoundarySide;
  vertices: TerrainBoundaryVertex[];
  minimum: number;
  maximum: number;
};

type TerrainSelection = {
  entries: TerrainSelectionEntry[];
  signature: string;
  viewportElevationSignature: string;
};

type TerrainSelectionEntry = {
  id: CesiumTerrainTileId;
  kind: "source" | "flat";
};

type TerrainCandidate = {
  entry: TerrainSelectionEntry;
  /** Error against the view's own pixel target; 0 outside the viewport. */
  viewportErrorRatio: number;
  /** Error against the coarser shadow target; 0 outside the sun coverage. */
  shadowErrorRatio: number;
  intersectsViewport: boolean;
  viewportCenterDistanceSquared: number;
};

const FLAT_TERRAIN_U = new Float32Array([0, 0, 1, 1]);
const FLAT_TERRAIN_V = new Float32Array([0, 1, 0, 1]);
const FLAT_TERRAIN_HEIGHTS = new Float32Array(4);
const FLAT_TERRAIN_INDICES = new Uint32Array([0, 3, 1, 0, 2, 3]);
const FLAT_TERRAIN_WEST_INDICES = new Uint32Array([0, 1]);
const FLAT_TERRAIN_SOUTH_INDICES = new Uint32Array([0, 2]);
const FLAT_TERRAIN_EAST_INDICES = new Uint32Array([2, 3]);
const FLAT_TERRAIN_NORTH_INDICES = new Uint32Array([1, 3]);
const TERRAIN_BOUNDARY_KEY_PRECISION = 1_000;
const TERRAIN_BOUNDARY_OVERLAP_EPSILON = 1e-3;

const oppositeTerrainBoundarySide = (
  side: TerrainBoundarySide
): TerrainBoundarySide => {
  switch (side) {
    case "west":
      return "east";
    case "east":
      return "west";
    case "south":
      return "north";
    case "north":
      return "south";
  }
};

const terrainBoundaryAxis = (side: TerrainBoundarySide) =>
  side === "west" || side === "east" ? "x" : "z";

const interpolateTerrainBoundaryNormal = (
  edge: TerrainBoundaryEdge,
  parameter: number
): Vector3 | null => {
  const { vertices } = edge;
  if (vertices.length === 0) return null;
  if (vertices.length === 1) return vertices[0].normal.clone();
  if (
    parameter < edge.minimum - TERRAIN_BOUNDARY_OVERLAP_EPSILON ||
    parameter > edge.maximum + TERRAIN_BOUNDARY_OVERLAP_EPSILON
  ) {
    return null;
  }
  for (let index = 1; index < vertices.length; index += 1) {
    const before = vertices[index - 1];
    const after = vertices[index];
    if (parameter > after.parameter + TERRAIN_BOUNDARY_OVERLAP_EPSILON) {
      continue;
    }
    const span = after.parameter - before.parameter;
    if (Math.abs(span) <= TERRAIN_BOUNDARY_OVERLAP_EPSILON) {
      return before.normal.clone();
    }
    return before.normal
      .clone()
      .lerp(after.normal, clamp((parameter - before.parameter) / span, 0, 1))
      .normalize();
  }
  return vertices[vertices.length - 1].normal.clone();
};

const partitionNoDataTerrainGeometry = (
  geometry: BufferGeometry,
  tile: CesiumTerrainTile,
  noDataHeightMeters: number
) => {
  const noDataMask = Uint8Array.from(tile.heightMeters, (height) =>
    Math.abs(height - noDataHeightMeters) <= ZERO_ELEVATION_EPSILON_METERS
      ? 1
      : 0
  );
  const hasNoData = noDataMask.some((value) => value === 1);
  if (!hasNoData) {
    return {
      reliefGeometry: geometry,
      reliefVertexMask: new Uint8Array(
        geometry.getAttribute("position").count
      ).fill(1),
      hasNoData,
    };
  }

  const sourceIndex = geometry.getIndex();
  if (!sourceIndex) {
    throw new TypeError("Projected terrain geometry must be indexed");
  }
  const reliefIndices: number[] = [];
  const reliefVertexMask = new Uint8Array(tile.heightMeters.length);
  for (let offset = 0; offset < sourceIndex.count; offset += 3) {
    const a = sourceIndex.getX(offset);
    const b = sourceIndex.getX(offset + 1);
    const c = sourceIndex.getX(offset + 2);
    // A configured no-data vertex marks missing coverage. Keeping a mixed
    // triangle would create a kilometre-scale ramp whose interpolated normals
    // show up as a light-dependent wedge. Render only complete relief faces;
    // an independently triangulated base fills the gap.
    if (noDataMask[a] === 1 || noDataMask[b] === 1 || noDataMask[c] === 1) {
      continue;
    }
    reliefIndices.push(a, b, c);
    reliefVertexMask[a] = 1;
    reliefVertexMask[b] = 1;
    reliefVertexMask[c] = 1;
  }
  if (reliefIndices.length === 0) {
    geometry.dispose();
    return { reliefGeometry: null, reliefVertexMask, hasNoData };
  }
  geometry.setIndex(reliefIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { reliefGeometry: geometry, reliefVertexMask, hasNoData };
};

const createFlatTerrainGeometry = (
  bounds: CesiumTerrainTileBounds,
  heightMeters: number,
  projectToWorld: TerrainTileProjector
) =>
  createProjectedTerrainTileGeometry({
    tile: {
      bounds,
      u: FLAT_TERRAIN_U,
      v: FLAT_TERRAIN_V,
      heightMeters:
        heightMeters === 0
          ? FLAT_TERRAIN_HEIGHTS
          : new Float32Array(4).fill(heightMeters),
      indices: FLAT_TERRAIN_INDICES,
    },
    projectToWorld,
  });

const terrainSelectionKey = ({ id, kind }: TerrainSelectionEntry) =>
  `${kind}:${cesiumTerrainTileKey(id)}`;

const clampInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number
) => Math.max(minimum, Math.floor(value ?? fallback));

const normalizeShadowMapSize = (
  shadowMapSize: SharedThreeSceneShadowView["shadowMapSize"]
): SharedThreeSceneShadowView["shadowMapSize"] => ({
  width:
    Number.isFinite(shadowMapSize.width) && shadowMapSize.width > 0
      ? shadowMapSize.width
      : 1,
  height:
    Number.isFinite(shadowMapSize.height) && shadowMapSize.height > 0
      ? shadowMapSize.height
      : 1,
});

const getFiniteHeightRange = (
  heights: ArrayLike<number>
): readonly [minimum: number, maximum: number] | null => {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (!Number.isFinite(height)) continue;
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
};

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
  if (
    options.noDataHeightMeters !== undefined &&
    !Number.isFinite(options.noDataHeightMeters)
  ) {
    throw new RangeError("Terrain no-data height must be finite");
  }
  const noDataHeightMeters = options.noDataHeightMeters;
  const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const projectedGeometryCache = createProjectedTerrainGeometryCache(
    terrainUrl,
    originLngLat
  );
  const root = new Group();
  root.name = `${runtimeId}-root`;
  const material = new MeshLambertMaterial({
    color: options.material?.color ?? DEFAULT_TERRAIN_COLOR,
    side: FrontSide,
    // The terrain is an open upward-wound surface, unlike closed building
    // extrusions. Cast its visible top faces directly instead of Three.js's
    // default opposite-side pass, which requires a closed volume.
    shadowSide: FrontSide,
  });
  const coverageMaterial = material.clone();
  coverageMaterial.polygonOffset = true;
  coverageMaterial.polygonOffsetFactor = 1;
  coverageMaterial.polygonOffsetUnits = 1;
  const sourcePromise = acquireCesiumTerrainTileSource(terrainUrl, {
    maxCacheBytes: options.maxCacheBytes,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  let coverageMesh: Mesh | null = null;
  let coverageBounds: CesiumTerrainTileBounds | null = null;
  let source: CesiumTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let shadowView: SharedThreeSceneShadowView | null = null;
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let terrainLoading = true;
  let meshUseClock = 0;
  let selectionGeneration = 0;
  let requestedSignature = "";
  let activeViewportElevationSignature = "";
  // Avoid repeating the full selection walk for an unchanged view.
  let selectionInputSignature = "";
  // Quantization prevents shadow-fit and terrain-selection feedback.
  let shadowViewSignature = "";
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

  const setTerrainLoading = (loading: boolean) => {
    terrainLoading = loading;
    if (map) setSharedThreeTerrainLoading(map, runtimeId, loading);
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

  const createFlatTerrainTile = (
    terrainSource: CesiumTerrainTileSource,
    id: CesiumTerrainTileId
  ): CesiumTerrainTile => ({
    id,
    bounds: terrainSource.getTileBounds(id),
    u: FLAT_TERRAIN_U,
    v: FLAT_TERRAIN_V,
    heightMeters: FLAT_TERRAIN_HEIGHTS,
    minimumHeightMeters: 0,
    maximumHeightMeters: 0,
    indices: FLAT_TERRAIN_INDICES,
    westIndices: FLAT_TERRAIN_WEST_INDICES,
    southIndices: FLAT_TERRAIN_SOUTH_INDICES,
    eastIndices: FLAT_TERRAIN_EAST_INDICES,
    northIndices: FLAT_TERRAIN_NORTH_INDICES,
    childTileMask: 0,
    geometricErrorMeters: 0,
    byteLength: 0,
  });

  const getScreenSpaceError = (
    terrainSource: CesiumTerrainTileSource,
    frame: SharedThreeSceneFrame,
    id: CesiumTerrainTileId,
    localBoundingBox: Box3,
    localCameraPosition: Vector3
  ) => {
    const distance = Math.max(
      1,
      localBoundingBox.distanceToPoint(localCameraPosition)
    );
    const focalLengthPixels =
      frame.viewport.y / (2 * Math.tan((frame.lodCamera.fov * Math.PI) / 360));
    return (
      (terrainSource.getLevelMaximumGeometricError(id.level) *
        focalLengthPixels) /
      distance
    );
  };

  /** Pixel density of an orthographic shadow buffer in the terrain frame. */
  const getOrthographicPixelsPerMeter = (
    camera: Camera,
    pixelWidth: number,
    pixelHeight: number
  ) => {
    if (
      !(camera as Camera & { isOrthographicCamera?: boolean })
        .isOrthographicCamera
    ) {
      return 0;
    }
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const clipFromRoot = new Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(root.matrixWorld);
    const elements = clipFromRoot.elements;
    const pixelsPerMeterForAxis = (offset: number) =>
      Math.hypot(
        (elements[offset] * pixelWidth) / 2,
        (elements[offset + 1] * pixelHeight) / 2
      );
    return Math.max(
      pixelsPerMeterForAxis(0),
      pixelsPerMeterForAxis(4),
      pixelsPerMeterForAxis(8)
    );
  };

  const getRelevantChildren = (
    terrainSource: CesiumTerrainTileSource,
    parent: TerrainSelectionEntry,
    intersectsViewport: (entry: TerrainSelectionEntry) => boolean,
    shadowBounds: CesiumTerrainTileBounds | null
  ) => {
    if (parent.kind === "flat") return [];
    const childLevel = parent.id.level + 1;
    const children: TerrainSelectionEntry[] = [];
    for (let yOffset = 0; yOffset < 2; yOffset += 1) {
      for (let xOffset = 0; xOffset < 2; xOffset += 1) {
        const id = {
          level: childLevel,
          x: parent.id.x * 2 + xOffset,
          y: parent.id.y * 2 + yOffset,
        };
        const bounds = terrainSource.getTileBounds(id);
        const entry = { id, kind: "source" } as const;
        const childIntersectsViewport = intersectsViewport(entry);
        const intersectsShadow =
          shadowBounds !== null &&
          geographicBoundsIntersect(bounds, shadowBounds);
        if (!childIntersectsViewport && !intersectsShadow) continue;
        // Keep the parent whole when any relevant child lacks source data.
        if (terrainSource.getTileDataAvailable(id) === false) return [];
        children.push(entry);
      }
    }
    return children;
  };

  const createProjectedGeometry = (tile: CesiumTerrainTile) =>
    createProjectedTerrainTileGeometry({
      tile,
      projectToWorld: projectToLocalWorld,
    });

  const loadTerrainEntry = async (
    terrainSource: CesiumTerrainTileSource,
    entry: TerrainSelectionEntry
  ) => {
    if (entry.kind === "flat") {
      const tile = createFlatTerrainTile(terrainSource, entry.id);
      return { tile, projectedGeometry: createProjectedGeometry(tile) };
    }
    const cached = await projectedGeometryCache.get(entry.id);
    if (cached) {
      return { tile: cached.tile, projectedGeometry: cached.geometry };
    }
    const tile = await terrainSource.requestTile(entry.id);
    const projectedGeometry = createProjectedGeometry(tile);
    projectedGeometryCache.set(tile, projectedGeometry);
    return { tile, projectedGeometry };
  };

  const ensureMesh = (
    tile: CesiumTerrainTile,
    entry: TerrainSelectionEntry,
    projectedGeometry?: BufferGeometry
  ) => {
    const key = terrainSelectionKey(entry);
    const cached = meshes.get(key);
    if (cached) {
      projectedGeometry?.dispose();
      cached.lastUsed = ++meshUseClock;
      return cached.node;
    }
    let reliefGeometry: BufferGeometry | null =
      projectedGeometry ?? createProjectedGeometry(tile);
    let reliefVertexMask = new Uint8Array(
      reliefGeometry.getAttribute("position").count
    ).fill(1);
    let baseGeometry: BufferGeometry | null = null;
    if (entry.kind === "flat") {
      baseGeometry = reliefGeometry;
      reliefGeometry = null;
      reliefVertexMask.fill(0);
    } else if (noDataHeightMeters !== undefined) {
      const partition = partitionNoDataTerrainGeometry(
        reliefGeometry,
        tile,
        noDataHeightMeters
      );
      reliefGeometry = partition.reliefGeometry;
      reliefVertexMask = partition.reliefVertexMask;
      if (partition.hasNoData) {
        baseGeometry = createFlatTerrainGeometry(
          tile.bounds,
          noDataHeightMeters,
          projectToLocalWorld
        );
      }
    }

    const node = new Group();
    node.name = `${runtimeId}-${key}`;
    let baseMesh: Mesh | null = null;
    if (baseGeometry) {
      baseMesh = new Mesh(baseGeometry, material);
      baseMesh.userData.isShadowTerrainSurface = true;
      baseMesh.name = `${node.name}-base`;
      baseMesh.castShadow = false;
      baseMesh.receiveShadow = true;
      baseMesh.userData.disableShadowCasting = true;
      node.add(baseMesh);
    }
    let reliefMesh: Mesh | null = null;
    if (reliefGeometry) {
      reliefMesh = new Mesh(reliefGeometry, material);
      reliefMesh.userData.isShadowTerrainSurface = true;
      reliefMesh.name = `${node.name}-relief`;
      reliefMesh.castShadow = true;
      reliefMesh.receiveShadow = true;
      node.add(reliefMesh);
    }
    node.visible = false;
    root.add(node);
    const filterReliefBoundary = (indices: Uint32Array | undefined) =>
      Uint32Array.from(
        [...(indices ?? [])].filter((index) => reliefVertexMask[index] === 1)
      );
    const boundaryEdges: TerrainBoundaryEdges = {
      west: filterReliefBoundary(tile.westIndices),
      south: filterReliefBoundary(tile.southIndices),
      east: filterReliefBoundary(tile.eastIndices),
      north: filterReliefBoundary(tile.northIndices),
    };
    const decodedHeightRange = getFiniteHeightRange(tile.heightMeters) ?? [
      0, 0,
    ];
    const minimumHeightMeters = Number.isFinite(tile.minimumHeightMeters)
      ? tile.minimumHeightMeters
      : decodedHeightRange[0];
    const maximumHeightMeters = Number.isFinite(tile.maximumHeightMeters)
      ? tile.maximumHeightMeters
      : decodedHeightRange[1];
    meshes.set(key, {
      node,
      reliefMesh,
      baseMesh,
      boundaryEdges,
      lastUsed: ++meshUseClock,
      id: entry.id,
      minimumHeightMeters,
      maximumHeightMeters,
    });
    return node;
  };

  const smoothActiveBoundaryNormals = (activeKeys: ReadonlySet<string>) => {
    const boundaries = new Map<string, TerrainBoundaryEdge[]>();
    const normalAccumulators = new Map<
      string,
      TerrainBoundaryNormalAccumulator
    >();
    for (const [key, record] of meshes) {
      if (!activeKeys.has(key)) continue;
      const { reliefMesh } = record;
      if (!reliefMesh) continue;
      reliefMesh.geometry.computeVertexNormals();
      const normal = reliefMesh.geometry.getAttribute("normal");
      const position = reliefMesh.geometry.getAttribute("position");
      for (const side of ["west", "south", "east", "north"] as const) {
        const indices = record.boundaryEdges[side];
        const axis = terrainBoundaryAxis(side);
        const edgeVertices: TerrainBoundaryVertex[] = [];
        for (const index of indices) {
          const vertexNormal = new Vector3(
            normal.getX(index),
            normal.getY(index),
            normal.getZ(index)
          );
          if (vertexNormal.lengthSq() <= Number.EPSILON) continue;
          const vertexKey = `${key}/${index}`;
          const accumulator =
            normalAccumulators.get(vertexKey) ??
            ({
              record,
              index,
              normalSum: vertexNormal.clone(),
              contributorCount: 0,
            } satisfies TerrainBoundaryNormalAccumulator);
          normalAccumulators.set(vertexKey, accumulator);
          edgeVertices.push({
            accumulator,
            parameter:
              axis === "x" ? position.getZ(index) : position.getX(index),
            normal: vertexNormal,
          });
        }
        edgeVertices.sort((left, right) => left.parameter - right.parameter);
        if (edgeVertices.length === 0) continue;
        const lineCoordinate =
          axis === "x"
            ? position.getX(edgeVertices[0].accumulator.index)
            : position.getZ(edgeVertices[0].accumulator.index);
        const lineKey = `${axis}/${Math.round(
          lineCoordinate * TERRAIN_BOUNDARY_KEY_PRECISION
        )}`;
        const edge: TerrainBoundaryEdge = {
          side,
          vertices: edgeVertices,
          minimum: edgeVertices[0].parameter,
          maximum: edgeVertices[edgeVertices.length - 1].parameter,
        };
        const lineEdges = boundaries.get(lineKey) ?? [];
        lineEdges.push(edge);
        boundaries.set(lineKey, lineEdges);
      }
    }

    for (const edges of boundaries.values()) {
      for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
        const left = edges[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < edges.length;
          rightIndex += 1
        ) {
          const right = edges[rightIndex];
          if (oppositeTerrainBoundarySide(left.side) !== right.side) continue;
          const overlapMinimum = Math.max(left.minimum, right.minimum);
          const overlapMaximum = Math.min(left.maximum, right.maximum);
          if (
            overlapMaximum - overlapMinimum <=
            TERRAIN_BOUNDARY_OVERLAP_EPSILON
          ) {
            continue;
          }
          for (const vertex of left.vertices) {
            const neighborNormal = interpolateTerrainBoundaryNormal(
              right,
              vertex.parameter
            );
            if (!neighborNormal) continue;
            vertex.accumulator.normalSum.add(neighborNormal);
            vertex.accumulator.contributorCount += 1;
          }
          for (const vertex of right.vertices) {
            const neighborNormal = interpolateTerrainBoundaryNormal(
              left,
              vertex.parameter
            );
            if (!neighborNormal) continue;
            vertex.accumulator.normalSum.add(neighborNormal);
            vertex.accumulator.contributorCount += 1;
          }
        }
      }
    }

    const updatedAttributes = new Set<
      ReturnType<BufferGeometry["getAttribute"]>
    >();
    for (const accumulator of normalAccumulators.values()) {
      if (
        accumulator.contributorCount === 0 ||
        accumulator.normalSum.lengthSq() === 0
      ) {
        continue;
      }
      accumulator.normalSum.normalize();
      const attribute =
        accumulator.record.reliefMesh!.geometry.getAttribute("normal");
      attribute.setXYZ(
        accumulator.index,
        accumulator.normalSum.x,
        accumulator.normalSum.y,
        accumulator.normalSum.z
      );
      updatedAttributes.add(attribute);
    }
    for (const attribute of updatedAttributes) attribute.needsUpdate = true;
  };

  let activeMeshKeys: ReadonlySet<string> = new Set();
  const terrainBoundsCorner = new Vector3();

  const getTerrainMeshWorldBounds = (
    record: TerrainMeshRecord,
    target: Box3
  ): Box3 => {
    const geographicBounds = source!.getTileBounds(record.id);
    target.makeEmpty();
    for (const longitude of [geographicBounds.west, geographicBounds.east]) {
      for (const latitude of [geographicBounds.south, geographicBounds.north]) {
        target.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            record.minimumHeightMeters,
            terrainBoundsCorner
          )
        );
        target.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            record.maximumHeightMeters,
            terrainBoundsCorner
          )
        );
      }
    }
    return target.applyMatrix4(root.matrixWorld);
  };

  const getViewElevationRange = (
    camera: Camera
  ): readonly [number, number] | null => {
    if (!source || activeMeshKeys.size === 0) return null;
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const viewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const viewFrustum = new Frustum().setFromProjectionMatrix(
      viewProjection,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    const localBounds = new Box3();
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record?.node.visible) continue;
      getTerrainMeshWorldBounds(record, localBounds);
      if (!viewFrustum.intersectsBox(localBounds)) continue;
      minimum = Math.min(minimum, localBounds.min.y);
      maximum = Math.max(maximum, localBounds.max.y);
    }
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum]
      : null;
  };

  const getDebugVolumes = (): readonly SharedThreeSceneDebugVolume[] => {
    if (!source || activeMeshKeys.size === 0) return [];
    root.updateMatrixWorld(true);
    const bounds = new Box3();
    const volumes: SharedThreeSceneDebugVolume[] = [];
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record?.node.visible) continue;
      getTerrainMeshWorldBounds(record, bounds);
      volumes.push({
        id: `${runtimeId}:${key}`,
        kind: "terrain-tile",
        minimum: [bounds.min.x, bounds.min.y, bounds.min.z],
        maximum: [bounds.max.x, bounds.max.y, bounds.max.z],
      });
    }
    return volumes;
  };

  const applyMeshVisibility = () => {
    for (const [key, record] of meshes) {
      record.node.visible = root.visible && activeMeshKeys.has(key);
      record.node.position.y = 0;
      record.node.updateMatrixWorld();
    }
  };

  const trimMeshCache = (activeKeys: ReadonlySet<string>) => {
    let excess = meshes.size - maxCachedMeshes;
    if (excess <= 0) return;
    const candidates = [...meshes.entries()]
      .filter(([key]) => !activeKeys.has(key))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      if (excess <= 0) break;
      root.remove(record.node);
      record.reliefMesh?.geometry.dispose();
      record.baseMesh?.geometry.dispose();
      meshes.delete(key);
      excess -= 1;
    }
  };

  const buildSelection = (
    terrainSource: CesiumTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelection => {
    const viewportBounds = getViewportBounds(frame.map);
    const shadowBounds = shadowView
      ? cameraFrustumBounds(shadowView.camera, root, origin, meterScale)
      : null;
    const shadowPixelsPerMeter =
      shadowView && shadowBounds
        ? getOrthographicPixelsPerMeter(
            shadowView.camera,
            shadowView.shadowMapSize.width,
            shadowView.shadowMapSize.height
          )
        : 0;
    const coverageBounds = shadowBounds
      ? unionGeographicBounds(viewportBounds, shadowBounds)
      : viewportBounds;
    frame.renderCamera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, false);
    const clipFromWorld = new Matrix4().multiplyMatrices(
      frame.renderCamera.projectionMatrix,
      frame.renderCamera.matrixWorldInverse
    );
    const viewportFrustum = new Frustum().setFromProjectionMatrix(
      clipFromWorld
    );
    const localFromWorld = new Matrix4().copy(root.matrixWorld).invert();
    const localCameraPosition = frame.lodCamera.position
      .clone()
      .applyMatrix4(localFromWorld);
    const viewMetrics = new Map<
      string,
      Readonly<{
        intersectsViewport: boolean;
        localBoundingBox: Box3;
        viewportCenterDistanceSquared: number;
      }>
    >();
    const getKnownHeightRange = (
      entry: TerrainSelectionEntry
    ): readonly [minimum: number, maximum: number] => {
      if (entry.kind === "flat") {
        const height = noDataHeightMeters ?? 0;
        return [height, height];
      }
      let ancestor = entry.id;
      while (ancestor.level >= 0) {
        const record = meshes.get(
          terrainSelectionKey({ id: ancestor, kind: "source" })
        );
        if (record) {
          const uncertainty =
            ancestor.level === entry.id.level
              ? 0
              : terrainSource.getLevelMaximumGeometricError(ancestor.level);
          return [
            record.minimumHeightMeters - uncertainty,
            record.maximumHeightMeters + uncertainty,
          ];
        }
        if (ancestor.level === 0) break;
        ancestor = {
          level: ancestor.level - 1,
          x: ancestor.x >> 1,
          y: ancestor.y >> 1,
        };
      }
      return UNKNOWN_TERRAIN_HEIGHT_RANGE_METERS;
    };
    const getViewMetrics = (entry: TerrainSelectionEntry) => {
      const key = terrainSelectionKey(entry);
      const cached = viewMetrics.get(key);
      if (cached) return cached;
      const bounds = terrainSource.getTileBounds(entry.id);
      const [minimumHeight, maximumHeight] = getKnownHeightRange(entry);
      const localBoundingBox = new Box3();
      for (const longitude of [bounds.west, bounds.east]) {
        for (const latitude of [bounds.south, bounds.north]) {
          localBoundingBox.expandByPoint(
            projectToLocalWorld(
              longitude,
              latitude,
              minimumHeight,
              new Vector3()
            )
          );
          localBoundingBox.expandByPoint(
            projectToLocalWorld(
              longitude,
              latitude,
              maximumHeight,
              new Vector3()
            )
          );
        }
      }
      const worldBoundingBox = localBoundingBox
        .clone()
        .applyMatrix4(root.matrixWorld);
      const projectedCenter = worldBoundingBox
        .getCenter(new Vector3())
        .project(frame.renderCamera);
      const metrics = {
        intersectsViewport:
          geographicBoundsIntersect(bounds, viewportBounds) ||
          viewportFrustum.intersectsBox(worldBoundingBox),
        localBoundingBox,
        viewportCenterDistanceSquared:
          projectedCenter.x ** 2 + projectedCenter.y ** 2,
      };
      viewMetrics.set(key, metrics);
      return metrics;
    };
    const intersectsViewport = (entry: TerrainSelectionEntry) =>
      getViewMetrics(entry).intersectsViewport;
    const getRootSearchBounds = (level: number) => {
      const viewportIds = terrainSource.getTileGridIdsForBounds(
        viewportBounds,
        level
      );
      let longitudePadding = 0;
      let latitudePadding = 0;
      for (const id of viewportIds) {
        const bounds = terrainSource.getTileBounds(id);
        longitudePadding = Math.max(
          longitudePadding,
          bounds.east - bounds.west
        );
        latitudePadding = Math.max(
          latitudePadding,
          bounds.north - bounds.south
        );
      }
      const viewportAndNeighbors = {
        west: viewportBounds.west - longitudePadding,
        south: Math.max(-90, viewportBounds.south - latitudePadding),
        east: viewportBounds.east + longitudePadding,
        north: Math.min(90, viewportBounds.north + latitudePadding),
      };
      return unionGeographicBounds(coverageBounds, viewportAndNeighbors);
    };
    const getRootEntries = (level: number): TerrainSelectionEntry[] =>
      terrainSource
        .getTileGridIdsForBounds(getRootSearchBounds(level), level)
        .flatMap((id) => {
          const bounds = terrainSource.getTileBounds(id);
          const kind =
            terrainSource.getTileDataAvailable(id) === false
              ? "flat"
              : "source";
          const entry = { id, kind } as TerrainSelectionEntry;
          const rootIntersectsViewport = intersectsViewport(entry);
          const intersectsShadow =
            shadowBounds !== null &&
            geographicBoundsIntersect(bounds, shadowBounds);
          if (!rootIntersectsViewport && !intersectsShadow) return [];
          if (kind === "flat" && !rootIntersectsViewport) {
            return [];
          }
          return [entry];
        });
    let rootLevel = minimumLevel;
    let rootEntries = getRootEntries(rootLevel);
    while (rootEntries.length > maxSelectionTiles && rootLevel > 0) {
      rootLevel -= 1;
      rootEntries = getRootEntries(rootLevel);
    }
    const selected = new Map(
      rootEntries.map((entry) => [terrainSelectionKey(entry), entry])
    );
    const toCandidate = (entry: TerrainSelectionEntry): TerrainCandidate => {
      const bounds = terrainSource.getTileBounds(entry.id);
      const metrics = getViewMetrics(entry);
      const viewportErrorRatio = metrics.intersectsViewport
        ? getScreenSpaceError(
            terrainSource,
            frame,
            entry.id,
            metrics.localBoundingBox,
            localCameraPosition
          ) / errorTargetPixels
        : 0;
      const shadowTargetPixels = errorTargetPixels * 2 ** shadowLevelOffset;
      const levelErrorMeters = terrainSource.getLevelMaximumGeometricError(
        entry.id.level
      );
      const shadowErrorRatio =
        shadowBounds && geographicBoundsIntersect(bounds, shadowBounds)
          ? (levelErrorMeters * shadowPixelsPerMeter) / shadowTargetPixels
          : 0;
      return {
        entry,
        viewportErrorRatio: entry.kind === "flat" ? 0 : viewportErrorRatio,
        shadowErrorRatio: entry.kind === "flat" ? 0 : shadowErrorRatio,
        intersectsViewport: metrics.intersectsViewport,
        viewportCenterDistanceSquared: metrics.viewportCenterDistanceSquared,
      };
    };
    // Refine the viewport before spending the shared budget on sun coverage.
    const makeHeap = (ratioOf: (candidate: TerrainCandidate) => number) => {
      const heap: TerrainCandidate[] = [];
      const swap = (a: number, b: number) => {
        const held = heap[a];
        heap[a] = heap[b];
        heap[b] = held;
      };
      const siftDown = (from: number) => {
        let index = from;
        for (;;) {
          const left = 2 * index + 1;
          const right = left + 1;
          let largest = index;
          if (
            left < heap.length &&
            ratioOf(heap[left]) > ratioOf(heap[largest])
          ) {
            largest = left;
          }
          if (
            right < heap.length &&
            ratioOf(heap[right]) > ratioOf(heap[largest])
          ) {
            largest = right;
          }
          if (largest === index) break;
          swap(largest, index);
          index = largest;
        }
      };
      return {
        get size() {
          return heap.length;
        },
        push(candidate: TerrainCandidate) {
          heap.push(candidate);
          let index = heap.length - 1;
          while (index > 0) {
            const parent = (index - 1) >> 1;
            if (ratioOf(heap[parent]) >= ratioOf(heap[index])) break;
            swap(parent, index);
            index = parent;
          }
        },
        pop(): TerrainCandidate {
          const top = heap[0];
          const last = heap.pop()!;
          if (heap.length > 0) {
            heap[0] = last;
            siftDown(0);
          }
          return top;
        },
      };
    };

    const viewportHeap = makeHeap((candidate) => candidate.viewportErrorRatio);
    const shadowHeap = makeHeap((candidate) => candidate.shadowErrorRatio);
    for (const entry of rootEntries) {
      const candidate = toCandidate(entry);
      if (candidate.intersectsViewport) viewportHeap.push(candidate);
      else shadowHeap.push(candidate);
    }

    const refine = (
      heap: ReturnType<typeof makeHeap>,
      ratioOf: (candidate: TerrainCandidate) => number
    ) => {
      while (heap.size > 0) {
        const candidate = heap.pop();
        if (ratioOf(candidate) <= 1) break;
        if (candidate.entry.id.level >= maximumLevel) continue;
        const children = getRelevantChildren(
          terrainSource,
          candidate.entry,
          intersectsViewport,
          shadowBounds
        );
        if (!children.length) continue;
        if (selected.size + children.length - 1 > maxSelectionTiles) continue;
        selected.delete(terrainSelectionKey(candidate.entry));
        for (const child of children) {
          selected.set(terrainSelectionKey(child), child);
          const childCandidate = toCandidate(child);
          if (childCandidate.intersectsViewport) {
            viewportHeap.push(childCandidate);
          } else {
            shadowHeap.push(childCandidate);
          }
        }
      }
    };

    refine(viewportHeap, (candidate) => candidate.viewportErrorRatio);
    refine(shadowHeap, (candidate) => candidate.shadowErrorRatio);

    // Viewport tiles download before offscreen shadow casters.
    const entries = [...selected.values()].sort((left, right) => {
      const leftInView = intersectsViewport(left) ? 0 : 1;
      const rightInView = intersectsViewport(right) ? 0 : 1;
      if (leftInView !== rightInView) return leftInView - rightInView;
      return (
        getViewMetrics(left).viewportCenterDistanceSquared -
        getViewMetrics(right).viewportCenterDistanceSquared
      );
    });
    return {
      entries,
      signature: entries.map(terrainSelectionKey).sort().join("|"),
      viewportElevationSignature: entries
        .filter((entry) => entry.kind === "source" && intersectsViewport(entry))
        .map(terrainSelectionKey)
        .sort()
        .join("|"),
    };
  };

  const computeSelectionInputSignature = (
    frame: SharedThreeSceneFrame
  ): string => {
    // Quantize the synthesized LoD pose to limit selection churn.
    const { position, quaternion } = frame.lodCamera;
    return [
      quantize(position.x, 5),
      quantize(position.y, 5),
      quantize(position.z, 5),
      quantize(quaternion.x, 0.005),
      quantize(quaternion.y, 0.005),
      quantize(quaternion.z, 0.005),
      quantize(quaternion.w, 0.005),
      `${frame.viewport.x}x${frame.viewport.y}`,
      shadowViewSignature,
    ].join(";");
  };

  const updateViewportCoverage = (frame: SharedThreeSceneFrame) => {
    const viewportBounds = getViewportBounds(frame.map);
    if (
      coverageBounds &&
      geographicBoundsContain(coverageBounds, viewportBounds)
    ) {
      return;
    }
    coverageBounds = padGeographicBounds(
      viewportBounds,
      VIEWPORT_COVERAGE_PADDING_FACTOR
    );
    const geometry = createFlatTerrainGeometry(
      coverageBounds,
      noDataHeightMeters ?? 0,
      projectToLocalWorld
    );
    if (!coverageMesh) {
      coverageMesh = new Mesh(geometry, coverageMaterial);
      coverageMesh.userData.isShadowTerrainSurface = true;
      coverageMesh.name = `${runtimeId}-viewport-coverage`;
      coverageMesh.castShadow = false;
      coverageMesh.receiveShadow = true;
      coverageMesh.userData.disableShadowCasting = true;
      root.add(coverageMesh);
      return;
    }
    coverageMesh.geometry.dispose();
    coverageMesh.geometry = geometry;
  };

  const loadSelection = (
    terrainSource: CesiumTerrainTileSource,
    selection: TerrainSelection
  ) => {
    setTerrainLoading(true);
    const generation = ++selectionGeneration;
    void loadWithConcurrency(
      selection.entries,
      requestConcurrency,
      async (entry) => {
        if (disposed || generation !== selectionGeneration) {
          throw new Error("Stale terrain selection");
        }
        const { tile, projectedGeometry } = await loadTerrainEntry(
          terrainSource,
          entry
        );
        if (disposed || generation !== selectionGeneration) {
          projectedGeometry.dispose();
          throw new Error("Stale terrain selection");
        }
        return { entry, tile, projectedGeometry };
      }
    )
      .then((loadedEntries) => {
        if (disposed) {
          for (const { projectedGeometry } of loadedEntries) {
            projectedGeometry.dispose();
          }
          return;
        }
        if (generation !== selectionGeneration) {
          // Cache newly fetched meshes without changing the active generation.
          for (const { entry, tile, projectedGeometry } of loadedEntries) {
            if (!meshes.has(terrainSelectionKey(entry))) {
              ensureMesh(tile, entry, projectedGeometry).visible = false;
            } else {
              projectedGeometry.dispose();
            }
          }
          return;
        }
        const activeKeys = new Set<string>();
        const retainedSourceKeys = new Set<string>();
        for (const { entry, tile, projectedGeometry } of loadedEntries) {
          const key = terrainSelectionKey(entry);
          activeKeys.add(key);
          if (entry.kind === "source") {
            retainedSourceKeys.add(cesiumTerrainTileKey(entry.id));
          }
          ensureMesh(tile, entry, projectedGeometry).visible = root.visible;
        }
        smoothActiveBoundaryNormals(activeKeys);
        activeMeshKeys = activeKeys;
        applyMeshVisibility();
        terrainSource.trimCache(retainedSourceKeys);
        trimMeshCache(activeKeys);
        settleReady(true);
        setTerrainLoading(false);
        options.onContentChanged?.();
        if (
          map &&
          selection.viewportElevationSignature !==
            activeViewportElevationSignature
        ) {
          activeViewportElevationSignature =
            selection.viewportElevationSignature;
          notifySharedThreeTerrainChanged(map);
          // Re-evaluate screen-space error after source heights become known.
          selectionInputSignature = "";
        }
        map?.triggerRepaint();
      })
      .catch((error) => {
        if (disposed || generation !== selectionGeneration) return;
        setTerrainLoading(false);
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
      setTerrainLoading(false);
      options.onError?.(error);
      settleReady(false);
    });

  return {
    id: runtimeId,
    originLngLat,
    root,
    updatePriority: TERRAIN_UPDATE_PRIORITY,
    ready,
    onAdd(mapInstance) {
      map = mapInstance;
      setSharedThreeTerrainLoading(mapInstance, runtimeId, terrainLoading);
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
      if (disposed || !root.visible) return;
      updateViewportCoverage(frame);
      if (!source) return;
      const inputSignature = computeSelectionInputSignature(frame);
      if (inputSignature === selectionInputSignature) return;
      const selection = buildSelection(source, frame);
      selectionInputSignature = inputSignature;
      if (selection.signature === requestedSignature) {
        if (selectionGeneration === 0) {
          setTerrainLoading(false);
          settleReady(true);
        }
        return;
      }
      requestedSignature = selection.signature;
      loadSelection(source, selection);
    },
    setShadowView(view) {
      shadowView = view
        ? {
            camera: view.camera,
            shadowMapSize: normalizeShadowMapSize(view.shadowMapSize),
          }
        : null;
      const nextSignature = getSharedThreeShadowViewSignature(shadowView);
      if (nextSignature !== shadowViewSignature) {
        shadowViewSignature = nextSignature;
        selectionInputSignature = "";
      }
    },
    setMaterialColor(color) {
      material.color.set(color);
      coverageMaterial.color.set(color);
      map?.triggerRepaint();
    },
    getElevation(longitude, latitude) {
      return source?.sampleHeight(longitude, latitude);
    },
    getViewElevationRange,
    getDebugVolumes,
    dispose() {
      if (disposed) return;
      disposed = true;
      selectionGeneration += 1;
      unregisterSampler?.();
      unregisterSampler = null;
      if (map) setSharedThreeTerrainLoading(map, runtimeId, false);
      for (const record of meshes.values()) {
        record.reliefMesh?.geometry.dispose();
        record.baseMesh?.geometry.dispose();
      }
      meshes.clear();
      material.dispose();
      coverageMesh?.geometry.dispose();
      coverageMaterial.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};
