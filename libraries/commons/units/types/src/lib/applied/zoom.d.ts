import { NumericUnit } from "../brands";

// TILED WEB MAP / XYZ / SLIPPY MAP

declare const zoomSymbol: unique symbol;

export type ZoomUnits = NumericUnit<typeof zoomSymbol>;

declare const tileSize256: 256;
declare const tileSize512: 512;

type ZoomQuality<TileSize extends number> = ZoomUnits & {
  readonly tileSize: TileSize;
};

// still default to 256x256 tiles as short hand
export type Zoom = ZoomQuality<typeof tileSize256>;

// Leaflet Zoom
export type Zoom256 = ZoomQuality<typeof tileSize256>;

// MapLibre Zoom defined for 512x512 tiles
export type Zoom512 = ZoomQuality<typeof tileSize512>;
