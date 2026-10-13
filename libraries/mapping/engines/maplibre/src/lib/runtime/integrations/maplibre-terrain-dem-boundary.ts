import type { Map as MaplibreMap } from "maplibre-gl";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

// Installed MapLibre 5.18 Terrain.getDEMElevation uses this native tile extent.
const TERRAIN_TILE_EXTENT = 8192;

type TerrainTileCoordinate = {
  normalizeCoordinates: (
    x: number,
    y: number,
    extent: number
  ) => { tileID: TerrainTileCoordinate; x: number; y: number } | null;
};
type TerrainDemData = {
  dim: number;
  get: (x: number, y: number) => number;
};
type TerrainData = {
  tile?: { dem?: TerrainDemData } | null;
  u_terrain_matrix: ArrayLike<number>;
};
type TerrainHost = {
  getDEMElevation: (
    tileID: TerrainTileCoordinate,
    x: number,
    y: number,
    extent?: number
  ) => number;
  getTerrainData: (tileID: TerrainTileCoordinate) => TerrainData;
};
type TerrainPatch = {
  terrain: TerrainHost;
  wrapper: TerrainHost["getDEMElevation"];
  descriptor: PropertyDescriptor | undefined;
};
type BoundaryLease = { references: number; dispose: () => void };
const leases = new WeakMap<MaplibreMap, BoundaryLease>();

const restore = (patch: TerrainPatch | null) => {
  if (!patch || patch.terrain.getDEMElevation !== patch.wrapper) return;
  if (patch.descriptor) {
    Object.defineProperty(patch.terrain, "getDEMElevation", patch.descriptor);
  } else {
    Reflect.deleteProperty(patch.terrain, "getDEMElevation");
  }
};

/**
 * Guard MapLibre's bilinear upper neighbor at the existing DEM border.
 * A valid normalized point can round to UV=1 in a parent-tile transform.
 * At that exact endpoint the native sampler still reads dim+1 with weight zero,
 * although DEMData only stores the inclusive border [-1, dim].
 */
export const acquireMapLibreTerrainDemBoundary = (
  map: MaplibreMap
): (() => void) => {
  let lease = leases.get(map);
  if (!lease) {
    let patch: TerrainPatch | null = null;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const terrain = (map as unknown as { terrain?: TerrainHost | null })
        .terrain;
      // A plugin that replaces our method owns it until this Terrain changes.
      if (terrain && terrain === patch?.terrain) return;
      restore(patch);
      patch = null;
      if (
        !terrain ||
        typeof terrain.getDEMElevation !== "function" ||
        typeof terrain.getTerrainData !== "function"
      )
        return;
      const descriptor = Object.getOwnPropertyDescriptor(
        terrain,
        "getDEMElevation"
      );
      if (
        descriptor
          ? descriptor.writable !== true
          : !Object.isExtensible(terrain)
      )
        return;
      const original = terrain.getDEMElevation;
      const wrapper: TerrainHost["getDEMElevation"] = function (
        this: TerrainHost,
        tileID,
        x,
        y,
        extent = TERRAIN_TILE_EXTENT
      ) {
        // Keep unsupported signatures, borrowed calls and invalid coordinates
        // on their original path. Errors are never caught or converted to height.
        if (
          this !== terrain ||
          typeof tileID?.normalizeCoordinates !== "function" ||
          typeof terrain.getTerrainData !== "function"
        )
          return original.call(this, tileID, x, y, extent);
        const normalized = tileID.normalizeCoordinates(x, y, extent);
        if (!normalized) return 0;
        const data = terrain.getTerrainData(normalized.tileID);
        const dem = data.tile?.dem;
        if (!dem) return 0;
        const matrix = data.u_terrain_matrix;
        if (
          !matrix ||
          matrix.length !== 16 ||
          !Number.isInteger(dem.dim) ||
          dem.dim <= 0 ||
          typeof dem.get !== "function"
        )
          return original.call(this, tileID, x, y, extent);
        // Same operation order as native vec2.transformMat4: no inverse,
        // alternate parent selection, matrix mutation or height exaggeration.
        const px = (normalized.x / extent) * TERRAIN_TILE_EXTENT;
        const py = (normalized.y / extent) * TERRAIN_TILE_EXTENT;
        const cxValue =
          (matrix[0] * px + matrix[4] * py + matrix[12]) * dem.dim;
        const cyValue =
          (matrix[1] * px + matrix[5] * py + matrix[13]) * dem.dim;
        if (
          !Number.isFinite(cxValue) ||
          !Number.isFinite(cyValue) ||
          cxValue < -1 ||
          cyValue < -1 ||
          cxValue > dem.dim ||
          cyValue > dem.dim
        )
          return original.call(this, tileID, x, y, extent);
        const cx = Math.floor(cxValue),
          cy = Math.floor(cyValue);
        const tx = cxValue - cx,
          ty = cyValue - cy;
        const nextX = Math.min(cx + 1, dem.dim);
        const nextY = Math.min(cy + 1, dem.dim);
        return (
          dem.get(cx, cy) * (1 - tx) * (1 - ty) +
          dem.get(nextX, cy) * tx * (1 - ty) +
          dem.get(cx, nextY) * (1 - tx) * ty +
          dem.get(nextX, nextY) * tx * ty
        );
      };
      Object.defineProperty(terrain, "getDEMElevation", {
        ...(descriptor ?? {
          configurable: true,
          enumerable: true,
          writable: true,
        }),
        value: wrapper,
      });
      patch = { terrain, wrapper, descriptor };
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      map.off(MAPLIBRE_EVENT.TERRAIN, sync);
      map.off(MAPLIBRE_EVENT.STYLE_DATA, sync);
      map.off(MAPLIBRE_EVENT.STYLE_LOAD, sync);
      map.off(MAPLIBRE_EVENT.REMOVE, dispose);
      restore(patch);
      patch = null;
      leases.delete(map);
    };
    lease = { references: 0, dispose };
    leases.set(map, lease);
    // Synchronous Terrain/style events run before the next label-placement pass.
    map.on(MAPLIBRE_EVENT.TERRAIN, sync);
    map.on(MAPLIBRE_EVENT.STYLE_DATA, sync);
    map.on(MAPLIBRE_EVENT.STYLE_LOAD, sync);
    map.on(MAPLIBRE_EVENT.REMOVE, dispose);
    sync();
  }
  lease.references++;
  const held = lease;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--held.references === 0) held.dispose();
  };
};
