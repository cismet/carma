import { OVERVIEW_COLORS } from "./tile-diagnostic-model";
import {
  TILE_RECORD_FLOATS,
  type DiagnosticSnapshot,
  type DiagnosticFrame,
  rgba,
} from "./tile-diagnostic-scene";

/** Small dynamic tail; resident tile primitives stay untouched during camera motion. */
/** Widths of a frustum edge at the eye and at the far end, in CSS pixels. */
const FRUSTUM_NEAR_WIDTH = 2.4;

const FRUSTUM_FAR_WIDTH = 1.6;

export const buildDiagnosticViewport = (
  snapshot: Pick<DiagnosticSnapshot, "edges" | "center"> & {
    origin?: readonly [number, number] | null;
    forward?: readonly [number, number] | null;
    nearCenter?: readonly [number, number];
  },
  color: string = OVERVIEW_COLORS.frustum,
  /** Orthographic light volume with a fixed-size direction marker. */
  light = false
): Float32Array => {
  const values: number[] = [];
  const add = (
    position: number[],
    kind: number,
    stroke: number,
    count: number,
    progress: number,
    color: string
  ) =>
    values.push(
      ...position,
      kind,
      stroke,
      count,
      progress,
      ...rgba(color),
      0,
      0,
      0,
      0
    );
  const origin = light ? null : snapshot.origin ?? null;
  const edges = snapshot.edges;
  // Distance from the eye taken over every endpoint of this cut, so one edge
  // cannot set the scale for the rest of the outline.
  const distanceTo = (x: number, y: number) =>
    origin ? Math.hypot(x - origin[0], y - origin[1]) : 0;
  let farthest = 0;
  if (origin)
    for (let i = 0; i < edges.length; i += 2)
      farthest = Math.max(farthest, distanceTo(edges[i], edges[i + 1]));
  const widthAt = (x: number, y: number) =>
    farthest > 0
      ? FRUSTUM_NEAR_WIDTH +
        (FRUSTUM_FAR_WIDTH - FRUSTUM_NEAR_WIDTH) *
          Math.min(1, distanceTo(x, y) / farthest)
      : FRUSTUM_NEAR_WIDTH;
  for (let i = 0; i < edges.length; i += 4) {
    const segment = Array.from(edges.subarray(i, i + 4));
    if (!origin) {
      add(segment, 3, 2, 0, 0, color);
      continue;
    }
    // A tapered quad: the renderer interpolates the width along the segment,
    // which a constant-width line primitive cannot express.
    values.push(
      ...segment,
      5,
      2,
      widthAt(segment[0], segment[1]),
      widthAt(segment[2], segment[3]),
      ...rgba(color),
      0,
      0,
      0,
      0
    );
  }
  // No centre cross or footprint-spanning arrow. The triangle has a fixed CSS
  // size and follows the actual light camera's projected ray direction.
  if (light && snapshot.nearCenter && snapshot.forward) {
    const [x, y] = snapshot.nearCenter;
    const [dx, dy] = snapshot.forward;
    const length = Math.hypot(dx, dy);
    if (Number.isFinite(x + y + length) && length > 1e-9)
      add([x, y, 8, 8], 7, 0, dx / length, dy / length, color);
  }
  return new Float32Array(values);
};

export const buildDiagnosticSelection = (
  snapshot: DiagnosticSnapshot,
  selection: DiagnosticFrame["selection"]
) => {
  const values: number[] = [];
  for (const [index, primary] of selection) {
    const offset = index * TILE_RECORD_FLOATS;
    if (offset < 0 || offset + TILE_RECORD_FLOATS > snapshot.tiles.length)
      continue;
    const [x, y, w, h] = snapshot.tiles.subarray(offset, offset + 4);
    values.push(
      x + w / 2,
      y + h / 2,
      w / 2,
      h / 2,
      0,
      1,
      0,
      0,
      ...rgba(primary ? "#fff05a" : "#ff974f"),
      0,
      0,
      0,
      0
    );
  }
  return new Float32Array(values);
};
