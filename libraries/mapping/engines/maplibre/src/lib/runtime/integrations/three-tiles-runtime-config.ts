// Match the direct screen-space-error control used by the official
// 3DTilesRendererJS kitchen-sink demo. Lower values request more detail.
export const TILES_ERROR_TARGET_MIN_PIXELS = 0;

export const TILES_ERROR_TARGET_MAX_PIXELS = 50;

export const TILES_ERROR_TARGET_DEFAULT_PIXELS = 4;

/**
 * Idle target of a terrain-providing (mesh) tileset. The mesh fills the
 * whole view, so a looser target than a building layer's keeps the selection
 * affordable; the shadow simulation overrides it per view when asked to.
 */
export const TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS = 6;

export const VIEW_QUALITY_AUDIT_PASSES = 2;

export const MESH_SETTLED_AUDIT_INTERVAL_MS = 1_000;

export const MESH_MOTION_COVERAGE_INTERVAL_MS = 180;

export const MESH_EVICTION_BATCH_SIZE = 16;

export const TILE_METADATA_DOWNLOAD_CONCURRENCY = 8;
export const TILE_METADATA_PARSE_CONCURRENCY = 2;

export const DEFAULT_CACHE_MIN_ITEMS = 6_000;

export const DEFAULT_CACHE_MAX_ITEMS = 8_000;

export const THREE_TILES_DEFAULT_REQUEST_CONCURRENCY = 64;

export const TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY = 8;

export const MESH_PARSE_CONCURRENCY = 2;

export const MESH_DOWNLOAD_CONCURRENCY = 16;

/**
 * Skip strategy while the camera moves: downloads and scene commits continue
 * at a bounded rate so newly exposed ground fills during a drag or a zoom
 * instead of in one burst afterwards. Parsing commits Three objects on the
 * renderer thread, hence the small parse limit.
 */
export const MESH_MOTION_DOWNLOAD_CONCURRENCY = 8;
export const MESH_MOTION_PARSE_CONCURRENCY = 2;

export const MESH_PARSE_BACKLOG_SOFT_LIMIT = 12;

export const MESH_PARSE_BACKLOG_HARD_LIMIT = 24;

/** Frames are requested at this interval until the root tileset arrived. */
export const KICKSTART_INTERVAL_MS = 400;

/** A hidden tab keeps its used tiles this long before the cache is wiped. */
export const HIDDEN_TAB_WIPE_DELAY_MS = 30_000;

export const CLAY_COLOR = 0xd6d2ca;

/**
 * Contract version of a style's `metadata.carmaConf["3d"]` block. A style that
 * names none is version 1: the legacy shape with `renderMode`, `tilesetUrl` and
 * `terrainMandatory` alone, which the layer manager completes with defaults.
 */
export const TILES3D_STYLE_VERSION = 1;
/**
 * Residual resolution of a terrain-providing tileset whose style names none:
 * the whole extent stays resident at the level that shows it across this many
 * pixels at the base error target.
 */
export const TILESET_MIN_RESOLUTION_DEFAULT_PX = 1024;
