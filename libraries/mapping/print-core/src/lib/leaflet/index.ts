// Leaflet print preview — subpath "@carma-mapping/print-core/leaflet".
//
// This folder holds a faithful copy of the geoportal Leaflet print UI
// (apps/geoportal/src/app/components/map-print + helper/print.tsx). The ONLY
// difference from the app version is that all Redux access was lifted out: every
// value the components used to read via useSelector is now a prop, and every
// action they dispatched is now a callback prop. The consuming app wires these
// props onto its own store.
//
// It MAY import Leaflet and from "../core". The core MUST NOT import from here.
//
// NOTE: this is the intermediate "move the code into the library" step. It is
// not yet integrated/refactored onto the core's printMap()/getPrintLayers().

export { default as PrintPreview } from "./PrintPreview";
export { default as PrintButton } from "./PrintButton";
export { default as PrintPrevTexts } from "./PrintPrevTexts";
export { default as ClosePrintButton } from "./ClosePrintButton";
export { default as UpdateScalePrintButton } from "./UpdateScalePrintButton";

export {
  printMap,
  getPrintLayers,
  getPreviewBounds,
  getCenterPrintPreview,
  deleteRectangleById,
  getPolygonByLeafletId,
  getPolygonPoints,
  getFontSizeForPortrait,
  getFontSizeForLandscape,
  getPrintBtnSizesPortrait,
  getPrintBtnSizesLandscape,
  getSmallSizePortrait,
  getSmallSizeLandscape,
  drawRectanglePrev,
  addPreviewWrapper,
  removePreviewWrapper,
  setPrevSizes,
  scaleOptions,
} from "./print.helper";
