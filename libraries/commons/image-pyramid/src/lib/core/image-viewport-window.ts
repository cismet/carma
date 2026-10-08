import type { CssPixels, DevicePixels, Radians, Ratio } from "@carma-units";

export type JpegPyramidLevel = "0" | "1" | "2" | "3" | "4" | "5" | "6";

type Size<P> = { width: P; height: P };
type Rect<P> = Size<P> & { x: P; y: P };
export type NativePreviewWindow = {
  source: Rect<DevicePixels>;
  target: Size<DevicePixels>;
};
export type NativePreviewTile = {
  source: Rect<DevicePixels>;
  sample: Rect<DevicePixels>;
  target: Rect<DevicePixels>;
  edge: DevicePixels;
};

/** Predict one zoom step while keeping pixel density and native-edge clipping consistent. */
export const forecastPreviewWindow = (
  window: NativePreviewWindow,
  nativeSize: Size<DevicePixels>,
  factor: number,
  anchor?: { x: DevicePixels; y: DevicePixels }
): NativePreviewWindow => {
  if (!(factor > 0) || !Number.isFinite(factor))
    throw new RangeError("Preview forecast factor must be finite and positive");
  if (factor === 1) return window;
  const { source, target } = window;
  const center = anchor ?? {
    x: (source.x + source.width / 2) as DevicePixels,
    y: (source.y + source.height / 2) as DevicePixels,
  };
  if (factor > 1 && factor <= 1.42)
    return { source: { ...source }, target: {
      width: Math.ceil(target.width * factor) as DevicePixels,
      height: Math.ceil(target.height * factor) as DevicePixels,
    } };
  if (factor > 1)
    return { source: {
      x: Math.floor(center.x + (source.x - center.x) / factor) as DevicePixels,
      y: Math.floor(center.y + (source.y - center.y) / factor) as DevicePixels,
      width: Math.max(1, Math.floor(source.width / factor)) as DevicePixels,
      height: Math.max(1, Math.floor(source.height / factor)) as DevicePixels,
    }, target: { ...target } };
  const left = Math.max(0, Math.floor(center.x + (source.x - center.x) / factor)),
    top = Math.max(0, Math.floor(center.y + (source.y - center.y) / factor)),
    right = Math.min(nativeSize.width, Math.ceil(center.x + (source.x + source.width - center.x) / factor)),
    bottom = Math.min(nativeSize.height, Math.ceil(center.y + (source.y + source.height - center.y) / factor)),
    width = Math.max(1, right - left), height = Math.max(1, bottom - top);
  return { source: { x: left as DevicePixels, y: top as DevicePixels, width: width as DevicePixels, height: height as DevicePixels },
    target: {
      width: Math.min(target.width, Math.max(1, Math.round(width * target.width / source.width * factor))) as DevicePixels,
      height: Math.min(target.height, Math.max(1, Math.round(height * target.height / source.height * factor))) as DevicePixels,
    } };
};

/** Invert the image roll and principal point to cover only the visible sensor pixels. */
export const nativePreviewWindow = (
  viewport: Size<CssPixels>,
  image: Size<CssPixels>,
  source: Size<DevicePixels>,
  offset: { x: CssPixels; y: CssPixels },
  principal: { xOffset: number; yOffset: number },
  roll: Radians,
  pixelRatio: Ratio
): NativePreviewWindow | null => {
  if (!(image.width > 0 && image.height > 0 && pixelRatio > 0)) return null;
  const c = Math.cos(roll),
    s = Math.sin(roll);
  const points = [
    [0, 0],
    [viewport.width, 0],
    [0, viewport.height],
    [viewport.width, viewport.height],
  ].map(([x, y]) => {
    const dx = x - viewport.width / 2 - offset.x;
    const dy = y - viewport.height / 2 - offset.y;
    return {
      x:
        ((c * dx + s * dy) / image.width - principal.xOffset + 0.5) *
        source.width,
      y:
        ((-s * dx + c * dy) / image.height - principal.yOffset + 0.5) *
        source.height,
    };
  });
  const x = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x))));
  const y = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y))));
  const right = Math.min(
    source.width,
    Math.ceil(Math.max(...points.map((p) => p.x)))
  );
  const bottom = Math.min(
    source.height,
    Math.ceil(Math.max(...points.map((p) => p.y)))
  );
  if (right <= x || bottom <= y) return null;
  const width = right - x,
    height = bottom - y;
  return {
    source: {
      x: x as DevicePixels,
      y: y as DevicePixels,
      width: width as DevicePixels,
      height: height as DevicePixels,
    },
    target: {
      width: Math.ceil(
        (width / source.width) * image.width * pixelRatio
      ) as DevicePixels,
      height: Math.ceil(
        (height / source.height) * image.height * pixelRatio
      ) as DevicePixels,
    },
  };
};

/** Bound requests on one device-pixel grid, with a single-pixel linear-sampling guard. */
export const nativePreviewTiles = (
  window: NativePreviewWindow,
  sourceSize: Size<DevicePixels>,
  targetTileEdge = 1024
): NativePreviewTile[] => {
  if (!Number.isSafeInteger(targetTileEdge) || targetTileEdge < 1)
    throw new RangeError("Preview tile edge must be a positive integer");
  const tiles: NativePreviewTile[] = [];
  const { source, target } = window;
  const stepX = source.width / target.width,
    stepY = source.height / target.height;
  const halo = Math.max(1, Math.ceil(Math.max(stepX, stepY)));
  for (let y = 0; y < target.height; y += targetTileEdge) {
    for (let x = 0; x < target.width; x += targetTileEdge) {
      const w = Math.min(targetTileEdge, target.width - x),
        h = Math.min(targetTileEdge, target.height - y);
      const sx = source.x + x * stepX,
        sy = source.y + y * stepY;
      const sw = w * stepX,
        sh = h * stepY;
      const left = Math.max(0, Math.floor(sx - halo)),
        top = Math.max(0, Math.floor(sy - halo));
      const right = Math.min(sourceSize.width, Math.ceil(sx + sw + halo));
      const bottom = Math.min(sourceSize.height, Math.ceil(sy + sh + halo));
      const width = right - left,
        height = bottom - top;
      const edge = Math.min(
        Math.max(width, height),
        Math.ceil(2 * Math.max(width / stepX, height / stepY))
      );
      tiles.push({
        source: {
          x: left as DevicePixels,
          y: top as DevicePixels,
          width: width as DevicePixels,
          height: height as DevicePixels,
        },
        sample: {
          x: sx as DevicePixels,
          y: sy as DevicePixels,
          width: sw as DevicePixels,
          height: sh as DevicePixels,
        },
        target: {
          x: x as DevicePixels,
          y: y as DevicePixels,
          width: w as DevicePixels,
          height: h as DevicePixels,
        },
        edge: edge as DevicePixels,
      });
    }
  }
  return tiles;
};
