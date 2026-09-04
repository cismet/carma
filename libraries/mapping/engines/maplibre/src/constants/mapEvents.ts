export const MAPLIBRE_EVENT = {
  IDLE: "idle",
  MOVE: "move",
  MOVE_END: "moveend",
  MOVE_START: "movestart",
  RENDER: "render",
  RESIZE: "resize",
  STYLE_DATA: "styledata",
  STYLE_DATA_LOADING: "styledataloading",
  STYLE_LOAD: "style.load",
  TERRAIN: "terrain",
} as const;

export type MapLibreEventName =
  (typeof MAPLIBRE_EVENT)[keyof typeof MAPLIBRE_EVENT];
