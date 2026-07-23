import { MercatorCoordinate } from "maplibre-gl";

import type { CopcPointChunk, CopcSceneMetadata } from "./copcLoader";

export const TERRAIN_RELATIVE_HEIGHT_FIELD = "Höhe über Gelände";

export const TERRAIN_DEM_ENCODINGS = {
  MAPBOX: "mapbox",
  TERRARIUM: "terrarium",
} as const;

export type TerrainDemEncoding =
  (typeof TERRAIN_DEM_ENCODINGS)[keyof typeof TERRAIN_DEM_ENCODINGS];

export interface TerrainDemFieldSource {
  tileUrlTemplate: string;
  zoom: number;
  tileSize: number;
  encoding: TerrainDemEncoding;
}

interface TerrainTile {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

interface TerrainTileKey {
  x: number;
  y: number;
}

const tileCache = new Map<string, Promise<TerrainTile>>();
const MAX_CACHED_TILES = 32;

const tileUrl = (
  template: string,
  zoom: number,
  x: number,
  y: number
): string =>
  template
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));

const loadTerrainTile = (url: string): Promise<TerrainTile> => {
  const cached = tileCache.get(url);
  if (cached) return cached;

  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`DEM tile ${response.status}: ${url}`);
      }
      return response.blob();
    })
    .then(createImageBitmap)
    .then((bitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("DEM tile canvas context is unavailable");
      context.drawImage(bitmap, 0, 0);
      const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      return { width: canvas.width, height: canvas.height, rgba };
    })
    .catch((error: unknown) => {
      tileCache.delete(url);
      throw error;
    });

  tileCache.set(url, pending);
  if (tileCache.size > MAX_CACHED_TILES) {
    const oldest = tileCache.keys().next().value as string | undefined;
    if (oldest && oldest !== url) tileCache.delete(oldest);
  }
  return pending;
};

export const decodeTerrainHeight = (
  red: number,
  green: number,
  blue: number,
  encoding: TerrainDemEncoding
): number =>
  encoding === TERRAIN_DEM_ENCODINGS.TERRARIUM
    ? red * 256 + green + blue / 256 - 32_768
    : -10_000 + (red * 65_536 + green * 256 + blue) * 0.1;

const mercatorTileCoordinate = (
  longitude: number,
  latitude: number,
  zoom: number
): [x: number, y: number] => {
  const coordinate = MercatorCoordinate.fromLngLat([longitude, latitude], 0);
  const scale = 2 ** zoom;
  return [coordinate.x * scale, coordinate.y * scale];
};

const coveringTileKeys = (
  metadata: CopcSceneMetadata,
  zoom: number
): TerrainTileKey[] => {
  const [[west, south], [east, north]] = metadata.boundsLngLat;
  const [westTile, northTile] = mercatorTileCoordinate(west, north, zoom);
  const [eastTile, southTile] = mercatorTileCoordinate(east, south, zoom);
  const minimumX = Math.floor(Math.min(westTile, eastTile));
  const maximumX = Math.floor(Math.max(westTile, eastTile)) + 1;
  const minimumY = Math.floor(Math.min(northTile, southTile));
  const maximumY = Math.floor(Math.max(northTile, southTile)) + 1;
  const keys: TerrainTileKey[] = [];
  for (let y = minimumY; y <= maximumY; y++) {
    for (let x = minimumX; x <= maximumX; x++) keys.push({ x, y });
  }
  return keys;
};

const decodedPixel = (
  tiles: Map<string, TerrainTile>,
  globalPixelX: number,
  globalPixelY: number,
  tileSize: number,
  encoding: TerrainDemEncoding
): number => {
  const tileX = Math.floor(globalPixelX / tileSize);
  const tileY = Math.floor(globalPixelY / tileSize);
  const pixelX = ((globalPixelX % tileSize) + tileSize) % tileSize;
  const pixelY = ((globalPixelY % tileSize) + tileSize) % tileSize;
  const tile = tiles.get(`${tileX}/${tileY}`);
  if (!tile) {
    throw new Error(`DEM tile ${tileX}/${tileY} is unavailable`);
  }
  const x = Math.min(pixelX, tile.width - 1);
  const y = Math.min(pixelY, tile.height - 1);
  const offset = (y * tile.width + x) * 4;
  return decodeTerrainHeight(
    tile.rgba[offset],
    tile.rgba[offset + 1],
    tile.rgba[offset + 2],
    encoding
  );
};

const sampleTerrainHeight = (
  tiles: Map<string, TerrainTile>,
  worldX: number,
  worldY: number,
  source: TerrainDemFieldSource
): number => {
  const pixelScale = 2 ** source.zoom * source.tileSize;
  const pixelX = worldX * pixelScale;
  const pixelY = worldY * pixelScale;
  const x0 = Math.floor(pixelX);
  const y0 = Math.floor(pixelY);
  const tx = pixelX - x0;
  const ty = pixelY - y0;
  const northwest = decodedPixel(
    tiles,
    x0,
    y0,
    source.tileSize,
    source.encoding
  );
  const northeast = decodedPixel(
    tiles,
    x0 + 1,
    y0,
    source.tileSize,
    source.encoding
  );
  const southwest = decodedPixel(
    tiles,
    x0,
    y0 + 1,
    source.tileSize,
    source.encoding
  );
  const southeast = decodedPixel(
    tiles,
    x0 + 1,
    y0 + 1,
    source.tileSize,
    source.encoding
  );
  const north = northwest + (northeast - northwest) * tx;
  const south = southwest + (southeast - southwest) * tx;
  return north + (south - north) * ty;
};

export interface TerrainRelativeFieldResult {
  values: Float32Array[];
  tileCount: number;
}

/**
 * Samples the configured raster DEM once per loaded point. Point heights are
 * measured in the active terrain provider's numeric height frame before the
 * optional manual ENU display correction is applied.
 */
export const buildTerrainRelativeHeightField = async (
  chunks: readonly CopcPointChunk[],
  metadata: CopcSceneMetadata,
  pointBaseHeightMeters: number,
  source: TerrainDemFieldSource
): Promise<TerrainRelativeFieldResult> => {
  const keys = coveringTileKeys(metadata, source.zoom);
  const loaded = await Promise.all(
    keys.map(async ({ x, y }) => ({
      x,
      y,
      tile: await loadTerrainTile(
        tileUrl(source.tileUrlTemplate, source.zoom, x, y)
      ),
    }))
  );
  const tiles = new Map(
    loaded.map(({ x, y, tile }) => [`${x}/${y}`, tile] as const)
  );
  const origin = MercatorCoordinate.fromLngLat(metadata.centerLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const values: Float32Array[] = [];

  for (const chunk of chunks) {
    const relativeHeights = new Float32Array(chunk.pointCount);
    for (let index = 0; index < chunk.pointCount; index++) {
      const positionOffset = index * 3;
      const worldX = origin.x + chunk.positions[positionOffset] * meterScale;
      const worldY =
        origin.y + chunk.positions[positionOffset + 2] * meterScale;
      const terrainHeight = sampleTerrainHeight(tiles, worldX, worldY, source);
      relativeHeights[index] =
        pointBaseHeightMeters +
        chunk.positions[positionOffset + 1] -
        terrainHeight;
    }
    values.push(relativeHeights);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { values, tileCount: tiles.size };
};
