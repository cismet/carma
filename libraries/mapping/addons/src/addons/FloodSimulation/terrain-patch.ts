import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";

/**
 * The raster DEM behind the flood: an XYZ tile service in the same shape a
 * MapLibre `raster-dem` source takes, so a config can name any of the
 * terrain.cismet.de services without translation.
 */
export type FloodTerrainSource = {
  /** tile url template with `{z}`, `{x}` and `{y}` */
  tiles: string;
  /** Default: 512 */
  tileSize?: number;
  /** Default: 5 */
  minzoom?: number;
  /** Default: 16 */
  maxzoom?: number;
  /**
   * How a pixel encodes its height. Default: "terrarium", which resolves
   * 1/256 m; "mapbox" steps in 0.1 m and terraces a flat street.
   */
  encoding?: "terrarium" | "mapbox";
};

export type ResolvedFloodTerrainSource = Required<FloodTerrainSource>;

/**
 * The Geobasis NRW DGM1 as served for wupp #4199: 1 m ground model without
 * buildings and vegetation, heights in DHHN2016, covering NRW rather than
 * stopping at the city limits. Terrarium rather than Mapbox encoding, per the
 * issue's finding that 0.1 m steps show as bands on flat ground.
 */
export const NRW_DGM1_TERRAIN: ResolvedFloodTerrainSource = {
  tiles:
    "https://terrain.cismet.de/services/nrw/dgm1_dhhn2016_terrarium/tiles/{z}/{x}/{y}.png",
  tileSize: 512,
  minzoom: 5,
  maxzoom: 16,
  encoding: "terrarium",
};

export const resolveTerrainSource = (
  source?: FloodTerrainSource
): ResolvedFloodTerrainSource => ({
  tiles: source?.tiles ?? NRW_DGM1_TERRAIN.tiles,
  tileSize: source?.tileSize ?? NRW_DGM1_TERRAIN.tileSize,
  minzoom: source?.minzoom ?? NRW_DGM1_TERRAIN.minzoom,
  maxzoom: source?.maxzoom ?? NRW_DGM1_TERRAIN.maxzoom,
  encoding: source?.encoding ?? NRW_DGM1_TERRAIN.encoding,
});

/** A rectangle of tiles at one zoom, `x0`/`y0` being the top-left tile. */
export type TileRect = {
  zoom: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
};

/**
 * The tiles of a rect composited into one canvas, top-left tile at (0, 0).
 * Pixels keep the service's encoding; the shader decodes them. A tile that
 * is missing (outside the coverage, or failed) is left black, which decodes to
 * the encoding's floor and is treated as "no ground" downstream.
 */
export type TerrainPatch = TileRect & {
  tileSize: number;
  canvas: HTMLCanvasElement;
  /** lowest decoded height in the patch, no-data pixels excluded */
  minHeight: number;
  /** highest decoded height in the patch, no-data pixels excluded */
  maxHeight: number;
  /** false when every tile was missing or empty */
  hasData: boolean;
};

/**
 * Below this a decoded height is no-data. Terrarium black is -32768 m, Mapbox
 * black is -10000 m; the deepest real ground on earth is around -430 m.
 */
export const NO_DATA_BELOW = -1000;

/**
 * Most tiles a patch may hold. 24 tiles of 512 px are 24 MB of texture; a
 * viewport that needs more at its own zoom is loaded one zoom coarser.
 */
const MAX_TILES = 24;

/** how far beyond the viewport the patch reaches, per side, in viewport widths */
const MARGIN = 0.25;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

/**
 * The tiles that cover the current view with a margin, at the coarsest zoom
 * that still fits `MAX_TILES`, starting from the map's own zoom (one texel per
 * screen pixel for 512 px tiles).
 */
export const tileRectForView = (
  map: MaplibreMap,
  source: ResolvedFloodTerrainSource
): TileRect => {
  const bounds = map.getBounds();
  const a = MercatorCoordinate.fromLngLat(bounds.getSouthWest());
  const b = MercatorCoordinate.fromLngLat(bounds.getNorthEast());
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const marginX = (maxX - minX) * MARGIN;
  const marginY = (maxY - minY) * MARGIN;
  const ex0 = clamp01(minX - marginX);
  const ex1 = clamp01(maxX + marginX);
  const ey0 = clamp01(minY - marginY);
  const ey1 = clamp01(maxY + marginY);

  let zoom = clamp(Math.round(map.getZoom()), source.minzoom, source.maxzoom);
  for (;;) {
    const n = 2 ** zoom;
    const x0 = Math.floor(ex0 * n);
    const x1 = Math.min(n - 1, Math.floor(ex1 * n));
    const y0 = Math.floor(ey0 * n);
    const y1 = Math.min(n - 1, Math.floor(ey1 * n));
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols * rows <= MAX_TILES) {
      return { zoom, x0, y0, cols, rows };
    }
    if (zoom <= source.minzoom) {
      // A view tilted to the horizon has bounds no zoom can cover in the
      // budget. Keep the tiles around the centre; the far distance goes dry.
      return cropAroundCenter(map, zoom, x0, y0, cols, rows);
    }
    zoom -= 1;
  }
};

/** at most 6 x 4 tiles, centred on the map centre, inside the given rect */
const cropAroundCenter = (
  map: MaplibreMap,
  zoom: number,
  x0: number,
  y0: number,
  cols: number,
  rows: number
): TileRect => {
  const n = 2 ** zoom;
  const center = MercatorCoordinate.fromLngLat(map.getCenter());
  const maxCols = Math.min(cols, 6);
  const maxRows = Math.min(rows, 4);
  const cx = Math.floor(center.x * n);
  const cy = Math.floor(center.y * n);
  const cropX0 = clamp(cx - Math.floor(maxCols / 2), x0, x0 + cols - maxCols);
  const cropY0 = clamp(cy - Math.floor(maxRows / 2), y0, y0 + rows - maxRows);
  return { zoom, x0: cropX0, y0: cropY0, cols: maxCols, rows: maxRows };
};

/** whether `patch`, at the same zoom, already holds every tile of `rect` */
export const patchCovers = (patch: TileRect, rect: TileRect): boolean =>
  patch.zoom === rect.zoom &&
  rect.x0 >= patch.x0 &&
  rect.y0 >= patch.y0 &&
  rect.x0 + rect.cols <= patch.x0 + patch.cols &&
  rect.y0 + rect.rows <= patch.y0 + patch.rows;

export const sameRect = (a: TileRect, b: TileRect): boolean =>
  a.zoom === b.zoom &&
  a.x0 === b.x0 &&
  a.y0 === b.y0 &&
  a.cols === b.cols &&
  a.rows === b.rows;

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

/**
 * Decoded bitmaps by url. Small on purpose: a patch is at most 24 tiles and a
 * pan reuses the ones it still overlaps, so the cache only has to bridge one
 * reload to the next.
 */
const MAX_CACHED_TILES = 48;
const tileCache = new Map<string, Promise<ImageBitmap | null>>();

/**
 * Drop the oldest entry. Not closed: a patch may still be compositing it, and
 * an unreferenced bitmap is collected on its own.
 */
const evictOldest = (): void => {
  if (tileCache.size <= MAX_CACHED_TILES) return;
  const oldest = tileCache.keys().next().value;
  if (oldest !== undefined) tileCache.delete(oldest);
};

/**
 * One tile as a bitmap, or null where the service has none. A 404 is the
 * normal answer outside the coverage and is remembered; a network failure is
 * not, so the next reload tries again.
 */
const loadTile = (url: string): Promise<ImageBitmap | null> => {
  const cached = tileCache.get(url);
  if (cached) return cached;

  const pending = fetch(url)
    .then((response) => {
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`DEM tile ${response.status}: ${url}`);
      }
      return response
        .blob()
        .then((blob) =>
          // no colour management: the channels are height bits, not colour
          createImageBitmap(blob, {
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
          })
        );
    })
    .catch((error: unknown) => {
      tileCache.delete(url);
      throw error;
    });

  tileCache.set(url, pending);
  evictOldest();
  return pending;
};

export const decodeHeight = (
  r: number,
  g: number,
  b: number,
  encoding: FloodTerrainSource["encoding"]
): number =>
  encoding === "mapbox"
    ? -10_000 + (r * 65_536 + g * 256 + b) * 0.1
    : r * 256 + g + b / 256 - 32_768;

/** every other pixel in both axes is enough to bound the slider */
const STATS_STRIDE = 2;

/**
 * Fetch the tiles of `rect` and composite them. A tile that fails is logged
 * through `onTileError` and left black rather than failing the whole patch,
 * since one missing tile at the edge should not take the flood off the map.
 */
export const loadTerrainPatch = async (
  source: ResolvedFloodTerrainSource,
  rect: TileRect,
  onTileError?: (error: unknown) => void
): Promise<TerrainPatch> => {
  const { tileSize, encoding } = source;
  const { zoom, x0, y0, cols, rows } = rect;

  const bitmaps = await Promise.all(
    Array.from({ length: cols * rows }, (_, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return loadTile(tileUrl(source.tiles, zoom, x0 + col, y0 + row)).catch(
        (error: unknown) => {
          onTileError?.(error);
          return null;
        }
      );
    })
  );

  const canvas = document.createElement("canvas");
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("[FLOOD] 2d canvas context is unavailable");
  }
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  let hasData = false;
  bitmaps.forEach((bitmap, index) => {
    if (!bitmap) return;
    hasData = true;
    const col = index % cols;
    const row = Math.floor(index / cols);
    context.drawImage(bitmap, col * tileSize, row * tileSize, tileSize, tileSize);
  });

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  if (hasData) {
    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    for (let y = 0; y < height; y += STATS_STRIDE) {
      let offset = y * width * 4;
      for (let x = 0; x < width; x += STATS_STRIDE, offset += 4 * STATS_STRIDE) {
        const h = decodeHeight(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          encoding
        );
        if (h < NO_DATA_BELOW) continue;
        if (h < minHeight) minHeight = h;
        if (h > maxHeight) maxHeight = h;
      }
    }
    hasData = Number.isFinite(minHeight);
  }

  return {
    ...rect,
    tileSize,
    canvas,
    minHeight: hasData ? minHeight : 0,
    maxHeight: hasData ? maxHeight : 0,
    hasData,
  };
};
