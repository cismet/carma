/** Loading state a tile volume reports to the diagnostics. */
export const TILE_VOLUME_STATE = {
  QUEUED: "queued",
  LOADING: "loading",
  PARSING: "parsing",
  FAILED: "failed",
  LOADED: "loaded",
  /** Loaded and held, but not published: a child waiting for its siblings. */
  RESIDENT: "resident",
} as const;

export type TileVolumeState =
  (typeof TILE_VOLUME_STATE)[keyof typeof TILE_VOLUME_STATE];

/** Whether a volume was loaded for the viewport or only as a shadow caster. */
export const TILE_VOLUME_LOAD_REASON = {
  VIEWPORT: "viewport",
  SHADOW: "shadow",
} as const;

export type TileVolumeLoadReason =
  (typeof TILE_VOLUME_LOAD_REASON)[keyof typeof TILE_VOLUME_LOAD_REASON];

/** Producer labels of the engine's own volumes; the contract keeps `kind` open. */
export const TILE_VOLUME_KIND = {
  TERRAIN_TILE: "terrain-tile",
  TILE_3D: "3d-tile",
} as const;

export type TileVolumeKind =
  (typeof TILE_VOLUME_KIND)[keyof typeof TILE_VOLUME_KIND];
