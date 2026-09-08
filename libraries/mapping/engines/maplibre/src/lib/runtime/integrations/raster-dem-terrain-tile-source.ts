import type { RasterDemTerrainResource } from "@carma-commons/resources";
import { runTerrainWorkerTask } from "./terrain-worker-client";
import { resolveRasterMeshErrorMeters } from "../../core/raster-mesh-error";

import {
  EARTH_CIRCUMFERENCE_METERS,
  assertTileId,
  longitudeToTileX,
  latitudeToTileY,
  getTileBounds,
  boundsIntersect,
  sampleRaster,
  terrainTileKey,
  type TerrainTileId,
  type TerrainTileBounds,
  type TerrainTile,
  type DecodedRaster,
} from "../../core/raster-dem-tile";
export { terrainTileKey } from "../../core/raster-dem-tile";
export type {
  TerrainTileId,
  TerrainTileBounds,
  TerrainTile,
} from "../../core/raster-dem-tile";
const DEFAULT_MAX_CACHE_BYTES = 96 * 1024 ** 2;
const TILE_RETRY_BASE_DELAY_MS = 250;
const TILE_RETRY_MAX_DELAY_MS = 8_000;
const TILE_RETRY_MAX_ATTEMPTS = 8;

export type RasterDemTerrainTileSourceOptions = Readonly<{
  maxCacheBytes?: number;
  meshSegments?: number;
}>;

export interface RasterDemTerrainTileSource {
  requestTile: (
    id: TerrainTileId,
    signal?: AbortSignal,
    maximumMeshErrorMeters?: number
  ) => Promise<TerrainTile>;
  getTileGridIdsForBounds: (
    bounds: TerrainTileBounds,
    level: number
  ) => TerrainTileId[];
  getTileBounds: (id: TerrainTileId) => TerrainTileBounds;
  getLevelMaximumGeometricError: (level: number) => number;
  getTileDataAvailable: (id: TerrainTileId) => boolean;
  sampleHeight: (longitude: number, latitude: number) => number | undefined;
  trimCache: (retainedKeys?: ReadonlySet<string>) => void;
  release: () => void;
}

type CacheEntry = {
  tile: TerrainTile;
  raster: DecodedRaster;
  lastUsed: number;
};

class TerrainRequestError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
  }
}

const sources = new Map<
  string,
  { source: RasterDemTerrainTileSource; users: number }
>();

export const isConfirmedTerrainServerError = (error: unknown): boolean => {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }
  const status = (error as { statusCode?: unknown }).statusCode;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
};

const waitWithSignal = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const buildSource = (
  config: RasterDemTerrainResource,
  options: RasterDemTerrainTileSourceOptions
): RasterDemTerrainTileSource => {
  const meshSegments = Math.max(
    2,
    Math.min(
      config.tileSize,
      Math.floor(options.meshSegments ?? config.tileSize)
    )
  );
  const maxCacheBytes = Math.max(
    1,
    Math.floor(options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES)
  );
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<TerrainTile>>();
  const lifetime = new AbortController();
  let cachedBytes = 0;
  let useClock = 0;

  const getLevelMaximumGeometricError = (level: number) => {
    const centerLatitude = (config.bounds[1] + config.bounds[3]) / 2;
    return (
      (EARTH_CIRCUMFERENCE_METERS *
        Math.cos((centerLatitude * Math.PI) / 180)) /
      (2 ** level * meshSegments)
    );
  };
  const tileIsAvailable = (id: TerrainTileId) =>
    id.level >= config.minzoom &&
    id.level <= config.maxzoom &&
    boundsIntersect(getTileBounds(id), config.bounds);
  const trimCache = (retainedKeys: ReadonlySet<string> = new Set()) => {
    if (cachedBytes <= maxCacheBytes) return;
    const candidates = [...cache.entries()]
      .filter(([, entry]) => !retainedKeys.has(terrainTileKey(entry.tile.id)))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, entry] of candidates) {
      cache.delete(key);
      cachedBytes -= entry.tile.byteLength + entry.raster.pixels.byteLength;
      if (cachedBytes <= maxCacheBytes) break;
    }
  };
  const requestTile = async (
    id: TerrainTileId,
    signal?: AbortSignal,
    requestedMaximumErrorMeters?: number
  ) => {
    signal = signal
      ? AbortSignal.any([signal, lifetime.signal])
      : lifetime.signal;
    assertTileId(id);
    if (!tileIsAvailable(id)) {
      throw new TerrainRequestError(
        `Terrain tile ${terrainTileKey(id)} is outside the configured source`,
        404
      );
    }
    signal?.throwIfAborted();
    const maximumMeshErrorMeters = resolveRasterMeshErrorMeters(
      requestedMaximumErrorMeters
    );
    const tileKey = terrainTileKey(id);
    const key = `${tileKey}:error=${maximumMeshErrorMeters}`;
    const cached = cache.get(key);
    if (cached) {
      cached.lastUsed = ++useClock;
      return cached.tile;
    }
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const load = (async () => {
      // A stricter view reuses the decoded source. Different mesh-error variants
      // never share geometry by tile id alone, and concurrent variants share the
      // first source request rather than downloading/decoding the PNG twice.
      const otherVariant = [...pending].find(([pendingKey]) =>
        pendingKey.startsWith(`${tileKey}:error=`)
      );
      if (otherVariant) await otherVariant[1];
      signal?.throwIfAborted();
      const decoded = [...cache.values()].find(
        (entry) => terrainTileKey(entry.tile.id) === tileKey
      )?.raster;
      if (decoded) {
        const result = await runTerrainWorkerTask(
          {
            kind: "remesh",
            raster: decoded,
            id,
            error: getLevelMaximumGeometricError(id.level),
            maximumMeshErrorMeters,
          },
          signal
        );
        if (result.kind !== "remesh")
          throw new Error("Unexpected terrain remeshing result");
        signal?.throwIfAborted();
        cache.set(key, {
          tile: result.tile,
          raster: result.raster,
          lastUsed: ++useClock,
        });
        cachedBytes += result.tile.byteLength + result.raster.pixels.byteLength;
        trimCache();
        return result.tile;
      }
      const url = config.url
        .replace("{z}", String(id.level))
        .replace("{x}", String(id.x))
        .replace("{y}", String(id.y));
      let response: Response | null = null;
      for (let attempt = 0; attempt < TILE_RETRY_MAX_ATTEMPTS; attempt += 1) {
        try {
          response = await fetch(url, { signal });
          if (!response.ok) {
            throw new TerrainRequestError(
              `Terrain request failed with ${response.status}`,
              response.status
            );
          }
          break;
        } catch (error) {
          signal?.throwIfAborted();
          if (
            isConfirmedTerrainServerError(error) ||
            attempt + 1 >= TILE_RETRY_MAX_ATTEMPTS
          ) {
            throw error;
          }
          await waitWithSignal(
            Math.min(
              TILE_RETRY_MAX_DELAY_MS,
              TILE_RETRY_BASE_DELAY_MS * 2 ** attempt
            ) *
              (0.5 + Math.random()),
            signal
          );
        }
      }
      if (!response)
        throw new Error("Terrain request did not produce a response");
      const result = await runTerrainWorkerTask(
        {
          kind: "decode",
          blob: await response.blob(),
          id,
          segments: meshSegments,
          error: getLevelMaximumGeometricError(id.level),
          maximumMeshErrorMeters,
        },
        signal
      );
      if (result.kind !== "decode")
        throw new Error("Unexpected terrain decoding result");
      signal?.throwIfAborted();
      const { tile, raster } = result;
      cache.set(key, { tile, raster, lastUsed: ++useClock });
      cachedBytes += tile.byteLength + raster.pixels.byteLength;
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

  return {
    requestTile,
    getTileGridIdsForBounds(bounds, level) {
      if (!Number.isInteger(level) || level < 0) {
        throw new RangeError("Terrain level must be a non-negative integer");
      }
      if (level < config.minzoom || level > config.maxzoom) return [];
      const west = Math.max(bounds.west, config.bounds[0]);
      const south = Math.max(bounds.south, config.bounds[1]);
      const east = Math.min(bounds.east, config.bounds[2]);
      const north = Math.min(bounds.north, config.bounds[3]);
      if (west >= east || south >= north) return [];
      const scale = 2 ** level;
      const epsilon = 1e-10;
      const minimumX = Math.max(0, Math.floor(longitudeToTileX(west, level)));
      const maximumX = Math.min(
        scale - 1,
        Math.floor(longitudeToTileX(east - epsilon, level))
      );
      const minimumY = Math.max(
        0,
        Math.floor(latitudeToTileY(north - epsilon, level))
      );
      const maximumY = Math.min(
        scale - 1,
        Math.floor(latitudeToTileY(south + epsilon, level))
      );
      const ids: TerrainTileId[] = [];
      for (let y = minimumY; y <= maximumY; y += 1) {
        for (let x = minimumX; x <= maximumX; x += 1) {
          ids.push({ level, x, y });
        }
      }
      return ids;
    },
    getTileBounds,
    getLevelMaximumGeometricError,
    getTileDataAvailable: tileIsAvailable,
    sampleHeight(longitude, latitude) {
      // Height queries run for floating labels too. Select the finest covering
      // tile without allocating and sorting the entire cache for every label.
      let entry: CacheEntry | undefined;
      for (const candidate of cache.values()) {
        const { bounds, id } = candidate.tile;
        if (
          (!entry || id.level > entry.tile.id.level) &&
          longitude >= bounds.west &&
          longitude <= bounds.east &&
          latitude >= bounds.south &&
          latitude <= bounds.north
        ) {
          entry = candidate;
        }
      }
      if (!entry) return undefined;
      entry.lastUsed = ++useClock;
      const { bounds } = entry.tile;
      const x = Math.max(
        0,
        Math.min(
          entry.raster.width - 1,
          ((longitude - bounds.west) / (bounds.east - bounds.west)) *
            entry.raster.width -
            0.5
        )
      );
      const y = Math.max(
        0,
        Math.min(
          entry.raster.height - 1,
          (latitudeToTileY(latitude, entry.tile.id.level) - entry.tile.id.y) *
            entry.raster.height -
            0.5
        )
      );
      return sampleRaster(entry.raster, x, y);
    },
    trimCache,
    release() {
      lifetime.abort();
      cache.clear();
      pending.clear();
      cachedBytes = 0;
    },
  };
};

export const acquireRasterDemTerrainTileSource = (
  config: RasterDemTerrainResource,
  options: RasterDemTerrainTileSourceOptions = {}
): Promise<RasterDemTerrainTileSource> => {
  if (config.encoding !== "terrarium") {
    throw new TypeError("Shadow terrain requires Terrarium elevation encoding");
  }
  const normalized = {
    ...config,
    url: config.url.trim(),
    bounds: [...config.bounds] as RasterDemTerrainResource["bounds"],
  } satisfies RasterDemTerrainResource;
  if (!normalized.id || !normalized.url) {
    throw new TypeError("Terrain source id and URL must not be empty");
  }
  const key = JSON.stringify([normalized, options]);
  const entry = sources.get(key) ?? {
    source: buildSource(normalized, options),
    users: 0,
  };
  sources.set(key, entry);
  entry.users += 1;
  let released = false;
  // A source switch can overlap two runtimes. Keep shared decoded data only
  // while a consumer exists; persistent binary records remain on disk.
  return Promise.resolve({
    ...entry.source,
    release() {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users !== 0) return;
      sources.delete(key);
      entry.source.release();
    },
  });
};
