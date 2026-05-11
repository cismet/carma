export interface CarmaMaplibreSourceDefaults {
  rasterTileSize: number;
  terrainTileSize: number;
  terrainMaxZoom: number;
}

export const CARMA_MAPLIBRE_SOURCE_DEFAULTS = {
  rasterTileSize: 256,
  terrainTileSize: 512,
  terrainMaxZoom: 15,
} as const satisfies CarmaMaplibreSourceDefaults;
