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

export const MESH_ALLOCATION_RECOVERY_PHASE = {
  WAITING: "waiting",
  PROBING: "probing",
  RECOVERED: "recovered",
} as const;

export const MESH_MOTION_COVERAGE_INTERVAL_MS = 180;

export const MESH_EVICTION_BATCH_SIZE = 16;

export const TILE_METADATA_DOWNLOAD_CONCURRENCY = 8;
export const TILE_METADATA_PARSE_CONCURRENCY = 2;

export const DEFAULT_CACHE_MIN_ITEMS = 6_000;

export const DEFAULT_CACHE_MAX_ITEMS = 8_000;

export const THREE_TILES_DEFAULT_REQUEST_CONCURRENCY = 64;

export const TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY = 8;

export const MESH_PARSE_CONCURRENCY = 2;

/** Overlap asynchronous shadow preparation only within a full desktop grant. */
export const MESH_DESKTOP_SHADOW_PARSE_CONCURRENCY = 8;

/** Bounds per-file contention while retaining measured payload throughput. */
export const MESH_DOWNLOAD_CONCURRENCY = 6;

/**
 * Skip strategy while the camera moves: downloads and scene commits continue
 * at a bounded rate so newly exposed ground fills during a drag or a zoom
 * instead of in one burst afterwards. Parsing commits Three objects on the
 * renderer thread, hence the small parse limit. Network slots stay available
 * during motion; downstream backlog and memory pressure still bound admission.
 * Decision: TILES_COVERAGE.md#motion-preserves-visible-detail.
 */
export const MESH_MOTION_DOWNLOAD_CONCURRENCY = MESH_DOWNLOAD_CONCURRENCY;
export const MESH_MOTION_PARSE_CONCURRENCY = 2;

export const MESH_PARSE_BACKLOG_SOFT_LIMIT = 12;

export const MESH_PARSE_BACKLOG_HARD_LIMIT = 24;

/** Frames are requested at this interval until the root tileset arrived. */
export const KICKSTART_INTERVAL_MS = 400;

/** A hidden tab keeps its used tiles this long before the cache is wiped. */
export const HIDDEN_TAB_WIPE_DELAY_MS = 30_000;

export const CLAY_COLOR = 0xd6d2ca;

/**
 * Zero selects the finest complete resident baseline fitting its memory share.
 * A positive explicit value additionally limits residual geometric detail.
 */
export const TILESET_MIN_RESOLUTION_DEFAULT_PX = 0;

/**
 * Quality settings for terrain-providing meshes, measured in CSS pixels.
 * Explicit layer targets override these defaults. Memory grants and resident
 * baseline selection remain independent of quality, bandwidth and display DPR.
 * Calibrated with shadow casters at 1920 x 1080 CSS pixels against Mesh 2024;
 * these settings trade visible detail for work, without promising load times.
 */
export const TILES_MESH_QUALITY_PROFILES = {
  low: {
    errorTarget: 16,
    baseErrorTarget: 12,
  },
  standard: {
    errorTarget: 12,
    baseErrorTarget: 12,
  },
  high: {
    errorTarget: TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS,
    baseErrorTarget: 12,
  },
} as const;
