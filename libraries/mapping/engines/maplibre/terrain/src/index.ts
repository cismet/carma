// Terrain runtime entry, kept out of the root barrel: only consumers that
// build the raster DEM terrain (the shadow simulation) bundle its worker.
export { buildRasterDemTerrainRuntime } from "../../src/lib/runtime/integrations/raster-dem-terrain-runtime";
export type { RasterDemTerrainRuntimeOptions } from "../../src/lib/runtime/integrations/raster-dem-terrain-runtime";
export { acquireRasterDemTerrainTileSource } from "../../src/lib/runtime/integrations/raster-dem-terrain-tile-source";
export type {
  TerrainTile,
  TerrainTileId,
} from "../../src/lib/core/raster-dem-tile";
export { getTileBounds } from "../../src/lib/core/raster-dem-tile";
export { createTerrainEcefPresentation } from "../../src/lib/runtime/integrations/terrain-ecef-presentation";
export { getTerrainScreenErrorRatio } from "../../src/lib/core/terrain-screen-error";
