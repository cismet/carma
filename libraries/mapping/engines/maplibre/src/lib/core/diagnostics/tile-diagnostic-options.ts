/** What the tile labels of the overview say. */
export const TILE_DIAGNOSTIC_LABEL_MODE = {
  NONE: "none",
  ID: "id",
  ID_AND_ERROR: "id and error",
  ID_AND_STATS: "id and stats",
} as const;
export type TileDiagnosticLabelMode =
  (typeof TILE_DIAGNOSTIC_LABEL_MODE)[keyof typeof TILE_DIAGNOSTIC_LABEL_MODE];

/** How a volume overview lies on the scene: seen from above or through the camera. */
export const TILE_DIAGNOSTIC_PROJECTION = {
  PLAN: "plan",
  CAMERA: "camera",
} as const;
export type TileDiagnosticProjection =
  (typeof TILE_DIAGNOSTIC_PROJECTION)[keyof typeof TILE_DIAGNOSTIC_PROJECTION];

/** How the tile extents show in the scene: not at all, as boxes or as their edges. */
export const TILE_DIAGNOSTIC_EXTENTS_MODE = {
  NONE: "none",
  BOXES: "boxes",
  EDGES: "edges",
} as const;
export type TileDiagnosticExtentsMode =
  (typeof TILE_DIAGNOSTIC_EXTENTS_MODE)[keyof typeof TILE_DIAGNOSTIC_EXTENTS_MODE];

/** What the overview plane treats as up: the tileset's own axis or the camera's tangent frame. */
export const TILE_DIAGNOSTIC_OVERVIEW_UP = {
  TILESET: "tileset",
  CAMERA_TANGENT: "camera-tangent",
} as const;
export type TileDiagnosticOverviewUp =
  (typeof TILE_DIAGNOSTIC_OVERVIEW_UP)[keyof typeof TILE_DIAGNOSTIC_OVERVIEW_UP];

/** What frames the overview: the tileset extent, the camera frustum or a free view. */
export const TILE_DIAGNOSTIC_OVERVIEW_VIEW = {
  EXTENT: "extent",
  FRUSTUM: "frustum",
  FREE: "free",
} as const;
export type TileDiagnosticOverviewView =
  (typeof TILE_DIAGNOSTIC_OVERVIEW_VIEW)[keyof typeof TILE_DIAGNOSTIC_OVERVIEW_VIEW];

/**
 * Which camera the overview crop follows besides a shared-scene camera id:
 * every frustum, or the live map camera, whose snapshot carries this id.
 */
export const TILE_DIAGNOSTIC_CAMERA_FOCUS = {
  ALL: "all",
  LIVE: "overview-live",
} as const;
