import { Cartographic, CesiumTerrainProvider } from "@carma-cesium";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";

const MAX_QUANTIZED_VALUE = 32_767;
const DEFAULT_MAX_CACHE_BYTES = 96 * 1024 ** 2;

export type CesiumTerrainTileId = Readonly<{
  level: number;
  x: number;
  y: number;
}>;

export type CesiumTerrainTileBounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export type CesiumTerrainTile = Readonly<{
  id: CesiumTerrainTileId;
  bounds: CesiumTerrainTileBounds;
  u: Float32Array;
  v: Float32Array;
  heightMeters: Float32Array;
  indices: Uint32Array;
  westIndices: Uint32Array;
  southIndices: Uint32Array;
  eastIndices: Uint32Array;
  northIndices: Uint32Array;
  childTileMask: number;
  geometricErrorMeters: number;
  byteLength: number;
}>;

export type CesiumTerrainTileSourceOptions = Readonly<{
  maxCacheBytes?: number;
}>;

export interface CesiumTerrainTileSource {
  terrainUrl: string;
  requestTile: (
    id: CesiumTerrainTileId,
    signal?: AbortSignal
  ) => Promise<CesiumTerrainTile>;
  getTileGridIdsForBounds: (
    bounds: CesiumTerrainTileBounds,
    level: number
  ) => CesiumTerrainTileId[];
  getTileBounds: (id: CesiumTerrainTileId) => CesiumTerrainTileBounds;
  getLevelMaximumGeometricError: (level: number) => number;
  getTileDataAvailable: (id: CesiumTerrainTileId) => boolean | undefined;
  sampleHeight: (longitude: number, latitude: number) => number | undefined;
  trimCache: (retainedKeys?: ReadonlySet<string>) => void;
}

type QuantizedMeshTerrainData = {
  _quantizedVertices?: Uint16Array;
  _indices?: Uint16Array | Uint32Array;
  _minimumHeight?: number;
  _maximumHeight?: number;
  _westIndices?: number[];
  _southIndices?: number[];
  _eastIndices?: number[];
  _northIndices?: number[];
  _childTileMask?: number;
  interpolateHeight: (
    rectangle: unknown,
    longitudeRadians: number,
    latitudeRadians: number
  ) => number | undefined;
};

type CacheEntry = {
  tile: CesiumTerrainTile;
  terrainData: QuantizedMeshTerrainData;
  rectangle: unknown;
  lastUsed: number;
};

const sourcePromises = new Map<string, Promise<CesiumTerrainTileSource>>();

export const cesiumTerrainTileKey = ({ level, x, y }: CesiumTerrainTileId) =>
  `${level}/${x}/${y}`;

const assertTileId = ({ level, x, y }: CesiumTerrainTileId) => {
  if (![level, x, y].every(Number.isInteger) || level < 0 || x < 0 || y < 0) {
    throw new RangeError(
      "Terrain tile coordinates must be non-negative integers"
    );
  }
};

const decodeTile = (
  provider: CesiumTerrainProvider,
  id: CesiumTerrainTileId,
  terrainData: QuantizedMeshTerrainData,
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
  }
): CesiumTerrainTile => {
  const quantized = terrainData._quantizedVertices;
  const sourceIndices = terrainData._indices;
  const minimumHeight = terrainData._minimumHeight;
  const maximumHeight = terrainData._maximumHeight;
  if (
    !quantized ||
    !sourceIndices ||
    !Number.isFinite(minimumHeight) ||
    !Number.isFinite(maximumHeight)
  ) {
    throw new TypeError("Terrain endpoint did not return quantized-mesh data");
  }

  const vertexCount = quantized.length / 3;
  const u = new Float32Array(vertexCount);
  const v = new Float32Array(vertexCount);
  const heightMeters = new Float32Array(vertexCount);
  const heightRange = maximumHeight! - minimumHeight!;
  for (let index = 0; index < vertexCount; index += 1) {
    u[index] = quantized[index] / MAX_QUANTIZED_VALUE;
    v[index] = quantized[vertexCount + index] / MAX_QUANTIZED_VALUE;
    heightMeters[index] =
      minimumHeight! +
      (quantized[vertexCount * 2 + index] / MAX_QUANTIZED_VALUE) * heightRange;
  }

  const indices = Uint32Array.from(sourceIndices);
  const westIndices = Uint32Array.from(terrainData._westIndices ?? []);
  const southIndices = Uint32Array.from(terrainData._southIndices ?? []);
  const eastIndices = Uint32Array.from(terrainData._eastIndices ?? []);
  const northIndices = Uint32Array.from(terrainData._northIndices ?? []);
  const arrays = [
    u,
    v,
    heightMeters,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  ];

  return {
    id,
    bounds: {
      west: radToDegNumeric(rectangle.west),
      south: radToDegNumeric(rectangle.south),
      east: radToDegNumeric(rectangle.east),
      north: radToDegNumeric(rectangle.north),
    },
    u,
    v,
    heightMeters,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    childTileMask: terrainData._childTileMask ?? 15,
    geometricErrorMeters: provider.getLevelMaximumGeometricError(id.level),
    byteLength: arrays.reduce((sum, array) => sum + array.byteLength, 0),
  };
};

const buildSource = async (
  terrainUrl: string,
  options: CesiumTerrainTileSourceOptions
): Promise<CesiumTerrainTileSource> => {
  const provider = await CesiumTerrainProvider.fromUrl(terrainUrl, {
    requestVertexNormals: false,
    requestWaterMask: false,
    requestMetadata: false,
  });
  const maxCacheBytes = Math.max(
    1,
    Math.floor(options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES)
  );
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CesiumTerrainTile>>();
  let cachedBytes = 0;
  let useClock = 0;

  const trimCache = (retainedKeys: ReadonlySet<string> = new Set()) => {
    if (cachedBytes <= maxCacheBytes) return;
    const candidates = [...cache.entries()]
      .filter(([key]) => !retainedKeys.has(key))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, entry] of candidates) {
      cache.delete(key);
      cachedBytes -= entry.tile.byteLength;
      if (cachedBytes <= maxCacheBytes) break;
    }
  };

  const requestTile = async (
    id: CesiumTerrainTileId,
    signal?: AbortSignal
  ): Promise<CesiumTerrainTile> => {
    assertTileId(id);
    signal?.throwIfAborted();
    const key = cesiumTerrainTileKey(id);
    const cached = cache.get(key);
    if (cached) {
      cached.lastUsed = ++useClock;
      return cached.tile;
    }
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const load = (async () => {
      let requested = provider.requestTileGeometry(id.x, id.y, id.level);
      while (!requested) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        requested = provider.requestTileGeometry(id.x, id.y, id.level);
      }
      const terrainData =
        (await requested) as unknown as QuantizedMeshTerrainData;
      signal?.throwIfAborted();
      const rectangle = provider.tilingScheme.tileXYToRectangle(
        id.x,
        id.y,
        id.level
      );
      const tile = decodeTile(provider, id, terrainData, rectangle);
      cache.set(key, {
        tile,
        terrainData,
        rectangle,
        lastUsed: ++useClock,
      });
      cachedBytes += tile.byteLength;
      trimCache();
      return tile;
    })();
    pending.set(key, load);
    try {
      return await load;
    } finally {
      pending.delete(key);
    }
  };

  const getTileGridIdsForBounds = (
    bounds: CesiumTerrainTileBounds,
    level: number
  ) => {
    if (!Number.isInteger(level) || level < 0) {
      throw new RangeError("Terrain level must be a non-negative integer");
    }
    const epsilon = 1e-10;
    const northWest = provider.tilingScheme.positionToTileXY(
      Cartographic.fromDegrees(bounds.west, bounds.north - epsilon),
      level
    );
    const southEast = provider.tilingScheme.positionToTileXY(
      Cartographic.fromDegrees(bounds.east - epsilon, bounds.south + epsilon),
      level
    );
    if (!northWest || !southEast) return [];
    const result: CesiumTerrainTileId[] = [];
    for (let y = northWest.y; y <= southEast.y; y += 1) {
      for (let x = northWest.x; x <= southEast.x; x += 1) {
        result.push({ level, x, y });
      }
    }
    return result;
  };

  return {
    terrainUrl,
    requestTile,
    getTileGridIdsForBounds,
    getTileBounds(id) {
      assertTileId(id);
      const rectangle = provider.tilingScheme.tileXYToRectangle(
        id.x,
        id.y,
        id.level
      );
      return {
        west: radToDegNumeric(rectangle.west),
        south: radToDegNumeric(rectangle.south),
        east: radToDegNumeric(rectangle.east),
        north: radToDegNumeric(rectangle.north),
      };
    },
    getLevelMaximumGeometricError: (level) =>
      provider.getLevelMaximumGeometricError(level),
    getTileDataAvailable: ({ x, y, level }) =>
      provider.getTileDataAvailable(x, y, level),
    sampleHeight(longitude, latitude) {
      const longitudeRadians = degToRadNumeric(longitude);
      const latitudeRadians = degToRadNumeric(latitude);
      const candidates = [...cache.values()]
        .filter(({ tile }) => {
          const { bounds } = tile;
          return (
            longitude >= bounds.west &&
            longitude <= bounds.east &&
            latitude >= bounds.south &&
            latitude <= bounds.north
          );
        })
        .sort((left, right) => right.tile.id.level - left.tile.id.level);
      for (const entry of candidates) {
        const height = entry.terrainData.interpolateHeight(
          entry.rectangle,
          longitudeRadians,
          latitudeRadians
        );
        if (Number.isFinite(height)) {
          entry.lastUsed = ++useClock;
          return height;
        }
      }
      return undefined;
    },
    trimCache,
  };
};

export const acquireCesiumTerrainTileSource = (
  terrainUrl: string,
  options: CesiumTerrainTileSourceOptions = {}
): Promise<CesiumTerrainTileSource> => {
  const normalizedUrl = terrainUrl.trim().replace(/\/+$/, "");
  if (!normalizedUrl) throw new TypeError("Terrain URL must not be empty");
  const cached = sourcePromises.get(normalizedUrl);
  if (cached) return cached;
  const pending = buildSource(normalizedUrl, options);
  sourcePromises.set(normalizedUrl, pending);
  void pending.catch(() => sourcePromises.delete(normalizedUrl));
  return pending;
};
