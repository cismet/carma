import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Camera,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshLambertMaterial,
  Vector3,
  type BufferGeometry,
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
import {
  createProjectedTerrainTileGeometry,
  type TerrainTileProjector,
} from "@carma-mapping/engines/three/primitives";

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
const ZERO_ELEVATION_EPSILON_METERS = 1e-3;
const TERRAIN_SHADOW_POLYGON_OFFSET_FACTOR = 2;
const TERRAIN_SHADOW_POLYGON_OFFSET_UNITS = 4;
const VIEWPORT_COVERAGE_PADDING_FACTOR = 0.25;

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

export type CesiumTerrainShadowView = Readonly<{
  camera: Camera;
  shadowMapSize: Readonly<{
    width: number;
    height: number;
  }>;
}>;

export interface CesiumTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
  setVisible: (visible: boolean) => void;
  /**
   * Freeze tile selection while a camera gesture is in flight. The loaded
   * meshes keep drawing; the next update after the freeze lifts re-selects.
   */
  setInteractive: (active: boolean) => void;
  setShadowCameras: (
    cameras: readonly (Camera | CesiumTerrainShadowView)[]
  ) => void;
  setShadowCamera: (
    camera: Camera | null,
    shadowMapSize?: CesiumTerrainShadowView["shadowMapSize"]
  ) => void;
  setMaterialColor: (color: ColorRepresentation) => void;
  getElevation: (longitude: number, latitude: number) => number | undefined;
}

type TerrainMeshRecord = {
  node: Group;
  reliefMesh: Mesh | null;
  baseMesh: Mesh | null;
  boundaryEdges: TerrainBoundaryEdges;
  lastUsed: number;
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
  errorRatio: number;
};

type TerrainShadowView = Readonly<{
  camera: Camera;
  shadowMapSize: CesiumTerrainShadowView["shadowMapSize"] | null;
}>;

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
      .lerp(
        after.normal,
        Math.max(0, Math.min(1, (parameter - before.parameter) / span))
      )
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
  shadowMapSize: CesiumTerrainShadowView["shadowMapSize"]
): CesiumTerrainShadowView["shadowMapSize"] => ({
  width:
    Number.isFinite(shadowMapSize.width) && shadowMapSize.width > 0
      ? shadowMapSize.width
      : 1,
  height:
    Number.isFinite(shadowMapSize.height) && shadowMapSize.height > 0
      ? shadowMapSize.height
      : 1,
});

const boundsIntersect = (
  left: CesiumTerrainTileBounds,
  right: CesiumTerrainTileBounds
) =>
  left.west <= right.east &&
  left.east >= right.west &&
  left.south <= right.north &&
  left.north >= right.south;

const boundsContain = (
  outer: CesiumTerrainTileBounds,
  inner: CesiumTerrainTileBounds
) =>
  outer.west <= inner.west &&
  outer.south <= inner.south &&
  outer.east >= inner.east &&
  outer.north >= inner.north;

const padBounds = (
  bounds: CesiumTerrainTileBounds
): CesiumTerrainTileBounds => {
  const longitudePadding =
    (bounds.east - bounds.west) * VIEWPORT_COVERAGE_PADDING_FACTOR;
  const latitudePadding =
    (bounds.north - bounds.south) * VIEWPORT_COVERAGE_PADDING_FACTOR;
  return {
    west: bounds.west - longitudePadding,
    south: Math.max(-90, bounds.south - latitudePadding),
    east: bounds.east + longitudePadding,
    north: Math.min(90, bounds.north + latitudePadding),
  };
};

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
  if (
    options.noDataHeightMeters !== undefined &&
    !Number.isFinite(options.noDataHeightMeters)
  ) {
    throw new RangeError("Terrain no-data height must be finite");
  }
  const noDataHeightMeters = options.noDataHeightMeters;
  const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
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
  const shadowDepthMaterial = new MeshDepthMaterial({
    polygonOffset: true,
    polygonOffsetFactor: TERRAIN_SHADOW_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: TERRAIN_SHADOW_POLYGON_OFFSET_UNITS,
  });
  shadowDepthMaterial.name = `${runtimeId}-shadow-depth`;
  const sourcePromise = acquireCesiumTerrainTileSource(terrainUrl, {
    maxCacheBytes: options.maxCacheBytes,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  let coverageMesh: Mesh | null = null;
  let coverageBounds: CesiumTerrainTileBounds | null = null;
  let source: CesiumTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let shadowViews: readonly TerrainShadowView[] = [];
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let meshUseClock = 0;
  let selectionGeneration = 0;
  let requestedSignature = "";
  let activeViewportElevationSignature = "";
  // What the last full LoD selection was computed from. `buildSelection` walks
  // and sorts every candidate tile, which is far too expensive to repeat on
  // every rendered frame while nothing moved; this cheap signature of its
  // inputs decides whether it runs at all.
  let selectionInputSignature = "";
  let interactive = false;
  // Quantized fingerprint of the shadow cameras. The shadow fit follows the
  // terrain it shades, so an unquantized feedback (camera -> selection ->
  // tiles -> elevation range -> camera ...) would never settle; rounding to a
  // couple of metres makes it converge.
  let shadowViewsSignature = "";
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

  const createFlatTerrainTile = (
    terrainSource: CesiumTerrainTileSource,
    id: CesiumTerrainTileId
  ): CesiumTerrainTile => ({
    id,
    bounds: terrainSource.getTileBounds(id),
    u: FLAT_TERRAIN_U,
    v: FLAT_TERRAIN_V,
    heightMeters: FLAT_TERRAIN_HEIGHTS,
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

  /**
   * Pixels one metre covers in the given orthographic shadow buffer.
   *
   * Tile-independent by construction, so it is computed once per selection
   * and multiplied with each tile's level error. Doing the matrix work per
   * candidate used to dominate the whole selection: `updateMatrixWorld(true)`
   * on the root recursed over every loaded terrain mesh, per tile.
   */
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
    viewportBounds: CesiumTerrainTileBounds,
    shadowBounds: readonly CesiumTerrainTileBounds[]
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
        const intersectsViewport = boundsIntersect(bounds, viewportBounds);
        const intersectsShadow = shadowBounds.some((candidateBounds) =>
          boundsIntersect(bounds, candidateBounds)
        );
        if (!intersectsViewport && !intersectsShadow) continue;
        const kind =
          terrainSource.getTileDataAvailable(id) === false ? "flat" : "source";
        // A flat 0 m tile cannot occlude elevated terrain from outside the
        // viewport, so only real terrain consumes the sun-frustum budget.
        if (kind === "flat" && !intersectsViewport) continue;
        children.push({ id, kind });
      }
    }
    return children;
  };

  const ensureMesh = (
    tile: CesiumTerrainTile,
    entry: TerrainSelectionEntry
  ) => {
    const key = terrainSelectionKey(entry);
    const cached = meshes.get(key);
    if (cached) {
      cached.lastUsed = ++meshUseClock;
      return cached.node;
    }
    let reliefGeometry: BufferGeometry | null =
      createProjectedTerrainTileGeometry({
        tile,
        projectToWorld: projectToLocalWorld,
      });
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
      reliefMesh.customDepthMaterial = shadowDepthMaterial;
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
    meshes.set(key, {
      node,
      reliefMesh,
      baseMesh,
      boundaryEdges,
      lastUsed: ++meshUseClock,
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

  const trimMeshCache = (activeKeys: ReadonlySet<string>) => {
    if (meshes.size <= maxCachedMeshes) return;
    const candidates = [...meshes.entries()]
      .filter(([key]) => !activeKeys.has(key))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      root.remove(record.node);
      record.reliefMesh?.geometry.dispose();
      record.baseMesh?.geometry.dispose();
      meshes.delete(key);
      if (meshes.size <= maxCachedMeshes) break;
    }
  };

  const buildSelection = (
    terrainSource: CesiumTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelection => {
    const viewportBounds = getViewportBounds(frame.map);
    const shadowCoverages = shadowViews.flatMap((view) => {
      const bounds = cameraFrustumBounds(view.camera, root, origin, meterScale);
      if (!bounds) return [];
      const pixelsPerMeter = getOrthographicPixelsPerMeter(
        view.camera,
        view.shadowMapSize?.width ?? frame.viewport.x,
        view.shadowMapSize?.height ?? frame.viewport.y
      );
      return [{ ...view, bounds, pixelsPerMeter }];
    });
    const shadowBounds = shadowCoverages.map(({ bounds }) => bounds);
    const coverageBounds = shadowBounds.reduce(
      (combined, bounds) => unionBounds(combined, bounds),
      viewportBounds
    );
    const getRootEntries = (level: number): TerrainSelectionEntry[] =>
      terrainSource
        .getTileGridIdsForBounds(coverageBounds, level)
        .flatMap((id) => {
          const bounds = terrainSource.getTileBounds(id);
          const intersectsViewport = boundsIntersect(bounds, viewportBounds);
          const intersectsShadow = shadowBounds.some((candidateBounds) =>
            boundsIntersect(bounds, candidateBounds)
          );
          if (!intersectsViewport && !intersectsShadow) return [];
          const kind =
            terrainSource.getTileDataAvailable(id) === false
              ? "flat"
              : "source";
          if (kind === "flat" && !intersectsViewport) {
            return [];
          }
          return [{ id, kind }];
        });
    const selPerf = (globalThis as unknown as Record<string, unknown>)
      .__carmaTerrainSelPerf as
      | { runs: number; rootMs: number; refineMs: number; roots: number; picked: number }
      | undefined;
    const selT0 = performance.now();
    let rootLevel = minimumLevel;
    let rootEntries = getRootEntries(rootLevel);
    while (rootEntries.length > maxSelectionTiles && rootLevel > 0) {
      rootLevel -= 1;
      rootEntries = getRootEntries(rootLevel);
    }
    const selT1 = performance.now();

    const selected = new Map(
      rootEntries.map((entry) => [terrainSelectionKey(entry), entry])
    );
    const toCandidate = (entry: TerrainSelectionEntry): TerrainCandidate => {
      const bounds = terrainSource.getTileBounds(entry.id);
      const intersectsViewport = boundsIntersect(bounds, viewportBounds);
      const viewportErrorRatio = intersectsViewport
        ? getScreenSpaceError(terrainSource, frame, entry.id) /
          errorTargetPixels
        : 0;
      const shadowTargetPixels = errorTargetPixels * 2 ** shadowLevelOffset;
      const levelErrorMeters = terrainSource.getLevelMaximumGeometricError(
        entry.id.level
      );
      const shadowErrorRatio = shadowCoverages.reduce(
        (maximum, coverage) =>
          boundsIntersect(bounds, coverage.bounds)
            ? Math.max(
                maximum,
                (levelErrorMeters * coverage.pixelsPerMeter) /
                  shadowTargetPixels
              )
            : maximum,
        0
      );
      return {
        entry,
        errorRatio:
          entry.kind === "flat"
            ? 0
            : Math.max(viewportErrorRatio, shadowErrorRatio),
      };
    };
    // A binary max-heap on errorRatio. The refinement loop pops the worst
    // tile, splits it and pushes its children; re-sorting the whole array on
    // every iteration made the selection quadratic and cost hundreds of
    // milliseconds once a shadow camera joined the coverage.
    const heap = rootEntries.map(toCandidate);
    const heapSwap = (a: number, b: number) => {
      const held = heap[a];
      heap[a] = heap[b];
      heap[b] = held;
    };
    const heapPush = (candidate: TerrainCandidate) => {
      heap.push(candidate);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent].errorRatio >= heap[index].errorRatio) break;
        heapSwap(parent, index);
        index = parent;
      }
    };
    const heapPop = (): TerrainCandidate => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let index = 0;
        for (;;) {
          const left = 2 * index + 1;
          const right = left + 1;
          let largest = index;
          if (
            left < heap.length &&
            heap[left].errorRatio > heap[largest].errorRatio
          ) {
            largest = left;
          }
          if (
            right < heap.length &&
            heap[right].errorRatio > heap[largest].errorRatio
          ) {
            largest = right;
          }
          if (largest === index) break;
          heapSwap(largest, index);
          index = largest;
        }
      }
      return top;
    };
    for (let index = (heap.length >> 1) - 1; index >= 0; index -= 1) {
      // heapify the roots in place
      let current = index;
      for (;;) {
        const left = 2 * current + 1;
        const right = left + 1;
        let largest = current;
        if (
          left < heap.length &&
          heap[left].errorRatio > heap[largest].errorRatio
        ) {
          largest = left;
        }
        if (
          right < heap.length &&
          heap[right].errorRatio > heap[largest].errorRatio
        ) {
          largest = right;
        }
        if (largest === current) break;
        heapSwap(largest, current);
        current = largest;
      }
    }
    while (heap.length > 0) {
      const candidate = heapPop();
      if (candidate.errorRatio <= 1) break;
      if (candidate.entry.id.level >= maximumLevel) continue;
      const children = getRelevantChildren(
        terrainSource,
        candidate.entry,
        viewportBounds,
        shadowBounds
      );
      if (!children.length) continue;
      if (selected.size + children.length - 1 > maxSelectionTiles) continue;
      selected.delete(terrainSelectionKey(candidate.entry));
      for (const child of children) {
        selected.set(terrainSelectionKey(child), child);
        heapPush(toCandidate(child));
      }
    }

    if (selPerf) {
      selPerf.runs += 1;
      selPerf.rootMs += selT1 - selT0;
      selPerf.refineMs += performance.now() - selT1;
      selPerf.roots += rootEntries.length;
      selPerf.picked += selected.size;
    }
    const entries = [...selected.values()];
    return {
      entries,
      signature: entries.map(terrainSelectionKey).sort().join("|"),
      viewportElevationSignature: entries
        .filter(
          (entry) =>
            entry.kind === "source" &&
            boundsIntersect(
              terrainSource.getTileBounds(entry.id),
              viewportBounds
            )
        )
        .map(terrainSelectionKey)
        .sort()
        .join("|"),
    };
  };

  const quantize = (value: number, step: number) =>
    Math.round(value / step) * step;

  const computeShadowViewsSignature = (
    views: readonly TerrainShadowView[]
  ): string =>
    views
      .map(({ camera, shadowMapSize }) => {
        const ortho = camera as unknown as {
          left?: number;
          right?: number;
          top?: number;
          bottom?: number;
          near?: number;
          far?: number;
        };
        const position = camera.position;
        return [
          quantize(position.x, 2),
          quantize(position.y, 2),
          quantize(position.z, 2),
          quantize(ortho.left ?? 0, 2),
          quantize(ortho.right ?? 0, 2),
          quantize(ortho.top ?? 0, 2),
          quantize(ortho.bottom ?? 0, 2),
          quantize(ortho.near ?? 0, 4),
          quantize(ortho.far ?? 0, 4),
          shadowMapSize ? `${shadowMapSize.width}x${shadowMapSize.height}` : "v",
        ].join(",");
      })
      .join("|");

  const computeSelectionInputSignature = (
    frame: SharedThreeSceneFrame
  ): string => {
    // The synthesized LoD camera already encodes centre, zoom, bearing and
    // pitch; quantizing its pose keeps a slow pan from re-selecting on every
    // frame while staying independent of the host map's API surface.
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
      shadowViewsSignature,
    ].join(";");
  };

  const updateViewportCoverage = (frame: SharedThreeSceneFrame) => {
    const viewportBounds = getViewportBounds(frame.map);
    if (coverageBounds && boundsContain(coverageBounds, viewportBounds)) return;
    coverageBounds = padBounds(viewportBounds);
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
    const generation = ++selectionGeneration;
    void loadWithConcurrency(selection.entries, requestConcurrency, (entry) =>
      entry.kind === "flat"
        ? Promise.resolve({
            entry,
            tile: createFlatTerrainTile(terrainSource, entry.id),
          })
        : terrainSource.requestTile(entry.id).then((tile) => ({ entry, tile }))
    )
      .then((loadedEntries) => {
        if (disposed || generation !== selectionGeneration) return;
        const activeKeys = new Set<string>();
        const retainedSourceKeys = new Set<string>();
        for (const { entry, tile } of loadedEntries) {
          const key = terrainSelectionKey(entry);
          activeKeys.add(key);
          if (entry.kind === "source") {
            retainedSourceKeys.add(cesiumTerrainTileKey(entry.id));
          }
          ensureMesh(tile, entry).visible = root.visible;
        }
        smoothActiveBoundaryNormals(activeKeys);
        for (const [key, record] of meshes) {
          record.node.visible = root.visible && activeKeys.has(key);
        }
        terrainSource.trimCache(retainedSourceKeys);
        trimMeshCache(activeKeys);
        settleReady(true);
        options.onContentChanged?.();
        if (
          map &&
          selection.viewportElevationSignature !==
            activeViewportElevationSignature
        ) {
          activeViewportElevationSignature =
            selection.viewportElevationSignature;
          notifySharedThreeTerrainChanged(map);
        }
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
      if (disposed || !root.visible) return;
      updateViewportCoverage(frame);
      if (!source) return;
      // The full selection walk is only worth its cost when something it
      // depends on has moved: the map camera (quantized so a slow pan
      // re-selects in steps rather than per frame) or the shadow fit.
      if (interactive) return;
      const inputSignature = computeSelectionInputSignature(frame);
      if (inputSignature === selectionInputSignature) return;
      const selection = buildSelection(source, frame);
      selectionInputSignature = inputSignature;
      if (selection.signature === requestedSignature) {
        return;
      }
      requestedSignature = selection.signature;
      loadSelection(source, selection);
    },
    setInteractive(active) {
      if (interactive === active) return;
      interactive = active;
      if (!active) {
        selectionInputSignature = "";
        map?.triggerRepaint();
      }
    },
    setVisible(visible) {
      root.visible = visible;
      if (!visible) {
        for (const record of meshes.values()) record.node.visible = false;
      } else {
        requestedSignature = "";
        selectionInputSignature = "";
      }
      map?.triggerRepaint();
    },
    setShadowCameras(cameras) {
      shadowViews = cameras.map((entry) =>
        (entry as Camera & { isCamera?: boolean }).isCamera
          ? { camera: entry as Camera, shadowMapSize: null }
          : {
              camera: (entry as CesiumTerrainShadowView).camera,
              shadowMapSize: normalizeShadowMapSize(
                (entry as CesiumTerrainShadowView).shadowMapSize
              ),
            }
      );
      const nextSignature = computeShadowViewsSignature(shadowViews);
      if (nextSignature !== shadowViewsSignature) {
        shadowViewsSignature = nextSignature;
        selectionInputSignature = "";
      }
    },
    setShadowCamera(camera, shadowMapSize) {
      shadowViews = camera
        ? [
            {
              camera,
              shadowMapSize: shadowMapSize
                ? normalizeShadowMapSize(shadowMapSize)
                : null,
            },
          ]
        : [];
      const nextSignature = computeShadowViewsSignature(shadowViews);
      if (nextSignature !== shadowViewsSignature) {
        shadowViewsSignature = nextSignature;
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
    dispose() {
      if (disposed) return;
      disposed = true;
      selectionGeneration += 1;
      unregisterSampler?.();
      unregisterSampler = null;
      for (const record of meshes.values()) {
        record.reliefMesh?.geometry.dispose();
        record.baseMesh?.geometry.dispose();
      }
      meshes.clear();
      material.dispose();
      coverageMesh?.geometry.dispose();
      coverageMaterial.dispose();
      shadowDepthMaterial.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};
