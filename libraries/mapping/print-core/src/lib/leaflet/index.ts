// Leaflet print preview — subpath "@carma-mapping/print-core/leaflet".
//
// This is where the Leaflet-specific preview rectangle lives: drawing the
// draggable L.polygon, reading map center / container points, and building a
// PrintJob that is handed to the core's printMap().
//
// It MAY import Leaflet and from "../core". The core MUST NOT import from here.
//
// TODO(next step): move the Leaflet-coupled functions out of
// apps/geoportal/src/app/helper/print.tsx into this folder:
//   drawRectanglePrev, drawRectFromWithBounds, getPolygonPoints,
//   getPolygonByLeafletId, deleteRectangleById, getPreviewBounds,
//   getCenterPrintPreview, addPreviewWrapper / removePreviewWrapper, …

export {};
