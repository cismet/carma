import { clamp } from "@carma-commons/math";

export const CANVAS_IMAGE_STRIP_INITIAL_VIEW = {
  FIT: "fit",
  NATIVE: "native",
} as const;

export type CanvasImageStripInitialView =
  (typeof CANVAS_IMAGE_STRIP_INITIAL_VIEW)[keyof typeof CANVAS_IMAGE_STRIP_INITIAL_VIEW];

export type CanvasImageStripDimensions = {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type CanvasImageStripTransform = {
  scale: number;
  centerX: number;
  centerY: number;
};

export type CanvasImageStripView = CanvasImageStripTransform &
  CanvasImageStripDimensions & {
    /** Open strips: progress along the pan range. Loops: centre / circumference. */
    position: number;
    fitScale: number;
    closedLoop: boolean;
  };

export const getCanvasImageStripFitScale = (
  dimensions: CanvasImageStripDimensions
): number =>
  Math.min(
    dimensions.viewportWidth / dimensions.sourceWidth,
    dimensions.viewportHeight / dimensions.sourceHeight
  );

export const constrainCanvasImageStripView = (
  transform: CanvasImageStripTransform,
  dimensions: CanvasImageStripDimensions,
  closedLoop: boolean
): CanvasImageStripTransform => {
  const fitScale = getCanvasImageStripFitScale(dimensions);
  const scale = clamp(
    transform.scale,
    Math.min(1, fitScale),
    Math.max(8, fitScale)
  );
  const halfWidth = dimensions.viewportWidth / (2 * scale);
  const halfHeight = dimensions.viewportHeight / (2 * scale);
  return {
    scale,
    centerX: closedLoop
      ? transform.centerX -
        Math.floor(transform.centerX / dimensions.sourceWidth) *
          dimensions.sourceWidth
      : halfWidth >= dimensions.sourceWidth / 2
      ? dimensions.sourceWidth / 2
      : clamp(transform.centerX, halfWidth, dimensions.sourceWidth - halfWidth),
    centerY:
      halfHeight >= dimensions.sourceHeight / 2
        ? dimensions.sourceHeight / 2
        : clamp(
            transform.centerY,
            halfHeight,
            dimensions.sourceHeight - halfHeight
          ),
  };
};

export const getCanvasImageStripView = (
  transform: CanvasImageStripTransform,
  dimensions: CanvasImageStripDimensions,
  closedLoop: boolean
): CanvasImageStripView => {
  const visibleWidth = dimensions.viewportWidth / transform.scale;
  const travel = dimensions.sourceWidth - visibleWidth;
  return {
    ...transform,
    ...dimensions,
    closedLoop,
    fitScale: getCanvasImageStripFitScale(dimensions),
    position: closedLoop
      ? transform.centerX / dimensions.sourceWidth
      : travel > 0
      ? clamp((transform.centerX - visibleWidth / 2) / travel, 0, 1)
      : 0.5,
  };
};

export const setCanvasImageStripPosition = (
  transform: CanvasImageStripTransform,
  dimensions: CanvasImageStripDimensions,
  position: number,
  closedLoop: boolean
): CanvasImageStripTransform => {
  const visibleWidth = dimensions.viewportWidth / transform.scale;
  return constrainCanvasImageStripView(
    {
      ...transform,
      centerX: closedLoop
        ? position * dimensions.sourceWidth
        : visibleWidth / 2 +
          clamp(position, 0, 1) *
            Math.max(0, dimensions.sourceWidth - visibleWidth),
    },
    dimensions,
    closedLoop
  );
};

export const zoomCanvasImageStripAt = (
  transform: CanvasImageStripTransform,
  dimensions: CanvasImageStripDimensions,
  factor: number,
  anchor: { x: number; y: number },
  closedLoop: boolean
): CanvasImageStripTransform => {
  const scale = constrainCanvasImageStripView(
    { ...transform, scale: transform.scale * factor },
    dimensions,
    closedLoop
  ).scale;
  const anchorX = anchor.x - dimensions.viewportWidth / 2;
  const anchorY = anchor.y - dimensions.viewportHeight / 2;
  return constrainCanvasImageStripView(
    {
      scale,
      centerX: transform.centerX + anchorX / transform.scale - anchorX / scale,
      centerY: transform.centerY + anchorY / transform.scale - anchorY / scale,
    },
    dimensions,
    closedLoop
  );
};

/** Visible source intervals only; the source is never duplicated or read back. */
export const getCanvasImageStripSlices = (
  transform: CanvasImageStripTransform,
  dimensions: CanvasImageStripDimensions,
  closedLoop: boolean
): { sourceX: number; sourceWidth: number; x: number; width: number }[] => {
  const scaledWidth = dimensions.sourceWidth * transform.scale;
  const left =
    dimensions.viewportWidth / 2 - transform.centerX * transform.scale;
  const firstCopy = closedLoop ? Math.floor(-left / scaledWidth) : 0;
  const lastCopy = closedLoop
    ? Math.ceil((dimensions.viewportWidth - left) / scaledWidth) - 1
    : 0;
  const slices: ReturnType<typeof getCanvasImageStripSlices> = [];
  for (let copy = firstCopy; copy <= lastCopy; copy++) {
    const copyLeft = left + copy * scaledWidth;
    const x = Math.max(0, copyLeft);
    const right = Math.min(dimensions.viewportWidth, copyLeft + scaledWidth);
    if (right <= x) continue;
    slices.push({
      sourceX: (x - copyLeft) / transform.scale,
      sourceWidth: (right - x) / transform.scale,
      x,
      width: right - x,
    });
  }
  return slices;
};
