// Public entry for "@carma-mapping/print-core".
//
// IMPORTANT: this barrel re-exports the CORE ONLY. It must never import from
// ./lib/leaflet or ./lib/maplibre, otherwise consumers of the core would
// transitively pull in Leaflet + MapLibre. Engine code is reached via the
// dedicated subpaths:
//   "@carma-mapping/print-core/leaflet"
//   "@carma-mapping/print-core/maplibre"

export * from "./lib/core";
