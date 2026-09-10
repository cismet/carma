// Terrain runtime entry, kept out of the root barrel: only consumers that
// build the raster DEM terrain (the shadow simulation) bundle its worker.
export { buildRasterDemTerrainRuntime } from "../../src/lib/runtime/integrations/raster-dem-terrain-runtime";
export type { RasterDemTerrainRuntimeOptions } from "../../src/lib/runtime/integrations/raster-dem-terrain-runtime";
