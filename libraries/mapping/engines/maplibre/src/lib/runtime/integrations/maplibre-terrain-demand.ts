import type { Map as MaplibreMap } from "maplibre-gl";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

/** Installed MapLibre adapter only: pausing demand retains DEM data and RTT. */
type TerrainTileManager = {
  _paused?: boolean;
  pause: () => void;
  resume: () => void;
  getSource: () => { type?: unknown };
};

type DemandPauseEntry = {
  references: number;
  disposed: boolean;
  ownedManagers: WeakSet<TerrainTileManager>;
  sync: () => void;
  detach: () => void;
};

const pauses = new WeakMap<MaplibreMap, Map<string, DemandPauseEntry>>();

const currentTerrainManager = (
  map: MaplibreMap,
  sourceId: string
): TerrainTileManager | null => {
  try {
    const candidate = (
      map as unknown as {
        style?: { tileManagers?: Record<string, unknown> };
      }
    ).style?.tileManagers?.[sourceId] as Partial<TerrainTileManager> | undefined;
    if (
      !candidate ||
      typeof candidate.pause !== "function" ||
      typeof candidate.resume !== "function" ||
      typeof candidate.getSource !== "function" ||
      (candidate._paused !== undefined &&
        typeof candidate._paused !== "boolean") ||
      candidate.getSource()?.type !== "raster-dem"
    )
      return null;
    return candidate as TerrainTileManager;
  } catch {
    // A removed map/source or a different vendor shape is a safe no-op.
    return null;
  }
};

/** Sources whose installed tile manager can take a native DEM demand pause. */
export const getMapLibreRasterDemSourceIds = (map: MaplibreMap): string[] => {
  try {
    const managers = (
      map as unknown as {
        style?: { tileManagers?: Record<string, unknown> };
      }
    ).style?.tileManagers;
    return Object.keys(managers ?? {}).filter(
      (sourceId) => currentTerrainManager(map, sourceId) !== null
    );
  } catch {
    return [];
  }
};

/**
 * Hold native DEM tile demand during image-plane interaction. The terrain and
 * its cached heights keep rendering; camera altitude and draping are unchanged.
 * Only the current source manager that this lease paused is resumed on release.
 */
export const acquireMapLibreTerrainDemandPause = (
  map: MaplibreMap,
  sourceId: string
): (() => void) => {
  let bySource = pauses.get(map);
  if (!bySource) {
    bySource = new Map();
    pauses.set(map, bySource);
  }
  let entry = bySource.get(sourceId);
  if (!entry) {
    const next: DemandPauseEntry = {
      references: 0,
      disposed: false,
      ownedManagers: new WeakSet(),
      sync: () => {
        if (next.disposed) return;
        const manager = currentTerrainManager(map, sourceId);
        if (!manager || manager._paused === true) return;
        try {
          manager.pause();
          if (Boolean(manager._paused)) next.ownedManagers.add(manager);
        } catch {
          // Optional optimisation must never interrupt the viewer.
        }
      },
      detach: () => {
        map.off(MAPLIBRE_EVENT.STYLE_DATA, next.sync);
        map.off(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
        map.off(MAPLIBRE_EVENT.REMOVE, onRemove);
      },
    };
    const onSourceData = (event: { sourceId?: string }) => {
      if (!event.sourceId || event.sourceId === sourceId) next.sync();
    };
    const onRemove = () => {
      next.disposed = true;
      next.detach();
      bySource!.delete(sourceId);
      if (bySource!.size === 0) pauses.delete(map);
    };
    entry = next;
    bySource.set(sourceId, entry);
    map.on(MAPLIBRE_EVENT.STYLE_DATA, next.sync);
    map.on(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
    map.on(MAPLIBRE_EVENT.REMOVE, onRemove);
  }
  entry.references++;
  entry.sync();

  const held = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (held.disposed || --held.references > 0) return;
    held.disposed = true;
    held.detach();
    bySource!.delete(sourceId);
    if (bySource!.size === 0) pauses.delete(map);
    // Replaced/removed managers must not start loading into a stale style.
    const manager = currentTerrainManager(map, sourceId);
    if (manager && held.ownedManagers.has(manager) && manager._paused === true) {
      try {
        manager.resume();
      } catch {
        // The source may have been removed between lookup and release.
      }
    }
  };
};

type TerrainZoomSource = { type: "raster-dem"; maxzoom: number };
type TerrainDemMapping = {
  getSource: () => unknown;
  _sourceTileCache: Record<string, string>;
};
type ZoomLimitEntry = {
  requests: Set<{ maximumZoom: number }>;
  disposed: boolean;
  sources: WeakMap<TerrainZoomSource, { original: number; applied: number }>;
  sync: () => void;
  detach: () => void;
};

const zoomLimits = new WeakMap<MaplibreMap, Map<string, ZoomLimitEntry>>();

const currentZoomSource = (
  map: MaplibreMap,
  sourceId: string
): TerrainZoomSource | null => {
  try {
    const source = map.getSource(sourceId);
    return source?.type === "raster-dem" &&
      Number.isFinite(source.maxzoom) &&
      source.maxzoom >= 0 &&
      Object.getOwnPropertyDescriptor(source, "maxzoom")?.writable === true
      ? (source as TerrainZoomSource)
      : null;
  } catch {
    return null;
  }
};

/** null: no active terrain for this source; undefined: unsupported active shape. */
const currentDemMapping = (
  map: MaplibreMap,
  source: TerrainZoomSource
): TerrainDemMapping | null | undefined => {
  try {
    const terrain = (
      map as unknown as {
        terrain?: { tileManager?: Partial<TerrainDemMapping> } | null;
      }
    ).terrain;
    if (!terrain) return null;
    const manager = terrain.tileManager;
    if (typeof manager?.getSource !== "function") return undefined;
    if (manager.getSource() !== source) return null;
    const cache = manager._sourceTileCache;
    if (
      !cache ||
      typeof cache !== "object" ||
      Array.isArray(cache) ||
      Object.getOwnPropertyDescriptor(manager, "_sourceTileCache")
        ?.writable !== true
    )
      return undefined;
    return manager as TerrainDemMapping;
  } catch {
    return undefined;
  }
};

/**
 * Limit DEM downloads used only for label draping without replacing a source.
 * Changing maxzoom invalidates only the derived RTT-to-DEM lookup; loaded DEM
 * tiles, their decoded pixels, GPU textures and HTTP/disk caches stay resident.
 */
export const acquireMapLibreTerrainZoomLimit = (
  map: MaplibreMap,
  sourceId: string,
  maximumZoom = 13
): (() => void) => {
  if (!Number.isInteger(maximumZoom) || maximumZoom < 0) return () => undefined;
  let bySource = zoomLimits.get(map);
  if (!bySource) {
    bySource = new Map();
    zoomLimits.set(map, bySource);
  }
  let entry = bySource.get(sourceId);
  if (!entry) {
    const next: ZoomLimitEntry = {
      requests: new Set(),
      disposed: false,
      sources: new WeakMap(),
      sync: () => {
        if (next.disposed) return;
        const source = currentZoomSource(map, sourceId);
        if (!source || typeof map.triggerRepaint !== "function") return;
        const mapping = currentDemMapping(map, source);
        // Without an active verified terrain adapter there is nothing to cap.
        if (!mapping) return;
        const current = source.maxzoom;
        const previous = next.sources.get(source);
        const authoredUpdate = previous && current !== previous.applied;
        const original = authoredUpdate
          ? current
          : previous?.original ?? current;
        const requested = Math.min(
          ...[...next.requests].map((request) => request.maximumZoom)
        );
        const target = Math.min(original, requested);
        if (current === target && !authoredUpdate) return;
        try {
          source.maxzoom = target;
          mapping._sourceTileCache = {};
          next.sources.set(source, { original, applied: target });
          map.triggerRepaint();
        } catch {
          // Optional source demand optimisation must not interrupt rendering.
        }
      },
      detach: () => {
        map.off(MAPLIBRE_EVENT.STYLE_DATA, next.sync);
        map.off(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
        map.off(MAPLIBRE_EVENT.TERRAIN, next.sync);
        map.off(MAPLIBRE_EVENT.REMOVE, onRemove);
      },
    };
    const onSourceData = (event: { sourceId?: string }) => {
      if (!event.sourceId || event.sourceId === sourceId) next.sync();
    };
    const onRemove = () => {
      next.disposed = true;
      next.detach();
      bySource!.delete(sourceId);
      if (bySource!.size === 0) zoomLimits.delete(map);
    };
    entry = next;
    bySource.set(sourceId, entry);
    map.on(MAPLIBRE_EVENT.STYLE_DATA, next.sync);
    map.on(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
    map.on(MAPLIBRE_EVENT.TERRAIN, next.sync);
    map.on(MAPLIBRE_EVENT.REMOVE, onRemove);
  }
  const request = { maximumZoom };
  entry.requests.add(request);
  entry.sync();
  const held = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (held.disposed) return;
    held.requests.delete(request);
    if (held.requests.size > 0) {
      held.sync();
      return;
    }
    held.disposed = true;
    held.detach();
    bySource!.delete(sourceId);
    if (bySource!.size === 0) zoomLimits.delete(map);
    const source = currentZoomSource(map, sourceId);
    if (!source) return;
    const saved = held.sources.get(source);
    if (!saved) return;
    const mapping = currentDemMapping(map, source);
    if (mapping === undefined) return;
    try {
      // Preserve an external source edit that arrived after the last event.
      if (source.maxzoom === saved.applied) source.maxzoom = saved.original;
      if (mapping) mapping._sourceTileCache = {};
      map.triggerRepaint();
    } catch {
      // A source can disappear together with its style during release.
    }
  };
};
