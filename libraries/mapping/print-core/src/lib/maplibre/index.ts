// MapLibre print preview — subpath "@carma-mapping/print-core/maplibre".
//
// The MapLibre-specific preview: a GeoJSON source + fill/line layers for the
// print rectangle, drag handling via map.project / map.unproject, deriving the
// print center / scale from the rectangle, and building a PrintJob handed to
// the core's printMap(). It MAY import maplibre-gl, React and from "../core".
// The core MUST NOT import from here.

export { MapLibrePrintPreview } from "./MapLibrePrintPreview";
export type { MapLibrePrintPreviewProps } from "./MapLibrePrintPreview";

export {
  buildInlineVectorStyle,
  layerHasActiveFilter,
} from "./inlineVectorPrint";
export type {
  Bbox,
  InlineVectorStyleOptions,
  StyleLayerLike,
} from "./inlineVectorPrint";

export {
  PREVIEW_SOURCE_ID,
  PREVIEW_FILL_LAYER_ID,
  PREVIEW_LINE_LAYER_ID,
  buildRectBounds,
  rectBoundsToFeature,
  getRectCenter3857,
  getRectScreenBox,
  fitMapToRect,
  ensureRectLayers,
  updateRectData,
  removeRectLayers,
  attachRectDrag,
  attachRectDblClick,
} from "./previewRect";
export type { RectBounds, RectScreenBox, RectDragHandlers } from "./previewRect";
