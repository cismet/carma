import { Matrix3 } from "three";
import type { CssPixels, DevicePixels, Radians } from "@carma-units";
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
