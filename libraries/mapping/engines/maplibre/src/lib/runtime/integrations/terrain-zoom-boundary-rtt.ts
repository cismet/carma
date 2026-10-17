import type { Map as MaplibreMap } from "maplibre-gl";

type TerrainRttHost = {
  terrain?: { tileManager?: { freeRtt?: () => void } } | null;
};

/**
 * With terrain, MapLibre draws fill/line layers into a texture per terrain tile
 * and reuses it until the tiles under it or the style change
 * (render_to_texture.ts, map.ts `_terrainDataCallback`). A zoom change alone
 * never redraws it, so a layer that turns on or off by zoom (minzoom, maxzoom,
 * a ["step", ["zoom"], ...] opacity) keeps its old look in every terrain tile
 * whose source tiles did not change: whole quadrants show the previous zoom
 * band. Freeing the cache once when the zoom crosses such a boundary fixes that.
 *
 * Boundaries are every integer zoom (zoom stops in styles almost always sit
 * there) and every layer's own minzoom/maxzoom.
 *
 * PRIVATE API: map.terrain.tileManager.freeRtt, the same call
 * shared-three-scene-registry.ts uses. Without it this does nothing.
 */
export const attachTerrainZoomBoundaryRefresh = (
  map: MaplibreMap
): (() => void) => {
  let layerZooms: number[] = [];
  const collectLayerZooms = () => {
    const zooms = new Set<number>();
    for (const id of map.getLayersOrder?.() ?? []) {
      const layer = map.getLayer(id);
      if (layer?.minzoom) zooms.add(layer.minzoom);
      if (layer?.maxzoom && layer.maxzoom < 24) zooms.add(layer.maxzoom);
    }
    layerZooms = [...zooms].filter((z) => !Number.isInteger(z));
  };

  let lastZoom = map.getZoom();
  const onZoom = () => {
    const zoom = map.getZoom();
    const crossed = crossesZoomBoundary(lastZoom, zoom, layerZooms);
    lastZoom = zoom;
    if (crossed) {
      (map as unknown as TerrainRttHost).terrain?.tileManager?.freeRtt?.();
    }
  };

  map.on("styledata", collectLayerZooms);
  map.on("zoom", onZoom);
  return () => {
    map.off("styledata", collectLayerZooms);
    map.off("zoom", onZoom);
  };
};

/** whether going from `from` to `to` passes an integer zoom or one of `extra` */
export const crossesZoomBoundary = (
  from: number,
  to: number,
  extra: number[] = []
): boolean => {
  if (from === to) return false;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (Math.floor(lo) !== Math.floor(hi)) return true;
  return extra.some((z) => lo < z && z <= hi);
};
