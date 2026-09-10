import {
  SHADOW_TERRAIN_QUALITY,
  type ShadowTerrainQuality,
} from "../contracts/shadow-simulation";

type InternalTileManager = {
  tileSize: number | null;
  _source?: {
    calculateTileZoom?: (...args: number[]) => number;
  };
};

type InternalTerrainTileManager = {
  deltaZoom: number;
  tileSize: number;
  tileManager: InternalTileManager;
  freeRtt?: () => void;
};

export type InternalMapLibreTerrain = {
  meshSize?: number;
  _meshCache?: Record<string, unknown>;
  tileManager?: InternalTerrainTileManager;
};

const QUALITY_DELTA_ZOOM: Record<ShadowTerrainQuality, number> = {
  [SHADOW_TERRAIN_QUALITY.STANDARD]: 0,
  [SHADOW_TERRAIN_QUALITY.HIGH]: 1,
  [SHADOW_TERRAIN_QUALITY.MAX]: 1,
  [SHADOW_TERRAIN_QUALITY.ULTRA]: 1,
  [SHADOW_TERRAIN_QUALITY.EXTREME]: 1,
};

// Keep MapLibre's native grid. Its single-segment TriangleIndexArray uses
// Uint16 indices: a 256-cell grid has 66,049 interior vertices, plus 1,542
// frame vertices even with skirts disabled. The indices wrap in the last
// two rows, leaving horizontal gaps in both the captured color and depth.
// Source-tile LOD and the independent Three terrain remain high resolution.
const MAPLIBRE_TERRAIN_MESH_SIZE = 128;

const QUALITY_PRIVATE_ZOOM_OFFSET: Record<ShadowTerrainQuality, number> = {
  [SHADOW_TERRAIN_QUALITY.STANDARD]: 0,
  [SHADOW_TERRAIN_QUALITY.HIGH]: 0,
  [SHADOW_TERRAIN_QUALITY.MAX]: 1,
  [SHADOW_TERRAIN_QUALITY.ULTRA]: 2,
  [SHADOW_TERRAIN_QUALITY.EXTREME]: 3,
};

/**
 * Increase MapLibre terrain fidelity beyond its public API.
 *
 * MapLibre 5.x deliberately exposes no terrain screen-space-error setting.
 * TerrainTileManager normally uses deltaZoom=1, i.e. DEM tiles one zoom below
 * the nominal map tile zoom. This narrowly-scoped compatibility patch lowers
 * that delta for z+1. Higher levels additionally use the internal source
 * calculateTileZoom hook; negative deltaZoom values are invalid because they
 * break MapLibre's parent/child tile assumptions. This private hook is the only
 * MapLibre 5.x mechanism for requesting z+2 and above. The source maxzoom still
 * clamps requests. All touched values are restored on teardown; missing or
 * changed internals are treated as an unsupported MapLibre version.
 */
export const applyMapLibreTerrainQuality = (
  terrain: InternalMapLibreTerrain | null | undefined,
  sourceTileSize: number,
  quality: ShadowTerrainQuality,
  initializeNativeTileLod?: () => void
): (() => void) => {
  const manager = terrain?.tileManager;
  if (
    !terrain ||
    !manager ||
    !Number.isFinite(manager.deltaZoom) ||
    !Number.isFinite(manager.tileSize) ||
    !manager.tileManager
  ) {
    return () => undefined;
  }

  const previous = {
    deltaZoom: manager.deltaZoom,
    terrainTileSize: manager.tileSize,
    sourceTileSize: manager.tileManager.tileSize,
    meshSize: terrain.meshSize,
    calculateTileZoom: manager.tileManager._source?.calculateTileZoom,
  };
  const zoomOffset = QUALITY_DELTA_ZOOM[quality];
  const deltaZoom = 1 - zoomOffset;
  const tileSize = sourceTileSize * 2 ** deltaZoom;
  manager.deltaZoom = deltaZoom;
  manager.tileSize = tileSize;
  manager.tileManager.tileSize = tileSize;
  terrain.meshSize = MAPLIBRE_TERRAIN_MESH_SIZE;
  const privateZoomOffset = QUALITY_PRIVATE_ZOOM_OFFSET[quality];
  if (privateZoomOffset > 0 && manager.tileManager._source) {
    // A missing source hook means MapLibre uses its adaptive default, NOT
    // the center zoom. Replacing it with args[0] forces distant horizon tiles
    // to the near-field LOD and thrashes the render-to-texture pool on pitch.
    // Obtain the native function via the public map API, once at setup.
    if (!previous.calculateTileZoom) initializeNativeTileLod?.();
    const calculateTileZoom = manager.tileManager._source.calculateTileZoom;
    if (calculateTileZoom) {
      manager.tileManager._source.calculateTileZoom = (...args) =>
        calculateTileZoom(...args) + privateZoomOffset;
    }
  }
  terrain._meshCache = {};
  manager.freeRtt?.();

  return () => {
    manager.deltaZoom = previous.deltaZoom;
    manager.tileSize = previous.terrainTileSize;
    manager.tileManager.tileSize = previous.sourceTileSize;
    terrain.meshSize = previous.meshSize;
    if (manager.tileManager._source) {
      manager.tileManager._source.calculateTileZoom =
        previous.calculateTileZoom;
    }
    terrain._meshCache = {};
    manager.freeRtt?.();
  };
};
