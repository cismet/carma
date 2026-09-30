/** Where the tile overview is drawn: not at all, over the map or in a panel window. */
export const TILE_LOADING_DEBUG_OVERVIEW_MODE = {
  OFF: "off",
  OVERLAY: "overlay",
  WINDOW: "window",
} as const;
export type TileLoadingDebugOverviewMode =
  (typeof TILE_LOADING_DEBUG_OVERVIEW_MODE)[keyof typeof TILE_LOADING_DEBUG_OVERVIEW_MODE];

/** The panels of the tile loading debugger. */
export const TILE_LOADING_DEBUG_PANEL_ID = {
  DIAGNOSTIC_TOOLS: "diagnostic-tools",
  MESH_STYLE: "mesh-style",
  OVERVIEW: "overview",
  OVERVIEW_OPTIONS: "overview-options",
  LEGEND: "legend",
  QUEUE: "queue",
  STATS: "stats",
  CHARTS: "charts",
  LOG: "log",
} as const;
export type TileLoadingDebugPanelId =
  (typeof TILE_LOADING_DEBUG_PANEL_ID)[keyof typeof TILE_LOADING_DEBUG_PANEL_ID];
