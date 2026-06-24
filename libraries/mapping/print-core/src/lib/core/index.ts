// Engine-agnostic core barrel. Must NOT import from ../leaflet or ../maplibre.

export { printMap } from "./printMap";
export type { PrintMapHandlers } from "./printMap";
export { getPrintLayers } from "./getPrintLayers";
export {
  buildWMSPrint,
  buildVectorStylePrint,
  buildOSMPrint,
  buildTilesPrint,
  getStyleName,
} from "./buildLayers";
export {
  scaleOptions,
  getPrintPixelSize,
  getMercatorScale,
  calculateBBox,
  createFeatureFromBBox,
} from "./scale";
export type { BBox } from "./scale";
export type {
  Orientation,
  PrintInputLayer,
  MapFishLayer,
  PrintJob,
  ScaleOption,
} from "./types";
