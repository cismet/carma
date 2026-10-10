import { Matrix3 } from "three";
import type { CssPixels, DevicePixels, Radians, Ratio } from "@carma-units";
import type { NativePreviewWindow } from "@carma-commons/image-pyramid";

type Size<P> = { width: P; height: P };
type Rect<P> = Size<P> & { x: P; y: P };

/** The same inverse projection, expressed as bottom-left viewport/texture UVs. */
export const nativePreviewTextureTransform = (
  viewport: Size<CssPixels>,
  image: Size<CssPixels>,
  source: Size<DevicePixels>,
  offset: { x: CssPixels; y: CssPixels },
  principal: { xOffset: number; yOffset: number },
  roll: Radians,
  crop: Rect<DevicePixels> = {
    x: 0 as DevicePixels,
    y: 0 as DevicePixels,
    ...source,
  }
): Matrix3 => {
  const c = Math.cos(roll),
    s = Math.sin(roll);
  const sample = (u: number, v: number) => {
    const dx = u * viewport.width - viewport.width / 2 - offset.x;
    const dy = (1 - v) * viewport.height - viewport.height / 2 - offset.y;
    const x =
      ((c * dx + s * dy) / image.width - principal.xOffset + 0.5) *
      source.width;
    const y =
      ((-s * dx + c * dy) / image.height - principal.yOffset + 0.5) *
      source.height;
    return { x: (x - crop.x) / crop.width, y: 1 - (y - crop.y) / crop.height };
  };
  const p = sample(0, 0),
    x = sample(1, 0),
    y = sample(0, 1);
  return new Matrix3().set(
    x.x - p.x,
    y.x - p.x,
    p.x,
    x.y - p.y,
    y.y - p.y,
    p.y,
    0,
    0,
    1
  );
};

/** Visible sensor bounds for the same finite-plane homography used to draw the photo. */
export const projectedNativePreviewWindow = (
  viewportToImage: Matrix3,
  viewport: Size<CssPixels>,
  source: Size<DevicePixels>,
  pixelRatio: Ratio
): NativePreviewWindow | null => {
  if (!(viewport.width > 0 && viewport.height > 0 && pixelRatio > 0))
    return null;
  const e = viewportToImage.elements;
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  const depths = corners.map(([u, v]) => e[2] * u + e[5] * v + e[8]);
  // A horizon crossing has no bounded four-corner image footprint.
  if (
    depths.some((w) => !Number.isFinite(w) || Math.abs(w) < 1e-12) ||
    depths.some((w) => Math.sign(w) !== Math.sign(depths[0]))
  )
    return null;
  const points = corners.map(([u, v], index) => ({
    x: (source.width * (e[0] * u + e[3] * v + e[6])) / depths[index],
    y: source.height * (1 - (e[1] * u + e[4] * v + e[7]) / depths[index]),
  }));
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;
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
  let density = 0;
  for (const [u, v] of [...corners, [0.5, 0.5]]) {
    const w = e[2] * u + e[5] * v + e[8];
    const px = e[0] * u + e[3] * v + e[6];
    const py = e[1] * u + e[4] * v + e[7];
    // Jacobian: source pixels per CSS pixel. Its smallest singular value
    // determines the greatest display magnification in any direction.
    const a =
      (source.width * (e[0] * w - px * e[2])) / (w * w * viewport.width);
    const b =
      (source.width * (e[3] * w - px * e[5])) / (w * w * viewport.height);
    const c =
      (-source.height * (e[1] * w - py * e[2])) / (w * w * viewport.width);
    const d =
      (-source.height * (e[4] * w - py * e[5])) / (w * w * viewport.height);
    const sum = a * a + b * b + c * c + d * d;
    const determinant = a * d - b * c;
    const largest = Math.sqrt(
      (sum +
        Math.sqrt(Math.max(0, sum * sum - 4 * determinant * determinant))) /
        2
    );
    const smallest = Math.abs(determinant) / largest;
    if (!(smallest > 0 && Number.isFinite(smallest))) return null;
    density = Math.max(density, pixelRatio / smallest);
  }
  const width = right - x,
    height = bottom - y;
  // Perspective foreshortening can make a bounding rectangle far larger than
  // the screen footprint; never compose a full native sensor just for that.
  density = Math.min(
    density,
    1,
    Math.sqrt(
      (4 * viewport.width * viewport.height * pixelRatio * pixelRatio) /
        (width * height)
    )
  );
  return {
    source: { x, y, width, height } as Rect<DevicePixels>,
    target: {
      width: Math.max(1, Math.ceil(width * density)) as DevicePixels,
      height: Math.max(1, Math.ceil(height * density)) as DevicePixels,
    },
  };
};
