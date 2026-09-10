export const MAPLIBRE_EVENT = {
  ERROR: "error",
  IDLE: "idle",
  MOVE: "move",
  MOVE_END: "moveend",
  MOVE_START: "movestart",
  RENDER: "render",
  RESIZE: "resize",
  STYLE_DATA: "styledata",
  STYLE_DATA_LOADING: "styledataloading",
  STYLE_LOAD: "style.load",
  SOURCE_DATA: "sourcedata",
  SOURCE_DATA_LOADING: "sourcedataloading",
  SOURCE_DATA_ABORT: "sourcedataabort",
  TERRAIN: "terrain",
  WEBGL_CONTEXT_LOST: "webglcontextlost",
  WEBGL_CONTEXT_RESTORED: "webglcontextrestored",
} as const;

export type MapLibreEventName =
  (typeof MAPLIBRE_EVENT)[keyof typeof MAPLIBRE_EVENT];
