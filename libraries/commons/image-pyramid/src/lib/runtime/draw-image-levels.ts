import type { DevicePixels } from "@carma-units";
import {
  imageTileRect,
  levelToNative,
  missingNeighbors,
  tileRangeFor,
  type ImageRect,
  type ImageLevelPlan,
} from "../core/image-level-plan";
import type { ImageLevelStack } from "./image-level-stack";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type ImageLevelsTransform = Readonly<{
  /** Native image pixel at canvas pixel (0, 0). */
  originX: number;
  originY: number;
  /** Canvas pixels per native image pixel. */
  scale: number;
  /** Independent vertical scale for rectangular viewport outputs; defaults to scale. */
  scaleY?: number;
}>;
export type DrawImageLevelsOptions = Readonly<{
  /** Fade tile edges whose same-level neighbor is still missing, in canvas pixels; 0 disables. */
  featherPx?: number;
  /** Independent shared-pool query; otherwise draw the primary preview plan. */
  plan?: ImageLevelPlan | null;
  /** Changed native rectangles; preserve all output pixels outside their filter halo. */
  damage?: readonly ImageRect[];
}>;

let scratch: OffscreenCanvas | null = null;
const scratchContext = (width: number, height: number) => {
  if (!scratch || scratch.width < width || scratch.height < height)
    scratch = new OffscreenCanvas(
      Math.max(width, scratch?.width ?? 0),
      Math.max(height, scratch?.height ?? 0)
    );
  return scratch.getContext("2d")!;
};

const fadeEdges = (
  context: OffscreenCanvasRenderingContext2D,
  mask: number,
  width: number,
  height: number,
  feather: number
) => {
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
  };
  const fx = Math.min(feather, width / 2),
    fy = Math.min(feather, height / 2);
  context.globalCompositeOperation = "destination-out";
  if (mask & 1) {
    edge(0, 0, fx, 0);
    context.fillRect(0, 0, fx, height);
  }
  if (mask & 2) {
    edge(width, 0, width - fx, 0);
    context.fillRect(width - fx, 0, fx, height);
  }
  if (mask & 4) {
    edge(0, 0, 0, fy);
    context.fillRect(0, 0, width, fy);
  }
  if (mask & 8) {
    edge(0, height, 0, height - fy);
    context.fillRect(0, height - fy, width, fy);
  }
  context.globalCompositeOperation = "source-over";
};

/**
 * Draw the resident pyramid tiles bottom to top with linear scaling. Missing
 * tiles stay transparent, so the next coarser level shows through them.
 */
export const drawImageLevels = (
  context: Context2D,
  stack: ImageLevelStack,
  transform: ImageLevelsTransform,
  canvas: Readonly<{ width: number; height: number }>,
  options: DrawImageLevelsOptions = {}
) => {
  const plan = options.plan === undefined ? stack.plan : options.plan,
    pyramid = stack.pyramid;
  if (!plan || !pyramid) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const { native } = pyramid;
  const scaleY = transform.scaleY ?? transform.scale;
  const visible: ImageRect = {
    x: transform.originX as DevicePixels,
    y: transform.originY as DevicePixels,
    width: (canvas.width / transform.scale) as DevicePixels,
    height: (canvas.height / scaleY) as DevicePixels,
  };
  const feather = options.featherPx ?? 0;
  context.imageSmoothingEnabled = true;
  const paint = (region: ImageRect) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    plan.layers.forEach((index, layer) => {
      const level = pyramid.levels.find(
        (candidate) => candidate.level === index
      );
      if (!level) return;
      // Below half size bilinear sampling skips pixels and aliases; the higher
      // quality filters through mipmaps. Only a thumbnail's floor gets there.
      const quality: ImageSmoothingQuality =
        Math.min(
          transform.scale * levelToNative(level, native).x,
          scaleY * levelToNative(level, native).y
        ) < 0.5
          ? "high"
          : "low";
      context.imageSmoothingQuality = quality;
      const range = tileRangeFor(level, native, region);
      const resident = (col: number, row: number) =>
        stack.isResident(index, col, row);
      for (let row = range.row0; row < range.row1; row++)
        for (let col = range.col0; col < range.col1; col++) {
          const bitmap = stack.tile(index, col, row);
          if (!bitmap) continue;
          const rect = imageTileRect(level, native, col, row);
          // Shared rounded edges keep neighbors seamless at any fractional scale.
          const x0 = Math.round((rect.x - transform.originX) * transform.scale);
          const y0 = Math.round((rect.y - transform.originY) * scaleY);
          const x1 = Math.round(
            (rect.x + rect.width - transform.originX) * transform.scale
          );
          const y1 = Math.round(
            (rect.y + rect.height - transform.originY) * scaleY
          );
          if (x1 <= x0 || y1 <= y0) continue;
          const nativeStep = levelToNative(level, native);
          const sw = Math.min(bitmap.width, rect.width / nativeStep.x);
          const sh = Math.min(bitmap.height, rect.height / nativeStep.y);
          const mask =
            feather > 0 && layer > 0
              ? missingNeighbors(level, col, row, resident)
              : 0;
          if (!mask) {
            context.drawImage(bitmap, 0, 0, sw, sh, x0, y0, x1 - x0, y1 - y0);
            continue;
          }
          const width = x1 - x0,
            height = y1 - y0;
          const staging = scratchContext(width, height);
          staging.globalCompositeOperation = "copy";
          staging.imageSmoothingEnabled = true;
          staging.imageSmoothingQuality = quality;
          staging.drawImage(bitmap, 0, 0, sw, sh, 0, 0, width, height);
          fadeEdges(staging, mask, width, height, feather);
          context.drawImage(
            staging.canvas,
            0,
            0,
            width,
            height,
            x0,
            y0,
            width,
            height
          );
        }
    });
  };
  if (options.damage === undefined) {
    paint(visible);
    return;
  }
  const halo = feather + 1;
  for (const rect of options.damage) {
    const left = Math.max(
      0,
      Math.floor((rect.x - transform.originX) * transform.scale - halo)
    );
    const top = Math.max(
      0,
      Math.floor((rect.y - transform.originY) * scaleY - halo)
    );
    const right = Math.min(
      canvas.width,
      Math.ceil(
        (rect.x + rect.width - transform.originX) * transform.scale + halo
      )
    );
    const bottom = Math.min(
      canvas.height,
      Math.ceil((rect.y + rect.height - transform.originY) * scaleY + halo)
    );
    if (right <= left || bottom <= top) continue;
    context.save();
    try {
      context.beginPath();
      context.rect(left, top, right - left, bottom - top);
      context.clip();
      paint({
        x: (transform.originX + left / transform.scale) as DevicePixels,
        y: (transform.originY + top / scaleY) as DevicePixels,
        width: ((right - left) / transform.scale) as DevicePixels,
        height: ((bottom - top) / scaleY) as DevicePixels,
      });
    } finally {
      context.restore();
    }
  }
};
