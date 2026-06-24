// MapLibre print preview — subpath "@carma-mapping/print-core/maplibre".
//
// This is where the MapLibre-specific preview rectangle will live: a GeoJSON
// source + fill layer for the print area, drag handling via map.project /
// map.unproject, deriving center / scale from the MapLibre camera, and building
// a PrintJob handed to the core's printMap().
//
// It MAY import maplibre-gl and from "../core". The core MUST NOT import from here.
//
// TODO(next step): implement the MapLibre preview against the same PrintJob
// contract the Leaflet preview uses.

export {};
