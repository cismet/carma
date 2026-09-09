// Match the direct screen-space-error control used by the official
// 3DTilesRendererJS kitchen-sink demo. Lower values request more detail.
export const TILES_ERROR_TARGET_MIN_PIXELS = 0;

export const TILES_ERROR_TARGET_MAX_PIXELS = 50;

export const TILES_ERROR_TARGET_DEFAULT_PIXELS = 4;

export const VIEW_QUALITY_AUDIT_PASSES = 2;

export const MESH_SETTLED_AUDIT_INTERVAL_MS = 1_000;

export const MESH_MOTION_COVERAGE_DEBOUNCE_MS = 180;

export const MESH_EVICTION_BATCH_SIZE = 16;

export const DEFAULT_CACHE_MIN_ITEMS = 6_000;

export const DEFAULT_CACHE_MAX_ITEMS = 8_000;

export const THREE_TILES_DEFAULT_REQUEST_CONCURRENCY = 64;

export const TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY = 8;

export const MESH_PARSE_CONCURRENCY = 2;

export const MESH_DOWNLOAD_CONCURRENCY = 16;

export const MESH_PARSE_BACKLOG_SOFT_LIMIT = 12;

export const MESH_PARSE_BACKLOG_HARD_LIMIT = 24;

/** Frames are requested at this interval until the root tileset arrived. */
export const KICKSTART_INTERVAL_MS = 400;

/** A hidden tab keeps its used tiles this long before the cache is wiped. */
export const HIDDEN_TAB_WIPE_DELAY_MS = 30_000;

export const CLAY_COLOR = 0xd6d2ca;
