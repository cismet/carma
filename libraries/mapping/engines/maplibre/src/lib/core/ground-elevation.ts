import {
  latitudeToTileY,
  longitudeToTileX,
  sampleRaster,
} from "./raster-dem-tile";

export type GroundElevationSource = Readonly<{
  /** `{z}/{x}/{y}` tile URL template of a Terrarium-encoded raster DEM. */
  tileUrlTemplate: string;
  /** Tile level to sample; clamped to the source's maximum. */
  level?: number;
  maxzoom?: number;
  signal?: AbortSignal;
}>;

const DEFAULT_LEVEL = 14;

/**
 * Height of the ground at one coordinate from a single Terrarium DEM tile,
 * without switching the map's terrain on. One small tile instead of the
 * whole viewport's DEM; null when the tile cannot be fetched or decoded.
 */
export const fetchGroundElevationMeters = async (
  longitude: number,
  latitude: number,
  source: GroundElevationSource
): Promise<number | null> => {
  const level = Math.max(
    0,
    Math.min(source.level ?? DEFAULT_LEVEL, source.maxzoom ?? DEFAULT_LEVEL)
  );
  const tileX = longitudeToTileX(longitude, level);
  const tileY = latitudeToTileY(latitude, level);
  const x = Math.floor(tileX);
  const y = Math.floor(tileY);
  // A MapLibre custom protocol (`carma-retry://https://…`) wraps the real
  // URL; plain fetch needs the inner one.
  const template = source.tileUrlTemplate.replace(
    /^[a-z][a-z0-9+.-]*:\/\/(?=https?:\/\/)/i,
    ""
  );
  const url = template
    .replace("{z}", String(level))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  try {
    const response = await fetch(url, { signal: source.signal });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement("canvas"), {
            width: bitmap.width,
            height: bitmap.height,
          });
    const context = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height
    );
    bitmap.close();
    const height_ = sampleRaster(
      { width, height, pixels: data },
      (tileX - x) * width,
      (tileY - y) * height
    );
    return Number.isFinite(height_) ? height_ : null;
  } catch {
    return null;
  }
};
