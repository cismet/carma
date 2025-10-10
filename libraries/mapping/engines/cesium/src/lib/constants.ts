// TODO move this out to a shared location or as config only
export const VIEWERSTATE_KEYS: Record<string, string> = {
  mapStyle: "m",
  is3d: "is3d",
};

/**
 * Tileset and scene style identifiers
 */
export const TILESET_IDS = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
} as const;

/**
 * Scene style identifiers (alias for TILESET_IDS)
 */
export const SCENE_STYLES = TILESET_IDS;
