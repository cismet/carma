/**
 * RUNTIME PATCH OF MAPLIBRE INTERNALS. Nothing in `node_modules/maplibre-gl`
 * is changed; this module replaces one function on the live terrain object of
 * a map and puts the original back when terrain goes.
 *
 * WHY
 * With terrain on, MapLibre gives every symbol the ground height of its spot,
 * read from a raster-dem tile. Which DEM tile belongs to a drawn tile is
 * decided in `TerrainTileManager.getSourceTile`
 * (maplibre-gl `src/tile/terrain_tile_manager.ts`). For a source that ends
 * below the DEM's `maxzoom` that pairing is wrong: its tiles are drawn
 * overscaled (a zoom 14 tile shown at zoom 20 has the id `20/14/x/y`), the
 * lookup asks for the DEM tile by key at the DEM's own zoom, an overscaled id
 * never matches there, and the fallback loop takes whatever DEM tile at the
 * tile's zoom or coarser happens to be in the cache. MapLibre itself only
 * logs "cannot calculate elevation if elevation maxzoom > source.maxzoom"
 * (`src/render/terrain.ts`, `getTerrainData`).
 *
 * SYMPTOM (geoportal, 19.11.2026, Kindertagesstätten over LoD2 and trees)
 * POI source `maxzoom` 14, terrain DEM `maxzoom` 16, map at zoom 20. Only the
 * zoom 5 DEM tile matched, so the icon got 198.47 m where the ground is at
 * 203.40 m. A symbol behind the terrain's depth image is faded by the symbol
 * shader (`calculate_visibility` in `src/shaders/_prelude.vertex.glsl`), which
 * looked as if the icon lay under the three.js scene. After tilting and
 * panning a zoom 14 or 13 DEM tile came into the cache by chance and the icon
 * jumped to the right height and stayed there. It is not a layer order
 * problem: the symbol layers are above the shared scene layer the whole time.
 *
 * WHAT THIS DOES
 * For an overscaled tile whose own zoom lies inside the DEM's zoom range it
 * loads the DEM tile at that own zoom through the terrain's source, holds it
 * (at most `MAX_HELD_DEM_TILES`, least recently used goes first) and answers
 * the lookup with it. Every other lookup, and this one until the tile has
 * arrived, goes to MapLibre's original function unchanged.
 *
 * PRIVATE API IN USE (written against maplibre-gl 5.18.0)
 * - `map.terrain.tileManager` (`TerrainTileManager`) and its `getSourceTile`
 * - `map.terrain.tileManager.tileManager._source` (`RasterDEMTileSource`):
 *   `minzoom`, `maxzoom`, `tileSize`, `hasTile`, `loadTile`, `abortTile`,
 *   `unloadTile`
 * - the `Tile` class, taken from the `constructor` of a tile the original
 *   lookup returned, since maplibre-gl does not export it
 * - `OverscaledTileID`: `key`, `overscaledZ`, `canonical.z`, `scaledTo`
 * - `tile.dem` as the sign of a loaded DEM tile, `tile.aborted` as the flag
 *   `loadTile` reads to tell an abort from a failed request
 *
 * ON A MAPLIBRE UPGRADE
 * If one of these names is gone, `keepDemForOverscaledTiles` finds nothing to
 * wrap and returns `null`: the map keeps working, and the symptom above comes
 * back. Check with a POI layer over terrain at zoom 20, tilted, right after a
 * reload; the icons must be at full opacity without any panning. If MapLibre
 * pairs overscaled tiles correctly by itself some day, delete this module and
 * its call in `LibreMap.tsx`.
 */

import type { Map as MaplibreMap } from "maplibre-gl";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

/** Structural stand-ins for the private MapLibre classes named above. */
type TileIdLike = {
  key: string;
  overscaledZ: number;
  canonical: { z: number };
  scaledTo: (zoom: number) => TileIdLike;
};

type DemTileLike = {
  tileID: TileIdLike;
  dem?: unknown;
  aborted?: boolean;
};

type DemTileConstructor = new (tileID: TileIdLike, size: number) => DemTileLike;

type DemSourceLike = {
  minzoom: number;
  maxzoom: number;
  tileSize: number;
  hasTile?: (tileID: TileIdLike) => boolean;
  loadTile: (tile: DemTileLike) => Promise<void>;
  abortTile?: (tile: DemTileLike) => Promise<void>;
  unloadTile?: (tile: DemTileLike) => Promise<void>;
};

type TerrainTileManagerLike = {
  tileManager?: { _source?: DemSourceLike };
  getSourceTile: (
    tileID: TileIdLike,
    searchForDEM?: boolean
  ) => DemTileLike | undefined;
};

type TerrainHost = {
  terrain?: { tileManager?: TerrainTileManagerLike } | null;
};

type HeldDemTile = {
  tile: DemTileLike;
  ready: boolean;
  lastUsed: number;
};

/** A level 14 terrarium tile of 512 px is about 1 MB of elevation data. */
export const MAX_HELD_DEM_TILES = 12;

/**
 * Wrap the lookup of one terrain tile manager, see the header of this file.
 * Returns the function that undoes it, or `null` when MapLibre's internals do
 * not have the expected shape (then nothing is patched).
 */
const keepDemForOverscaledTiles = (
  map: MaplibreMap,
  manager: TerrainTileManagerLike
): (() => void) | null => {
  const source = manager.tileManager?._source;
  const original = manager.getSourceTile;
  if (
    !source ||
    typeof original !== "function" ||
    typeof source.loadTile !== "function"
  )
    return null;

  const held = new Map<string, HeldDemTile>();
  let released = false;
  let useCounter = 0;

  const drop = (entry: HeldDemTile): void => {
    try {
      if (entry.ready) {
        void source.unloadTile?.(entry.tile)?.catch(() => undefined);
      } else {
        // `loadTile` reads this flag to tell an abort from a failed request.
        entry.tile.aborted = true;
        void source.abortTile?.(entry.tile)?.catch(() => undefined);
      }
    } catch {
      // The source can be gone already when a style is replaced.
    }
  };

  const evictLeastRecentlyUsed = (): void => {
    while (held.size > MAX_HELD_DEM_TILES) {
      let oldestKey: string | null = null;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, entry] of held) {
        if (entry.lastUsed < oldestUse) {
          oldestUse = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey === null) return;
      const entry = held.get(oldestKey);
      held.delete(oldestKey);
      if (entry) drop(entry);
    }
  };

  const request = (tileID: TileIdLike, Tile: DemTileConstructor): void => {
    const entry: HeldDemTile = {
      tile: new Tile(tileID, source.tileSize),
      ready: false,
      lastUsed: ++useCounter,
    };
    // A failed request stays listed without `ready`, so it is not repeated on
    // every frame; it is asked again once the list has turned it out.
    held.set(tileID.key, entry);
    evictLeastRecentlyUsed();
    source.loadTile(entry.tile).then(
      () => {
        if (released || held.get(tileID.key) !== entry) return;
        if (!entry.tile.dem) return;
        entry.ready = true;
        map.triggerRepaint();
      },
      () => undefined
    );
  };

  const patched: TerrainTileManagerLike["getSourceTile"] = (
    tileID,
    searchForDEM
  ) => {
    const ownZoom = tileID.canonical.z;
    if (
      !searchForDEM ||
      tileID.overscaledZ <= ownZoom ||
      ownZoom >= source.maxzoom ||
      ownZoom < source.minzoom
    )
      return original.call(manager, tileID, searchForDEM);

    const ownId = tileID.scaledTo(ownZoom);
    const entry = held.get(ownId.key);
    if (entry) entry.lastUsed = ++useCounter;
    if (entry?.ready) return entry.tile;

    const found = original.call(manager, tileID, searchForDEM);
    // Nothing found leaves no tile class to build from; the same zoom found
    // means MapLibre holds or loads that tile itself.
    if (entry || !found || found.tileID.canonical.z === ownZoom) return found;
    if (source.hasTile && !source.hasTile(ownId)) return found;
    request(ownId, found.constructor as DemTileConstructor);
    return found;
  };
  // THE PATCH: an own property on this one manager instance, shadowing
  // `TerrainTileManager.prototype.getSourceTile`. The prototype and every
  // other map stay untouched, and the release below restores `original`.
  manager.getSourceTile = patched;

  return () => {
    released = true;
    if (manager.getSourceTile === patched) manager.getSourceTile = original;
    for (const entry of held.values()) drop(entry);
    held.clear();
  };
};

const installed = new WeakMap<MaplibreMap, () => void>();

/**
 * Follow the map's terrain and keep the elevation of overscaled tiles exact,
 * see {@link keepDemForOverscaledTiles}. `setTerrain` builds a new tile
 * manager every time, so the hold moves with it.
 */
export const installTerrainOverscaledDemKeeper = (
  map: MaplibreMap
): (() => void) => {
  const existing = installed.get(map);
  if (existing) return existing;

  let current: TerrainTileManagerLike | null = null;
  let release: (() => void) | null = null;
  const sync = (): void => {
    const manager =
      (map as unknown as TerrainHost).terrain?.tileManager ?? null;
    if (manager === current) return;
    release?.();
    current = manager;
    release = manager ? keepDemForOverscaledTiles(map, manager) : null;
  };
  const dispose = (): void => {
    if (installed.get(map) !== dispose) return;
    installed.delete(map);
    map.off(MAPLIBRE_EVENT.TERRAIN, sync);
    map.off(MAPLIBRE_EVENT.STYLE_DATA, sync);
    map.off(MAPLIBRE_EVENT.REMOVE, dispose);
    release?.();
    release = null;
    current = null;
  };

  installed.set(map, dispose);
  sync();
  map.on(MAPLIBRE_EVENT.TERRAIN, sync);
  map.on(MAPLIBRE_EVENT.STYLE_DATA, sync);
  map.on(MAPLIBRE_EVENT.REMOVE, dispose);
  return dispose;
};
