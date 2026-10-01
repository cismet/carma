import {
  BufferAttribute,
  Box3,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
} from "three";
import {
  createLocalEcefFrame,
  getCameraLocalMercatorFit,
} from "@carma-geo/proj";
import type { TerrainTile, TerrainTileId } from "../../core/raster-dem-tile";
import {
  createTerrainEcefSeamReprojection,
  projectTerrainEcefInWorker,
  snapshotTerrainEcefSeamInput,
} from "./terrain-ecef-worker-projection";
import {
  convertTerrainGeometryToEcef,
  type TerrainEcefConversionInput,
} from "./terrain-ecef-conversion";
import {
  createTerrainEcefGeometryCache,
  type TerrainEcefCacheOptions,
} from "./terrain-ecef-geometry-cache";

/** Keeps the native raster topology for seam workers, but renders its ECEF
 * surface. Neither camera gestures nor frame refits reproject these vertices.
 */
export const createTerrainEcefPresentation = (
  origin: readonly [number, number],
  heightOffsetMeters?: (longitude: number, latitude: number) => number,
  cacheOptions?: TerrainEcefCacheOptions,
  onContentChanged?: () => void,
  onProjectionError?: (error: unknown) => void
) => {
  // An arbitrary callback cannot identify its complete correction graph. A
  // caller must explicitly version it, otherwise derived persistence is off.
  const cache =
    cacheOptions && (!heightOffsetMeters || cacheOptions.heightOffsetIdentity)
      ? createTerrainEcefGeometryCache(origin, cacheOptions)
      : null;
  const originFrame = createLocalEcefFrame(...origin);
  const prepared = new WeakMap<
    BufferGeometry,
    {
      nativeVersion: string;
      nativeBaseHeights: Float32Array;
      ecefBounds: Box3;
      recomputeMs: number;
      persisted: boolean;
    }
  >();
  let disposed = false;
  const conversionInput = (
    native: BufferGeometry,
    tile: TerrainTile,
    nativeBaseHeights?: Float32Array
  ): TerrainEcefConversionInput => ({
    origin,
    tile: {
      bounds: tile.bounds,
      u: tile.u,
      v: tile.v,
      heightMeters: tile.heightMeters,
    },
    positions: native.getAttribute("position").array as Float32Array,
    normals: native.getAttribute("normal").array as Float32Array,
    indices: native.index!.array as Uint16Array | Uint32Array,
    nativeBaseHeights,
  });
  const root = new Group();
  root.name = "terrain-ecef-mount";
  root.matrixAutoUpdate = false;
  let reference: readonly [number, number] | null = null;
  const tiles = new Map<
    Mesh,
    {
      mesh: Mesh;
      tile: TerrainTile;
      nativeBaseHeights: Float32Array;
      version: string;
      ecefBounds: Box3;
      recomputeMs: number;
      persistedVersion: string;
      pendingPersistence: Promise<boolean> | null;
      reprojection: ReturnType<typeof createTerrainEcefSeamReprojection> | null;
    }
  >();
  const version = (geometry: BufferGeometry) =>
    [
      geometry.id,
      (geometry.getAttribute("position") as BufferAttribute).id,
      (geometry.getAttribute("position") as BufferAttribute).version,
      geometry.index?.id,
      geometry.index?.version,
      (geometry.getAttribute("normal") as BufferAttribute).id,
      (geometry.getAttribute("normal") as BufferAttribute).version,
    ].join(":");
  const mount = (native: Mesh, tile: TerrainTile, cached?: BufferGeometry) => {
    if (tiles.has(native))
      throw new Error("Terrain mesh already has an ECEF presentation");
    const preparation = cached ? prepared.get(cached) : undefined;
    if (preparation && preparation.nativeVersion !== version(native.geometry))
      throw new Error("Terrain geometry changed after ECEF preparation");
    const frame = createLocalEcefFrame(
      (tile.bounds.west + tile.bounds.east) / 2,
      (tile.bounds.south + tile.bounds.north) / 2
    );
    const geometry = cached ?? new BufferGeometry();
    const mesh = new Mesh(geometry, native.material);
    mesh.name = native.name;
    mesh.userData.isShadowTerrainSurface = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.multiplyMatrices(
      originFrame.localFromEcef,
      frame.ecefFromLocal
    );
    native.parent?.add(mesh);
    native.removeFromParent();
    tiles.set(native, {
      mesh,
      tile,
      nativeBaseHeights: preparation?.nativeBaseHeights ?? new Float32Array(),
      version: cached ? version(native.geometry) : "",
      persistedVersion:
        cached && (!preparation || preparation.persisted)
          ? version(native.geometry)
          : "",
      recomputeMs: preparation?.recomputeMs ?? 0,
      pendingPersistence: null,
      reprojection: null,
      ecefBounds:
        preparation?.ecefBounds ??
        (cached
          ? new Box3()
              .copy(
                cached.boundingBox ??
                  new Box3().setFromBufferAttribute(
                    cached.getAttribute("position") as BufferAttribute
                  )
              )
              .applyMatrix4(frame.ecefFromLocal)
          : new Box3()),
    });
    try {
      sync(native);
    } catch (error) {
      // Restore borrowed ownership if projection fails; an empty replacement
      // must not strand the original surface outside its parent.
      mesh.parent?.add(native);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      tiles.delete(native);
      throw error;
    }
    return mesh;
  };
  const sync = (native: Mesh) => {
    const state = tiles.get(native);
    if (!state) return;
    state.mesh.material = native.material;
    state.mesh.castShadow = native.castShadow;
    state.mesh.receiveShadow = native.receiveShadow;
    const current = version(native.geometry);
    if (current === state.version) return;
    if (state.version && !heightOffsetMeters) {
      state.reprojection ??= createTerrainEcefSeamReprojection({
        version: () => version(native.geometry),
        publishedVersion: () => state.version,
        project: (signal) =>
          projectTerrainEcefInWorker(
            snapshotTerrainEcefSeamInput(
              conversionInput(
                native.geometry,
                state.tile,
                state.nativeBaseHeights.length
                  ? state.nativeBaseHeights
                  : undefined
              )
            ),
            native.geometry.index!.array as Uint16Array | Uint32Array,
            signal,
            true
          ),
        publish: (projected, current) => {
          const previous = state.mesh.geometry;
          state.mesh.geometry = projected.geometry;
          state.nativeBaseHeights = projected.nativeBaseHeights;
          state.ecefBounds = projected.ecefBounds;
          state.version = current;
          state.recomputeMs = projected.recomputeMs;
          previous.dispose();
          onContentChanged?.();
        },
        onError: (error) => {
          console.warn("[terrain] ECEF seam reprojection failed", error);
          onProjectionError?.(error);
        },
      });
      state.reprojection.sync();
      return;
    }
    // Explicit synchronous path for custom callbacks and unprepared mounting.
    const startedAt = performance.now();
    const projected = convertTerrainGeometryToEcef(
      conversionInput(
        native.geometry,
        state.tile,
        state.nativeBaseHeights.length ? state.nativeBaseHeights : undefined
      ),
      heightOffsetMeters
    );
    state.nativeBaseHeights = projected.nativeBaseHeights;
    state.mesh.geometry.dispose();
    state.mesh.geometry = projected.geometry;
    state.ecefBounds = projected.ecefBounds;
    state.version = current;
    state.recomputeMs = performance.now() - startedAt;
  };
  return {
    root,
    mount,
    sync,
    syncAsync: async (native: Mesh) => {
      sync(native);
      await tiles.get(native)?.reprojection?.settled();
    },
    /** Await before publishing a pristine native tile. Disk hits need only a
     * short Y-buffer copy; misses run projection on the shared worker pool. */
    prepare: async (
      native: BufferGeometry,
      tile: TerrainTile,
      signal?: AbortSignal,
      restoredGeometry?: BufferGeometry | null
    ): Promise<BufferGeometry> => {
      signal?.throwIfAborted();
      const nativeVersion = version(native);
      const valid = () => {
        signal?.throwIfAborted();
        if (disposed || version(native) !== nativeVersion)
          throw new Error("Terrain geometry changed during ECEF preparation");
      };
      const cached =
        restoredGeometry ?? (await cache?.restore(native, tile, signal));
      if (cached) {
        try {
          valid();
          const nativeBaseHeights = new Float32Array(tile.u.length);
          const positions = native.getAttribute("position");
          for (let i = 0; i < nativeBaseHeights.length; i++)
            nativeBaseHeights[i] = positions.getY(i);
          const frame = createLocalEcefFrame(
            (tile.bounds.west + tile.bounds.east) / 2,
            (tile.bounds.south + tile.bounds.north) / 2
          );
          prepared.set(cached, {
            nativeVersion,
            nativeBaseHeights,
            recomputeMs: 0,
            persisted: true,
            ecefBounds: cached
              .boundingBox!.clone()
              .applyMatrix4(frame.ecefFromLocal),
          });
          return cached;
        } catch (error) {
          cached.dispose();
          throw error;
        }
      }
      valid();
      // Arbitrary height-correction callbacks cannot cross a worker boundary.
      // This explicit custom-hook fallback uses the identical converter.
      if (heightOffsetMeters) {
        const startedAt = performance.now();
        const result = convertTerrainGeometryToEcef(
          conversionInput(native, tile),
          heightOffsetMeters
        );
        prepared.set(result.geometry, {
          nativeVersion,
          nativeBaseHeights: result.nativeBaseHeights,
          ecefBounds: result.ecefBounds,
          persisted: false,
          recomputeMs: performance.now() - startedAt,
        });
        return result.geometry;
      }
      const result = await projectTerrainEcefInWorker(
        conversionInput(native, tile),
        native.index!.array as Uint16Array | Uint32Array,
        signal
      );
      try {
        valid();
      } catch (error) {
        result.geometry.dispose();
        throw error;
      }
      prepared.set(result.geometry, {
        nativeVersion,
        nativeBaseHeights: result.nativeBaseHeights,
        recomputeMs: result.recomputeMs,
        persisted: false,
        ecefBounds: result.ecefBounds,
      });
      return result.geometry;
    },
    restore: (
      native: BufferGeometry,
      tile: TerrainTile,
      signal?: AbortSignal
    ) => cache?.restore(native, tile, signal) ?? Promise.resolve(null),
    /** Persist a pristine idle preparation without touching a live tile or
     * republishing its seam state. The caller retains both input geometries. */
    offerPrepared: (
      native: BufferGeometry,
      tile: TerrainTile,
      geometry: BufferGeometry
    ): Promise<boolean> => {
      const preparation = prepared.get(geometry);
      if (
        !cache ||
        !preparation ||
        disposed ||
        preparation.nativeVersion !== version(native)
      )
        return Promise.resolve(false);
      return preparation.persisted
        ? Promise.resolve(true)
        : cache.offer(native, geometry, tile, preparation.recomputeMs);
    },
    offer: (native: Mesh): Promise<boolean> => {
      const state = tiles.get(native);
      if (!cache || !state) return Promise.resolve(false);
      sync(native);
      if (disposed || version(native.geometry) !== state.version)
        return Promise.resolve(false);
      if (state.pendingPersistence) return state.pendingPersistence;
      if (state.persistedVersion === state.version)
        return Promise.resolve(true);
      const offeredVersion = state.version;
      // Pair this derived record with the native generation at offer time,
      // including while the cache worker is warming or another seam arrives.
      const nativeSnapshot = new BufferGeometry();
      nativeSnapshot.setAttribute(
        "position",
        native.geometry.getAttribute("position").clone()
      );
      nativeSnapshot.setAttribute(
        "normal",
        native.geometry.getAttribute("normal").clone()
      );
      nativeSnapshot.setIndex(native.geometry.index!.clone());
      state.pendingPersistence = cache
        .offer(
          nativeSnapshot,
          state.mesh.geometry,
          state.tile,
          state.recomputeMs
        )
        .then((stored) => {
          // A seam update during IDB writing is a different record. It remains
          // eligible for the next idle offer instead of claiming the old write.
          if (stored) state.persistedVersion = offeredVersion;
          return stored;
        })
        .finally(() => {
          nativeSnapshot.dispose();
          state.pendingPersistence = null;
        });
      return state.pendingPersistence;
    },
    markUsed: (ids: readonly TerrainTileId[]) =>
      cache?.markUsed(ids) ?? Promise.resolve(false),
    protectBaseline: (ids: readonly TerrainTileId[]) =>
      cache?.protectBaseline(ids) ?? Promise.resolve(false),
    mesh: (native: Mesh) => tiles.get(native)?.mesh,
    ecefBounds: (native: Mesh, target: Box3) => {
      const state = tiles.get(native);
      return state ? target.copy(state.ecefBounds) : target.makeEmpty();
    },
    refit: (lngLat: readonly [number, number]) => {
      if (reference?.[0] === lngLat[0] && reference?.[1] === lngLat[1]) return;
      root.matrix.copy(
        getCameraLocalMercatorFit(origin, lngLat, {
          correctEllipsoidMetric: true,
        })
      );
      root.updateMatrixWorld(true);
      reference = lngLat;
    },
    bounds: (native: Mesh, target: Box3, worldToReference?: Matrix4) => {
      const mesh = tiles.get(native)?.mesh;
      if (!mesh) return target.makeEmpty();
      mesh.updateWorldMatrix(true, false);
      const matrix = mesh.matrixWorld.clone();
      if (worldToReference) matrix.premultiply(worldToReference);
      return target.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix);
    },
    localToWorld: () => root.matrixWorld,
    bytes: (native: Mesh, excludeCpuBuffers?: ReadonlySet<ArrayBufferLike>) => {
      const state = tiles.get(native);
      if (!state) return 0;
      const attributes = [
        ...Object.values(state.mesh.geometry.attributes),
        ...(state.mesh.geometry.index ? [state.mesh.geometry.index] : []),
      ];
      const buffers = new Set<ArrayBufferLike>([
        state.nativeBaseHeights.buffer,
        ...attributes.map((attribute) => attribute.array.buffer),
      ]);
      // CPU views can share one backing record; Three uploads a separate GPU
      // buffer per attribute. Count each retained resource exactly once.
      return (
        [...buffers].reduce(
          (sum, buffer) =>
            sum + (excludeCpuBuffers?.has(buffer) ? 0 : buffer.byteLength),
          0
        ) +
        attributes.reduce(
          (sum, attribute) => sum + attribute.array.byteLength,
          0
        )
      );
    },
    detach: (native: Mesh) => {
      const state = tiles.get(native);
      if (!state) return;
      state.reprojection?.dispose();
      state.mesh.parent?.add(native);
      state.mesh.removeFromParent();
      state.mesh.geometry.dispose();
      tiles.delete(native);
    },
    disposeTile: (native: Mesh) => {
      const state = tiles.get(native);
      state?.reprojection?.dispose();
      state?.mesh.geometry.dispose();
      state?.mesh.removeFromParent();
      tiles.delete(native);
    },
    dispose: () => {
      disposed = true;
      cache?.close();
      for (const state of tiles.values()) {
        state.reprojection?.dispose();
        state.mesh.geometry.dispose();
        state.mesh.removeFromParent();
      }
      tiles.clear();
    },
  };
};
