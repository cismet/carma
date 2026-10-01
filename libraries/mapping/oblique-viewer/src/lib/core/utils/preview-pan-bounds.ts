import type { CssPixels, Radians, Ratio } from "@carma-units";

type Point = { x: CssPixels; y: CssPixels };
type Size = { width: CssPixels; height: CssPixels };
export type PreviewImageGeometry = {
  aspectRatio: Ratio;
  halfFovTan: Ratio;
  principal: { xOffset: Ratio; yOffset: Ratio };
  roll: Radians;
};
export type PreviewPanFrame = {
  viewport: Size;
  image: Size;
  principal: PreviewImageGeometry["principal"];
  roll: Radians;
};
const rotate = (point: Point, roll: Radians): Point => ({
  x: (Math.cos(roll) * point.x - Math.sin(roll) * point.y) as CssPixels,
  y: (Math.sin(roll) * point.x + Math.cos(roll) * point.y) as CssPixels,
});
const clip = (
  polygon: Point[],
  axis: "x" | "y",
  edge: CssPixels,
  below: boolean
): Point[] => {
  if (!polygon.length) return [];
  const output: Point[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = below ? previous[axis] <= edge : previous[axis] >= edge;
  for (const point of polygon) {
    const inside = below ? point[axis] <= edge : point[axis] >= edge;
    if (inside !== previousInside) {
      const t = (edge - previous[axis]) / (point[axis] - previous[axis]);
      output.push({
        x: (previous.x + t * (point.x - previous.x)) as CssPixels,
        y: (previous.y + t * (point.y - previous.y)) as CssPixels,
      });
    }
    if (inside) output.push(point);
    previous = point;
    previousInside = inside;
  }
  return output;
};

/** Visible photo area as a fraction of the actual 2D viewport, including image roll. */
export const previewImageCoverage = (
  offset: Point,
  frame: PreviewPanFrame
): Ratio => {
  const { image, viewport, principal, roll } = frame;
  if (
    !(
      viewport.width > 0 &&
      viewport.height > 0 &&
      image.width > 0 &&
      image.height > 0
    )
  )
    return 0 as Ratio;
  const left = (principal.xOffset - 0.5) * image.width;
  const top = (principal.yOffset - 0.5) * image.height;
  let polygon = [
    [left, top],
    [left + image.width, top],
    [left + image.width, top + image.height],
    [left, top + image.height],
  ].map(([x, y]) => {
    const point = rotate({ x: x as CssPixels, y: y as CssPixels }, roll);
    return {
      x: (offset.x + point.x) as CssPixels,
      y: (offset.y + point.y) as CssPixels,
    };
  });
  polygon = clip(polygon, "x", (-viewport.width / 2) as CssPixels, false);
  polygon = clip(polygon, "x", (viewport.width / 2) as CssPixels, true);
  polygon = clip(polygon, "y", (-viewport.height / 2) as CssPixels, false);
  polygon = clip(polygon, "y", (viewport.height / 2) as CssPixels, true);
  let area = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    area += point.x * next.y - next.x * point.y;
  });
  return (Math.abs(area) / (2 * viewport.width * viewport.height)) as Ratio;
};

/** Allow edges/corners to reach the viewport centre, retaining at least a quarter of the viewport when the image permits it. */
export const clampPreviewPan = (
  offset: Point,
  frame: PreviewPanFrame,
  { previousOffset }: { previousOffset?: Point } = {}
): Point => {
  const { image, principal, roll } = frame;
  if (!(image.width > 0 && image.height > 0)) return offset;
  const local = rotate(offset, -roll as Radians);
  const previousLocal = previousOffset
    ? rotate(previousOffset, -roll as Radians)
    : undefined;
  const bounded = rotate(
    {
      x: Math.max(
        Math.min(
          -(principal.xOffset + 0.5) * image.width,
          previousLocal?.x ?? Infinity
        ),
        Math.min(
          Math.max(
            (0.5 - principal.xOffset) * image.width,
            previousLocal?.x ?? -Infinity
          ),
          local.x
        )
      ) as CssPixels,
      y: Math.max(
        Math.min(
          -(principal.yOffset + 0.5) * image.height,
          previousLocal?.y ?? Infinity
        ),
        Math.min(
          Math.max(
            (0.5 - principal.yOffset) * image.height,
            previousLocal?.y ?? -Infinity
          ),
          local.y
        )
      ) as CssPixels,
    },
    roll
  );
  const centred = rotate(
    {
      x: (-principal.xOffset * image.width) as CssPixels,
      y: (-principal.yOffset * image.height) as CssPixels,
    },
    roll
  );
  // A zoomed-out photo can naturally cover less than the viewport; don't enlarge it as a side effect of drag.
  const available = previewImageCoverage(centred, frame);
  const normalMinimum = available >= 0.25 ? 0.25 : 0.25 * available;
  // A tracked entry can begin at an edge with less photo visible. Do not
  // recenter it on the first drag; allow recovery without reducing coverage.
  const minimum = previousOffset
    ? Math.min(normalMinimum, previewImageCoverage(previousOffset, frame))
    : normalMinimum;
  if (previewImageCoverage(bounded, frame) >= minimum) return bounded;
  let low = 0,
    high = 1;
  const interpolate = (t: number): Point => ({
    x: (centred.x + t * (bounded.x - centred.x)) as CssPixels,
    y: (centred.y + t * (bounded.y - centred.y)) as CssPixels,
  });
  // Along this ray convex image/viewport overlap decreases towards the boundary.
  for (let i = 0; i < 32; i++) {
    const t = (low + high) / 2;
    if (previewImageCoverage(interpolate(t), frame) >= minimum) low = t;
    else high = t;
  }
  return interpolate(low);
};
